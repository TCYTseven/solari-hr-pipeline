// Small shared helpers: process spawning and pure text utilities.
import { spawn } from "node:child_process";

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface ProcResult {
  code: number;
  stdout: string;
  stderr: string;
  /** stdout and stderr interleaved in arrival order. */
  output: string;
  timedOut: boolean;
}

export interface ProcOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Kill the process after this many ms. */
  timeoutMs?: number;
  /** Bytes written to stdin, then stdin is closed. */
  input?: Buffer | string;
  onData?: (chunk: string) => void;
}

/** Spawn a process without a shell and collect its output. Never throws on non-zero exit. */
export function runProc(cmd: string, args: string[], opts: ProcOptions = {}): Promise<ProcResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: [opts.input != null ? "pipe" : "ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let output = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, opts.timeoutMs);
    }
    child.stdout!.setEncoding("utf8");
    child.stderr!.setEncoding("utf8");
    child.stdout!.on("data", (d: string) => {
      stdout += d;
      output += d;
      opts.onData?.(d);
    });
    child.stderr!.on("data", (d: string) => {
      stderr += d;
      output += d;
      opts.onData?.(d);
    });
    if (opts.input != null && child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.end(opts.input);
    }
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      const msg = `${cmd}: ${err.message}\n`;
      resolve({ code: 127, stdout, stderr: stderr + msg, output: output + msg, timedOut });
    });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? (signal ? 137 : 1), stdout, stderr, output, timedOut });
    });
  });
}

/** Like runProc but throws with the output tail when the exit code is non-zero. */
export async function mustRun(cmd: string, args: string[], opts: ProcOptions = {}): Promise<ProcResult> {
  const r = await runProc(cmd, args, opts);
  if (r.code !== 0) {
    const tail = errorTail(r.output, 6).join("\n");
    throw new Error(`${cmd} ${args[0] ?? ""} exited ${r.code}${r.timedOut ? " (timed out)" : ""}: ${tail}`);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Pure text helpers

 
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(?:\u0007|\u001b\\)|\u001b[()][A-Za-z0-9]/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI, "");
}

/** Normalize terminal output for storage: strip ANSI, resolve carriage-return overwrites. */
export function cleanOutput(s: string): string {
  return stripAnsi(s)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const parts = line.split("\r");
      return parts[parts.length - 1] ?? "";
    })
    .join("\n");
}

// Trailer lines that carry no information about the failure.
const TAIL_NOISE = [
  /^npm (error|ERR!)\s*(\d{3})?\s*$/,
  /A complete log of this run can be found in/,
  /^npm notice/,
  /^\[notice\] (A new release of pip|To update, run)/,
  /^# exit code \d+/,
];

/** Last `n` informative non-empty lines of `output`, ANSI stripped and trimmed on the right. */
export function errorTail(output: string, n = 4): string[] {
  return cleanOutput(output)
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "" && !TAIL_NOISE.some((re) => re.test(l.trim())))
    .slice(-n);
}

/** Keep logs bounded: head + tail with a marker in between. */
export function capLog(text: string, max = 200_000): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.3);
  const tail = max - head;
  const dropped = text.length - head - tail;
  return `${text.slice(0, head)}\n... ${dropped} characters truncated ...\n${text.slice(-tail)}`;
}

/** Quote one argument for POSIX sh. */
export function shellQuoteArg(arg: string): string {
  if (arg === "") return "''";
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function shellQuote(argv: string[]): string {
  return argv.map(shellQuoteArg).join(" ");
}

/** Replace any known secret value (and obvious key shapes) with a mask. */
export function redact(text: string, secrets: string[] = []): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 8) out = out.split(s).join("••••");
  }
  return out
    .replace(/\bsk-ant-[A-Za-z0-9_-]{10,}/g, "••••")
    .replace(/\bslr_(?:live|test)_[A-Za-z0-9_-]{6,}/g, "••••")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "••••")
    .replace(/([?&](?:pt_token|token|access_token|key)=)[^&\s"']+/gi, "$1••••");
}

/**
 * `redact` applied to every string inside a value (arrays and plain objects are
 * walked; Dates, Buffers and numbers pass through). Pure.
 */
export function redactDeep<T>(value: T, secrets: string[] = []): T {
  if (typeof value === "string") return redact(value, secrets) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, secrets)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactDeep(v, secrets);
    return out as T;
  }
  return value;
}

export function truncate(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= n) return one;
  const cut = one.slice(0, Math.max(0, n - 3));
  // Prefer ending on a whole word when one ends reasonably close to the limit.
  const space = cut.lastIndexOf(" ");
  const head = space >= cut.length * 0.6 ? cut.slice(0, space) : cut;
  return `${head.trimEnd()}...`;
}

/**
 * The dashboard renders summaries as two paragraphs split on a blank line.
 * If the model returned one block, split it at the sentence end nearest the middle.
 */
export function twoParagraphs(text: string): string {
  const t = text.trim();
  if (/\n\s*\n/.test(t)) return t;
  const flat = t.replace(/\s*\n\s*/g, " ");
  const ends = [...flat.matchAll(/[.!?](?=\s+[A-Z"'(])/g)].map((m) => (m.index ?? 0) + 1);
  if (ends.length === 0 || flat.length < 240) return flat;
  const mid = flat.length / 2;
  const at = ends.reduce((best, e) => (Math.abs(e - mid) < Math.abs(best - mid) ? e : best));
  return `${flat.slice(0, at).trim()}\n\n${flat.slice(at).trim()}`;
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function pool<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
}

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Ctrl-C handling: a stop flag checked between stages, plus process-wide
// cleanup (containers, VMs) so an interrupt does not leak resources.

let stopping = false;

export class InterruptedError extends Error {
  constructor() {
    super("run interrupted (SIGINT/SIGTERM)");
    this.name = "InterruptedError";
  }
}

export function requestStop(): void {
  stopping = true;
}

export function isStopping(): boolean {
  return stopping;
}

export function throwIfStopping(): void {
  if (stopping) throw new InterruptedError();
}

const cleanups = new Set<() => Promise<void>>();

export function onCleanup(fn: () => Promise<void>): () => void {
  cleanups.add(fn);
  return () => cleanups.delete(fn);
}

export async function runCleanups(): Promise<void> {
  const fns = [...cleanups];
  cleanups.clear();
  await Promise.allSettled(fns.map((f) => f()));
}
