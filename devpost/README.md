# Solari Screener: Devpost kit

Submission fields, gallery, story and demo video plan for the Devpost entry. The story to paste into "About the project" is in [`story.md`](story.md).

## Submission fields

| Field | Value |
| --- | --- |
| Project name | Solari Screener |
| Elevator pitch (200 chars max) | An AI screener for coding challenges: it boots each submission in a Solari Sandbox, has Claude demo it on camera, and scores it, live on one dashboard. |
| Thumbnail | [`screenshots/00-cover.png`](screenshots/00-cover.png) |
| About the project | Paste [`story.md`](story.md) as is. Devpost renders the Markdown. |
| Built with | `typescript`, `node.js`, `next.js`, `react`, `tailwindcss`, `postgresql`, `claude`, `anthropic`, `claude-code`, `solari`, `playwright`, `docker`, `github-api`, `server-sent-events`, `zod` |
| Try it out | https://github.com/TCYTseven/solari-hr-pipeline |
| Video demo | Your YouTube or Vimeo link (script below) |

Other taglines, if the pitch field wants a different angle:

- Every hiring-challenge submission, booted in a sandbox, demoed on camera by an AI agent and scored before anyone opens the repo.
- Clone, install, boot, click around, judge. Solari Screener does the first four for every fork.
- A hiring manager's review queue where each project is already running on video.

## Gallery

Upload in this order. Every image is 3000 x 2000 PNG (3:2, the ratio Devpost crops to) and under 1 MB. Skip the `_phone-*.png` files: they only feed the mobile composite.

| # | File | Caption |
| --- | --- | --- |
| 0 | [`00-cover.png`](screenshots/00-cover.png) | Solari Screener: each submission booted, demoed on camera and scored. |
| 1 | [`01-submissions.png`](screenshots/01-submissions.png) | The submission grid, with status and Solari product filters. Cards change state while a scan runs. |
| 2 | [`02-submission-demo.png`](screenshots/02-submission-demo.png) | One submission: the recorded demo, its step timeline and the score breakdown. |
| 3 | [`03-agent-steps.png`](screenshots/03-agent-steps.png) | Each action the Claude demo agent took, with its reasoning. |
| 4 | [`04-review.png`](screenshots/04-review.png) | Review: ranked by score with a live preview. `j` / `k` to move, `enter` to open. |
| 5 | [`05-review-table.png`](screenshots/05-review-table.png) | The review table: products, boot time, score and a link to each demo. |
| 6 | [`06-stats.png`](screenshots/06-stats.png) | Stats: boot time by project type, Solari product usage, VM totals and common build failures. |
| 7 | [`07-how-it-works.png`](screenshots/07-how-it-works.png) | How it works: the five stages and the real Solari SDK calls behind them. |
| 8 | [`08-build-failed.png`](screenshots/08-build-failed.png) | A failed build shows the command and error that broke it, without cloning the repo. |
| 9 | [`09-architecture.png`](screenshots/09-architecture.png) | Architecture: pipeline stages, Postgres NOTIFY, server-sent events and the safety model. |
| 10 | [`10-mobile.png`](screenshots/10-mobile.png) | The dashboard on a phone: submissions, one submission and review. |

The screenshots use the built-in sample data (`SCREENER_DATA=mock`), so the candidates in them are fictional. Keep it that way for the public gallery, since real candidates' names, projects and scores come from job applications. The last line of `story.md` says so.

## Demo video (about 2:45)

Many judges watch the video before reading anything. Record at 1440p or higher with the browser zoomed to 110 to 125%, bookmarks bar hidden and notifications off.

Set up a fork you own for the live part: fork `solari-sdk/solari-cookbook`, add a small Solari project, then run `npm run scan -- --owner <your-login> --force` while recording, so the dashboard changes on camera without showing a real candidate.

