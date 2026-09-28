// An executor provides an isolated box (Docker container or Solari VM) that the
// screen step drives through the same stages: create, clone, install, boot, release.
import type { StageTiming } from "../../lib/types";

export interface ExecResult {
  exitCode: number;
  /** Combined stdout + stderr, in arrival order where the transport allows. */
  output: string;
  timedOut: boolean;
}

export interface ExecOptions {
  /** Directory inside the box, relative to the repo root ("." for the root). */
  cwd?: string;
  /** Enforced inside the guest with `timeout`, plus a host-side safety margin. */
  timeoutSec: number;
  onOutput?: (chunk: string) => void;
}

export interface BoxSpec {
  owner: string;
  runId: string;
  /** Env injected into the submission (only SUBMISSION_* values, renamed). */
  env: Record<string, string>;
  /** For desktop surfaces on Solari: create a desktop VM instead of a sandbox. */
  kind: "sandbox" | "desktop";
}

export interface Box {
  readonly surface: StageTiming["surface"];
  /** Human description of the box for the install log, e.g. "docker run ... (container 1a2b3c)". */
  readonly description: string;
  /** Absolute path of the repo checkout inside the box. */
  readonly repoPath: string;
  /** In-box port the relay listens on (the one exposed to the demo browser). */
  readonly relayPort: number;
  create(): Promise<void>;
  /**
   * Put the screened commit at repoPath. `tar` is a `git archive --prefix=repo/`
   * tarball; `sourceUrl` + `sha` allow an in-guest clone when the fork is remote.
   */
  clone(input: { tar: Buffer; sourceUrl: string | null; sha: string }, log: (s: string) => void): Promise<ExecResult>;
  /** Run a POSIX sh script inside the box with a timeout. */
  exec(script: string, opts: ExecOptions): Promise<ExecResult>;
  /** Start a script in the background; output goes to logFile inside the box. */
  startBackground(script: string, opts: { cwd?: string; logFile: string; pidFile: string }): Promise<void>;
  /**
   * Start the relay to `port` and return the URL the demo browser can reach it on
   * (http://127.0.0.1:<hostPort>/ for Docker, the preview URL for Solari).
   */
  exposePort(port: number): Promise<string>;
  /** Tear the box down. Idempotent; never throws. */
  release(): Promise<void>;
  /** VMs launched for this box (0 for local Docker). */
  vmCount: number;
  /** Seconds the VM was alive (0 for local Docker). */
  vmSeconds(): number;
}

export interface Executor {
  readonly kind: "docker" | "solari";
  /** Called once per scan before any box is created (e.g. build the Docker image). */
  prepare(log: (s: string) => void): Promise<void>;
  box(spec: BoxSpec): Box;
}

/** Where the in-box relay records its pid, so it can be restarted on another target port. */
export const RELAY_PID = "/tmp/screener-relay.pid";

/**
 * Node TCP relay run inside the box: forwards 0.0.0.0:<listen> to localhost:<target>
 * (IPv4, then IPv6), so apps bound to 127.0.0.1 are reachable from outside.
 */
export const RELAY_JS = `const net = require("net");
const fs = require("fs");
const [listen, target] = process.argv.slice(2).map(Number);
const server = net.createServer((c) => {
  const hosts = ["127.0.0.1", "::1"];
  const attempt = (i) => {
    const u = net.connect(target, hosts[i]);
    u.once("connect", () => { c.pipe(u).pipe(c); });
    u.once("error", () => { if (i + 1 < hosts.length) attempt(i + 1); else c.destroy(); });
    c.once("error", () => u.destroy());
    c.once("close", () => u.destroy());
  };
  attempt(0);
});
let tries = 0;
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && tries++ < 25) setTimeout(() => server.listen(listen, "0.0.0.0"), 200);
  else process.exit(1);
});
server.listen(listen, "0.0.0.0", () => fs.writeFileSync(${JSON.stringify(RELAY_PID)}, String(process.pid)));
`;

/** Ports in LISTEN state from /proc/net/tcp and /proc/net/tcp6 contents. Pure. */
export function parseListeningPorts(procNet: string): number[] {
  const ports = new Set<number>();
  for (const line of procNet.split("\n")) {
    const f = line.trim().split(/\s+/);
    if (f.length < 4 || !/^\d+:$/.test(f[0]!) || f[3] !== "0A") continue;
    const port = parseInt(f[1]!.split(":").pop() ?? "", 16);
    if (Number.isFinite(port) && port > 0) ports.add(port);
  }
  return [...ports].sort((a, b) => a - b);
}

/** Ports an app announced in its output ("http://127.0.0.1:4173", "listening on port 5000"). Pure. */
export function portsInLog(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|::):(\d{2,5})\b|\bport\s+(\d{2,5})\b/gi)) {
    const p = Number(m[1] ?? m[2]);
    if (p > 0 && p < 65536 && !out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * When the triaged port stays silent, pick the port the app really listens on:
 * a new listening port (not in the baseline, not excluded), preferring one the
 * app printed in its log, else the lowest. Null when there is nothing better. Pure.
 */
export function pickAppPort(listening: number[], baseline: number[], exclude: number[], log: string, wanted: number): number | null {
  const fresh = listening.filter((p) => !baseline.includes(p) && !exclude.includes(p));
  if (fresh.length === 0 || fresh.includes(wanted)) return null;
  const announced = portsInLog(log).filter((p) => fresh.includes(p));
  return announced[0] ?? Math.min(...fresh);
}
