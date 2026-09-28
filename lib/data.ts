// Data access for the dashboard. Pages only talk to this module.
// With DATABASE_URL set it reads Postgres; without it, the mock set in lib/mock.ts.
import "server-only";
import { connection } from "next/server";
import { db, hasDatabase } from "./db";
import { median } from "./metrics";
import { MOCK_ISSUES, MOCK_SCAN, MOCK_SUBMISSIONS, MOCK_VM_COUNTS, mockRunFor } from "./mock";
import { toIssue, toRun, toSubmission } from "./rows";
import { computeStats, type Stats } from "./stats";
import type { Run, ScanInfo, Submission } from "./types";

export interface Overview {
  forksFound: number;
  booted: number;
  vmsLaunched: number;
  medianBootMs: number | null;
}

/** A scan older than this is treated as crashed, not running. */
const STALE_SCAN_MS = 3 * 60 * 60 * 1000;

export async function listSubmissions(): Promise<Submission[]> {
  if (!hasDatabase()) return MOCK_SUBMISSIONS.filter((s) => !s.hidden);
  await connection();
  const { rows } = await db().query("select * from submissions where not hidden order by discovered_at desc");
  return rows.map(toSubmission);
}

export async function getSubmission(owner: string): Promise<{ submission: Submission; run: Run | null } | null> {
  if (!hasDatabase()) {
    const key = owner.toLowerCase();
    const submission = MOCK_SUBMISSIONS.find((s) => s.owner.toLowerCase() === key && !s.hidden);
    return submission ? { submission, run: mockRunFor(submission) } : null;
  }
  await connection();
  const { rows } = await db().query("select * from submissions where lower(owner) = lower($1) and not hidden", [owner]);
  if (!rows[0]) return null;
  const submission = toSubmission(rows[0]);
  const runs = await db().query("select * from runs where owner = $1 order by started_at desc limit 1", [
    submission.owner,
  ]);
  return { submission, run: runs.rows[0] ? toRun(runs.rows[0]) : null };
}

export async function getScanInfo(): Promise<ScanInfo> {
  if (!hasDatabase()) return MOCK_SCAN;
  await connection();
  const { rows } = await db().query(
    `select
       (select max(coalesce(finished_at, started_at)) from scans) as last_scan_at,
       (select max(started_at) from scans where status = 'running') as running_since`,
  );
  const r = rows[0] ?? {};
  const since = r.running_since ? new Date(r.running_since).getTime() : 0;
  return {
    lastScanAt: r.last_scan_at ? new Date(r.last_scan_at).toISOString() : null,
    running: since > 0 && Date.now() - since < STALE_SCAN_MS,
  };
}

export async function getOverview(): Promise<Overview> {
  if (!hasDatabase()) {
    const subs = await listSubmissions();
    const booted = subs.filter((s) => s.status === "booted");
    return {
      forksFound: subs.length,
      booted: booted.length,
      vmsLaunched: Object.values(MOCK_VM_COUNTS).reduce((a, b) => a + b, 0),
      medianBootMs: median(booted.map((s) => s.bootMs).filter((n): n is number => n != null)),
    };
  }
  await connection();
  const { rows } = await db().query(
    `select
       count(*)::int as forks_found,
       count(*) filter (where status = 'booted')::int as booted,
       percentile_cont(0.5) within group (order by boot_ms) filter (where status = 'booted' and boot_ms is not null) as median_boot_ms,
       (select coalesce(sum(vm_count), 0)::int from runs) as vms_launched
     from submissions where not hidden`,
  );
  const r = rows[0];
  return {
    forksFound: r.forks_found,
    booted: r.booted,
    vmsLaunched: r.vms_launched,
    medianBootMs: r.median_boot_ms == null ? null : Number(r.median_boot_ms),
  };
}

export async function getStats(): Promise<Stats> {
  if (!hasDatabase()) {
    const subs = await listSubmissions();
    const runs = subs.map(mockRunFor).filter((r): r is Run => r != null);
    const vmsLaunched = Object.values(MOCK_VM_COUNTS).reduce((a, b) => a + b, 0);
    return computeStats({
      submissions: subs,
      sandboxCreateMs: runs.flatMap((r) =>
        r.timings.filter((t) => t.surface === "Sandbox" && t.create != null).map((t) => t.create as number),
      ),
      vmsLaunched,
      vmSeconds: vmsLaunched * 74,
      failureReasons: runs.map((r) => r.failureReason).filter((r): r is string => !!r),
      issues: MOCK_ISSUES,
    });
  }
  await connection();
  const pool = db();
  const [subs, creates, totals, reasons, issues] = await Promise.all([
    listSubmissions(),
    // Solari sandbox create times; local Docker runs only count when there are no Solari runs yet.
    pool.query(
      `select t->>'surface' as surface, (t->>'create')::float as ms
         from runs, jsonb_array_elements(timings) t
        where t->>'surface' in ('Sandbox', 'Local sandbox') and t->>'create' is not null`,
    ),
    pool.query("select coalesce(sum(vm_count), 0)::int as vms, coalesce(sum(vm_seconds), 0)::float as secs from runs"),
    pool.query(
      `select distinct on (r.owner) r.failure_reason
         from runs r join submissions s on s.owner = r.owner
        where not s.hidden and s.status in ('build_failed', 'timeout', 'needs_secrets')
        order by r.owner, r.started_at desc`,
    ),
    pool.query("select * from sdk_issues order by opened_at desc"),
  ]);
  const solari = creates.rows.filter((r) => r.surface === "Sandbox");
  return computeStats({
    submissions: subs,
    sandboxCreateMs: (solari.length ? solari : creates.rows).map((r) => Number(r.ms)),
    vmsLaunched: totals.rows[0].vms,
    vmSeconds: totals.rows[0].secs,
    failureReasons: reasons.rows.map((r) => r.failure_reason).filter(Boolean),
    issues: issues.rows.map(toIssue),
  });
}
