// Demo surfaces the computer-use agent drives: a Playwright browser (local
// Chromium or a Solari Browser session over CDP) or a Solari Desktop.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Solari } from "@solarisdk/browser";
import type { Desktop } from "@solarisdk/sdk";
import { type Browser, type BrowserContext, type Page, chromium } from "playwright";
import type { Product, StageTiming } from "../../lib/types";
import { config } from "../config";
import { DISPLAY_DETECT, applySolariWsMode, withConcurrencyRetry } from "../executors/solari";
import { launchLocalChromium } from "../media";
import { onCleanup, shellQuoteArg, sleep } from "../util";
import { toPlaywrightKey } from "./captions";
import { shouldBlockRequest, withPreviewToken } from "./netguard";

export type ActionInput = Record<string, unknown>;

export interface Surface {
  readonly label: StageTiming["surface"];
  readonly product: Product;
  readonly width: number;
  readonly height: number;
  /** Epoch ms when the recording started (DemoStep.t is relative to it). */
  videoStartedAt: number;
  vmCount: number;
  vmSeconds(): number;
  /** Create the browser/desktop, start recording and show the app. */
  open(url: string | null): Promise<void>;
  screenshot(): Promise<Buffer>;
  /** Small JPEG for the live frame. */
  liveFrame(): Promise<Buffer>;
  /** Execute one computer-toolset member. Returns text for members that report something. */
  perform(member: string, input: ActionInput): Promise<string | void>;
  /** What is under (x, y) and whether the focused field is a password, for captions. */
  describe(x: number | null, y: number | null): Promise<{ target: string | null; password: boolean }>;
  /** Stop recording and write the video into dir. Returns the file name or null. */
  finish(dir: string): Promise<string | null>;
  /** Release everything. Idempotent; never throws. */
  close(): Promise<void>;
}

function xy(input: ActionInput, key = "coordinate"): [number, number] | null {
  const v = input[key];
  return Array.isArray(v) && v.length === 2 ? [Number(v[0]), Number(v[1])] : null;
}

const MODIFIERS: Record<string, string> = { ctrl: "Control", control: "Control", shift: "Shift", alt: "Alt", super: "Meta", cmd: "Meta", meta: "Meta" };

function modifierKeys(text: unknown): string[] {
  if (typeof text !== "string" || !text.trim()) return [];
  return text
    .split("+")
    .map((k) => MODIFIERS[k.trim().toLowerCase()])
    .filter((k): k is string => !!k);
}

// ---------------------------------------------------------------------------
// Playwright browser surface

abstract class PlaywrightSurface implements Surface {
  abstract readonly label: StageTiming["surface"];
  readonly product = "browser" as const;
  readonly width = config.viewport.width;
  readonly height = config.viewport.height;
  videoStartedAt = 0;
  vmCount = 0;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  private videoDir = fs.mkdtempSync(path.join(os.tmpdir(), "screener-video-"));
  private recording = false;
  private closed = false;

  protected abstract connect(): Promise<Browser>;
  protected async disconnect(): Promise<void> {}
  vmSeconds(): number {
    return 0;
  }

  async open(url: string | null): Promise<void> {
    this.browser = await this.connect();
    const viewport = { width: this.width, height: this.height };
    try {
      this.context = await this.browser.newContext({ viewport, recordVideo: { dir: this.videoDir, size: viewport } });
      this.recording = true;
    } catch {
      // Some CDP endpoints refuse new contexts: fall back to the default one, no video.
      this.context = this.browser.contexts()[0] ?? (await this.browser.newContext({ viewport }));
    }
    await this.guardNetwork(url);
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    if (!this.recording) await this.page.setViewportSize(viewport);
    this.videoStartedAt = Date.now();
    // Follow popups / target=_blank so the agent keeps seeing what it opened.
    this.context.on("page", (p) => {
      this.page = p;
      void p.setViewportSize(viewport).catch(() => {});
    });
    if (url) {
      await this.page.goto(url, { waitUntil: "load", timeout: 45_000 }).catch(async () => {
        await this.page!.waitForTimeout(1000);
      });
      await this.page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
    }
  }

