// Database tasks: `npm run db:migrate`, `npm run db:seed`, `npm run db:reset -- --yes`,
// `npm run db:restore -- <github-login>` (undo an opt-out; the fork is screened again).
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { MOCK_ISSUES, MOCK_SUBMISSIONS, mockRunFor } from "../lib/mock";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });

async function migrate() {
  await pool.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  console.log("schema applied");
}

async function seed() {
  await migrate();
  for (const s of MOCK_SUBMISSIONS) {
    await pool.query(
      `insert into submissions (owner, repo, fork_number, title, description, repo_url, commit_sha, status,
         project_type, stack, products_used, demo_product, boot_ms, score, score_total, summary, thumbnail_url,
         preview_url, video_url, captions_url, error_tail, discovered_at, scanned_at, hidden)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       on conflict (owner) do nothing`,
      [
        s.owner, s.repo, s.forkNumber, s.title, s.description, s.repoUrl, s.commitSha, s.status,
        s.projectType, JSON.stringify(s.stack), s.productsUsed, s.demoProduct, s.bootMs,
        s.score ? JSON.stringify(s.score) : null, s.score?.total ?? null, s.summary, s.thumbnailUrl,
        s.previewUrl, s.videoUrl, s.captionsUrl, s.errorTail ? JSON.stringify(s.errorTail) : null,
        s.discoveredAt, s.scannedAt, s.hidden,
      ],
    );
    if (s.status === "opted_out") {
      await pool.query("insert into optouts (owner) values ($1) on conflict do nothing", [s.owner]);
    }
    const run = mockRunFor(s);
    if (!run) continue;
    const exists = await pool.query("select 1 from runs where owner = $1 limit 1", [s.owner]);
    if (exists.rowCount) continue;
    await pool.query(
      `insert into runs (owner, commit_sha, status, started_at, finished_at, timings, logs, steps, vm_count, vm_seconds, failure_reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        run.owner, run.commitSha, run.status, run.startedAt, run.finishedAt, JSON.stringify(run.timings),
        JSON.stringify(run.logs), JSON.stringify(run.steps), run.vmCount, run.vmCount * 74, run.failureReason,
      ],
    );
  }
  for (const i of MOCK_ISSUES) {
    await pool.query(
      "insert into sdk_issues (id, title, url, kind, state, opened_at) values ($1,$2,$3,$4,$5,$6) on conflict (id) do nothing",
      [i.id, i.title, i.url, i.kind, i.state, i.openedAt],
    );
  }
  await pool.query(
    "insert into scans (started_at, finished_at, forks_found, status) values (now() - interval '6 minutes', now() - interval '4 minutes', $1, 'done')",
    [MOCK_SUBMISSIONS.length],
  );
  console.log(`seeded ${MOCK_SUBMISSIONS.length} mock submissions`);
}

async function reset() {
  if (!process.argv.includes("--yes")) {
    console.error("This drops every screener table. Re-run with --yes to confirm.");
    process.exit(1);
  }
  await pool.query("drop table if exists runs, submissions, optouts, sdk_issues, scans cascade");
  await pool.query("drop function if exists screener_notify() cascade");
  await migrate();
  console.log("database reset");
}

async function restore(owner: string | undefined) {
  if (!owner) {
    console.error("usage: npm run db:restore -- <github-login>");
    process.exit(1);
  }
  await pool.query("delete from optouts where lower(owner) = lower($1)", [owner]);
  const res = await pool.query(
    "update submissions set hidden = false, status = 'queued', commit_sha = null, updated_at = now() where lower(owner) = lower($1)",
    [owner],
  );
  console.log(res.rowCount ? `restored ${owner}; it will be screened on the next scan` : `removed the opt-out for ${owner}`);
}

const cmd = process.argv[2];
try {
  if (cmd === "migrate") await migrate();
  else if (cmd === "seed") await seed();
  else if (cmd === "reset") await reset();
  else if (cmd === "restore") await restore(process.argv[3]);
  else {
    console.error("usage: db.mts migrate | seed | reset --yes | restore <login>");
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
