// An executor provides an isolated box (Docker container or Solari VM) that the
// screen step drives through the same stages: create, clone, install, boot, release.
import type { StageTiming } from "../../lib/types";
import { shellQuoteArg } from "../util";

export interface ExecResult {
  exitCode: number;
  /** Combined stdout + stderr, in arrival order where the transport allows. */
  output: string;
  timedOut: boolean;
}

export interface ExecOptions {
  /** Directory inside the box, relative to the repo root ("." for the root, "/" for the filesystem root). */
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
  /** A desktop VM: the app runs on its display and the agent drives the desktop itself. */
  readonly kind: "sandbox" | "desktop";
  /** Human description of the box for the install log, e.g. "docker run ... (container 1a2b3c)". */
  readonly description: string;
  /** Absolute path of the repo checkout inside the box. */
  readonly repoPath: string;
  /** In-box port the relay listens on (the one exposed to the demo browser). */
  readonly relayPort: number;
  create(log: (s: string) => void): Promise<void>;
  /**
   * Put the screened commit at repoPath. `tar` is a `git archive --prefix=repo/`
   * tarball; `sourceUrl` + `sha` allow an in-guest clone when the fork is remote.
   */
  clone(input: { tar: Buffer; sourceUrl: string | null; sha: string }, log: (s: string) => void): Promise<ExecResult>;
  /** Run a POSIX sh script inside the box with a timeout. */
  exec(script: string, opts: ExecOptions): Promise<ExecResult>;
  /**
   * Start a script in the background, detached from the caller; output goes to
   * logFile and the pid to pidFile. On a desktop VM it starts on the display.
   */
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
  /** Remove boxes a crashed screener left behind (labelled containers, tagged VMs). Never throws. */
  cleanupOrphans(log: (s: string) => void): Promise<void>;
  box(spec: BoxSpec): Box;
}

/** Where the in-box relay records its pid, so it can be restarted on another target port. */
export const RELAY_PID = "/tmp/screener-relay.pid";

/**
 * Node HTTP relay run inside the box: serves 0.0.0.0:<listen> and forwards to the
 * app on localhost:<target> (IPv4, then IPv6), so apps bound to 127.0.0.1 are
 * reachable. It rewrites Host to localhost:<target> (dev servers such as Vite and
 * webpack-dev-server reject the preview gateway's Host), keeps the original in
 * X-Forwarded-Host, turns absolute redirects to localhost into relative ones and
 * relays WebSocket upgrades. Answers 502 while the app is not listening.
 */
