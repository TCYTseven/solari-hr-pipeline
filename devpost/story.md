## Inspiration

Solari runs a hiring challenge: candidates fork the Solari cookbook and build something on Solari's cloud browsers, sandbox microVMs or desktops. Each fork is a small, unfamiliar project. Reviewing one by hand means cloning it, working out which folder the candidate touched, guessing the install and run commands, finding the API keys it expects, booting it, and then clicking through it to see if it works. The hiring manager repeats all of that for each fork before judging anything.

I wanted the hiring manager to open a dashboard and find each project already running on video, with a score and a written summary beside it.

## What it does

Solari Screener watches the forks of the Solari cookbook and screens each new or changed one in five stages:

1. **Discover.** Lists the forks through the GitHub API every 30 minutes and skips forks whose commit hasn't changed, plus anyone who opted out.
2. **Triage.** Clones the fork, diffs it against upstream to find the candidate's project, and asks Claude for the project type, stack, the Solari products it uses, how to install and run it, and what a demo should show.
3. **Build.** Installs and boots the project in a fresh Solari Sandbox microVM (a Solari Desktop VM for GUI apps), timing every stage.
4. **Demo.** A Claude computer-use agent opens the app in a Solari Browser or Desktop and explores it while the session records. Each action becomes a step on a clickable timeline, with Claude's reasoning and captions. CLI projects get their run output as the demo.
5. **Score.** Claude grades boots, works, uses Solari, use case and polish from 1 to 5, using the code, the logs and the demo, and writes a two-paragraph summary.

The dashboard shows each stage as it lands:

- **Submissions:** a grid with status and product filters, search and sort. Cards change state while a scan runs.
- **Submission detail:** the demo video with its step timeline, the score breakdown, and tabs for the summary, agent steps, timing and logs.
- **Review:** submissions ranked by score with a live preview of the selected one. `j` / `k` to move, `enter` to open, `o` for the repo.
- **Stats:** boot time by project type, Solari product usage, VMs launched, sandbox create latency, failure rate, the most common build failures and SDK issues.
- **How it works** and **Opt out,** so candidates can see what happens to their code and remove it.

## How I built it

- **Pipeline:** TypeScript on Node 22. `@solarisdk/sdk` creates the sandboxes and desktops, and `@solarisdk/browser` creates browser sessions that Playwright drives over CDP. The Anthropic SDK runs triage, scoring and the computer-use demo agent on Claude Sonnet.
- **Storage and realtime:** Postgres holds submissions and runs. The pipeline writes after each stage and a trigger calls `pg_notify`. The dashboard keeps one `LISTEN` connection per server process and streams changes to open tabs over server-sent events.
- **Dashboard:** Next.js 16, React 19 and Tailwind CSS 4, styled with design tokens taken from getsolari.com so it reads like part of Solari's product.
- **Docker fallback:** without a Solari key, each fork builds in a throwaway Docker container and demos in local Chromium. The stages and the dashboard stay the same.
- **Tests:** 57 unit tests on the pipeline, and 128 Playwright + axe tests covering layout at eight widths, keyboard use, reduced motion and accessibility.
- **Process:** I built it with Claude Code, working through a written design plan one step at a time and fixing what the first real scans broke.

## Challenges I ran into

- **Finding the project inside a fork.** Candidates add a folder to a large cookbook, work on feature branches, or get merged upstream and delete the branch. The screener diffs against an upstream mirror, picks the directory that owns the most changed files under a new or changed manifest, and falls back to the merged PR's head when the fork's branches match upstream.
- **Timeouts that didn't fire.** Commands on the sandbox control channel ignore `timeoutMs`, so a hung `npm install` could hold a VM until its idle timeout. Each stage now runs under an in-guest `timeout`, with a host-side deadline as a backstop.
- **Dev servers behind a preview URL.** Vite and webpack-dev-server reject requests whose `Host` header they don't recognise, which includes requests through Solari's preview gateway. A small relay in the sandbox rewrites the header, and the screener sets the allowed-host variables those servers read. The demo browser also re-adds the preview token to same-origin requests that dropped it.
- **WebSockets from Node.** Node 22's built-in `WebSocket` can't send an `Authorization` header and stringifies binary frames, so the SDK is pointed at the `ws` package.
- **Running strangers' code.** Submissions only receive variables named `SUBMISSION_*`, and a scan refuses to start if one of them matches the screener's own keys. Stored logs are redacted first, including secrets split across chunks. Triage can't follow symlinks out of the checkout, repo text reaches Claude tagged as untrusted data, and the demo browser blocks loopback and private addresses other than the app itself.
- **Keeping the scores consistent.** The rubric says a project that didn't boot gets 1 for boots, and one missing secrets can't score above 3 on works. The pipeline enforces both rules in code and recomputes the total. A tool call cut off at `max_tokens` can parse as a partial object, so the demo agent discards it.

## Accomplishments that I'm proud of

- One Solari key covers the whole loop: the sandbox that builds the project, the browser or desktop that demos it, and the recording the hiring manager watches.
- `npm run solari:check` tests a key against the exact SDK paths the pipeline uses (sandbox commands, preview URLs, browser recording, desktop display and recording) and ends with a pass / warn / fail summary.
- The dashboard updates live, works on a phone, supports keyboard-only use and passes automated axe accessibility checks.
- [FILL IN from /stats after a real scan: forks screened, VMs launched, median boot time.]

## What I learned

- SDK lifecycles need care: `kill()` ends a sandbox VM while `close()` leaves it running, and closing a browser session's socket doesn't release the session. Every exit path now ends both explicitly.
- Model output is input. Triage results are checked before later stages act on them: the project directory has to be inside the checkout, ports and env var names have to be valid, and run timeouts are clamped.
- A live process is different from a working server. The screener waits for the port to answer HTTP from inside the box before it exposes the app for a demo.

## What's next for Solari Screener

- **Other challenges and hackathons.** The upstream repo is already a setting (`SCREENER_UPSTREAM`). A configurable rubric and prompts would let the same pipeline pre-screen any template-based hackathon for its judges.
- **Feedback for candidates.** Post each candidate's score, summary and demo link back to them on GitHub.
- **Side-by-side review.** Compare two submissions' demos and scores on one screen.

_Screenshots use the dashboard's built-in sample data, to keep real candidates' work private._
