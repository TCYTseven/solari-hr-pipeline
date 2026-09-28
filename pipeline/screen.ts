// Per-fork orchestration: workspace -> triage -> build/boot -> demo -> score -> Postgres.
import type { DemoStep, Product, StageName, Status } from "../lib/types";
import { describeClaudeError, isFatalClaudeError } from "./claude";
import { config, secretValues, submissionEnv } from "./config";
import { runDemoAgent, type DemoResult } from "./demo/agent";
import { toVtt } from "./demo/captions";
import { LocalBrowserSurface, SolariBrowserSurface, SolariDesktopSurface, type Surface } from "./demo/surfaces";
import type { ForkRef, RemoteHeads } from "./discover";
import { SolariBox, isFatalSolariError } from "./executors/solari";
import { type Box, type ExecResult, type Executor, RELAY_PID, parseListeningPorts, pickAppPort } from "./executors/types";
import { type MediaRun, encodeFramesWebm, mediaRun, renderTerminalPng, writeAtomic } from "./media";
import { RunRecorder, timed } from "./recorder";
import { type FailureReason, type ScoreResult, scoreSubmission } from "./score";
import type { LastRun, Store } from "./store";
import { type Triage, type TriageResult, heuristicTriage, triage as runTriage } from "./triage";
import { InterruptedError, errMessage, errorTail, shellQuote, sleep, throwIfStopping, truncate } from "./util";
import { type Workspace, archiveCommit, collectContext, prepareWorkspace } from "./workspace";

export interface ScreenOptions {
  executor: Executor;
  store: Store;
  demo: boolean;
  verbose: boolean;
  say: (msg: string) => void;
}

/** What the fork looked like when it was screened; stored in runs.triage._source. */
export interface SourceFingerprint {
  defaultBranch: string | null;
  defaultSha: string | null;
  heads: string[];
  branch?: string;
  sha?: string;
  source?: Workspace["source"];
}

export function fingerprint(heads: RemoteHeads): SourceFingerprint {
  return { defaultBranch: heads.defaultBranch, defaultSha: heads.headSha, heads: [...new Set(heads.heads.map((h) => h.sha))].sort() };
}

/**
 * Skip a fork when nothing changed since its last finished run. Never skips
 * after a screener error, or after needs_secrets once every missing variable
 * is available as SUBMISSION_<NAME>. Pure.
 */
export function shouldSkip(last: LastRun | null, heads: RemoteHeads, availableEnv: Set<string> = new Set()): boolean {
  if (!last) return false;
  if (last.failureReason === "Screener error") return false;
  if (last.status === "needs_secrets") {
    const required = (last.triage as { requiredEnv?: unknown } | null)?.requiredEnv;
    if (Array.isArray(required) && required.length > 0 && required.every((n) => typeof n === "string" && availableEnv.has(n))) return false;
  }
  const fp = (last.triage as { _source?: SourceFingerprint } | null)?._source;
  if (fp && Array.isArray(fp.heads)) {
    const now = fingerprint(heads);
    return fp.defaultSha === now.defaultSha && fp.heads.length === now.heads.length && fp.heads.every((s, i) => s === now.heads[i]);
  }
  return last.commitSha != null && last.commitSha === heads.headSha;
}

/** Card error tail for a missing-secrets run. Pure. */
export function missingSecretsTail(missing: string[]): string[] {
  return [`Missing required env: ${missing.join(", ")}`, `The screener only passes SUBMISSION_<NAME> vars (e.g. SUBMISSION_${missing[0]}).`];
}

/** Runs in progress in this process (marked abandoned on Ctrl-C). Maps runId -> owner. */
export const activeRuns = new Map<string, string>();

const RUN_LOG = "/tmp/screener-run.log";
const RUN_PID = "/tmp/screener-run.pid";

class Outcome {
  status: Status = "booted";
  errorTail: string[] | null = null;
  note: string | null = null;
  runOutput = "";
  appUrl: string | null = null;
}