export const RELAY_JS = `"use strict";
const http = require("http");
const net = require("net");
const fs = require("fs");
const [listen, target] = process.argv.slice(2).map(Number);
const HOSTS = ["127.0.0.1", "::1"];
let preferred = 0;
const HOP = ["connection", "keep-alive", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"];
function pickHost(cb) {
  const order = [preferred, 1 - preferred];
  const tryAt = (i) => {
    if (i >= order.length) return cb(null);
    const s = net.connect(target, HOSTS[order[i]]);
    s.once("connect", () => { s.destroy(); preferred = order[i]; cb(HOSTS[order[i]]); });
    s.once("error", () => tryAt(i + 1));
  };
  tryAt(0);
}
function forwardHeaders(h, keepUpgrade) {
  const out = {};
  for (const [k, v] of Object.entries(h)) if (keepUpgrade || !HOP.includes(k)) out[k] = v;
  if (h.host) out["x-forwarded-host"] = h.host;
  if (!out["x-forwarded-proto"]) out["x-forwarded-proto"] = "http";
  out.host = "localhost:" + target;
  return out;
}
const LOCAL = new RegExp("^https?://(localhost|127\\\\.0\\\\.0\\\\.1|\\\\[::1\\\\]|0\\\\.0\\\\.0\\\\.0):" + target + "(?=/|$)", "i");
const server = http.createServer((req, res) => {
  pickHost((host) => {
    if (!host) {
      res.writeHead(502, { "content-type": "text/plain" });
      return res.end("screener relay: the app is not listening yet\\n");
    }
    const up = http.request({ host, port: target, method: req.method, path: req.url, headers: forwardHeaders(req.headers, false) }, (r) => {
      const headers = {};
      for (const [k, v] of Object.entries(r.headers)) if (!HOP.includes(k)) headers[k] = v;
      if (typeof headers.location === "string") headers.location = headers.location.replace(LOCAL, "") || "/";
      res.writeHead(r.statusCode || 502, headers);
      r.pipe(res);
    });
    up.on("error", () => {
      if (!res.headersSent) { res.writeHead(502, { "content-type": "text/plain" }); res.end("screener relay: upstream error\\n"); }
      else res.destroy();
    });
    req.pipe(up);
  });
});
server.on("upgrade", (req, sock, head) => {
  pickHost((host) => {
    if (!host) return sock.destroy();
    const up = net.connect(target, host, () => {
      let raw = req.method + " " + req.url + " HTTP/" + req.httpVersion + "\\r\\n";
      for (const [k, v] of Object.entries(forwardHeaders(req.headers, true))) for (const x of [].concat(v)) raw += k + ": " + x + "\\r\\n";
      up.write(raw + "\\r\\n");
      if (head && head.length) up.write(head);
      sock.pipe(up).pipe(sock);
    });
    up.on("error", () => sock.destroy());
    sock.on("error", () => up.destroy());
  });
});
let tries = 0;
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && tries++ < 25) setTimeout(() => server.listen(listen, "0.0.0.0"), 200);
  else process.exit(1);
});
server.listen(listen, "0.0.0.0", () => fs.writeFileSync(${JSON.stringify(RELAY_PID)}, String(process.pid)));
`;

/**
 * sh that prints `__HTTP__ <status>` for GET http://localhost:<port>/ from inside
 * the box (IPv4, then IPv6), or `__HTTP__ 000` when nothing answers. Uses curl
 * when present, else python3, else node: the guest image is not assumed. Any
 * HTTP status means the app is up. Pure.
 */
export function readinessScript(port: number): string {
  const p = String(Math.trunc(port));
  const py =
    "import http.client,sys\ntry:\n c=http.client.HTTPConnection(sys.argv[1],int(sys.argv[2]),timeout=3)\n c.request('GET','/')\n print(c.getresponse().status)\nexcept Exception:\n print('000')";
  const js =
    "const r=require('http').get({host:process.argv[1],port:+process.argv[2],path:'/',timeout:3000},s=>{console.log(s.statusCode);process.exit(0)});" +
    "r.on('error',()=>{console.log('000');process.exit(0)});r.on('timeout',()=>{console.log('000');process.exit(0)})";
  return [
    "__code=000",
    "for __h in 127.0.0.1 ::1; do",
    "  if command -v curl >/dev/null 2>&1; then",
    `    case "$__h" in *:*) __u="http://[$__h]:${p}/";; *) __u="http://$__h:${p}/";; esac`,
    "    __c=$(curl -s -o /dev/null -m 3 -w '%{http_code}' \"$__u\" 2>/dev/null)",
    "  elif command -v python3 >/dev/null 2>&1; then",
    `    __c=$(python3 -c ${shellQuoteArg(py)} "$__h" ${p} 2>/dev/null)`,
    "  elif command -v node >/dev/null 2>&1; then",
    `    __c=$(node -e ${shellQuoteArg(js)} "$__h" ${p} 2>/dev/null)`,
    "  fi",
    '  case "$__c" in ""|000) ;; *) __code=$__c; break;; esac',
    "done",
    'echo "__HTTP__ $__code"',
  ].join("\n");
}

/** Parse the status printed by readinessScript: true when the app answered HTTP. Pure. */
export function parseReadiness(output: string): { up: boolean; status: number | null } {
  const m = /__HTTP__ (\d{3})/.exec(output);
  const status = m ? Number(m[1]) : null;
  return { up: status != null && status > 0, status: status && status > 0 ? status : null };
}

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
