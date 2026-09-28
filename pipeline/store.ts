// Postgres access for the pipeline. Maps camelCase fields to the snake_case schema.
import pg from "pg";
import type { DemoStep, LogTab, Product, ProjectType, Score, StackItem, StageTiming, Status } from "../lib/types";
import { secretValues } from "./config";
import type { ForkRef } from "./discover";
import { redactDeep } from "./util";

export interface SubmissionPatch {
  repo?: string;
  title?: string;
  description?: string;
  repoUrl?: string;
  defaultBranch?: string | null;
  commitSha?: string | null;
  status?: Status;
  projectType?: ProjectType;
  stack?: StackItem[];
  productsUsed?: Product[];
  demoProduct?: Product | null;
  bootMs?: number | null;
  score?: Score | null;
  summary?: string | null;
  thumbnailUrl?: string | null;
  previewUrl?: string | null;
  videoUrl?: string | null;
  captionsUrl?: string | null;
  errorTail?: string[] | null;
  scannedAt?: Date | null;
  hidden?: boolean;
}

export interface RunPatch {
  commitSha?: string | null;
  status?: Status;
  finishedAt?: Date | null;
  timings?: StageTiming[];
  logs?: Record<LogTab, string>;
  steps?: DemoStep[];
  streamUrl?: string | null;
  vmCount?: number;
  vmSeconds?: number;
  failureReason?: string | null;
  triage?: unknown;
}

const SUBMISSION_COLS: Record<keyof SubmissionPatch, string> = {
  repo: "repo",
  title: "title",
  description: "description",
  repoUrl: "repo_url",
  defaultBranch: "default_branch",
  commitSha: "commit_sha",
  status: "status",
  projectType: "project_type",
  stack: "stack",
  productsUsed: "products_used",
  demoProduct: "demo_product",
  bootMs: "boot_ms",
  score: "score",
  summary: "summary",
  thumbnailUrl: "thumbnail_url",
  previewUrl: "preview_url",
  videoUrl: "video_url",
  captionsUrl: "captions_url",
  errorTail: "error_tail",
  scannedAt: "scanned_at",
  hidden: "hidden",
};

const RUN_COLS: Record<keyof RunPatch, string> = {
  commitSha: "commit_sha",
  status: "status",
  finishedAt: "finished_at",
  timings: "timings",
  logs: "logs",
  steps: "steps",
  streamUrl: "stream_url",
  vmCount: "vm_count",
  vmSeconds: "vm_seconds",
  failureReason: "failure_reason",
  triage: "triage",
};

const JSONB = new Set(["stack", "score", "error_tail", "timings", "logs", "steps", "triage"]);

/**
 * Column/value pairs for a patch. `score` also writes `score_total`. Every string
 * (including inside jsonb values) is redacted here, at the store boundary, so no
 * code path can publish one of `secrets` or an obvious key. Pure.
 */
export function patchColumns(patch: Record<string, unknown>, cols: Record<string, string>, secrets: string[] = []): { col: string; value: unknown }[] {
  const out: { col: string; value: unknown }[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (raw === undefined) continue;
    const col = cols[key];
    if (!col) throw new Error(`unknown field ${key}`);
    const value = redactDeep(raw, secrets);
    out.push({ col, value: JSONB.has(col) && value !== null ? JSON.stringify(value) : value });
    if (col === "score") {
      const total = value && typeof value === "object" ? (value as Score).total : null;
      out.push({ col: "score_total", value: total ?? null });
    }
  }
  return out;
}

/** Parameterized UPDATE for a patch. Pure. */
export function buildUpdate(
  table: "submissions" | "runs",
  keyCol: string,
  key: string,
  patch: Record<string, unknown>,
  extra: { set?: string[]; where?: string[]; secrets?: string[] } = {},
): { text: string; values: unknown[] } | null {
  const cols = patchColumns(patch, table === "submissions" ? SUBMISSION_COLS : RUN_COLS, extra.secrets);
  const sets = cols.map((c, i) => `${c.col} = $${i + 2}${JSONB.has(c.col) ? "::jsonb" : ""}`);
  sets.push(...(extra.set ?? []));
  if (sets.length === 0) return null;
  const where = [`${keyCol} = $1`, ...(extra.where ?? [])].join(" and ");
  return { text: `update ${table} set ${sets.join(", ")} where ${where}`, values: [key, ...cols.map((c) => c.value)] };
}

