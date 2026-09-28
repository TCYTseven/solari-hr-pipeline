// Solari executor: one sandbox microVM (or a desktop VM for GUI apps) per submission.
import { AuthError, type Desktop, PlanError, type Sandbox, SolariClient } from "@solarisdk/sdk";
import { config } from "../config";
import { onCleanup, shellQuoteArg } from "../util";
import { type Box, type BoxSpec, type ExecOptions, type ExecResult, type Executor, RELAY_JS } from "./types";

let shared: SolariClient | null = null;

export function solariClient(): SolariClient {
  if (!config.solariApiKey) throw new Error("SOLARI_API_KEY is not set");
  shared ??= new SolariClient({
    apiKey: config.solariApiKey,
    ...(config.solariBaseUrl ? { baseUrl: config.solariBaseUrl } : {}),
  });
  return shared;
}

/** Solari errors that will fail every fork the same way (bad key, plan). */
export function isFatalSolariError(err: unknown): boolean {
  return err instanceof AuthError || err instanceof PlanError;
}

const ROOT = "/tmp/screener";
const IDLE_MS = 15 * 60_000;

export class SolariExecutor implements Executor {
  readonly kind = "solari" as const;

  async prepare(): Promise<void> {
    solariClient();
  }

  box(spec: BoxSpec): Box {
    return new SolariBox(spec);
  }
}

export class SolariBox implements Box {
  readonly surface: "Sandbox" | "Desktop";
  readonly repoPath = `${ROOT}/repo`;
  readonly relayPort = config.relayPort;
  vmCount = 0;
  description = "";
  handle: Sandbox | Desktop | null = null;
  private startedAt = 0;
  private endedAt = 0;
  private unregister: (() => void) | null = null;

  constructor(private spec: BoxSpec) {
    this.surface = spec.kind === "desktop" ? "Desktop" : "Sandbox";
  }

  vmSeconds(): number {
    if (!this.startedAt) return 0;
    return ((this.endedAt || Date.now()) - this.startedAt) / 1000;
  }

  /** The desktop handle, when this box is a desktop VM. */
  desktop(): Desktop | null {
    return this.spec.kind === "desktop" ? (this.handle as Desktop | null) : null;
  }

  async create(): Promise<void> {
    const pt = solariClient();
    const common = {
      cpu: 2,
      memMb: 4096,
      envs: this.spec.env,
      idleTimeoutMs: IDLE_MS,
      lifecycle: { onTimeout: "kill" as const },
      metadata: { screener: "1", owner: this.spec.owner, run: this.spec.runId },
    };
    if (this.spec.kind === "desktop") {
      const r = config.desktopResolution;
      this.handle = await pt.sandboxes.createDesktop({
        ...common,
        template: "default",
        resolution: `${r.width}x${r.height}`,
        record: true,
      });
    } else {
      this.handle = await pt.sandboxes.create({ ...common, template: "base", diskGb: 10 });
    }
    this.startedAt = Date.now();
    this.vmCount = 1;
    this.unregister = onCleanup(() => this.release());
    // files.*, commands.start and every desktop action need the control channel.
    await this.handle.connect();
    const id = this.handle.id;
    this.description =
      this.spec.kind === "desktop"
        ? `solari desktops create --template default --cpu 2 --mem 4096  (${id.slice(0, 12)}...)`
        : `solari sandboxes create --template base --cpu 2 --mem 4096 --disk 10  (${id.slice(0, 12)}...)`;
  }

