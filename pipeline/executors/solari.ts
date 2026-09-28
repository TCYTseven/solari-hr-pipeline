// Solari executor: one sandbox microVM (or a desktop VM for GUI apps) per submission.
import { SolariError as BrowserSolariError } from "@solarisdk/browser";
import { AuthError, ConcurrencyLimitError, type Desktop, PlanError, type Sandbox, SolariClient } from "@solarisdk/sdk";
import { config } from "../config";
import { launchLocalChromium } from "../media";
import { onCleanup, shellQuoteArg, sleep } from "../util";
import { type Box, type BoxSpec, type ExecOptions, type ExecResult, type Executor, RELAY_JS, parseReadiness, readinessScript } from "./types";

/**
 * SOLARI_WS=package: make the SDK use the `ws` package. Node 22's native
 * WebSocket cannot send the Authorization header and stringifies binary frames;
 * the SDK picks the native one whenever `globalThis.WebSocket` exists, at connect time.
 */
export function applySolariWsMode(mode: "native" | "package" = config.solariWs): void {
  if (mode === "package") (globalThis as { WebSocket?: unknown }).WebSocket = undefined;
}

let shared: SolariClient | null = null;

export function solariClient(): SolariClient {
  if (!config.solariApiKey) throw new Error("SOLARI_API_KEY is not set");
  applySolariWsMode();
  shared ??= new SolariClient({
    apiKey: config.solariApiKey,
    ...(config.solariBaseUrl ? { baseUrl: config.solariBaseUrl } : {}),
  });
  return shared;
}

/** Solari errors that will fail every fork the same way (bad key, plan): abort the scan. */
export function isFatalSolariError(err: unknown): boolean {
  if (err instanceof AuthError || err instanceof PlanError) return true;
  // @solarisdk/browser has its own, unrelated SolariError class.
  if (err instanceof BrowserSolariError) return err.status === 401 || err.status === 402 || err.code === "FeatureRequiresPlan";
  return false;
}

function isConcurrencyLimit(err: unknown): boolean {
  return (
    err instanceof ConcurrencyLimitError ||
    (err instanceof BrowserSolariError && (err.status === 429 || err.code === "ConcurrencyLimitExceeded"))
  );
}

/** Retry a create while Solari reports the concurrency limit (5s, 10s, 20s, 40s). */
export async function withConcurrencyRetry<T>(fn: () => Promise<T>, log?: (s: string) => void, attempts = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isConcurrencyLimit(err) || i >= attempts - 1) throw err;
      const wait = Math.min(60_000, 5_000 * 2 ** i);
      log?.(`# Solari concurrency limit reached; retrying in ${wait / 1000}s\n`);
      await sleep(wait);
    }
  }
}

const ROOT = "/tmp/screener";
const BIN = `${ROOT}/bin`;
const IDLE_MS = 15 * 60_000;

/** Prepended to every in-guest command: shims first, then user-installed tools (uv, pip --user). */
export const ENV_PREFIX = `export PATH="${BIN}:$HOME/.local/bin:$PATH" PIP_BREAK_SYSTEM_PACKAGES=1;`;

/** Find the X display when the agent's environment does not say (desktop VMs only). */
export const DISPLAY_DETECT =
  'if [ -z "$DISPLAY" ]; then for __x in /tmp/.X11-unix/X*; do [ -e "$__x" ] && export DISPLAY=":${__x##*/X}" && break; done; fi;';

/**
 * Shims so commands written for the documented Docker image also work on
 * Solari's `base` template: `python` -> python3, `pip`/`pip3` -> python3 -m pip
 * (bootstrapping pip with ensurepip if needed), and uv when it installs quickly.
 */