const NOT_OPTED_OUT = "not exists (select 1 from optouts o where lower(o.owner) = lower(submissions.owner))";

export interface LastRun {
  id: string;
  commitSha: string | null;
  status: Status;
  failureReason: string | null;
  triage: Record<string, unknown> | null;
}

/** How a run ended when it ended as a screener problem (kept in runs.triage._screener.error). */
export type ScreenerErrorKind = "error" | "interrupted" | "stale";

/** Runs stuck in `running` longer than this are treated as abandoned by a crashed screener. */
export const STALE_HOURS = 3;

export class Store {
  readonly pool: pg.Pool;
  /** Values redacted from every write (the screener's keys and SUBMISSION_* values). */
  private readonly secrets: string[];

  constructor(url: string, secrets: string[] = secretValues()) {
    this.secrets = secrets;
    this.pool = new pg.Pool({ connectionString: url, max: 6 });
    this.pool.on("error", (err) => console.warn(`[db] idle client error: ${err.message}`));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<void> {
    await this.pool.query("select 1 from submissions limit 1");
  }

  async optouts(): Promise<Set<string>> {
    const r = await this.pool.query<{ owner: string }>("select owner from optouts");
    return new Set(r.rows.map((x) => x.owner.toLowerCase()));
  }

  /** Hide every opted-out submission. Touches nothing else on those rows. */
  async applyOptouts(): Promise<number> {
    const r = await this.pool.query(
      `update submissions set status = 'opted_out', hidden = true, updated_at = now()
       where lower(owner) in (select lower(owner) from optouts) and (status <> 'opted_out' or hidden = false)`,
    );
    return r.rowCount ?? 0;
  }

  async startScan(): Promise<string> {
    const r = await this.pool.query<{ id: string }>("insert into scans (status) values ('running') returning id");
    return r.rows[0]!.id;
  }

  async finishScan(id: string, status: "done" | "failed", forksFound: number): Promise<void> {
    await this.pool.query("update scans set status = $2, forks_found = $3, finished_at = now() where id = $1", [id, status, forksFound]);
  }

  async setScanForks(id: string, forksFound: number): Promise<void> {
    await this.pool.query("update scans set forks_found = $2 where id = $1", [id, forksFound]);
  }

  /** Insert a newly discovered fork as queued with the next fork_number. Returns null for opted-out owners. */
  async registerFork(fork: ForkRef): Promise<{ forkNumber: number; inserted: boolean } | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await this.pool.query<{ fork_number: number; inserted: boolean }>(
          `insert into submissions (owner, repo, fork_number, repo_url, status, title)
           select $1, $2, coalesce((select max(fork_number) from submissions), 0) + 1, $3, 'queued', $2
           where not exists (select 1 from optouts o where lower(o.owner) = lower($1))
           on conflict (owner) do update set repo = excluded.repo, repo_url = excluded.repo_url
           returning fork_number, (xmax = 0) as inserted`,
          [fork.owner, fork.repo, fork.repoUrl],
        );
        const row = r.rows[0];
        return row ? { forkNumber: row.fork_number, inserted: row.inserted } : null;
      } catch (err) {
        // Two writers raced on fork_number: retry with the new max.
        if ((err as { code?: string }).code === "23505" && attempt < 3) continue;
        throw err;
      }
    }
  }

  async isOptedOut(owner: string): Promise<boolean> {
    const r = await this.pool.query("select 1 from optouts where lower(owner) = lower($1) limit 1", [owner]);
    return (r.rowCount ?? 0) > 0;
  }

  /** The owner key as stored (GitHub logins are case-insensitive), or null. */
  async canonicalOwner(owner: string): Promise<string | null> {
    const r = await this.pool.query<{ owner: string }>("select owner from submissions where lower(owner) = lower($1) limit 1", [owner]);
    return r.rows[0]?.owner ?? null;
  }

  /** Other scans still marked running that started recently (a live scan elsewhere). */
  async freshRunningScans(exceptId?: string): Promise<number> {
    const r = await this.pool.query<{ n: string }>(
      `select count(*)::text as n from scans
       where status = 'running' and started_at > now() - make_interval(hours => $2) and id is distinct from $1::uuid`,
      [exceptId ?? null, STALE_HOURS],
    );
    return Number(r.rows[0]?.n ?? 0);
  }

  /**
   * After a crash: fail scans and close runs left `running` for more than
   * STALE_HOURS, and requeue their submissions. Returns the owners requeued.
   */
  async recoverStale(): Promise<{ scans: number; owners: string[] }> {
    const scans = await this.pool.query(
      `update scans set status = 'failed', finished_at = now()
       where status = 'running' and started_at < now() - make_interval(hours => $1)`,
      [STALE_HOURS],
    );
    const runs = await this.pool.query<{ owner: string }>(
      `update runs set status = 'skipped', failure_reason = 'Screener error', finished_at = now(), stream_url = null,
         triage = coalesce(triage, '{}'::jsonb)
           || jsonb_build_object('_screener', coalesce(triage->'_screener', '{}'::jsonb) || '{"error":"stale"}'::jsonb)
       where status = 'running' and started_at < now() - make_interval(hours => $1)
       returning owner`,
      [STALE_HOURS],
    );
    const owners = [...new Set(runs.rows.map((r) => r.owner))];
    if (owners.length) {
      await this.pool.query(
        `update submissions set status = 'queued', error_tail = $2::jsonb, updated_at = now()
         where owner = any($1) and status = 'running' and ${NOT_OPTED_OUT}`,
        [owners, JSON.stringify(["Screener error: the screener stopped mid-run; it will be screened again"])],
      );
    }
    return { scans: scans.rowCount ?? 0, owners };
  }

  async getSubmissionRepo(owner: string): Promise<{ repo: string; repoUrl: string } | null> {
    const r = await this.pool.query<{ repo: string; repo_url: string }>("select repo, repo_url from submissions where lower(owner) = lower($1)", [owner]);
    const row = r.rows[0];
    return row ? { repo: row.repo, repoUrl: row.repo_url } : null;
  }

  /** The latest finished runs, newest first, for change detection (see shouldSkip). */
  async recentFinishedRuns(owner: string, limit = 3): Promise<LastRun[]> {
    const r = await this.pool.query<{ id: string; commit_sha: string | null; status: Status; failure_reason: string | null; triage: Record<string, unknown> | null }>(
      `select id, commit_sha, status, failure_reason, triage from runs
       where owner = $1 and finished_at is not null and status not in ('running', 'queued')
       order by started_at desc limit $2`,
      [owner, limit],
    );
    return r.rows.map((row) => ({ id: row.id, commitSha: row.commit_sha, status: row.status, failureReason: row.failure_reason, triage: row.triage }));
  }

  /** Create a running run and flip the submission to running so the dashboard shows it live. */
  async beginRun(owner: string, commitSha: string | null): Promise<string> {
    const r = await this.pool.query<{ id: string }>(
      `insert into runs (owner, commit_sha, status) values ($1, $2, 'running') returning id`,
      [owner, commitSha],
    );
    await this.updateSubmission(owner, { status: "running" });
    return r.rows[0]!.id;
  }

  /** Close runs interrupted mid-flight (Ctrl-C) and requeue their submissions. */
  async abandonRuns(runs: [string, string][]): Promise<void> {
    for (const [id, owner] of runs) {
      await this.pool.query(
        `update runs set status = 'skipped', failure_reason = 'Screener error', finished_at = now(), stream_url = null,
           triage = coalesce(triage, '{}'::jsonb)
             || jsonb_build_object('_screener', coalesce(triage->'_screener', '{}'::jsonb) || '{"error":"interrupted"}'::jsonb)
         where id = $1 and finished_at is null`,
        [id],
      );
      await this.updateSubmission(owner, { status: "queued", errorTail: ["Screener error: run interrupted"] });
    }
  }

  async updateRun(id: string, patch: RunPatch): Promise<void> {
    const q = buildUpdate("runs", "id", id, patch as Record<string, unknown>, { secrets: this.secrets });
    if (q) await this.pool.query(q.text, q.values);
  }

  /** Update a submission unless its owner has opted out. */
  async updateSubmission(owner: string, patch: SubmissionPatch): Promise<void> {
    const q = buildUpdate("submissions", "owner", owner, patch as Record<string, unknown>, {
      set: ["updated_at = now()"],
      where: [NOT_OPTED_OUT],
      secrets: this.secrets,
    });
    if (q) await this.pool.query(q.text, q.values);
  }
}