  /**
   * The page is untrusted: block requests to loopback, private and link-local
   * hosts (the screener's machine, the Docker host, the LAN, cloud metadata)
   * except the app's own origin; and add the preview `pt_token` to same-origin
   * requests that lost it.
   */
  private async guardNetwork(appUrl: string | null): Promise<void> {
    const ctx = this.context!;
    const origin = appUrl ? new URL(appUrl).origin : null;
    await ctx.route("**/*", async (route) => {
      const url = route.request().url();
      if (shouldBlockRequest(url, origin)) return route.abort("blockedbyclient");
      const withToken = withPreviewToken(url, appUrl);
      return withToken ? route.continue({ url: withToken }) : route.continue();
    });
    await ctx.routeWebSocket(
      (u) => shouldBlockRequest(u.href, origin),
      (ws) => ws.close(),
    );
  }

  private p(): Page {
    if (!this.page) throw new Error("browser not open");
    return this.page;
  }

  /** Map ctrl+a/c/v/x/z/y to Cmd on a local macOS browser. */
  protected macShortcuts = false;

  async screenshot(): Promise<Buffer> {
    return this.p().screenshot({ type: "png", timeout: 15_000 });
  }

  async liveFrame(): Promise<Buffer> {
    return this.p().screenshot({ type: "jpeg", quality: 60, timeout: 15_000 });
  }

