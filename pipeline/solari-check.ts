// `npm run solari:check`: verify a Solari key end to end with one sandbox, one
// browser session and one desktop, printing how long each step took.
import fs from "node:fs";
import path from "node:path";
import { Solari, SolariError as BrowserError } from "@solarisdk/browser";
import { AuthError, ConcurrencyLimitError, GatewayError, NoCapacityError, PlanError, type Desktop, type Sandbox, SolariError, SolariClient } from "@solarisdk/sdk";
import { chromium } from "playwright";
import { config } from "./config";

const rows: [string, string][] = [];
let failed = 0;

function ms(t0: number): string {
  const d = performance.now() - t0;
  return d < 1000 ? `${Math.round(d)}ms` : `${(d / 1000).toFixed(2)}s`;
}

function explain(err: unknown): string {
  if (err instanceof AuthError) return "401 Unauthorized: SOLARI_API_KEY is wrong or revoked.";
  if (err instanceof PlanError) return "402: this feature needs a paid Solari plan.";
  if (err instanceof ConcurrencyLimitError) return "429: concurrency limit reached. Kill running sessions or wait.";
  if (err instanceof NoCapacityError) return "503: Solari has no capacity right now. Try again shortly.";
  if (err instanceof GatewayError) return `Gateway error ${err.status}${err.code ? ` (${err.code})` : ""}: ${err.message}`;
  if (err instanceof SolariError) return `${err.name}: ${err.message}`;
  if (err instanceof BrowserError) return `Browser API error${err.status ? ` ${err.status}` : ""}${err.code ? ` (${err.code})` : ""}: ${err.message}`;
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const t0 = performance.now();
  try {
    const v = await fn();
    rows.push([name, ms(t0)]);
    console.log(`  ok   ${name.padEnd(34)} ${ms(t0)}`);
    return v;
  } catch (err) {
    failed++;
    rows.push([name, "FAILED"]);
    console.log(`  FAIL ${name.padEnd(34)} ${ms(t0)}\n       ${explain(err)}`);
    return null;
  }
}

async function checkSandbox(pt: SolariClient): Promise<void> {
  console.log("\nSandbox");
  let sb: Sandbox | null = null;
  try {
    sb = await step("sandboxes.create (base)", () =>
      pt.sandboxes.create({ template: "base", cpu: 1, memMb: 1024, idleTimeoutMs: 120_000, lifecycle: { onTimeout: "kill" }, metadata: { screener: "check" } }),
    );
    if (!sb) return;
    const s = sb;
    const r = await step("commands.run node --version", () => s.commands.run("node", { args: ["--version"], timeoutMs: 30_000 }));
    if (r) console.log(`       node ${r.stdout.trim() || r.stderr.trim()} (exit ${r.exitCode})`);
    const py = await step("commands.run python3 --version", () => s.commands.run("python3", { args: ["--version"], timeoutMs: 30_000 }));
    if (py) console.log(`       ${(py.stdout || py.stderr).trim()}`);
  } finally {
    if (sb) {
      const s = sb;
      await step("sandbox.kill", () => s.kill());
    }
  }
}

async function checkBrowser(): Promise<void> {
  console.log("\nBrowser");
  const solari = new Solari({ apiKey: config.solariApiKey!, ...(config.solariBaseUrl ? { baseUrl: config.solariBaseUrl } : {}) });
  let id: string | null = null;
  try {
    const session = await step("sessions.create", () => solari.sessions.create({}));
    if (!session) return;
    id = session.id;
    const browser = await step("connectOverCDP (local playwright)", () => chromium.connectOverCDP(session.cdpEndpoint, { timeout: 30_000 }));
    if (!browser) return;
    const ctx = browser.contexts()[0] ?? (await browser.newContext());
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const title = await step("goto https://example.com", async () => {
      await page.goto("https://example.com", { waitUntil: "load", timeout: 45_000 });
      return page.title();
    });
    if (title) console.log(`       title: ${title}`);
    // The screener records demos with recordVideo on a new CDP context: check that works too.
    const dir = path.join(config.root, ".screener", "check");
    fs.mkdirSync(dir, { recursive: true });
    await step("newContext + recordVideo", async () => {
      const rc = await browser.newContext({ viewport: config.viewport, recordVideo: { dir, size: config.viewport } });
      const p = await rc.newPage();
      await p.goto("https://example.com", { waitUntil: "load", timeout: 45_000 });
      await p.waitForTimeout(1000);
      const v = p.video();
      await rc.close();
      const file = v ? await v.path() : null;
      if (!file || !fs.existsSync(file)) throw new Error("no video file was written");
      console.log(`       video ${path.relative(config.root, file)} (${fs.statSync(file).size} bytes)`);
    });
    await browser.close().catch(() => {});
  } finally {
    if (id) {
      const sid = id;
      await step("sessions.releaseAndWait", () => solari.sessions.releaseAndWait(sid));
    }
    await solari.close().catch(() => {});
  }
}

async function checkDesktop(pt: SolariClient): Promise<void> {
  console.log("\nDesktop");
  let d: Desktop | null = null;
  try {
    d = await step("desktops.create (default, 1280x720)", () =>
      pt.desktops.create({
        template: "default",
        resolution: "1280x720",
        idleTimeoutMs: 120_000,
        lifecycle: { onTimeout: "kill" },
        metadata: { screener: "check" },
      }),
    );
    if (!d) return;
    const desk = d;
    await step("desktop.connect", () => desk.connect());
    await step("desktop.health (ready)", async () => {
      for (let i = 0; i < 40; i++) {
        const h = await desk.health();
        if (h.ready && h.display) return h;
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error("desktop never reported ready + display");
    });
    const png = await step("desktop.screenshot", () => desk.screenshot({ format: "png" }));
    if (png) {
      const out = path.join(config.root, ".screener", "check", "desktop.png");
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, png);
      console.log(`       saved ${path.relative(config.root, out)} (${png.length} bytes)`);
    }
  } finally {
    if (d) {
      const desk = d;
      await step("desktop.kill", () => desk.kill());
    }
  }
}

async function main(): Promise<void> {
  if (!config.solariApiKey) {
    console.error("SOLARI_API_KEY is not set. Put it in .env (SOLARI_API_KEY=slr_live_...) and run again.");
    process.exit(2);
  }
  console.log(`Solari check against ${config.solariBaseUrl ?? "https://api.getsolari.com"}`);
  const pt = new SolariClient({ apiKey: config.solariApiKey, ...(config.solariBaseUrl ? { baseUrl: config.solariBaseUrl } : {}) });
  const t0 = performance.now();
  await checkSandbox(pt);
  await checkBrowser();
  await checkDesktop(pt);
  console.log(`\n${failed ? `${failed} step(s) failed` : "All checks passed"} in ${ms(t0)}.`);
  process.exit(failed ? 1 : 0);
}

void main();