export async function screenFork(fork: ForkRef, heads: RemoteHeads, opts: ScreenOptions): Promise<Status> {
  const { store, executor } = opts;
  const secrets = secretValues();
  const runId = await store.beginRun(fork.owner, heads.headSha);
  activeRuns.set(runId, fork.owner);
  const say = (m: string) => opts.say(`[${fork.owner}] ${m}`);
  const rec = new RunRecorder(store, runId, secrets, opts.verbose ? (tab, text) => process.stdout.write(`[${fork.owner}:${tab}] ${text}`) : undefined);
  const fp = fingerprint(heads);
  let box: Box | null = null;
  let surface: Surface | null = null;
  let media: MediaRun | null = null;
  const vm = { count: 0, seconds: 0 };

  const finalizeRelease = async () => {
    if (surface) {
      const s = surface;
      surface = null;
      const r = await timed(() => s.close());
      if (s.label !== "Desktop") rec.timing(s.label, "release", r.ms);
      vm.count += s.vmCount;
      vm.seconds += s.vmSeconds();
    }
    if (box) {
      const b = box;
      box = null;
      const r = await timed(() => b.release());
      rec.timing(b.surface, "release", r.ms);
      vm.count += b.vmCount;
      vm.seconds += b.vmSeconds();
    }
  };

  try {
    // 1. Workspace + diff vs upstream -------------------------------------------------
    say("fetching fork and comparing with upstream");
    const ws = await prepareWorkspace(fork, heads.defaultBranch, heads.headSha);
    throwIfStopping();
    Object.assign(fp, { branch: ws.branch, sha: ws.sha, source: ws.source });
    rec.log(
      "install",
      `# ${fork.repoUrl} ${ws.branch} @ ${ws.sha.slice(0, 7)}: ${ws.changes.length} files changed vs upstream` +
        (ws.changes.length ? `, project in ${ws.projectDir}` : "") +
        "\n",
    );
    await store.updateRun(runId, { commitSha: ws.sha });
    // default_branch is the fork's default branch; the screened branch lives in runs.triage._source.
    await store.updateSubmission(fork.owner, { commitSha: ws.sha, defaultBranch: ws.defaultBranch });

    if (ws.changes.length === 0) {
      say("no changes from upstream: skipped");
      await rec.flush({ status: "skipped", finishedAt: new Date(), streamUrl: null, triage: { _source: fp } });
      await store.updateSubmission(fork.owner, {
        status: "skipped",
        summary: "No changes from upstream",
        score: null,
        errorTail: null,
        bootMs: null,
        scannedAt: new Date(),
      });
      return "skipped";
    }

    // 2. Triage ------------------------------------------------------------------------
    const ctx = collectContext(ws);
    let tri: TriageResult;
    try {
      tri = await runTriage(ws, ctx);
    } catch (err) {
      if (isFatalClaudeError(err)) throw err;
      const note = `Triage by Claude failed (${describeClaudeError(err)}); used a manifest-based guess.`;
      say(note);
      tri = { triage: heuristicTriage(ws), raw: null, source: "heuristic", note };
    }
    throwIfStopping();
    const t = tri.triage;
    say(`triaged: ${t.projectType}, ${t.demoSurface} demo, run ${JSON.stringify(t.run)}${t.server ? ` on :${t.port}` : ""}`);
    rec.set({ triage: { ...(tri.raw && typeof tri.raw === "object" ? tri.raw : {}), _source: fp, _screener: { projectDir: t.projectDir, triagedBy: tri.source } } });
    await store.updateSubmission(fork.owner, {
      title: t.title,
      description: t.description,
      projectType: t.projectType,
      stack: t.stack,
      productsUsed: t.productsUsed as Product[],
    });

    // 3. Secrets policy ----------------------------------------------------------------
    const subEnv = submissionEnv();
    const missing = t.requiredEnv.filter((n) => !(n in subEnv));
    const outcome = new Outcome();
    let demo: DemoResult | null = null;
    let demoProduct: Product | null = null;
    let bootMs: number | null = null;
    const files: { thumb?: string; video?: string; captions?: string } = {};

    if (missing.length) {
      outcome.status = "needs_secrets";
      outcome.errorTail = missingSecretsTail(missing);
      rec.log("install", `# Not built: needs ${missing.join(", ")} (set SUBMISSION_<NAME> to provide them)\n`);
      say(`needs secrets: ${missing.join(", ")}`);
    } else {
      // 4. Build + boot ------------------------------------------------------------------
      const kind = executor.kind === "solari" && t.demoSurface === "desktop" ? "desktop" : "sandbox";
      const env: Record<string, string> = {
        ...subEnv,
        CI: "1",
        HOST: "0.0.0.0",
        BROWSER: "none",
        PYTHONUNBUFFERED: "1",
        PIP_BREAK_SYSTEM_PACKAGES: "1",
        NPM_CONFIG_UPDATE_NOTIFIER: "false",
        ...(t.server && t.port ? { PORT: String(t.port) } : {}),
      };
      box = executor.box({ owner: fork.owner, runId, env, kind });
      bootMs = await buildAndBoot(box, ws, t, rec, outcome, say);

      // 5. Demo ------------------------------------------------------------------------
      throwIfStopping();
      if (outcome.status === "booted" && opts.demo) {
        media = mediaRun(fork.owner, runId);
        const r = await runDemo(box, t, outcome, rec, media, secrets, say, (s) => (surface = s));
        demo = r.demo;
        demoProduct = r.product;
        Object.assign(files, r.files);
      }
    }

    throwIfStopping();
    await finalizeRelease();

    // 6. Score ------------------------------------------------------------------------
    let scored: ScoreResult | null = null;
    let scoreNote: string | null = null;
    say("scoring");
    try {
      const frames = demo?.frames ?? [];
      const shots = frames.length ? [frames[Math.floor(frames.length / 2)]!.png, frames[frames.length - 1]!.png] : [];
      scored = await scoreSubmission({
        status: outcome.status,
        triage: t,
        context: ctx.text,
        installLog: rec.logs.install,
        runLog: rec.logs.run,
        steps: demo?.steps ?? [],
        demoSummary: demo?.summary ?? null,
        missingEnv: missing,
        screenshots: frames.length > 1 && shots[0] !== shots[1] ? shots : shots.slice(0, 1),
        notes: [
          tri.note,
          outcome.note,
          demo?.error ? `Demo agent error: ${demo.error}` : null,
          outcome.status === "booted" && opts.demo && !demo ? "CLI/script project: the run output is the demo, so there is no video or frames by design." : null,
          outcome.status === "booted" && !opts.demo ? "The demo step was disabled for this scan (--no-demo)." : null,
          ws.source !== "default" ? `Screened ${ws.branch} because the fork's default branch has no changes of its own.` : null,
        ].filter((n): n is string => !!n),
      });
    } catch (err) {
      if (isFatalClaudeError(err)) throw err;
      scoreNote = `Scoring failed: ${describeClaudeError(err)}`;
      say(scoreNote);
    }

    const failureReason: FailureReason | string | null =
      outcome.status === "booted" ? null : (scored?.failureReason ?? defaultFailure(outcome.status, outcome.note));
    await rec.flush({
      status: outcome.status,
      finishedAt: new Date(),
      streamUrl: null,
      vmCount: vm.count,
      vmSeconds: Math.round(vm.seconds * 10) / 10,
      failureReason,
    });
    await store.updateSubmission(fork.owner, {
      status: outcome.status,
      // Only a successful boot has a meaningful boot time (the dashboard's median boot stat).
      bootMs: outcome.status === "booted" && bootMs != null ? Math.round(bootMs) : null,
      score: scored?.score ?? null,
      summary: scored?.summary ?? scoreNote ?? null,
      errorTail: outcome.status === "booted" ? null : outcome.errorTail,
      demoProduct,
      thumbnailUrl: files.thumb && media ? media.url(files.thumb) : null,
      videoUrl: files.video && media ? media.url(files.video) : null,
      previewUrl: files.video && media ? media.url(files.video) : null,
      captionsUrl: files.captions && media ? media.url(files.captions) : null,
      scannedAt: new Date(),
    });
    say(`done: ${outcome.status}${scored ? `, score ${scored.score.total}` : ""}${demo ? `, ${demo.steps.length} demo steps` : ""}`);
    return outcome.status;
  } catch (err) {
    await finalizeRelease().catch(() => {});
    const msg = err instanceof InterruptedError ? "run interrupted" : errMessage(err);
    say(`screener error: ${msg}`);
    rec.log("install", `\n# Screener error: ${msg}\n`);
    await rec.flush({
      status: "skipped",
      finishedAt: new Date(),
      streamUrl: null,
      failureReason: "Screener error",
      vmCount: vm.count,
      vmSeconds: Math.round(vm.seconds * 10) / 10,
      triage: { _source: fp },
    });
    // Back to queued so the next scan retries it; the dashboard shows why.
    await store.updateSubmission(fork.owner, { status: "queued", errorTail: [`Screener error: ${truncate(msg, 200)}`] });
    if (isFatalClaudeError(err) || isFatalSolariError(err) || err instanceof InterruptedError) throw err;
    return "queued";
  } finally {
    await finalizeRelease().catch(() => {});
    activeRuns.delete(runId);
  }
}

