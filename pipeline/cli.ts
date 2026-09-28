// Entry point: `npm run scan -- [flags]` and `npm run scan:watch`.
import { pathToFileURL } from "node:url";
import { config, sharedSecretConflicts, submissionEnv } from "./config";
import { type ForkRef, type RemoteHeads, discoverForks, lsRemote, parseForkSpec, upstreamRef } from "./discover";
import { DockerExecutor } from "./executors/docker";
import { SolariExecutor } from "./executors/solari";
import type { Executor } from "./executors/types";
import { MAX_SCREENER_ERRORS, activeRuns, screenFork, shouldSkip } from "./screen";
import { Store } from "./store";
import { InterruptedError, errMessage, isStopping, pool, requestStop, runCleanups, sleep } from "./util";
import { ensureUpstreamMirror, resetUpstreamMirror } from "./workspace";

export interface ScanFlags {
  command: "scan" | "watch";
  owner?: string;
  forks?: string;
  limit?: number;
  concurrency: number;
  executor: "auto" | "solari" | "docker";
  demo: boolean;
  force: boolean;
  verbose: boolean;
}

const USAGE = `Usage: tsx pipeline/cli.ts <scan|watch> [flags]
  --owner <login>        rescreen one fork (implies --force)
  --forks <list>         comma-separated owner/repo, git URLs or local paths (name=path to set the owner)
  --limit N              screen at most N forks this scan
  --concurrency N        forks screened in parallel (default 2)
  --executor auto|solari|docker   default auto: solari when SOLARI_API_KEY is set
  --no-demo              build and boot only, skip the demo agent
  --force                rescreen even if the commit is unchanged
  --verbose              echo install/run/demo logs to the terminal`;

/** Parse CLI flags. Pure; throws on bad input. */
export function parseArgs(argv: string[]): ScanFlags {
  const [command, ...rest] = argv;
  if (command !== "scan" && command !== "watch") throw new Error(USAGE);
  const flags: ScanFlags = { command, concurrency: 2, executor: "auto", demo: true, force: false, verbose: false };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    const [name, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = () => {
      const v = inline ?? rest[++i];
      if (v == null || v === "") throw new Error(`${name} needs a value\n${USAGE}`);
      return v;
    };
    const int = () => {
      const n = Number(value());
      if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
      return n;
    };
    switch (name) {
      case "--owner":
        flags.owner = value();
        flags.force = true;
        break;
      case "--forks":
        flags.forks = value();
        break;
      case "--limit":
        flags.limit = int();
        break;
      case "--concurrency":
        flags.concurrency = int();
        break;
      case "--executor": {
        const v = value();
        if (v !== "auto" && v !== "solari" && v !== "docker") throw new Error("--executor must be auto, solari or docker");
        flags.executor = v;
        break;
      }
      case "--no-demo":
        flags.demo = false;
        break;
      case "--force":
        flags.force = true;
        break;
      case "--verbose":
      case "-v":
        flags.verbose = true;
        break;
      case "--help":
      case "-h":
        throw new Error(USAGE);
      default:
        throw new Error(`Unknown flag ${arg}\n${USAGE}`);
    }
  }
  return flags;
}

export function pickExecutor(kind: ScanFlags["executor"]): Executor {
  if (kind === "solari" || (kind === "auto" && config.solariApiKey)) return new SolariExecutor();
  return new DockerExecutor();
}

const say = (msg: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${msg}`);

async function resolveForks(flags: ScanFlags, store: Store): Promise<ForkRef[]> {
  const discovered = await discoverForks(flags.forks);
  // GitHub logins are case-insensitive but the owner key is not: reuse the stored spelling.
  const forks: ForkRef[] = [];
  for (const f of discovered) forks.push({ ...f, owner: (await store.canonicalOwner(f.owner)) ?? f.owner });
  if (!flags.owner) return forks;
  const owner = (await store.canonicalOwner(flags.owner)) ?? flags.owner;
  const hit = forks.filter((f) => f.owner.toLowerCase() === owner.toLowerCase());
  if (hit.length) return hit.map((f) => ({ ...f, owner }));
  const known = await store.getSubmissionRepo(owner);
  if (known) return [{ ...parseForkSpec(known.repoUrl), owner, repo: known.repo }];
  return [{ ...parseForkSpec(`${owner}/${upstreamRef().repo}`), owner }];
}

/** Refuse to run when a submission would get one of the screener's own keys. */
export function assertNoSharedSecrets(env: Record<string, string | undefined> = process.env): void {
  const shared = sharedSecretConflicts(env);
  if (shared.length === 0) return;
  const why: Record<string, string> = {
    SOLARI_API_KEY:
      "with the same Solari key a candidate's code can list and kill the screener's VMs and other candidates' (they are all tagged screener=1) and spend on your account",
    ANTHROPIC_API_KEY: "a candidate's code could spend on, and read usage of, the screener's Anthropic account",
    GITHUB_TOKEN: "a candidate's code could act on GitHub as the screener",
  };
  throw new Error(
    `Refusing to scan: ${shared.map((k) => `SUBMISSION_${k}`).join(", ")} ${shared.length === 1 ? "is" : "are"} the same as the screener's own ` +
      `${shared.join(", ")}. Submissions are untrusted code: ${shared.map((k) => why[k]).join("; ")}. ` +
      "Give submissions a separate key (for Solari, a separate org or project) and try again.",
  );
}

/**
 * Crash recovery at scan start: close runs and scans left `running` for hours, and,
 * when no other scan is live, remove leftover containers and VMs from a crashed run.
 */
