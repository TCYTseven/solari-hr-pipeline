// Local fallback executor: one Docker container per submission.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config";
import { mustRun, onCleanup, runProc, shellQuoteArg } from "../util";
import { type Box, type BoxSpec, type ExecOptions, type ExecResult, type Executor, RELAY_JS } from "./types";

const DOCKERFILE = path.join(config.root, "pipeline", "docker", "Dockerfile");

function contextHash(caPem: string | null): string {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(DOCKERFILE));
  h.update(RELAY_JS);
  if (caPem) h.update(caPem);
  return h.digest("hex").slice(0, 16);
}

export class DockerExecutor implements Executor {
  readonly kind = "docker" as const;
  private ready: Promise<void> | null = null;

  prepare(log: (s: string) => void): Promise<void> {
    this.ready ??= this.ensureImage(log).catch((err) => {
      this.ready = null;
      throw err;
    });
    return this.ready;
  }

  private async ensureImage(log: (s: string) => void): Promise<void> {
    const ping = await runProc("docker", ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 20_000 });
    if (ping.code !== 0) throw new Error(`Docker is not available: ${ping.output.trim().split("\n").pop()}`);

    const caPath = process.env.SCREENER_DOCKER_CA_CERT?.trim();
    const caPem = caPath ? fs.readFileSync(caPath, "utf8") : null;
    const hash = contextHash(caPem);
    const inspect = await runProc("docker", ["image", "inspect", "--format", '{{index .Config.Labels "screener.hash"}}', config.dockerImage]);
    if (inspect.code === 0 && inspect.stdout.trim() === hash) return;

    log(`Building ${config.dockerImage} (first use or Dockerfile changed)...`);
    const ctx = fs.mkdtempSync(path.join(os.tmpdir(), "screener-image-"));
    try {
      fs.copyFileSync(DOCKERFILE, path.join(ctx, "Dockerfile"));
      fs.writeFileSync(path.join(ctx, "relay.cjs"), RELAY_JS);
      fs.mkdirSync(path.join(ctx, "ca"));
      if (caPem) fs.writeFileSync(path.join(ctx, "ca", "extra.crt"), caPem);
      else fs.writeFileSync(path.join(ctx, "ca", ".keep"), "");
      const r = await runProc("docker", ["build", "--label", `screener.hash=${hash}`, "-t", config.dockerImage, ctx], {
        timeoutMs: 1_800_000,
      });
      if (r.code !== 0) throw new Error(`docker build failed:\n${r.output.split("\n").slice(-15).join("\n")}`);
      log(`Built ${config.dockerImage}.`);
    } finally {
      fs.rmSync(ctx, { recursive: true, force: true });
    }
  }

  box(spec: BoxSpec): Box {
    return new DockerBox(spec);
  }
}

class DockerBox implements Box {
  readonly surface = "Local sandbox" as const;
  readonly repoPath = "/work/repo";
  readonly relayPort = config.relayPort;
  readonly vmCount = 0;
  description = "";
  private id: string | null = null;
  private hostPort: number | null = null;
  private unregister: (() => void) | null = null;
  private readonly name: string;

  constructor(private spec: BoxSpec) {
    this.name = `screener-${spec.owner.toLowerCase().replace(/[^a-z0-9_.-]/g, "-")}-${spec.runId.slice(0, 8)}`;
  }

  vmSeconds(): number {
    return 0;
  }