  async clone(input: { tar: Buffer; sourceUrl: string | null; sha: string }, log: (s: string) => void): Promise<ExecResult> {
    const h = this.need();
    if (input.sourceUrl) {
      const script =
        `mkdir -p ${ROOT} && git clone --quiet --filter=blob:none ${shellQuoteArg(input.sourceUrl)} ${this.repoPath} ` +
        `&& cd ${this.repoPath} && git -c advice.detachedHead=false checkout --quiet ${input.sha} && git log -1 --format='HEAD %h %s'`;
      log(`$ git clone ${input.sourceUrl} && git checkout ${input.sha.slice(0, 12)}\n`);
      const r = await this.exec(script, { timeoutSec: 300, cwd: "/" });
      log(r.output);
      return r;
    }
    // Local fork (tests): upload the archive instead of cloning.
    log(`$ git archive ${input.sha.slice(0, 12)} | upload ${ROOT}/repo.tar && tar -xf repo.tar\n`);
    await h.files.write(`${ROOT}/repo.tar`, new Uint8Array(input.tar));
    const r = await this.exec(`cd ${ROOT} && tar -xf repo.tar && rm repo.tar && echo "Unpacked into ${this.repoPath}"`, {
      timeoutSec: 120,
      cwd: "/",
    });
    log(r.output);
    return r;
  }

  private dir(cwd?: string): string {
    if (cwd === "/") return "/";
    return !cwd || cwd === "." ? this.repoPath : `${this.repoPath}/${cwd}`;
  }

  async exec(script: string, opts: ExecOptions): Promise<ExecResult> {
    const h = this.need();
    // commands.* over the control channel ignores timeoutMs: enforce it in the guest
    // with `timeout`, and keep a host-side deadline that kills the command.
    const wrapped = `cd ${shellQuoteArg(this.dir(opts.cwd))} && exec timeout -k 5 ${opts.timeoutSec} sh -c ${shellQuoteArg(script)}`;
    const t0 = Date.now();
    const cmd = await h.commands.start("sh", { args: ["-c", wrapped] });
    let output = "";
    cmd.onData((c) => {
      output += c.data;
      opts.onOutput?.(c.data);
    });
    let hostTimedOut = false;
    const deadline = new Promise<number>((resolve) =>
      setTimeout(() => {
        hostTimedOut = true;
        void cmd.kill(9).catch(() => {});
        resolve(137);
      }, (opts.timeoutSec + 60) * 1000).unref(),
    );
    const exitCode = await Promise.race([cmd.wait(), deadline]);
    const hitLimit = Date.now() - t0 >= opts.timeoutSec * 1000 - 500;
    return { exitCode, output, timedOut: hostTimedOut || (hitLimit && (exitCode === 124 || exitCode === 137)) };
  }

  async startBackground(script: string, opts: { cwd?: string; logFile: string; pidFile: string }): Promise<void> {
    const h = this.need();
    const bg = `cd ${shellQuoteArg(this.dir(opts.cwd))} && nohup sh -c ${shellQuoteArg(script)} > ${shellQuoteArg(opts.logFile)} 2>&1 & echo $! > ${shellQuoteArg(opts.pidFile)}`;
    const desktop = this.desktop();
    if (desktop) {
      // Start through the desktop agent so GUI apps land on the display.
      await desktop.process.start("sh", { args: ["-c", bg] });
      return;
    }
    const r = await h.commands.run("sh", { args: ["-c", bg] });
    if (r.exitCode !== 0) throw new Error(`failed to start the app: ${r.stderr || r.stdout}`);
  }

  async exposePort(port: number): Promise<string> {
    const h = this.need();
    await h.files.write(`${ROOT}/relay.cjs`, RELAY_JS);
    await h.commands.run("sh", {
      args: ["-c", `nohup node ${ROOT}/relay.cjs ${config.relayPort} ${port} > ${ROOT}/relay.log 2>&1 &`],
    });
    const { url } = await h.previewUrl(config.relayPort);
    return new URL(url).toString();
  }

  async release(): Promise<void> {
    const h = this.handle;
    this.handle = null;
    this.unregister?.();
    this.unregister = null;
    if (!h) return;
    this.endedAt = Date.now();
    try {
      await h.kill();
    } catch (err) {
      console.warn(`[solari] kill failed for ${h.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  private need(): Sandbox | Desktop {
    if (!this.handle) throw new Error("VM not created");
    return this.handle;
  }
}
