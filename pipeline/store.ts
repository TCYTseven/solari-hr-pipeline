// Postgres access for the pipeline. Maps camelCase fields to the snake_case schema.
import pg from "pg";
import type { DemoStep, LogTab, Product, ProjectType, Score, StackItem, StageTiming, Status } from "../lib/types";
import type { ForkRef } from "./discover";

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

/** Column/value pairs for a patch. `score` also writes `score_total`. Pure. */
export function patchColumns(patch: Record<string, unknown>, cols: Record<string, string>): { col: string; value: unknown }[] {
  const out: { col: string; value: unknown }[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const col = cols[key];
    if (!col) throw new Error(`unknown field ${key}`);
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
  extra: { set?: string[]; where?: string[] } = {},
): { text: string; values: unknown[] } | null {
  const cols = patchColumns(patch, table === "submissions" ? SUBMISSION_COLS : RUN_COLS);
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

export class Store {
  readonly pool: pg.Pool;

  constructor(url: string) {
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

  async getSubmissionRepo(owner: string): Promise<{ repo: string; repoUrl: string } | null> {
    const r = await this.pool.query<{ repo: string; repo_url: string }>("select repo, repo_url from submissions where lower(owner) = lower($1)", [owner]);
    const row = r.rows[0];
    return row ? { repo: row.repo, repoUrl: row.repo_url } : null;
  }

  /** Latest finished run, for change detection (see shouldSkip). */
  async lastFinishedRun(owner: string): Promise<LastRun | null> {
    const r = await this.pool.query<{ id: string; commit_sha: string | null; status: Status; failure_reason: string | null; triage: Record<string, unknown> | null }>(
      `select id, commit_sha, status, failure_reason, triage from runs
       where owner = $1 and finished_at is not null and status not in ('running', 'queued')
       order by started_at desc limit 1`,
      [owner],
    );
    const row = r.rows[0];
    return row ? { id: row.id, commitSha: row.commit_sha, status: row.status, failureReason: row.failure_reason, triage: row.triage } : null;
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
      await this.updateRun(id, { status: "skipped", finishedAt: new Date(), streamUrl: null, failureReason: "Screener error" });
      await this.updateSubmission(owner, { status: "queued", errorTail: ["Screener error: run interrupted"] });
    }
  }

  async updateRun(id: string, patch: RunPatch): Promise<void> {
    const q = buildUpdate("runs", "id", id, patch as Record<string, unknown>);
    if (q) await this.pool.query(q.text, q.values);
  }

  /** Update a submission unless its owner has opted out. */
  async updateSubmission(owner: string, patch: SubmissionPatch): Promise<void> {
    const q = buildUpdate("submissions", "owner", owner, patch as Record<string, unknown>, {
      set: ["updated_at = now()"],
      where: [NOT_OPTED_OUT],
    });
    if (q) await this.pool.query(q.text, q.values);
  }
}