  async create(): Promise<void> {
    // Pass env through a 0600 file so values never show up in `ps`.
    const envFile = path.join(os.tmpdir(), `${this.name}.env`);
    const lines = Object.entries(this.spec.env)
      .filter(([, v]) => !/[\r\n]/.test(v))
      .map(([k, v]) => `${k}=${v}`);
    fs.writeFileSync(envFile, lines.join("\n") + "\n", { mode: 0o600 });
    const args = [
      "run", "-d", "--name", this.name,
      "--label", "solari-screener=1", "--label", `screener.owner=${this.spec.owner}`,
      "--cpus", config.dockerCpus, "--memory", config.dockerMemory, "--pids-limit", "2048",
      "--security-opt", "no-new-privileges",
      // Point the Docker Desktop host alias at the container itself so a submission
      // can't reach services on the screener's machine by name.
      "--add-host", "host.docker.internal:127.0.0.1",
      "-p", `127.0.0.1::${config.relayPort}`,
      "--env-file", envFile,
      config.dockerImage, "sleep", "infinity",
    ];
    try {
      const r = await mustRun("docker", args, { timeoutMs: 120_000 });
      this.id = r.stdout.trim().split("\n").pop()!.slice(0, 12);
    } finally {
      fs.rmSync(envFile, { force: true });
    }
    this.unregister = onCleanup(() => this.release());
    const port = await mustRun("docker", ["port", this.id, `${config.relayPort}/tcp`], { timeoutMs: 30_000 });
    const m = /:(\d+)\s*$/m.exec(port.stdout.trim().split("\n")[0] ?? "");
    if (!m) throw new Error(`could not read published port: ${port.stdout}`);
    this.hostPort = Number(m[1]);
    this.description = `docker run --cpus ${config.dockerCpus} --memory ${config.dockerMemory} ${config.dockerImage}  (container ${this.id})`;
  }

  async clone(input: { tar: Buffer; sourceUrl: string | null; sha: string }, log: (s: string) => void): Promise<ExecResult> {
    const id = this.need();
    log(`$ git archive ${input.sha.slice(0, 12)} | docker cp - ${id}:/work\n`);
    await mustRun("docker", ["exec", id, "mkdir", "-p", "/work"], { timeoutMs: 30_000 });
    const r = await runProc("docker", ["cp", "-", `${id}:/work`], { input: input.tar, timeoutMs: 300_000 });
    const out = r.output.trim();
    const summary = r.code === 0 ? `Copied ${(input.tar.length / 1024).toFixed(0)} kB into ${this.repoPath}\n` : `${out}\n`;
    log(summary);
    return { exitCode: r.code, output: summary, timedOut: r.timedOut };
  }

  private dir(cwd?: string): string {
    return !cwd || cwd === "." ? this.repoPath : path.posix.join(this.repoPath, cwd);
  }

  async exec(script: string, opts: ExecOptions): Promise<ExecResult> {
    const id = this.need();
    const t0 = Date.now();
    const r = await runProc(
      "docker",
      ["exec", "-w", this.dir(opts.cwd), id, "timeout", "-k", "5", String(opts.timeoutSec), "sh", "-c", script],
      { timeoutMs: (opts.timeoutSec + 30) * 1000, onData: opts.onOutput },
    );
    // `timeout` exits 124 (or 137 when it had to SIGKILL) once the limit is hit.
    const hitLimit = Date.now() - t0 >= opts.timeoutSec * 1000 - 500;
    const timedOut = r.timedOut || (hitLimit && (r.code === 124 || r.code === 137));
    return { exitCode: r.code, output: r.output, timedOut };
  }

  async startBackground(script: string, opts: { cwd?: string; logFile: string; pidFile: string }): Promise<void> {
    const id = this.need();
    // $0 carries the user script so it needs no nested quoting.
    const wrapper = `echo $$ > ${shellQuoteArg(opts.pidFile)}; exec sh -c "$0" > ${shellQuoteArg(opts.logFile)} 2>&1`;
    await mustRun("docker", ["exec", "-d", "-w", this.dir(opts.cwd), id, "sh", "-c", wrapper, script], { timeoutMs: 30_000 });
  }

  async exposePort(port: number): Promise<string> {
    const id = this.need();
    await mustRun("docker", ["exec", "-d", id, "node", "/opt/screener/relay.cjs", String(config.relayPort), String(port)], {
      timeoutMs: 30_000,
    });
    return `http://127.0.0.1:${this.hostPort}/`;
  }

  async release(): Promise<void> {
    const id = this.id;
    this.id = null;
    this.unregister?.();
    this.unregister = null;
    if (!id) return;
    const r = await runProc("docker", ["rm", "-f", id], { timeoutMs: 60_000 });
    if (r.code !== 0) console.warn(`[docker] failed to remove ${id}: ${r.output.trim()}`);
  }

  private need(): string {
    if (!this.id) throw new Error("container not created");
    return this.id;
  }
}
