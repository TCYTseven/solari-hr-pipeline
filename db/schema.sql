-- Solari Screener schema. Idempotent: safe to run on every `npm run db:migrate`.
-- gen_random_uuid() is built into Postgres 13+.


-- One row per fork. The fork owner's GitHub login is the key and the URL: /s/[owner].
create table if not exists submissions (
  owner          text primary key,
  repo           text not null,
  fork_number    integer not null unique,
  title          text not null default '',
  description    text not null default '',
  repo_url       text not null,
  default_branch text,
  commit_sha     text,
  status         text not null default 'queued'
                 check (status in ('queued','running','booted','build_failed','timeout','needs_secrets','skipped','opted_out')),
  project_type   text not null default 'cli'
                 check (project_type in ('web','desktop_agent','browser_agent','cli')),
  stack          jsonb not null default '[]'::jsonb,        -- [{slug, name}]
  products_used  text[] not null default '{}',              -- browser | sandbox | desktop
  demo_product   text check (demo_product in ('browser','sandbox','desktop')),
  boot_ms        integer,
  score          jsonb,                                     -- {boots, works, usesSolari, useCase, polish, total}
  score_total    real,                                      -- copy of score.total for sorting
  summary        text,
  thumbnail_url  text,
  preview_url    text,
  video_url      text,
  captions_url   text,
  error_tail     jsonb,                                     -- string[]
  discovered_at  timestamptz not null default now(),
  scanned_at     timestamptz,
  updated_at     timestamptz not null default now(),
  hidden         boolean not null default false
);

create index if not exists submissions_visible_idx on submissions (hidden, discovered_at desc);

-- One row per screening run of a fork.
create table if not exists runs (
  id             uuid primary key default gen_random_uuid(),
  owner          text not null references submissions(owner) on delete cascade,
  commit_sha     text,
  status         text not null default 'running'
                 check (status in ('queued','running','booted','build_failed','timeout','needs_secrets','skipped','opted_out')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  timings        jsonb not null default '[]'::jsonb,        -- StageTiming[]
  logs           jsonb not null default '{"install":"","run":"","demo":""}'::jsonb,
  steps          jsonb not null default '[]'::jsonb,        -- DemoStep[]
  stream_url     text,
  vm_count       integer not null default 0,
  vm_seconds     real not null default 0,
  failure_reason text,
  triage         jsonb
);

create index if not exists runs_owner_idx on runs (owner, started_at desc);

-- GitHub usernames that asked to be removed. The pipeline never screens them again.
create table if not exists optouts (
  owner        text primary key,
  requested_at timestamptz not null default now()
);

-- Issues and PRs opened against the Solari SDK while screening.
create table if not exists sdk_issues (
  id        text primary key,
  title     text not null,
  url       text not null,
  kind      text not null check (kind in ('issue','pr')),
  state     text not null check (state in ('open','closed','merged')),
  opened_at timestamptz not null default now()
);

-- One row per scan of the upstream's forks.
create table if not exists scans (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  forks_found integer not null default 0,
  status      text not null default 'running' check (status in ('running','done','failed'))
);

-- Realtime: every change to a submission, run or scan is broadcast on the
-- "screener" channel. The dashboard's /api/live route LISTENs and relays it
-- to browsers over server-sent events.
create or replace function screener_notify() returns trigger language plpgsql as $$
declare
  payload json;
begin
  if tg_table_name = 'scans' then
    payload := json_build_object('table', tg_table_name, 'op', tg_op, 'id', new.id, 'status', new.status);
  else
    payload := json_build_object('table', tg_table_name, 'op', tg_op, 'owner', new.owner, 'status', new.status);
  end if;
  perform pg_notify('screener', payload::text);
  return new;
end $$;

drop trigger if exists submissions_notify on submissions;
create trigger submissions_notify after insert or update on submissions
  for each row execute function screener_notify();

drop trigger if exists runs_notify on runs;
create trigger runs_notify after insert or update on runs
  for each row execute function screener_notify();

drop trigger if exists scans_notify on scans;
create trigger scans_notify after insert or update on scans
  for each row execute function screener_notify();
