// Media files for the dashboard: ${MEDIA_DIR}/<owner>/<runId>/<file>, served as /media/...
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Browser, chromium } from "playwright";
import { config } from "./config";
import { cleanOutput } from "./util";

export interface MediaRun {
  dir: string;
  url(file: string): string;
  file(file: string): string;
}

export function mediaRun(owner: string, runId: string): MediaRun {
  const dir = path.join(config.mediaDir, owner, runId);
  fs.mkdirSync(dir, { recursive: true });
  const prefix = config.mediaUrlPrefix.replace(/\/+$/, "");
  return {
    dir,
    url: (file) => `${prefix}/${encodeURIComponent(owner)}/${runId}/${file}`,
    file: (file) => path.join(dir, file),
  };
}

/** Write via a temp file + rename so the dashboard never serves a half-written file. */
export function writeAtomic(file: string, data: Buffer | Uint8Array | string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/** Chromium for local demos and thumbnails: CHROMIUM_PATH, else Playwright's own download. */
export function chromiumExecutable(): string | undefined {
  const p = config.chromiumPath;
  if (p && fs.existsSync(p)) return p;
  return undefined;
}

export function runningAsRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

export async function launchLocalChromium(): Promise<Browser> {
  try {
    // Untrusted pages load in this browser: keep Chromium's own sandbox on. It cannot
    // start as root (as in some CI containers), so only there it is turned off.
    return await chromium.launch({ headless: true, executablePath: chromiumExecutable(), chromiumSandbox: !runningAsRoot() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Executable doesn't exist|browserType\.launch/i.test(msg) && !chromiumExecutable()) {
      throw new Error(`Local Chromium not found. Run \`npx playwright install chromium\` or set CHROMIUM_PATH. (${msg.split("\n")[0]})`);
    }
    throw err;
  }
}

/** An ffmpeg that can encode VP8: FFMPEG_PATH, Playwright's bundled one, or `ffmpeg` on PATH. */
export function findFfmpeg(): string | null {
  const candidates: string[] = [];
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), "Library", "Caches", "ms-playwright"),
    path.join(os.homedir(), ".cache", "ms-playwright"),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ms-playwright") : undefined,
  ].filter((r): r is string => !!r && fs.existsSync(r));
  for (const root of roots) {
    const dirs = fs.readdirSync(root).filter((d) => /^ffmpeg-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const bin of ["ffmpeg-mac", "ffmpeg-linux", "ffmpeg-win64.exe"]) candidates.push(path.join(root, d, bin));
    }
  }
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) if (dir) candidates.push(path.join(dir, "ffmpeg"));
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

/**
 * Turn timestamped JPEG frames into a WebM slideshow (each frame held until the
 * next one). The fallback when live recording is not available. Uses the same
 * mjpeg -> vp8 path as Playwright's own recorder, so Playwright's minimal ffmpeg
 * build is enough. Returns false when no ffmpeg is found or encoding fails.
 */
export async function encodeFramesWebm(frames: { t: number; jpeg: Buffer }[], durationSec: number, outFile: string, fps = 4): Promise<boolean> {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg || frames.length === 0) return false;
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const total = Math.max(durationSec, sorted[sorted.length - 1]!.t + 1);
  const count = Math.max(1, Math.ceil(total * fps));
  const { spawn } = await import("node:child_process");
  const tmp = `${outFile}.${process.pid}.tmp.webm`;
  const child = spawn(
    ffmpeg,
    ["-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "pipe:0",
      "-an", "-c:v", "vp8", "-b:v", "1M", "-deadline", "realtime", "-speed", "8", "-y", tmp],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  let stderr = "";
  let exited = false;
  child.stderr!.on("data", (d: Buffer) => (stderr += d.toString()));
  const done = new Promise<number>((resolve) => {
    child.on("error", () => {
      exited = true;
      resolve(-1);
    });
    child.on("close", (code) => {
      exited = true;
      resolve(code ?? -1);
    });
  });
  child.stdin!.on("error", () => {});
  let j = 0;
  for (let i = 0; i < count && !exited; i++) {
    const at = i / fps;
    while (j + 1 < sorted.length && sorted[j + 1]!.t <= at) j++;
    if (!child.stdin!.write(sorted[j]!.jpeg)) {
      await Promise.race([new Promise<void>((r) => child.stdin!.once("drain", () => r())), done]);
    }
  }
  child.stdin!.end();
  const code = await done;
  if (code !== 0 || !fs.existsSync(tmp) || fs.statSync(tmp).size === 0) {
    fs.rmSync(tmp, { force: true });
    if (stderr) console.warn(`[media] frame encode failed: ${stderr.trim().split("\n").pop()}`);
    return false;
  }
  fs.renameSync(tmp, outFile);
  return true;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The last `n` display lines of an output, tabs expanded, long lines clipped. */
export function terminalLines(output: string, n = 24, width = 110): string[] {
  const lines = cleanOutput(output)
    .replace(/\t/g, "    ")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(-n).map((l) => (l.length > width ? `${l.slice(0, width - 1)}…` : l));
}

/**
 * Font size for a terminal thumbnail: large for short output so a card's
 * small preview stays readable, down to 15px for a full 24 lines, and never
 * wider than the frame for the longest line.
 */
export function terminalFontPx(lines: string[]): number {
  const byHeight = Math.floor(620 / (Math.max(lines.length, 1) * 1.6));
  const longest = Math.max(20, ...lines.map((l) => l.length));
  const byWidth = Math.floor(1220 / (longest * 0.62));
  return Math.max(12, Math.min(30, byHeight, byWidth));
}

export function terminalHtml(title: string, lines: string[]): string {
  const body = lines
    .map((l) => {
      const cls = l.startsWith("$ ") ? "cmd" : /error|fail|traceback|exception/i.test(l) ? "err" : "";
      return `<div class="l ${cls}">${escapeHtml(l) || "&nbsp;"}</div>`;
    })
    .join("");
  const px = terminalFontPx(lines);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1280px;height:720px;background:#0F1514;overflow:hidden}
  .bar{height:40px;display:flex;align-items:center;gap:8px;padding:0 20px;border-bottom:1px solid #2A3C3A;color:#939599;
    font:13px "JetBrains Mono","SFMono-Regular",Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace}
  .dot{width:11px;height:11px;border-radius:50%;background:#2A3C3A}
  .t{margin-left:12px}
  pre{margin:0;padding:${Math.round(px * 1.2)}px ${Math.round(px * 1.6)}px;color:#E7E7E2;
    font:${px}px/1.6 "JetBrains Mono","SFMono-Regular",Menlo,Consolas,"DejaVu Sans Mono","Liberation Mono",monospace}
  .l{white-space:pre;overflow:hidden}
  .cmd{color:#82AAFF}
  .err{color:#FF6B5A}
</style></head><body><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="t">${escapeHtml(title)}</span></div><pre>${body}</pre></body></html>`;
}

/** Render run output as a dark terminal screenshot (1280x720 PNG). */
export async function renderTerminalPng(title: string, output: string, outFile: string): Promise<void> {
  const browser = await launchLocalChromium();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(terminalHtml(title, terminalLines(output)), { waitUntil: "load" });
    const png = await page.screenshot({ type: "png" });
    writeAtomic(outFile, png);
  } finally {
    await browser.close();
  }
}
