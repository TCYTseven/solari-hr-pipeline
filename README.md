# Solari Screener

Every fork of the Solari cookbook, booted and demoed.

Candidates fork [`solari-sdk/solari-cookbook`](https://github.com/solari-sdk/solari-cookbook) and build something on Solari. The screener finds each fork, works out what the candidate built, installs and boots it in a Solari Sandbox, has a Claude agent demo it in a Solari Browser or Desktop while recording, and scores it. A dashboard styled after getsolari.com shows every submission, live while a scan runs.

## What's in here

**The pipeline** (`pipeline/`, `npm run scan`)

1. **Discover.** Lists the upstream's forks through the GitHub API and skips forks whose commit hasn't changed and anyone who opted out.
2. **Triage.** Clones the fork, diffs it against upstream to find the candidate's project, and asks Claude Sonnet for the project type, stack, the Solari products it uses, how to install and run it, and what the demo should show.
3. **Build.** Installs and boots it in a Solari Sandbox (or a local Docker container when there's no Solari key), timing every stage.
4. **Demo.** A Claude computer-use agent opens the app in a Solari Browser (or a Solari Desktop for GUI apps) and explores it while the session is recorded. Every action becomes a timeline step with Claude's reasoning, plus captions. CLI projects get their run output as the demo.
5. **Score.** Claude rates boots, works, uses Solari, use case and polish from 1 to 5 and writes a two-paragraph summary.

Every stage writes to Postgres as it finishes. A trigger broadcasts each change, and the dashboard streams it to open browsers.

**The dashboard** (`app/`, `npm run dev`)

| Page | What it shows |
| --- | --- |
| `/` | Hero metrics and the submission grid, with product tabs, search, sort and an "only booted" filter |
| `/s/[owner]` | Demo video with a clickable step timeline, score breakdown, AI summary, run timing table, install / run / demo logs, and a live view while a run is active |
| `/stats` | Boot time by project type, product usage, VM totals, create latency, failure rate, common build failures, SDK issues |
| `/how` | The pipeline in five steps and the SDK calls it makes |
| `/optout` | Candidates remove their submission by GitHub username |
| `/review?key=...` | Private, unindexed ranking for the hiring manager: table or grid, `j`/`k` to move, `enter` to open, `o` for the repo |

## Quick start (macOS)

You need Node 20.9 or newer (22 recommended) and Docker Desktop running.

```bash
git clone https://github.com/TCYTseven/solari-hr-pipeline.git
cd solari-hr-pipeline
npm install
npx playwright install chromium   # local browser for thumbnails and the Docker fallback
npm run setup                     # creates .env, starts Postgres in Docker, applies the schema
```

Open `.env` and fill in:

| Variable | Why |
| --- | --- |
| `ANTHROPIC_API_KEY` | Triage, the demo agent and scoring (Claude Sonnet) |
| `SOLARI_API_KEY` | Builds in Solari Sandboxes, demos in Solari Browsers and Desktops |
| `SUBMISSION_SOLARI_API_KEY` | The Solari key handed to submissions, since most of them call Solari themselves. Use a separate key (ideally a separate org) with a spend cap. |
| `REVIEW_KEY` | Secret for `/review?key=...` |
| `GITHUB_TOKEN` | Optional. Raises GitHub's API limit from 60 to 5,000 requests an hour. |

Then:

```bash
npm run solari:check   # confirms the Solari key works for sandboxes, browsers and desktops
npm run dev            # dashboard on http://localhost:3000
npm run scan           # screen every fork once (in a second terminal)
```

The dashboard is empty until the first scan finishes its first fork. Run `npm run db:seed` to load ten sample submissions if you want to look around first (`npm run db:reset -- --yes` clears them).

To keep it current, run `npm run scan:watch`, which rescans every 30 minutes.

### Without a Solari key

Leave `SOLARI_API_KEY` empty and the pipeline builds each fork in a throwaway Docker container and demos it in local Chromium instead. Everything else works the same. The sandbox image builds itself on the first scan. Local runs don't count as Solari VMs on `/stats`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run setup` | First-run setup: `.env`, a random Postgres password, Postgres in Docker on a free port, schema |
| `npm run dev` / `build` / `start` | The dashboard |
| `npm run scan` | Screen forks once. Flags: `--owner <login>` rescreen one fork, `--forks a/b,c/d` screen a given list, `--limit N`, `--concurrency N` (default 2), `--executor auto\|solari\|docker`, `--no-demo`, `--force`, `--verbose` |
| `npm run scan:watch` | Scan every `SCREENER_INTERVAL_MIN` minutes (default 30) |
| `npm run solari:check` | Smoke test for your Solari key: a sandbox, a browser session and a desktop, with timings |
| `npm run db:migrate` | Apply `db/schema.sql` (safe to rerun) |
| `npm run db:seed` / `db:reset -- --yes` | Load or wipe sample data |
| `npm run db:restore -- <login>` | Undo an opt-out and queue that fork again |
| `npm run sdk-issue -- <url> "<title>" [--state open\|closed\|merged]` | Record an SDK issue or PR for `/stats` |
| `npm run lint` / `typecheck` | ESLint, TypeScript |
| `npm run test:pipeline` | Pipeline unit tests |
| `npm run test:e2e` | Playwright + axe: layout at eight widths, keyboard use, reduced motion, accessibility |

Every setting is listed with its default in [`.env.example`](.env.example).

## How it fits together

```
 GitHub forks ─▶ pipeline (npm run scan)
                  triage ──▶ Claude Sonnet
                  build  ──▶ Solari Sandbox   (or Docker)
                  demo   ──▶ Solari Browser / Desktop + Claude computer use   (or local Chromium)
                  score  ──▶ Claude Sonnet
                     │
                     ▼
                 Postgres ── NOTIFY ──▶ /api/live (server-sent events) ──▶ dashboard refreshes
                     ▲                                                       │
                     └──────────────────── reads ────────────────────────────┘
 recordings: .screener/media  ──▶ served at /media/*
```

- `app/`: routes. `components/`: page sections. `ui/`: the design-system components from the plan (buttons, status pills, badges, tabs, log block, video frame).
- `lib/`: data access (`data.ts` reads Postgres, or the mock set when `DATABASE_URL` is unset), the shared types, and the realtime hub.
- `pipeline/`: the screener. `pipeline/executors/` holds the Solari and Docker builders, and `pipeline/demo/` the agent, surfaces and captions.
- `db/schema.sql`: tables, plus the trigger that powers realtime.
- `docs/steps.md`: the design plan the dashboard follows. `docs/deploy.md`: putting the dashboard on Vercel.

## Safety

Submissions are untrusted code, so:

- **Keys.** The screener's own keys never reach a submission. Only variables named `SUBMISSION_<NAME>` are passed in (as `<NAME>`).
- **Prompt injection.** Repository content and web pages are treated as data in every Claude prompt, never as instructions, and secrets are redacted from logs and captions.
- **Docker fallback.** Each run gets its own throwaway container, and Postgres listens on localhost only with a random password. A Solari Sandbox is still the stronger boundary, so prefer a Solari key when screening strangers' code.
- **Opt-outs.** Anyone can opt any username out. If someone misuses the form, `npm run db:restore -- <login>` undoes it.
- **Review page.** The review key lives in the URL. Share that link only with reviewers; the page sends no referrer and is kept out of search engines.

## Deploying

The dashboard runs on Vercel; the pipeline stays on a machine with Docker or Solari access and writes to the same hosted Postgres. See [`docs/deploy.md`](docs/deploy.md).

Built on Solari. Not affiliated with Pinetree Research.