export const BOOTSTRAP_SH = `mkdir -p ${BIN}
if ! command -v python >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
  printf '#!/bin/sh\\nexec python3 "$@"\\n' > ${BIN}/python && chmod +x ${BIN}/python
fi
if command -v python3 >/dev/null 2>&1 && ! python3 -m pip --version >/dev/null 2>&1; then
  python3 -m ensurepip --user >/dev/null 2>&1 || true
fi
for p in pip pip3; do
  if ! command -v $p >/dev/null 2>&1; then printf '#!/bin/sh\\nexec python3 -m pip "$@"\\n' > ${BIN}/$p && chmod +x ${BIN}/$p; fi
done
command -v uv >/dev/null 2>&1 || timeout 90 python3 -m pip install --user --quiet uv >/dev/null 2>&1 || true
echo "tools: node $(node --version 2>/dev/null || echo missing), npm $(npm --version 2>/dev/null || echo missing), $(python3 --version 2>&1 || echo python3 missing), pip $(python3 -m pip --version 2>/dev/null | cut -d' ' -f2 || echo missing), uv $(uv --version 2>/dev/null | cut -d' ' -f2 || echo missing), git $(git --version 2>/dev/null | cut -d' ' -f3 || echo missing), curl $(command -v curl >/dev/null && echo yes || echo missing)"`;

export class SolariExecutor implements Executor {
  readonly kind = "solari" as const;
  private checked = false;

  async prepare(log: (s: string) => void): Promise<void> {
    solariClient();
    if (this.checked) return;
    this.checked = true;
    // CLI thumbnails are rendered in local Chromium; everything else runs on Solari.
    try {
      const browser = await launchLocalChromium();
      await browser.close();
    } catch (err) {
      log(`warning: local Chromium unavailable, CLI thumbnails will be skipped (${err instanceof Error ? err.message.split("\n")[0] : err})`);
    }
  }

  async cleanupOrphans(log: (s: string) => void): Promise<void> {
    try {
      const pt = solariClient();
      let n = 0;
      for await (const sb of pt.sandboxes.listAll({ metadata: { screener: "1" } })) {
        await pt.sandboxes.kill(sb.sandboxId).catch(() => {});
        n++;
      }
      if (n) log(`killed ${n} leftover screener VM(s)`);
    } catch (err) {
      log(`could not list leftover Solari VMs: ${err instanceof Error ? err.message : err}`);
    }
  }

  environment(): string | null {
    return null; // a VM is needed to probe; triage uses the documented template contents
  }

  box(spec: BoxSpec): Box {
    return new SolariBox(spec);
  }
}

export class SolariBox implements Box {
  readonly surface: "Sandbox" | "Desktop";
  readonly kind: "sandbox" | "desktop";
  readonly repoPath = `${ROOT}/repo`;
  readonly relayPort = config.relayPort;
  vmCount = 0;
  description = "";
  handle: Sandbox | Desktop | null = null;
  private startedAt = 0;
  private endedAt = 0;
  private unregister: (() => void) | null = null;

  constructor(private spec: BoxSpec) {
    this.kind = spec.kind;
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

  async create(log: (s: string) => void): Promise<void> {
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
      this.handle = await withConcurrencyRetry(
        () => pt.sandboxes.createDesktop({ ...common, template: "default", resolution: `${r.width}x${r.height}`, record: true }),
        log,
      );
    } else {
      this.handle = await withConcurrencyRetry(() => pt.sandboxes.create({ ...common, template: "base", diskGb: 10 }), log);
    }
    this.startedAt = Date.now();
    this.vmCount = 1;
    this.unregister = onCleanup(() => this.release());
    // files.*, commands.start and every desktop action need the control channel.
    await this.handle.connect();
    const id = this.handle.id;
    this.description =
      this.spec.kind === "desktop"
        ? `solari sandboxes create-desktop --template default --cpu 2 --mem 4096  (${id.slice(0, 12)}...)`
        : `solari sandboxes create --template base --cpu 2 --mem 4096 --disk 10  (${id.slice(0, 12)}...)`;
    const boot = await this.exec(BOOTSTRAP_SH, { cwd: "/", timeoutSec: 150 });
    log(`# ${boot.output.trim().split("\n").pop() ?? "tools: unknown"}\n`);
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
    const wrapped = `${ENV_PREFIX} cd ${shellQuoteArg(this.dir(opts.cwd))} && exec timeout -k 5 ${opts.timeoutSec} sh -c ${shellQuoteArg(script)}`;
    const t0 = Date.now();
    const cmd = await h.commands.start("sh", { args: ["-c", wrapped] });
    let output = "";
    cmd.onData((c) => {
      output += c.data;
      opts.onOutput?.(c.data);
    });
    let hostTimedOut = false;
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<number>((resolve) => {
      timer = setTimeout(() => {
        hostTimedOut = true;
        void cmd.kill(9).catch(() => {});
        resolve(137);
      }, (opts.timeoutSec + 60) * 1000);
      timer.unref();
    });
    const exitCode = await Promise.race([cmd.wait(), deadline]);
    if (timer) clearTimeout(timer);
    const hitLimit = Date.now() - t0 >= opts.timeoutSec * 1000 - 500;
    return { exitCode, output, timedOut: hostTimedOut || (hitLimit && (exitCode === 124 || exitCode === 137)) };
  }

