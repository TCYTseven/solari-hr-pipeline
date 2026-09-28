// `npm run solari:check`: verify a Solari key end to end on the exact paths the
// pipeline uses (control channel, streamed commands, preview URLs through the
// relay, browser sessions over CDP with recording, desktops with env, display,
// a browser and mp4 recording), then print a PASS/WARN/FAIL summary with fixes.
import fs from "node:fs";
import path from "node:path";
import { Solari, SolariError as BrowserError } from "@solarisdk/browser";
import {
  AuthError,
  ConcurrencyLimitError,
  type Desktop,
  GatewayError,
  NoCapacityError,
  PlanError,
  type Sandbox,
  SolariClient,
  SolariError,
} from "@solarisdk/sdk";
import { chromium } from "playwright";
import { config } from "./config";
import { BOOTSTRAP_SH, DISPLAY_DETECT, applySolariWsMode } from "./executors/solari";
import { RELAY_JS, parseReadiness, readinessScript } from "./executors/types";

type Level = "PASS" | "WARN" | "FAIL";
const results: { level: Level; name: string; detail: string; fix?: string }[] = [];
let wsMode: "native" | "package" = config.solariWs;

function ms(t0: number): string {
  const d = performance.now() - t0;
  return d < 1000 ? `${Math.round(d)}ms` : `${(d / 1000).toFixed(2)}s`;
}