function defaultFailure(status: Status, note: string | null): FailureReason {
  if (status === "needs_secrets") return "Missing env var";
  if (status === "timeout") return note === "Port never opened" ? "Port never opened" : "Timed out";
  if (note === "Crashed on start") return "Crashed on start";
  return "Dependency install failed";
}

// ---------------------------------------------------------------------------

async function buildAndBoot(
  box: Box,
  ws: Workspace,
  t: Triage,
  rec: RunRecorder,
  out: Outcome,
  say: (m: string) => void,
): Promise<number> {
  const total: Record<StageName, number> = { create: 0, clone: 0, install: 0, boot: 0, demo: 0, release: 0 };
  const stage = async <T>(name: StageName, fn: () => Promise<T>): Promise<T> => {
    const r = await timed(fn);
    total[name] = r.ms;
    rec.timing(box.surface, name, r.ms);
    return r.value;
  };
  const fail = (status: Status, output: string, note: string, extra?: string) => {
    out.status = status;
    out.note = note;
    const tail = errorTail(output, extra ? 3 : 4);
    out.errorTail = extra ? [...tail, extra] : tail.length ? tail : [note];
  };

  say(`creating ${box.surface.toLowerCase()}`);
  await stage("create", () => box.create());
  throwIfStopping();
  rec.cmd("install", box.description);

  const tar = await archiveCommit(ws);
  const cloned = await stage("clone", () => box.clone({ tar, sourceUrl: ws.sourceUrl, sha: ws.sha }, (s) => rec.log("install", s)));
  throwIfStopping();
  if (cloned.exitCode !== 0) {
    fail(cloned.timedOut ? "timeout" : "build_failed", cloned.output, "Clone failed");
    return total.create + total.clone;
  }

  // Install
  if (t.projectDir !== ".") rec.cmd("install", `cd ${t.projectDir}`);
  say(`installing (${t.install.length} command${t.install.length === 1 ? "" : "s"})`);
  const installDeadline = Date.now() + config.installTimeoutSec * 1000;
  let installFailed: ExecResult | null = null;
  await stage("install", async () => {
    for (const argv of t.install) {
      const left = Math.max(10, Math.round((installDeadline - Date.now()) / 1000));
      rec.cmd("install", shellQuote(argv));
      const r = await box.exec(shellQuote(argv), { cwd: t.projectDir, timeoutSec: left, onOutput: (s) => rec.log("install", s) });
      throwIfStopping();
      if (r.exitCode !== 0 || r.timedOut) {
        rec.log("install", `\n# exit code ${r.exitCode}${r.timedOut ? " (timed out)" : ""}\n`);
        installFailed = r;
        return;
      }
    }
  });
  const installResult = installFailed as ExecResult | null;
  if (installResult) {
    if (installResult.timedOut) fail("timeout", installResult.output, "Timed out", `Install timed out after ${config.installTimeoutSec}s`);
    else fail("build_failed", installResult.output, "Install failed");
    say(`install failed: ${out.status}`);
    return total.create + total.clone + total.install;
  }

  // Boot
  throwIfStopping();
  const runScript = shellQuote(t.run);
  rec.cmd("run", `${t.projectDir !== "." ? `cd ${t.projectDir} && ` : ""}${runScript}`);
  if (t.server && t.port) {
    say(`starting server on :${t.port}`);
    await stage("boot", async () => {
      const listening = async () =>
        parseListeningPorts((await box.exec("cat /proc/net/tcp /proc/net/tcp6 2>/dev/null; true", { cwd: "/", timeoutSec: 20 })).output);
      const baseline = await listening().catch(() => [] as number[]);
      await box.startBackground(runScript, { cwd: t.projectDir, logFile: RUN_LOG, pidFile: RUN_PID });
      let target = t.port!;
      out.appUrl = await box.exposePort(target);
      const started = Date.now();
      const deadline = started + t.runTimeoutSec * 1000;
      let offset = 0;
      let lastPoll = 0;
      const pull = async (): Promise<boolean> => {
        const r = await box.exec(
          `if kill -0 "$(cat ${RUN_PID} 2>/dev/null)" 2>/dev/null; then echo __ALIVE__; else echo __DEAD__; fi; tail -c +${offset + 1} ${RUN_LOG} 2>/dev/null`,
          { cwd: "/", timeoutSec: 20 },
        );
        const nl = r.output.indexOf("\n");
        const alive = r.output.slice(0, nl).trim() === "__ALIVE__";
        const text = r.output.slice(nl + 1);
        if (text) {
          offset += Buffer.byteLength(text);
          out.runOutput += text;
          rec.log("run", text);
        }
        return alive;
      };
      while (Date.now() < deadline) {
        if (await probe(out.appUrl)) {
          await pull().catch(() => true);
          rec.log("run", `\n# Port ${target} answered after ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
          return;
        }
        if (Date.now() - lastPoll > 2000) {
          lastPoll = Date.now();
          const alive = await pull().catch(() => true);
          if (!alive) {
            await sleep(500);
            await pull().catch(() => false);
            fail("build_failed", out.runOutput, "Crashed on start", "Process exited before the port opened");
            return;
          }
          // The app may ignore PORT and listen elsewhere: follow it with the relay.
          if (Date.now() - started > 3000) {
            const now = await listening().catch(() => [] as number[]);
            const better = pickAppPort(now, baseline, [box.relayPort], out.runOutput, target);
            if (better != null && better !== target) {
              rec.log("run", `# :${target} is silent but the app listens on :${better}; relaying to :${better}\n`);
              await box.exec(`kill "$(cat ${RELAY_PID} 2>/dev/null)" 2>/dev/null; rm -f ${RELAY_PID}; true`, { cwd: "/", timeoutSec: 20 });
              target = better;
              out.appUrl = await box.exposePort(target);
              continue;
            }
          }
        }
        await sleep(750);
      }
      await pull().catch(() => true);
      fail("timeout", out.runOutput, "Port never opened", `Port ${target} did not answer within ${t.runTimeoutSec}s`);
    });
  } else {
    say(`running (timeout ${t.runTimeoutSec}s)`);
    await stage("boot", async () => {
      const r = await box.exec(runScript, { cwd: t.projectDir, timeoutSec: t.runTimeoutSec, onOutput: (s) => rec.log("run", s) });
      out.runOutput = r.output;
      rec.log("run", `\n# exit code ${r.exitCode}${r.timedOut ? " (timed out)" : ""}\n`);
      if (r.timedOut) fail("timeout", r.output, "Timed out", `Run did not finish within ${t.runTimeoutSec}s`);
      else if (r.exitCode !== 0) fail("build_failed", r.output, "Crashed on start");
    });
  }
  say(out.status === "booted" ? `booted in ${((total.create + total.clone + total.install + total.boot) / 1000).toFixed(1)}s` : `boot failed: ${out.status}`);
  return total.create + total.clone + total.install + total.boot;
}