async function recover(store: Store, executor: Executor): Promise<void> {
  const stale = await store.recoverStale();
  if (stale.scans || stale.owners.length) {
    say(`recovered from an earlier crash: closed ${stale.scans} scan(s), requeued ${stale.owners.length} submission(s)`);
  }
  if ((await store.freshRunningScans()) > 0) {
    say("another scan is running: leaving its containers and VMs alone");
    return;
  }
  await executor.cleanupOrphans(say);
}

export async function scan(flags: ScanFlags): Promise<void> {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is not set");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  const store = new Store(config.databaseUrl);
  let scanId: string | null = null;
  let found = 0;
  try {
    await store.ping();
    assertNoSharedSecrets();
    const executor = pickExecutor(flags.executor);
    await recover(store, executor);
    // Watch mode runs many scans in one process: fetch the upstream again each time.
    resetUpstreamMirror();
    scanId = await store.startScan();
    say(`scan ${scanId.slice(0, 8)} started (executor ${executor.kind}, model ${config.model}, upstream ${config.upstream})`);

    const hidden = await store.applyOptouts();
    if (hidden) say(`hid ${hidden} opted-out submission(s)`);
    const optouts = await store.optouts();

    const forks = await resolveForks(flags, store);
    found = forks.length;
    await store.setScanForks(scanId, found);
    say(`${found} fork(s) found`);

    // Register in discovery order so fork numbers follow it.
    const eligible: ForkRef[] = [];
    for (const fork of forks) {
      if (optouts.has(fork.owner.toLowerCase())) {
        say(`[${fork.owner}] opted out: not screened`);
        continue;
      }
      const reg = await store.registerFork(fork);
      if (!reg) continue;
      if (reg.inserted) say(`[${fork.owner}] new fork #${String(reg.forkNumber).padStart(3, "0")}`);
      eligible.push(fork);
    }

    const todo: { fork: ForkRef; heads: RemoteHeads }[] = [];
    await pool(eligible, 6, async (fork) => {
      try {
        const heads = await lsRemote(fork.cloneUrl);
        const history = await store.recentFinishedRuns(fork.owner, MAX_SCREENER_ERRORS);
        const skip = flags.force ? null : shouldSkip(history, heads, new Set(Object.keys(submissionEnv())));
        if (skip) {
          say(`[${fork.owner}] ${skip}: skipped`);
          return;
        }
        todo.push({ fork, heads });
      } catch (err) {
        say(`[${fork.owner}] cannot read the repository: ${errMessage(err)}`);
      }
    });
    // Keep discovery order after the parallel ls-remote.
    todo.sort((a, b) => eligible.indexOf(a.fork) - eligible.indexOf(b.fork));
    const batch = flags.limit ? todo.slice(0, flags.limit) : todo;
    if (batch.length === 0) say("nothing to screen");
    else {
      say(`screening ${batch.length} fork(s), ${flags.concurrency} at a time${flags.demo ? "" : " (no demo)"}`);
      await executor.prepare(say);
      await ensureUpstreamMirror();
    }

    let fatal: unknown = null;
    await pool(batch, flags.concurrency, async ({ fork, heads }) => {
      if (fatal || isStopping()) return;
      try {
        await screenFork(fork, heads, { executor, store, demo: flags.demo, verbose: flags.verbose, say });
      } catch (err) {
        fatal ??= err;
        if (!(err instanceof InterruptedError)) say(`[${fork.owner}] aborting scan: ${errMessage(err)}`);
      }
    });
    if (fatal) throw fatal;
    if (isStopping()) throw new InterruptedError();
    await store.finishScan(scanId, "done", found);
    say(`scan ${scanId.slice(0, 8)} done`);
  } catch (err) {
    if (scanId) await store.finishScan(scanId, "failed", found).catch(() => {});
    throw err;
  } finally {
    await runCleanups();
    await store.abandonRuns([...activeRuns]).catch(() => {});
    await store.close().catch(() => {});
  }
}

async function watch(flags: ScanFlags): Promise<void> {
  const minutes = Math.max(1, config.intervalMin);
  while (!isStopping()) {
    try {
      await scan({ ...flags, command: "scan" });
    } catch (err) {
      say(`scan failed: ${errMessage(err)}`);
    }
    if (isStopping()) break;
    say(`next scan in ${minutes} min`);
    for (let waited = 0; waited < minutes * 60_000 && !isStopping(); waited += 1000) await sleep(1000);
  }
}

async function main(): Promise<void> {
  let flags: ScanFlags;
  try {
    flags = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(errMessage(err));
    process.exit(2);
  }
  const stop = (sig: string) => {
    if (isStopping()) process.exit(130); // second Ctrl-C: leave now
    requestStop();
    say(`${sig}: stopping; releasing sandboxes and containers (Ctrl-C again to force)...`);
    // Killing the boxes makes in-flight stages fail fast; screenFork then closes
    // its run and scan() marks the scan failed. Force-exit if that stalls.
    void runCleanups();
    setTimeout(() => {
      void (async () => {
        if (config.databaseUrl && activeRuns.size) {
          const store = new Store(config.databaseUrl);
          await store.abandonRuns([...activeRuns]).catch(() => {});
          await store.close().catch(() => {});
        }
        process.exit(130);
      })();
    }, 20_000).unref();
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  if (flags.command === "watch") await watch(flags);
  else await scan(flags);
  if (isStopping()) process.exit(130);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error(`${isStopping() ? "stopped" : "error"}: ${errMessage(err)}`);
      process.exit(isStopping() ? 130 : 1);
    },
  );
}