function record(level: Level, name: string, detail = "", fix?: string): void {
  results.push({ level, name, detail, fix });
  const tag = level === "PASS" ? "ok  " : level === "WARN" ? "warn" : "FAIL";
  console.log(`  ${tag} ${name}${detail ? `: ${detail}` : ""}`);
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

/** Run a step; record FAIL with the error and return null when it throws. */
async function step<T>(name: string, fn: () => Promise<T>, fix?: string): Promise<T | null> {
  const t0 = performance.now();
  try {
    const v = await fn();
    console.log(`  ..   ${name} (${ms(t0)})`);
    return v;
  } catch (err) {
    record("FAIL", name, `${explain(err)} (${ms(t0)})`, fix);
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, msTimeout: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${msTimeout / 1000}s`)), msTimeout);
    }),
  ]);
}

const sleep = (n: number) => new Promise((r) => setTimeout(r, n));

/**
 * Open the control channel. With the default (Node's native WebSocket) failing,
 * retry with the `ws` package and tell the user to set SOLARI_WS=package.
 */
async function connectControl(handle: Sandbox | Desktop, what: string): Promise<boolean> {
  const t0 = performance.now();
  try {
    await withTimeout(handle.connect(), 20_000, `${what} connect`);
    record("PASS", `${what} control channel`, `connected with the ${wsMode === "package" ? "ws package" : "native WebSocket"} (${ms(t0)})`);
    return true;
  } catch (first) {
    if (wsMode === "package") {
      record("FAIL", `${what} control channel`, explain(first), "Check network access to wss://api.getsolari.com, then contact Solari support with the error.");
      return false;
    }
    handle.close();
    applySolariWsMode("package");
    wsMode = "package";
    try {
      await withTimeout(handle.connect(), 20_000, `${what} connect (ws package)`);
      record(
        "WARN",
        `${what} control channel`,
        `native WebSocket failed (${explain(first)}); the ws package works`,
        "Add SOLARI_WS=package to .env so the pipeline uses the ws package.",
      );
      return true;
    } catch (second) {
      record("FAIL", `${what} control channel`, `native: ${explain(first)}; ws package: ${explain(second)}`, "Check network access to wss://api.getsolari.com.");
      return false;
    }
  }
}

async function run(h: Sandbox | Desktop, script: string): Promise<{ exitCode: number; out: string }> {
  // Collect through the callbacks: early output can be missing from result.stdout when they are set.
  let out = "";
  const r = await h.commands.run("sh", { args: ["-c", script], onStdout: (d) => (out += d), onStderr: (d) => (out += d) });
  return { exitCode: r.exitCode, out: out || r.stdout + r.stderr };
}

async function fetchStatus(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  return { status: res.status, body: (await res.text()).slice(0, 500) };
}

const ECHO_PY = `import http.server, json
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps({"host": self.headers.get("Host"), "xfh": self.headers.get("X-Forwarded-Host"), "path": self.path}).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
http.server.HTTPServer(("0.0.0.0", 8000), H).serve_forever()
`;

async function checkSandbox(pt: SolariClient): Promise<void> {
  console.log("\nSandbox (what the pipeline builds and runs submissions in)");
  const t0 = performance.now();
  const sb = await step("sandboxes.create (base)", () =>
    pt.sandboxes.create({ template: "base", cpu: 1, memMb: 1024, idleTimeoutMs: 180_000, lifecycle: { onTimeout: "kill" }, metadata: { screener: "check" } }),
  );
  if (!sb) return;
  record("PASS", "sandbox create", ms(t0));
  try {
    if (!(await connectControl(sb, "sandbox"))) return;

    // Streamed commands, the way every install/run step goes.
    await step("commands.start + onData + wait", async () => {
      const h = await sb.commands.start("sh", { args: ["-c", "echo out-line; echo err-line 1>&2; exit 3"] });
      let seen = "";
      h.onData((c) => (seen += c.data));
      const code = await withTimeout(h.wait(), 30_000, "wait");
      if (code === 3 && seen.includes("out-line") && seen.includes("err-line")) record("PASS", "streamed command", "stdout+stderr chunks and exit code 3 received");
      else record("FAIL", "streamed command", `exit ${code}, output ${JSON.stringify(seen)}`, "Report to Solari: commands.start output or exit codes are not delivered.");
    });

    const tools = await step("command -v node npm python3 pip3 git timeout curl", () =>
      run(sb, "for t in node npm python3 pip3 git timeout curl; do if command -v $t >/dev/null 2>&1; then echo \"$t yes\"; else echo \"$t no\"; fi; done; node --version 2>/dev/null; python3 --version 2>&1"),
    );
    if (tools) {
      const missing = [...tools.out.matchAll(/^(\w+) no$/gm)].map((m) => m[1]!);
      const hard = missing.filter((t) => ["node", "npm", "python3", "git", "timeout"].includes(t));
      if (hard.length) record("FAIL", "base image tools", `missing ${hard.join(", ")}`, "The pipeline needs these in the 'base' template; build a custom template or report it to Solari.");
      else if (missing.length) record("WARN", "base image tools", `missing ${missing.join(", ")} (the pipeline adds a pip shim and checks readiness with python3/node instead of curl)`);
      else record("PASS", "base image tools", tools.out.split("\n").filter((l) => !/ yes$/.test(l)).join(" ").trim());
    }

    const boot = await step("pipeline bootstrap (python/pip shims, uv)", () => run(sb, `export PATH="/tmp/screener/bin:$HOME/.local/bin:$PATH"; ${BOOTSTRAP_SH}`));
    if (boot) {
      const line = boot.out.trim().split("\n").pop() ?? "";
      record(/pip missing|missing, uv/.test(line) ? "WARN" : "PASS", "bootstrap", line.replace(/^tools: /, ""), "Python projects may fail to install; consider a custom template with pip.");
    }

    // A server in the VM, reached through a preview URL: first directly, then through the pipeline's relay.
    await sb.files.write("/tmp/echo.py", ECHO_PY);
    await sb.files.write("/tmp/screener-relay.cjs", RELAY_JS);
    await run(sb, "(exec nohup python3 /tmp/echo.py) >/tmp/echo.log 2>&1 </dev/null & (exec nohup node /tmp/screener-relay.cjs 39999 8000) >/tmp/relay.log 2>&1 </dev/null &");
    let ready = false;
    for (let i = 0; i < 20 && !ready; i++) {
      ready = parseReadiness((await run(sb, readinessScript(8000))).out).up;
      if (!ready) await sleep(500);
    }
    if (!ready) {
      record("FAIL", "server in the VM", "python3 http.server on :8000 never answered inside the VM", "Check /tmp/echo.log in the VM; report to Solari.");
    } else {
      record("PASS", "readiness inside the VM", "the pipeline's curl/python3/node probe saw :8000 answer");
      const direct = await step("previewUrl(8000) + GET", async () => {
        const { url } = await sb.previewUrl(8000);
        const r = await fetchStatus(url);
        return { url, ...r };
      });
      if (direct) {
        let seenHost = "?";
        try {
          seenHost = (JSON.parse(direct.body) as { host: string }).host;
        } catch {
          /* not JSON */
        }
        record(direct.status === 200 ? "PASS" : "FAIL", "preview URL", `HTTP ${direct.status}; the app saw Host: ${seenHost}`, "Preview URLs do not reach the VM; report to Solari.");
        const sub = new URL(direct.url);
        sub.pathname = "/sub/path";
        sub.searchParams.delete("pt_token");
        const subRes = await step("GET a sub-path without pt_token", () => fetchStatus(sub.toString()));
        if (subRes) {
          if (subRes.status === 200) record("PASS", "sub-path without pt_token", "HTTP 200 (no token needed on sub-requests)");
          else record("WARN", "sub-path without pt_token", `HTTP ${subRes.status}`, "Fine for the screener: its demo browser adds pt_token to same-origin requests. Other clients must keep the token.");
        }
      }
      const relayed = await step("previewUrl(39999) through the pipeline's relay", async () => {
        const { url } = await sb.previewUrl(39999);
        return fetchStatus(url);
      });
      if (relayed) {
        let seen: { host?: string; xfh?: string } = {};
        try {
          seen = JSON.parse(relayed.body) as typeof seen;
        } catch {
          /* not JSON */
        }
        const ok = relayed.status === 200 && seen.host === "localhost:8000";
        record(ok ? "PASS" : "FAIL", "relay", `HTTP ${relayed.status}; app saw Host: ${seen.host ?? "?"}, X-Forwarded-Host: ${seen.xfh ?? "?"}`, "Web demos on Solari will break; check /tmp/relay.log in the VM.");
      }
      const closed = await step("previewUrl of a closed port (8999)", async () => {
        const { url } = await sb.previewUrl(8999);
        return fetchStatus(url);
      });
      if (closed) {
        if (closed.status === 200) record("WARN", "closed port", "the gateway answers 200 for a port nothing listens on", "Harmless for the screener (it checks readiness inside the VM), but worth reporting.");
        else record("PASS", "closed port", `the gateway answers HTTP ${closed.status} (readiness is decided inside the VM anyway)`);
      }
    }
  } finally {
    await step("sandbox.kill", () => sb.kill());
  }
}

async function checkBrowser(): Promise<void> {
  console.log("\nBrowser (web demos on Solari)");
  const solari = new Solari({ apiKey: config.solariApiKey!, ...(config.solariBaseUrl ? { baseUrl: config.solariBaseUrl } : {}) });
  let id: string | null = null;
  try {
    const t0 = performance.now();
    const session = await step("sessions.create", () => solari.sessions.create({}));
    if (!session) return;
    id = session.id;
    record("PASS", "browser session", ms(t0));
    const browser = await step("connectOverCDP (local playwright)", () => chromium.connectOverCDP(session.cdpEndpoint, { timeout: 30_000 }));
    if (!browser) return;
    const dir = path.join(config.root, ".screener", "check");
    fs.mkdirSync(dir, { recursive: true });
    const video = await step("newContext + recordVideo + goto example.com", async () => {
      const ctx = await browser.newContext({ viewport: config.viewport, recordVideo: { dir, size: config.viewport } });
      const page = await ctx.newPage();
      await page.goto("https://example.com", { waitUntil: "load", timeout: 45_000 });
      const title = await page.title();
      await page.waitForTimeout(1000);
      const v = page.video();
      await ctx.close();
      const file = v ? await v.path() : null;
      return { title, file, size: file && fs.existsSync(file) ? fs.statSync(file).size : 0 };
    });
    if (video) {
      if (video.size > 0) record("PASS", "browser recording", `"${video.title}", ${path.relative(config.root, video.file!)} (${video.size} bytes)`);
      else record("WARN", "browser recording", `page "${video.title}" loaded but no video was written`, "Demos fall back to a slideshow of screenshots. Run `npx playwright install chromium` (it installs ffmpeg).");
    }
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
  console.log("\nDesktop (GUI demos on Solari)");
  const t0 = performance.now();
  const d = await step("sandboxes.createDesktop (envs, record: true)", () =>
    pt.sandboxes.createDesktop({
      template: "default",
      resolution: `${config.desktopResolution.width}x${config.desktopResolution.height}`,
      envs: { SCREENER_CHECK: "hello" },
      record: true,
      idleTimeoutMs: 180_000,
      lifecycle: { onTimeout: "kill" },
      metadata: { screener: "check" },
    }),
  );
  if (!d) return;
  record("PASS", "desktop create", ms(t0));
  try {
    if (!(await connectControl(d, "desktop"))) return;
    const healthy = await step("desktop.health (ready + display)", async () => {
      for (let i = 0; i < 40; i++) {
        const h = await d.health();
        if (h.ready && h.display) return true;
        await sleep(500);
      }
      return false;
    });
    record(healthy ? "PASS" : "FAIL", "desktop ready", healthy ? "" : "never reported ready + display", "Report to Solari.");

    const png = await step("desktop.screenshot", () => d.screenshot({ format: "png" }));
    if (png) {
      const out = path.join(config.root, ".screener", "check", "desktop.png");
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, png);
      record("PASS", "desktop screenshot", `${path.relative(config.root, out)} (${png.length} bytes)`);
    }

    // What an app started the pipeline's way (process.start) sees.
    await step("process.start writes its env", async () => {
      await d.process.start("sh", { args: ["-c", "env > /tmp/screener-env.txt"] });
      let text = "";
      for (let i = 0; i < 20 && !text; i++) {
        await sleep(300);
        text = await d.files.readText("/tmp/screener-env.txt").catch(() => "");
      }
      const display = /^DISPLAY=(.*)$/m.exec(text)?.[1];
      const env = /^SCREENER_CHECK=(.*)$/m.exec(text)?.[1];
      record(env === "hello" ? "PASS" : "FAIL", "desktop envs", env === "hello" ? "createDesktop envs reach processes" : "SCREENER_CHECK missing", "Submissions on desktops would not get their SUBMISSION_* values; report to Solari.");
      if (display) record("PASS", "desktop DISPLAY", `processes start with DISPLAY=${display}`);
      else {
        const x = await run(d, `${DISPLAY_DETECT} echo "$DISPLAY"`);
        record(x.out.trim() ? "WARN" : "FAIL", "desktop DISPLAY", x.out.trim() ? `not set for process.start; the pipeline detects ${x.out.trim()} from /tmp/.X11-unix` : "no X display found", "GUI apps may not appear; report to Solari.");
      }
    });

    const apps = await step("command -v google-chrome chromium firefox xdotool node", () =>
      run(d, "for t in google-chrome google-chrome-stable chromium chromium-browser firefox xdotool node timeout; do if command -v $t >/dev/null 2>&1; then echo \"$t yes\"; else echo \"$t no\"; fi; done"),
    );
    if (apps) {
      const has = (t: string) => new RegExp(`^${t} yes$`, "m").test(apps.out);
      const browser = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "firefox"].find(has);
      record(browser ? "PASS" : "FAIL", "desktop browser", browser ?? "none found", "Web apps demoed on a desktop need a browser; use the browser surface or a custom template.");
      record(has("xdotool") ? "PASS" : "WARN", "desktop xdotool", has("xdotool") ? "present" : "missing", "Scrolling falls back to Page_Up/Page_Down.");
      record(has("timeout") ? "PASS" : "FAIL", "desktop timeout", has("timeout") ? "present" : "missing", "The pipeline enforces command timeouts with coreutils timeout.");
      if (!has("node")) record("WARN", "desktop node", "missing", "Node projects cannot run on the desktop template.");
    }

    const rec = await step("record.start / stop / downloadUrl", async () => {
      await d.record.start({ fps: 15 });
      await sleep(2500);
      const stopped = await d.record.stop();
      const { url } = await d.downloadUrl(stopped.path);
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const bytes = res.ok ? (await res.arrayBuffer()).byteLength : 0;
      return { path: stopped.path, reported: stopped.sizeBytes, downloaded: bytes, status: res.status };
    });
    if (rec) {
      record(rec.downloaded > 0 ? "PASS" : "FAIL", "desktop recording", `${rec.path}: ${rec.downloaded} bytes downloaded (HTTP ${rec.status})`, "Desktop demos would have no video; report to Solari.");
    }
  } finally {
    await step("desktop.kill", () => d.kill());
  }
}

async function main(): Promise<void> {
  if (!config.solariApiKey) {
    console.error("SOLARI_API_KEY is not set. Put it in .env (SOLARI_API_KEY=slr_live_...) and run again.");
    process.exit(2);
  }
  applySolariWsMode(wsMode);
  console.log(`Solari check against ${config.solariBaseUrl ?? "https://api.getsolari.com"} (WebSocket: ${wsMode === "package" ? "ws package" : "native"})`);
  const pt = new SolariClient({ apiKey: config.solariApiKey, ...(config.solariBaseUrl ? { baseUrl: config.solariBaseUrl } : {}) });
  const t0 = performance.now();
  await checkSandbox(pt);
  await checkBrowser();
  await checkDesktop(pt);

  const count = (l: Level) => results.filter((r) => r.level === l).length;
  console.log(`\nSummary (${ms(t0)}): ${count("PASS")} PASS, ${count("WARN")} WARN, ${count("FAIL")} FAIL`);
  for (const r of results.filter((x) => x.level !== "PASS")) {
    console.log(`  ${r.level} ${r.name}: ${r.detail}${r.fix ? `\n       -> ${r.fix}` : ""}`);
  }
  if (wsMode === "package" && config.solariWs !== "package") console.log("\nSet SOLARI_WS=package in .env before running scans.");
  process.exit(count("FAIL") ? 1 : 0);
}

void main();
