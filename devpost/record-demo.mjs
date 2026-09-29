// Records a captioned walkthrough of a running dashboard and encodes it as
// devpost/demo.mp4 (for X, Devpost and GitHub uploads) and devpost/demo.gif
// (plays inline in the README).
//
//   node devpost/record-demo.mjs [baseUrl]      # default http://localhost:3000
//
// Needs ffmpeg with libx264 on PATH, or FFMPEG=/path/to/ffmpeg. The frames come
// from Chrome's screencast (sharper than Playwright's recordVideo), with a
// drawn cursor, key hints and captions, since headless Chrome shows none.
// Set CHROMIUM_PATH to use an existing Chromium. DETAIL picks the submission
// to open (a booted web app; alice-chen is in the sample data).
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const here = dirname(fileURLToPath(import.meta.url));
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const DETAIL = process.env.DETAIL ?? "alice-chen";
const W = 1440;
const H = 900;

// Cursor, click ripple, key hints and a caption bar, drawn into every page.
const overlay = () => {
  const css = `
    #demo-cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 2147483647;
      pointer-events: none; transform: translate(-100px, -100px); transition: none; }
    .demo-ripple { position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
      border: 2px solid #f5b301; z-index: 2147483646; pointer-events: none; animation: demo-ripple .5s ease-out forwards; }
    @keyframes demo-ripple { from { transform: scale(.4); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
    #demo-caption { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 2147483645;
      pointer-events: none; padding: 12px 22px; border-radius: 10px; background: rgba(8,10,14,.92);
      border: 1px solid rgba(245,179,1,.55); color: #fff; font: 500 20px/1.3 Inter, system-ui, sans-serif;
      letter-spacing: -.01em; white-space: nowrap; box-shadow: 0 12px 40px rgba(0,0,0,.5); transition: opacity .25s; }
    #demo-key { position: fixed; right: 32px; bottom: 30px; z-index: 2147483645; pointer-events: none; min-width: 44px;
      padding: 8px 14px; border-radius: 8px; background: #17171d; border: 1px solid rgba(255,255,255,.3);
      color: #fff; font: 600 18px/1 "JetBrains Mono", ui-monospace, monospace; text-align: center; opacity: 0; transition: opacity .15s; }`;
  const mount = () => {
    if (document.getElementById("demo-cursor")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l15 8.5-6.5 1.6L8.2 18z" fill="#fff" stroke="#080a0e" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    const caption = document.createElement("div");
    caption.id = "demo-caption";
    caption.style.opacity = "0";
    const key = document.createElement("div");
    key.id = "demo-key";
    document.body.append(cursor, caption, key);
    const last = window.__demoCursor;
    if (last) cursor.style.transform = `translate(${last.x - 3}px, ${last.y - 2}px)`;
    if (window.__demoCaptionText) {
      caption.textContent = window.__demoCaptionText;
      caption.style.opacity = "1";
    }
  };
  window.__demoMount = mount;
  document.addEventListener("DOMContentLoaded", mount);
  window.addEventListener(
    "mousemove",
    (e) => {
      window.__demoCursor = { x: e.clientX, y: e.clientY };
      const c = document.getElementById("demo-cursor");
      if (c) c.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`;
    },
    true,
  );
  window.addEventListener(
    "mousedown",
    (e) => {
      const r = document.createElement("div");
      r.className = "demo-ripple";
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      document.body.append(r);
      setTimeout(() => r.remove(), 600);
    },
    true,
  );
  let keyTimer;
  window.addEventListener(
    "keydown",
    (e) => {
      const k = document.getElementById("demo-key");
      if (!k) return;
      k.textContent = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      k.style.opacity = "1";
      clearTimeout(keyTimer);
      keyTimer = setTimeout(() => (k.style.opacity = "0"), 700);
    },
    true,
  );
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const work = await mkdtemp(join(tmpdir(), "screener-demo-"));
try {
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await context.addInitScript(overlay);
  const page = await context.newPage();

  const pause = (ms) => page.waitForTimeout(ms);
  const caption = (text) =>
    page.evaluate((t) => {
      window.__demoCaptionText = t;
      window.__demoMount?.();
      const c = document.getElementById("demo-caption");
      if (!c) return;
      c.textContent = t;
      c.style.opacity = t ? "1" : "0";
    }, text);
  let at = { x: W / 2, y: H / 2 };
  const moveTo = async (locator, dx = 0, dy = 0) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Not visible: ${locator}`);
    const to = { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
    const steps = Math.max(12, Math.round(Math.hypot(to.x - at.x, to.y - at.y) / 18));
    await page.mouse.move(to.x, to.y, { steps });
    at = to;
    await pause(180);
  };
  const click = async (locator, dx, dy) => {
    await moveTo(locator, dx, dy);
    await page.mouse.down();
    await pause(70);
    await page.mouse.up();
  };
  const scrollBy = async (y, ms = 900) => {
    const n = Math.round(ms / 30);
    for (let i = 0; i < n; i++) {
      await page.mouse.wheel(0, y / n);
      await pause(30);
    }
  };

  await page.goto(base + "/", { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(at.x, at.y);

  // Chrome only sends a frame when the page changes; each frame's timestamp
  // says how long it stays on screen.
  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    frames.push({ data, t: metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

  // 1. The grid.
  await caption("Each fork of the Solari cookbook, booted, demoed and scored");
  await pause(2600);
  const filters = page.getByRole("complementary", { name: "Filters" });
  await caption("Filter by status or Solari product");
  await click(filters.getByRole("button", { name: /^Booted/ }));
  await pause(1300);
  await click(filters.getByRole("button", { name: /^Desktop/ }));
  await pause(1300);
  await click(filters.getByRole("button", { name: /^Any product/ }));
  await click(filters.getByRole("button", { name: /^All/ }));
  await pause(700);
  await caption("Search by name, project or stack");
  await click(page.getByPlaceholder("Search by name, project or stack"));
  await page.keyboard.type("price", { delay: 110 });
  await pause(1100);

  // 2. One submission.
  await click(page.getByRole("link", { name: /solari-price-watch/ }).first());
  await page.waitForURL(`**/s/${DETAIL}**`);
  await caption("Each submission: the recorded demo, a step timeline and the score");
  await pause(2400);
  const dots = page.getByRole("button", { name: /^\d+:\d\d / });
  await click(dots.nth(4));
  await pause(1200);
  await click(dots.nth(6));
  await pause(1200);
  await caption("Every action the Claude demo agent took, with its reasoning");
  await click(page.getByRole("tab", { name: /Agent steps/ }));
  await pause(500);
  await scrollBy(420);
  await pause(2400);

  // 3. Review.
  await caption("Review: ranked by score, with a live preview");
  await click(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Review" }));
  await page.waitForURL("**/review");
  await pause(1400);
  await click(page.getByRole("heading", { name: "Review" }));
  for (const key of ["j", "j", "j", "k"]) {
    await page.keyboard.press(key);
    await pause(750);
  }
  await caption("Or as a table, with boot time and a link to each demo");
  await click(page.getByRole("button", { name: "Table", exact: true }));
  await pause(2200);

  // 4. Stats.
  await caption("Stats: boot time, Solari product usage and common build failures");
  await click(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Stats" }));
  await page.waitForURL("**/stats");
  await pause(2600);
  await scrollBy(300);
  await pause(1600);

  // 5. How it works.
  await caption("One Solari key covers the sandbox, the browser and the desktop");
  await click(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "How it works" }));
  await page.waitForURL("**/how");
  await pause(1800);
  await click(page.getByRole("tab", { name: "Browser" }));
  await pause(1500);
  await click(page.getByRole("tab", { name: "Desktop" }));
  await pause(2200);

  await cdp.send("Page.stopScreencast");
  await context.close();
  if (frames.length < 2) throw new Error("The screencast produced no frames");

  // concat list: each frame shown until the next one arrived; hold the last.
  let list = "";
  for (let i = 0; i < frames.length; i++) {
    const name = `f${String(i).padStart(5, "0")}.jpg`;
    await writeFile(join(work, name), Buffer.from(frames[i].data, "base64"));
    const dur = i + 1 < frames.length ? Math.max(frames[i + 1].t - frames[i].t, 0.001) : 1.5;
    list += `file '${name}'\nduration ${dur.toFixed(4)}\n`;
  }
  list += `file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
  await writeFile(join(work, "frames.txt"), list);

  const mp4 = join(here, "demo.mp4");
  const gif = join(here, "demo.gif");
  const run = (args) => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
  run(["-f", "concat", "-safe", "0", "-i", join(work, "frames.txt"), "-vf", "fps=30,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-movflags", "+faststart", mp4]);
  run(["-i", mp4, "-vf",
    "fps=10,scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    gif]);
  console.log(`✓ ${frames.length} frames -> ${mp4}, ${gif}`);
} finally {
  await browser.close();
  await rm(work, { recursive: true, force: true });
}