  async perform(member: string, input: ActionInput): Promise<string | void> {
    const page = this.p();
    const m = page.mouse;
    const c = xy(input);
    const mods = modifierKeys(input.text);
    const withMods = async (fn: () => Promise<void>) => {
      for (const k of mods) await page.keyboard.down(k);
      try {
        await fn();
      } finally {
        for (const k of mods.reverse()) await page.keyboard.up(k);
      }
    };
    switch (member) {
      case "left_click":
      case "right_click":
      case "middle_click":
      case "double_click":
      case "triple_click": {
        const button = member === "right_click" ? "right" : member === "middle_click" ? "middle" : "left";
        const clickCount = member === "double_click" ? 2 : member === "triple_click" ? 3 : 1;
        await withMods(async () => {
          if (c) await m.click(c[0], c[1], { button, clickCount });
          else {
            await m.down({ button, clickCount });
            await m.up({ button, clickCount });
          }
        });
        break;
      }
      case "mouse_move":
        if (c) await m.move(c[0], c[1], { steps: 5 });
        break;
      case "left_click_drag": {
        const from = xy(input, "start_coordinate");
        if (from && c) {
          await m.move(from[0], from[1]);
          await m.down();
          await m.move(c[0], c[1], { steps: 12 });
          await m.up();
        }
        break;
      }
      case "left_mouse_down":
        await m.down();
        break;
      case "left_mouse_up":
        await m.up();
        break;
      case "type":
        await page.keyboard.type(String(input.text ?? ""), { delay: 15 });
        break;
      case "key": {
        const times = Math.min(Math.max(Number(input.repeat ?? 1) || 1, 1), 50);
        const key = toPlaywrightKey(String(input.text ?? ""), { macShortcuts: this.macShortcuts });
        for (let i = 0; i < times; i++) await page.keyboard.press(key);
        break;
      }
      case "hold_key": {
        const k = toPlaywrightKey(String(input.text ?? ""));
        await page.keyboard.down(k);
        await sleep(Math.min(Number(input.duration ?? 1), 5) * 1000);
        await page.keyboard.up(k);
        break;
      }
      case "scroll": {
        if (c) await m.move(c[0], c[1]);
        const amount = Math.min(Math.max(Number(input.scroll_amount ?? 3) || 3, 1), 20) * 100;
        const dir = String(input.scroll_direction ?? "down");
        await withMods(() => m.wheel(dir === "left" ? -amount : dir === "right" ? amount : 0, dir === "up" ? -amount : dir === "down" ? amount : 0));
        break;
      }
      case "wait":
        await sleep(Math.min(Math.max(Number(input.duration ?? 1), 0), 10) * 1000);
        break;
      case "cursor_position":
        return "Cursor position is not tracked in this browser; take a screenshot instead.";
      default:
        throw new Error(`unsupported action ${member}`);
    }
    // Let the page react before the next screenshot.
    await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => {});
    await sleep(member === "type" ? 150 : 400);
  }

  async describe(x: number | null, y: number | null): Promise<{ target: string | null; password: boolean }> {
    try {
      return await this.p().evaluate(
        ([px, py]) => {
          const active = document.activeElement as HTMLInputElement | null;
          const password = !!active && active.tagName === "INPUT" && active.type === "password";
          if (px == null || py == null) return { target: null, password };
          let el = document.elementFromPoint(px, py) as HTMLElement | null;
          const interactive = el?.closest("button,a,input,select,textarea,label,summary,[role=button],[role=link],[role=tab],[role=menuitem],[onclick]") as HTMLElement | null;
          if (interactive) el = interactive;
          if (!el) return { target: null, password };
          const input = el as HTMLInputElement;
          const field = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
          // "Product URL, e.g. shop.example.com/widget" -> "Product URL"
          const placeholder = (input.placeholder || "").split(/,?\s+(?:e\.g\.|eg\.|for example|\()/i)[0];
          const text =
            el.getAttribute("aria-label") ||
            (field
              ? (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : "") ||
                el.closest("label")?.textContent ||
                placeholder ||
                input.name ||
                el.tagName.toLowerCase()
              : el.innerText) ||
            el.getAttribute("title") ||
            el.getAttribute("alt") ||
            "";
          const clean = String(text).replace(/\s+/g, " ").trim();
          return { target: clean ? clean.slice(0, 60) : null, password };
        },
        [x, y] as const,
      );
    } catch {
      return { target: null, password: false };
    }
  }

  async finish(dir: string): Promise<string | null> {
    const video = this.recording ? this.page?.video() ?? null : null;
    // Closing the context flushes the recording to disk.
    await this.context?.close().catch(() => {});
    this.context = null;
    if (!video) return null;
    try {
      const src = await video.path();
      if (!fs.existsSync(src) || fs.statSync(src).size === 0) return null;
      const dest = path.join(dir, "demo.webm");
      fs.copyFileSync(src, dest);
      return "demo.webm";
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    await this.disconnect().catch(() => {});
    fs.rmSync(this.videoDir, { recursive: true, force: true });
  }
}

/** Local Chromium via Playwright (Docker executor). */
export class LocalBrowserSurface extends PlaywrightSurface {
  readonly label = "Local browser" as const;
  protected macShortcuts = process.platform === "darwin";
  protected connect(): Promise<Browser> {
    return launchLocalChromium();
  }
}

/** A Solari Browser session, driven by the local Playwright over the SDK's in-process CDP endpoint. */
export class SolariBrowserSurface extends PlaywrightSurface {
  readonly label = "Browser" as const;
  private solari: Solari | null = null;
  private sessionId: string | null = null;
  private startedAt = 0;
  private endedAt = 0;
  private unregister: (() => void) | null = null;

  protected async connect(): Promise<Browser> {
    if (!config.solariApiKey) throw new Error("SOLARI_API_KEY is not set");
    applySolariWsMode();
    const solari = new Solari({ apiKey: config.solariApiKey, ...(config.solariBaseUrl ? { baseUrl: config.solariBaseUrl } : {}) });
    this.solari = solari;
    const session = await withConcurrencyRetry(() => solari.sessions.create({}));
    this.sessionId = session.id;
    this.startedAt = Date.now();
    this.vmCount = 1;
    // Ctrl-C releases the session too.
    this.unregister = onCleanup(() => this.close());
    // CDP has no client-version gate, so the regular playwright package can attach.
    return chromium.connectOverCDP(session.cdpEndpoint, { timeout: 30_000 });
  }

  vmSeconds(): number {
    return this.startedAt ? ((this.endedAt || Date.now()) - this.startedAt) / 1000 : 0;
  }

  protected async disconnect(): Promise<void> {
    const id = this.sessionId;
    this.sessionId = null;
    this.unregister?.();
    this.unregister = null;
    this.endedAt = Date.now();
    // Closing the socket does not release a session: always DELETE it.
    if (id && this.solari) await this.solari.sessions.releaseAndWait(id).catch(() => {});
    await this.solari?.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Solari Desktop surface (the desktop VM is also the box the app runs in)

export class SolariDesktopSurface implements Surface {
  readonly label = "Desktop" as const;
  readonly product = "desktop" as const;
  readonly width = config.desktopResolution.width;
  readonly height = config.desktopResolution.height;
  videoStartedAt = 0;
  /** Counted by the executor box, which owns the VM. */
  vmCount = 0;
  private recording = false;

  constructor(private desktop: Desktop) {}

  vmSeconds(): number {
    return 0;
  }

  /** Browser used for a web UI on the desktop (set by open). */
  browser: string | null = null;

  async open(url: string | null): Promise<void> {
    for (let i = 0; i < 40; i++) {
      const h = await this.desktop.health().catch(() => null);
      if (h?.ready && h.display) break;
      await sleep(500);
    }
    try {
      await this.desktop.record.start({ fps: 15 });
      this.recording = true;
    } catch {
      this.recording = false;
    }
    this.videoStartedAt = Date.now();
    if (url) await this.openBrowser(url);
    await sleep(1500); // give the app a moment to draw its window
  }

  /**
   * Show a web UI served inside the desktop VM: open the first browser the image
   * has at the in-VM URL. The app name is not documented, so probe for it.
   */
  private async openBrowser(url: string): Promise<void> {
    const probe = await this.desktop.commands.run("sh", {
      args: ["-c", "for b in google-chrome google-chrome-stable chromium chromium-browser firefox; do command -v $b >/dev/null 2>&1 && { echo $b; exit 0; }; done; echo none"],
    });
    const bin = probe.stdout.trim().split("\n").pop() ?? "none";
    if (bin === "none") throw new Error("no browser found on the desktop (tried google-chrome, chromium, firefox)");
    const args = bin.includes("firefox") ? ["--new-window", url] : ["--no-first-run", "--no-default-browser-check", "--new-window", url];
    this.browser = bin;
    try {
      await this.desktop.open(bin, args);
    } catch {
      const cmd = [bin, ...args].map(shellQuoteArg).join(" ");
      await this.desktop.process.start("sh", { args: ["-c", `${DISPLAY_DETECT} (exec nohup ${cmd}) >/tmp/screener-browser.log 2>&1 </dev/null &`] });
    }
    await sleep(4000); // first launch of a browser is slow
  }

  async screenshot(): Promise<Buffer> {
    return Buffer.from(await this.desktop.screenshot({ format: "png" }));
  }

  async liveFrame(): Promise<Buffer> {
    return Buffer.from(await this.desktop.screenshot({ format: "jpeg", quality: 60 }));
  }

  private async cursor(): Promise<[number, number]> {
    const c = await this.desktop.display.cursor();
    return [c.x, c.y];
  }

  async perform(member: string, input: ActionInput): Promise<string | void> {
    const d = this.desktop;
    const c = xy(input) ?? (["left_click", "right_click", "middle_click", "double_click", "triple_click"].includes(member) ? await this.cursor() : null);
    const mods = typeof input.text === "string" && member.endsWith("click") ? input.text.split("+").map((k) => k.trim()).filter(Boolean) : [];
    if (mods.length) await d.keyboard.down(mods);
    try {
      switch (member) {
        case "left_click":
          await d.mouse.click(c![0], c![1], { button: "left" });
          break;
        case "right_click":
          await d.mouse.click(c![0], c![1], { button: "right" });
          break;
        case "middle_click":
          await d.mouse.click(c![0], c![1], { button: "middle" });
          break;
        case "double_click":
          await d.mouse.doubleClick(c![0], c![1]);
          break;
        case "triple_click":
          for (let i = 0; i < 3; i++) await d.mouse.click(c![0], c![1]);
          break;
        case "mouse_move":
          if (c) await d.mouse.move(c[0], c[1]);
          break;
        case "left_click_drag": {
          const from = xy(input, "start_coordinate");
          if (from && c) await d.mouse.drag({ x: from[0], y: from[1] }, { x: c[0], y: c[1] });
          break;
        }
        case "left_mouse_down": {
          const [x, y] = await this.cursor();
          await d.mouse.down(x, y);
          break;
        }
        case "left_mouse_up": {
          const [x, y] = await this.cursor();
          await d.mouse.up(x, y);
          break;
        }
        case "type":
          await d.keyboard.type(String(input.text ?? ""));
          break;
        case "key": {
          const keys = String(input.text ?? "").split("+").map((k) => k.trim()).filter(Boolean);
          const times = Math.min(Math.max(Number(input.repeat ?? 1) || 1, 1), 50);
          for (let i = 0; i < times; i++) await d.keyboard.press(keys.length > 1 ? keys : keys[0]!);
          break;
        }
        case "hold_key": {
          const k = String(input.text ?? "");
          await d.keyboard.down(k);
          await sleep(Math.min(Number(input.duration ?? 1), 5) * 1000);
          await d.keyboard.up(k);
          break;
        }
        case "scroll": {
          if (c) await d.mouse.move(c[0], c[1]);
          const dir = String(input.scroll_direction ?? "down");
          const n = Math.min(Math.max(Number(input.scroll_amount ?? 3) || 3, 1), 20);
          // mouse.scroll has no direction: use xdotool wheel clicks (on the right display,
          // with a timeout), else paging keys.
          const btn = { up: "4", down: "5", left: "6", right: "7" }[dir] ?? "5";
          const r = await d.commands
            .run("sh", { args: ["-c", `${DISPLAY_DETECT} exec timeout 5 xdotool click --repeat ${n} ${btn}`] })
            .catch(() => null);
          if (!r || r.exitCode !== 0) {
            for (let i = 0; i < Math.ceil(n / 3); i++) await d.keyboard.press(dir === "up" ? "Page_Up" : "Page_Down");
          }
          break;
        }
        case "wait":
          await sleep(Math.min(Math.max(Number(input.duration ?? 1), 0), 10) * 1000);
          break;
        case "cursor_position": {
          const [x, y] = await this.cursor();
          return `X=${x},Y=${y}`;
        }
        default:
          throw new Error(`unsupported action ${member}`);
      }
    } finally {
      if (mods.length) await d.keyboard.up(mods).catch(() => {});
    }
    await sleep(member === "type" ? 200 : 500);
  }

  async describe(): Promise<{ target: string | null; password: boolean }> {
    return { target: null, password: false };
  }

  async finish(dir: string): Promise<string | null> {
    if (!this.recording) return null;
    this.recording = false;
    const stopped = await this.desktop.record.stop();
    let bytes: Uint8Array;
    try {
      const { url } = await this.desktop.downloadUrl(stopped.path);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch {
      bytes = await this.desktop.files.read(stopped.path);
    }
    if (!bytes.length) return null;
    fs.writeFileSync(path.join(dir, "demo.mp4"), bytes);
    return "demo.mp4";
  }

  async close(): Promise<void> {
    if (this.recording) await this.desktop.record.stop().catch(() => {});
    this.recording = false;
  }
}