| Time | Screen | Voiceover |
| --- | --- | --- |
| 0:00 | GitHub's fork list for the cookbook, scrolling | "Solari's hiring challenge asks candidates to fork this cookbook and build something on Solari. Each fork is a different project, with its own stack, its own install steps and its own API keys." |
| 0:15 | A terminal: clone, `npm install` failing, an `.env` error | "Reviewing one by hand means cloning it, finding what changed, getting it to install and boot, and then clicking through it. For each fork." |
| 0:30 | Dashboard `/`, scan running, your card moving from queued to running to booted | "Solari Screener does that part. It finds each new fork, and Claude reads it and works out how to run it. The project boots in a Solari Sandbox, and the cards update live as each stage finishes." |
| 0:55 | Your submission's page: play the demo video, click two timeline dots | "When the app is up, a Claude computer-use agent opens it in a Solari Browser, or a Solari Desktop for GUI apps, and demos it while the session records. Each dot is one action. Click it to jump there." |
| 1:20 | Agent steps tab, then the score panel | "Every step keeps Claude's reasoning. Then Claude scores five things from 1 to 5 (boots, works, uses Solari, use case and polish) and writes a summary for the hiring manager." |
| 1:40 | A failed build's page with the error at the top | "When a build fails, the page shows the command and the error, so the reviewer knows why without cloning anything." |
| 1:55 | `/review`: press `j` a few times, then Table | "The review page ranks everything by score. `j` and `k` move through it, and the preview follows." |
| 2:10 | `/stats`, then `/how` with the Sandbox / Browser / Desktop tabs | "Stats show boot times, which Solari products candidates use, and the most common build failures. One Solari key covers the sandbox, the browser and the desktop." |
| 2:25 | `09-architecture.png` or the safety section of the README | "Submissions are untrusted code. They only get secrets named `SUBMISSION_*`, logs are redacted, and the demo browser can't reach private networks." |
| 2:40 | Cover image with the repo URL | "Solari Screener. Every fork, booted, demoed and scored." |

## How it maps to common judging criteria

| Criterion | What to point at |
| --- | --- |
| Technical complexity | Five-stage pipeline across three Solari products, a computer-use agent, Postgres `NOTIFY` streamed to the browser over server-sent events, and a Docker fallback that keeps every stage working without a Solari key. |
| Use of the sponsor's tech | Sandbox, Browser and Desktop behind one key; `npm run solari:check` for the exact SDK paths; the SDK workarounds listed under Challenges in the story. |
| Design and UX | Tokens taken from getsolari.com, keyboard-driven review, mobile layouts, 128 Playwright + axe tests. |
| Usefulness | Replaces the clone, install, boot and click-through loop for each submission, and ranks the results for the person hiring. |
| Completeness | `npm run setup` for first run, 57 pipeline unit tests, opt-out flow, deploy guide in `docs/deploy.md`. |

If the hackathon publishes its own criteria, reorder the story's sections to match them.

## Questions judges may ask

**What stops a malicious submission?** It runs in its own Solari Sandbox microVM. It only sees `SUBMISSION_*` variables, and the scan refuses to start if one equals the screener's own keys. Logs are redacted before storage. Triage can't follow symlinks out of the checkout. Repo text and web pages reach Claude tagged as untrusted data. The demo browser blocks loopback and private addresses other than the app.

**Can the AI score be trusted?** It's a first pass for a human. The rubric's hard rules (didn't boot means 1 for boots, missing secrets caps works at 3) are enforced in code. The video, agent steps and logs sit next to the score so the reviewer can check it.

**Why not run the candidates' CI?** Most submissions have no tests, and tests don't show whether a browser agent or a desktop app does what it claims. The screener runs the app and records it.

**What does a scan cost?** One sandbox, plus one browser or desktop session, per fork that changed. Unchanged forks are skipped, concurrency defaults to 2, and `/stats` shows VMs launched and VM-minutes. Bring your real numbers from a scan.

**How long did it take?** Answer from your own experience. The commit history shows it was built with Claude Code from the plan in `docs/steps.md`.

## Before you submit

- [ ] Fill the `[FILL IN]` line in `story.md` with numbers from `/stats` after a real scan, or delete it.
- [ ] Record and upload the video, then add the link.
- [ ] Make the repo public if the hackathon requires it. The repo has no `LICENSE` file; add one (MIT is common) if open source is a rule.
- [ ] Swap "I" for "we" in `story.md` if you're submitting as a team.
- [ ] Preview the submission page on Devpost, including on a phone, before publishing.
- [ ] Add teammates on Devpost before the deadline, when submissions lock.

## Regenerating the images

```bash
SCREENER_DATA=mock npm run build
SCREENER_DATA=mock npm run start          # or drop SCREENER_DATA to use your database
node devpost/capture.mjs                  # writes devpost/screenshots/
```

`capture.mjs` takes the dashboard URL as its first argument (default `http://localhost:3000`). With real data, set `DETAIL=<owner>` to a booted web app and `FAILED=<owner>` to a failed build. The cover, architecture and mobile images come from `templates/*.html`, which use the dashboard's colors and bundled copies of Inter and JetBrains Mono (both OFL).