/** Any HTTP answer counts as up, except proxy errors from a preview gateway. */
async function probe(url: string | null): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    await res.body?.cancel().catch(() => {});
    return ![502, 503, 504].includes(res.status);
  } catch {
    return false;
  }
}

async function runDemo(
  box: Box,
  t: Triage,
  out: Outcome,
  rec: RunRecorder,
  media: MediaRun,
  secrets: string[],
  say: (m: string) => void,
  track: (s: Surface) => void,
): Promise<{ demo: DemoResult | null; product: Product; files: { thumb?: string; video?: string; captions?: string } }> {
  const files: { thumb?: string; video?: string; captions?: string } = {};
  const desktop = box instanceof SolariBox ? box.desktop() : null;
  const webUi = t.server && !!out.appUrl;
  let surface: Surface | null = null;
  if (desktop) surface = new SolariDesktopSurface(desktop);
  else if (webUi && (t.demoSurface === "browser" || t.demoSurface === "desktop")) {
    surface = box instanceof SolariBox ? new SolariBrowserSurface() : new LocalBrowserSurface();
  }

  if (!surface) {
    // CLI / script: the run output is the demo. Thumbnail = the terminal.
    rec.log("demo", "# CLI project: no agent demo; the run output is the demo.\n");
    try {
      await renderTerminalPng(`${t.title}  $ ${shellQuote(t.run)}`, out.runOutput || "(no output)", media.file("thumb.png"));
      files.thumb = "thumb.png";
    } catch (err) {
      rec.log("demo", `# thumbnail render failed: ${errMessage(err)}\n`);
    }
    return { demo: null, product: "sandbox", files };
  }

  track(surface);
  say(`demoing on ${surface.label}`);
  const s = surface;
  const opened = await timed(() => s.open(desktop ? null : out.appUrl));
  if (s.label !== "Desktop") rec.timing(s.label, "create", opened.ms);
  rec.set({ streamUrl: media.url("live.jpg") });
  await rec.flush();

  const demo = await timed(() =>
    runDemoAgent({
      surface: s,
      triage: t,
      secrets,
      log: (line) => rec.log("demo", `${line}\n`),
      onStep: (step: DemoStep) => rec.step(step),
      onFrame: async (jpeg) => writeAtomic(media.file("live.jpg"), jpeg),
    }),
  );
  rec.timing(s.label, "demo", demo.ms);
  const result = demo.value;

  const video = await s.finish(media.dir).catch((err) => {
    rec.log("demo", `# saving the recording failed: ${errMessage(err)}\n`);
    return null;
  });
  if (video) files.video = video;
  else if (result.liveFrames.length > 1 && (await encodeFramesWebm(result.liveFrames, result.durationSec, media.file("demo.webm")))) {
    // No live recording (e.g. the CDP endpoint refused a recording context): use the screenshots.
    files.video = "demo.webm";
    rec.log("demo", "# no live recording available; built demo.webm from the screenshots\n");
  }
  const mid = result.frames[Math.floor(result.frames.length / 2)];
  if (mid) {
    writeAtomic(media.file("thumb.png"), mid.png);
    files.thumb = "thumb.png";
  }
  if (result.steps.length) {
    writeAtomic(media.file("captions.vtt"), toVtt(result.steps, result.durationSec + 1));
    files.captions = "captions.vtt";
  }
  if (result.endedBy === "refusal") out.note = "Demo agent declined";
  rec.log("demo", `# demo ended (${result.endedBy}) after ${result.actions} actions, ${result.durationSec.toFixed(1)}s${video ? `, saved ${video}` : ", no video"}\n`);
  return { demo: result, product: s.product, files };
}