  async startBackground(script: string, opts: { cwd?: string; logFile: string; pidFile: string }): Promise<void> {
    const h = this.need();
    const desktop = this.desktop();
    // Fully detached: own subshell, nohup, no stdin, output to the log, pid recorded.
    const bg =
      `${ENV_PREFIX} ${desktop ? DISPLAY_DETECT : ""} rm -f ${shellQuoteArg(opts.pidFile)}; ` +
      `(cd ${shellQuoteArg(this.dir(opts.cwd))} && exec nohup sh -c ${shellQuoteArg(script)}) > ${shellQuoteArg(opts.logFile)} 2>&1 < /dev/null & ` +
      `echo $! > ${shellQuoteArg(opts.pidFile)}`;
    if (desktop) {
      // Start through the desktop agent so GUI apps land on the display.
      await desktop.process.start("sh", { args: ["-c", bg] });
    } else {
      const r = await h.commands.run("sh", { args: ["-c", bg] });
      if (r.exitCode !== 0) throw new Error(`failed to start the app: ${r.stderr || r.stdout}`);
    }
    // process.start returns before the wrapper has written the pid: wait for it.
    for (let i = 0; i < 20; i++) {
      const r = await this.exec(`test -s ${shellQuoteArg(opts.pidFile)} && echo yes || echo no`, { cwd: "/", timeoutSec: 10 });
      if (r.output.includes("yes")) return;
      await sleep(250);
    }
    throw new Error("the app did not start (no pid recorded)");
  }

  async exposePort(port: number): Promise<string> {
    const h = this.need();
    const node = await this.exec("command -v node >/dev/null 2>&1 && echo yes || echo no", { cwd: "/", timeoutSec: 10 });
    let exposed = port;
    if (node.output.includes("yes")) {
      await h.files.write(`${ROOT}/relay.cjs`, RELAY_JS);
      // Detached like the app itself (not under exec()'s `timeout`).
      await h.commands.run("sh", {
        args: ["-c", `${ENV_PREFIX} (exec nohup node ${ROOT}/relay.cjs ${config.relayPort} ${port}) > ${ROOT}/relay.log 2>&1 < /dev/null &`],
      });
      for (let i = 0; i < 20; i++) {
        const r = await this.exec(readinessScript(config.relayPort), { cwd: "/", timeoutSec: 15 });
        if (parseReadiness(r.output).up) {
          exposed = config.relayPort;
          break;
        }
        await sleep(250);
      }
    }
    // Without node there is no relay: expose the app's own port (works for 0.0.0.0 binds).
    let lastErr: unknown = null;
    for (let i = 0; i < 4; i++) {
      try {
        const { url } = await h.previewUrl(exposed);
        return new URL(url).toString();
      } catch (err) {
        lastErr = err;
        await sleep(1000 * 2 ** i);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(`previewUrl(${exposed}) failed`);
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

