// Mock data for building the dashboard without a database (and for demos:
// when DATABASE_URL is unset the site runs on this). Every status appears.
import type { Run, SdkIssue, Submission } from "./types";

const now = Date.now();
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

function sub(p: Partial<Submission> & Pick<Submission, "owner" | "forkNumber" | "status">): Submission {
  return {
    repo: "solari-cookbook",
    title: "solari-cookbook",
    description: "",
    repoUrl: `https://github.com/${p.owner}/${p.repo ?? "solari-cookbook"}`,
    commitSha: null,
    projectType: "cli",
    stack: [],
    productsUsed: [],
    demoProduct: null,
    bootMs: null,
    score: null,
    summary: null,
    thumbnailUrl: null,
    previewUrl: null,
    videoUrl: null,
    captionsUrl: null,
    errorTail: null,
    discoveredAt: ago(60 * 24),
    scannedAt: ago(12),
    hidden: false,
    ...p,
  };
}

const score = (boots: number, works: number, usesSolari: number, useCase: number, polish: number) => ({
  boots,
  works,
  usesSolari,
  useCase,
  polish,
  total: Math.round(((boots + works + usesSolari + useCase + polish) / 5) * 10) / 10,
});

export const MOCK_SUBMISSIONS: Submission[] = [
  sub({
    owner: "alice-chen",
    forkNumber: 17,
    status: "booted",
    title: "solari-price-watch",
    description:
      "Tracks competitor prices across 40 Shopify stores using parallel stealth browsers, then diffs each crawl into a daily report.",
    commitSha: "3f2a91c8d1e04b7a9c2f",
    projectType: "web",
    stack: [
      { slug: "python", name: "Python" },
      { slug: "fastapi", name: "FastAPI" },
      { slug: "googlechrome", name: "Chrome" },
      { slug: "postgresql", name: "PostgreSQL" },
    ],
    productsUsed: ["browser", "sandbox"],
    demoProduct: "browser",
    bootMs: 39_800,
    score: score(5, 4, 4, 5, 3),
    thumbnailUrl: "/mock/price-watch.svg",
    summary:
      "Price Watch is a FastAPI dashboard that keeps a list of Shopify stores and crawls them on a schedule. Each crawl fans out eight stealth Solari Browsers in parallel, and the whole thing runs from a single Solari Sandbox, which is a clean split between the service and the browsers it drives.\n\nIn the demo the agent added a store, ran a crawl that finished 40 stores in 18 seconds, and read three price changes off the diff view. The README is thin and the UI has no loading states, but the core loop works end to end and the use case maps directly to what Solari customers buy browsers for.",
    discoveredAt: ago(60 * 30),
    scannedAt: ago(12),
  }),
  sub({
    owner: "devon-ray",
    forkNumber: 23,
    status: "booted",
    title: "desktop-qa-bot",
    description:
      "A computer-use agent that opens exported spreadsheets on a Solari Desktop and checks every total against the source data.",
    commitSha: "a91be07f55c3",
    projectType: "desktop_agent",
    stack: [
      { slug: "python", name: "Python" },
      { slug: "anthropic", name: "Anthropic" },
      { slug: "ubuntu", name: "Ubuntu" },
    ],
    productsUsed: ["desktop", "sandbox"],
    demoProduct: "desktop",
    bootMs: 52_300,
    score: score(5, 5, 5, 4, 4),
    thumbnailUrl: "/mock/desktop-qa.svg",
    discoveredAt: ago(60 * 20),
    scannedAt: ago(9),
  }),
  sub({
    owner: "mkowalski",
    forkNumber: 31,
    status: "booted",
    title: "form-sentinel",
    description:
      "Submits every contact form on a site every 15 minutes and alerts when a lead fails to arrive in the CRM sandbox.",
    commitSha: "77c0d2e19ab4",
    projectType: "browser_agent",
    stack: [
      { slug: "typescript", name: "TypeScript" },
      { slug: "nodedotjs", name: "Node.js" },
      { slug: "googlechrome", name: "Chrome" },
    ],
    productsUsed: ["browser", "sandbox"],
    demoProduct: "browser",
    bootMs: 28_900,
    score: score(4, 4, 4, 3, 4),
    thumbnailUrl: "/mock/form-sentinel.svg",
    discoveredAt: ago(60 * 12),
    scannedAt: ago(15),
  }),
  sub({
    owner: "priya-n",
    forkNumber: 36,
    status: "running",
    title: "sandbox-grader",
    description:
      "Grades student Python homework by forking one warm sandbox snapshot per submission and running the test suite in parallel.",
    commitSha: "0be4410c2f9d",
    projectType: "cli",
    stack: [
      { slug: "python", name: "Python" },
      { slug: "pytest", name: "pytest" },
      { slug: "docker", name: "Docker" },
    ],
    productsUsed: ["sandbox"],
    demoProduct: "sandbox",
    thumbnailUrl: "/mock/sandbox-grader.svg",
    discoveredAt: ago(60 * 6),
    scannedAt: ago(1),
  }),
  sub({
    owner: "tomasz-dev",
    forkNumber: 29,
    status: "build_failed",
    title: "invoice-extractor",
    description:
      "Logs into supplier portals, downloads invoices as PDFs and extracts line items into a CSV inside a sandbox.",
    commitSha: "c3d9e8812f00",
    projectType: "browser_agent",
    stack: [
      { slug: "nodedotjs", name: "Node.js" },
      { slug: "typescript", name: "TypeScript" },
      { slug: "googlechrome", name: "Chrome" },
    ],
    productsUsed: ["browser", "sandbox"],
    score: score(1, 1, 3, 4, 2),
    errorTail: [
      "npm ERR! code ERESOLVE",
      "npm ERR! ERESOLVE unable to resolve dependency tree",
      "npm ERR! peer typescript@\"^4.9\" from ts-node@10.9.1",
      "npm ERR! Found: typescript@5.6.3",
    ],
    discoveredAt: ago(60 * 14),
    scannedAt: ago(18),
  }),
  sub({
    owner: "lena-okafor",
    forkNumber: 33,
    status: "build_failed",
    title: "ghost-cart",
    description:
      "Abandoned-cart tester that walks a checkout flow with stealth mode and a residential proxy in five countries.",
    commitSha: "58aa01c7e3b2",
    projectType: "browser_agent",
    stack: [
      { slug: "python", name: "Python" },
      { slug: "googlechrome", name: "Chrome" },
    ],
    productsUsed: ["browser"],
    score: score(1, 1, 3, 3, 2),
    errorTail: [
      "Traceback (most recent call last):",
      '  File "/work/ghost-cart/main.py", line 4, in <module>',
      "    from solari_browser import Solari",
      "ModuleNotFoundError: No module named 'solari_browser'",
    ],
    discoveredAt: ago(60 * 9),
    scannedAt: ago(21),
  }),
  sub({
    owner: "sam-whitfield",
    forkNumber: 27,
    status: "timeout",
    title: "crawl-lab",
    description: "A notebook-style crawler playground that streams a Solari Browser into a Jupyter kernel running in a sandbox.",
    commitSha: "9d1c40e2aa81",
    projectType: "web",
    stack: [
      { slug: "python", name: "Python" },
      { slug: "jupyter", name: "Jupyter" },
      { slug: "googlechrome", name: "Chrome" },
    ],
    productsUsed: ["browser", "sandbox"],
    score: score(2, 1, 4, 3, 3),
    errorTail: [
      "$ jupyter lab --ip 0.0.0.0 --port 8888",
      "[I 14:02:11 ServerApp] Building JupyterLab assets (production, minimized)",
      "waiting for port 8888 ...",
      "timed out after 600s waiting for port 8888",
    ],
    discoveredAt: ago(60 * 16),
    scannedAt: ago(26),
  }),
  sub({
    owner: "noor-a",
    forkNumber: 34,
    status: "needs_secrets",
    title: "agent-desk",
    description: "Hands a Solari Desktop to a planning agent that files expense reports from receipts dropped in a folder.",
    commitSha: "e2f7a1b09c35",
    projectType: "desktop_agent",
    stack: [
      { slug: "python", name: "Python" },
      { slug: "ubuntu", name: "Ubuntu" },
    ],
    productsUsed: ["desktop"],
    score: score(1, 1, 4, 4, 3),
    errorTail: ["Missing required environment variables:", "  EXPENSIFY_API_TOKEN", "  RECEIPTS_BUCKET_URL"],
    discoveredAt: ago(60 * 7),
    scannedAt: ago(30),
  }),
  sub({
    owner: "jpark",
    forkNumber: 12,
    status: "skipped",
    title: "solari-cookbook",
    description: "No changes from upstream.",
    commitSha: "7a45864a0b17",
    discoveredAt: ago(60 * 40),
    scannedAt: ago(33),
  }),
  sub({
    owner: "rivera-labs",
    forkNumber: 38,
    status: "queued",
    title: "solari-cookbook",
    description: "Found in the last scan. Waiting for a sandbox.",
    discoveredAt: ago(3),
    scannedAt: null,
  }),
  sub({
    owner: "quiet-fox",
    forkNumber: 19,
    status: "opted_out",
    title: "private-project",
    description: "Hidden at the owner's request.",
    hidden: true,
  }),
];

export const MOCK_SCAN = { lastScanAt: ago(4), running: true };

/** Solari VMs (sandboxes, browsers and desktops) launched per submission, all runs. */
export const MOCK_VM_COUNTS: Record<string, number> = {
  "alice-chen": 14,
  "devon-ray": 9,
  mkowalski: 11,
  "priya-n": 26,
  "tomasz-dev": 3,
  "lena-okafor": 2,
  "sam-whitfield": 4,
  "noor-a": 1,
  jpark: 0,
};

const PRICE_WATCH_INSTALL = `$ git clone --depth 50 https://github.com/alice-chen/solari-cookbook /work/repo
Cloning into '/work/repo'...
remote: Enumerating objects: 412, done.
Receiving objects: 100% (412/412), 1.9 MiB | 11.2 MiB/s, done.
# project: applications/price-watch
$ python3 -m venv .venv
$ .venv/bin/pip install -r requirements.txt
Collecting fastapi==0.118.0
Collecting solari-browser==0.1.5
Collecting uvicorn[standard]==0.37.0
Collecting psycopg[binary]==3.2.10
Installing collected packages: typing-extensions, sniffio, idna, h11, click, anyio, uvicorn, starlette, pydantic, fastapi, solari-browser
WARNING: Running pip as the 'root' user can result in broken permissions
Successfully installed 38 packages in 29.8s
$ npm --prefix web ci
added 212 packages in 1.4s`;

const PRICE_WATCH_RUN = `$ .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
INFO:     Started server process [214]
INFO:     Waiting for application startup.
seeding 40 demo stores from fixtures/stores.json
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
# port 8000 answered 200 after 6.2s
INFO:     10.0.0.1:0 - "GET / HTTP/1.1" 200 OK
INFO:     10.0.0.1:0 - "POST /stores HTTP/1.1" 201 Created
INFO:     10.0.0.1:0 - "POST /crawl HTTP/1.1" 202 Accepted
crawl 7f3e: launching 8 Solari browsers (stealth)
crawl 7f3e: 40/40 stores done in 18.4s, 3 prices changed`;

const PRICE_WATCH_DEMO = `# goal: add a store, run a crawl and read the price diff
0:02 screenshot   Dashboard loaded: 40 stores, last crawl 3 min ago
0:05 click        "+ Add store" button (1070, 101)
0:09 type         "shopify.com/demo-sneakers"
0:12 key          Return
0:17 click        "Run crawl" on the new row
0:31 wait         crawl progress 40/40
0:38 click        "Price changes" tab
0:46 scroll       down 3 to the diff table
0:55 finish       Added a store, ran a crawl, 3 price changes shown with old and new prices`;

export const MOCK_RUNS: Record<string, Run> = {
  "alice-chen": {
    id: "run_7f3e2a",
    owner: "alice-chen",
    commitSha: "3f2a91c8d1e04b7a9c2f",
    status: "booted",
    startedAt: ago(14),
    finishedAt: ago(12),
    timings: [
      { surface: "Sandbox", create: 88, clone: 2_100, install: 31_400, boot: 6_200, demo: null, release: 3 },
      { surface: "Browser", create: 0.8, clone: null, install: null, boot: 1_100, demo: 60_000, release: 2 },
    ],
    logs: { install: PRICE_WATCH_INSTALL, run: PRICE_WATCH_RUN, demo: PRICE_WATCH_DEMO },
    steps: [
      { t: 2, action: "screenshot", label: "Opened the dashboard", reasoning: "Start by looking at what the app shows on load: 40 seeded stores and the time of the last crawl." },
      { t: 5, action: "click", label: "Clicked Add store", reasoning: "Adding a store is the main write path, so it is the first thing a user would try." },
      { t: 9, action: "type", label: "Typed shopify.com/demo-sneakers", reasoning: "Use a store URL the fixtures don't already contain, to prove the form actually persists." },
      { t: 12, action: "key", label: "Pressed Enter", reasoning: "Submit the form the way a keyboard user would." },
      { t: 17, action: "click", label: "Clicked Run crawl", reasoning: "The crawl is the feature that uses Solari: it fans out stealth browsers across stores." },
      { t: 31, action: "wait", label: "Waited for the crawl", reasoning: "The progress bar reached 40/40, so the parallel browsers all returned." },
      { t: 38, action: "click", label: "Opened Price changes", reasoning: "The diff view is the payoff; check it shows the three changed prices from the run log." },
      { t: 46, action: "scroll", label: "Scrolled to the diff table", reasoning: "Old and new prices are below the fold." },
      { t: 55, action: "done", label: "Finished the demo", reasoning: "Added a store, ran a crawl, and saw three price changes with old and new values." },
    ],
    streamUrl: null,
    vmCount: 9,
    failureReason: null,
  },
};

const MOCK_FAILURE_REASONS: Record<string, string> = {
  "tomasz-dev": "Dependency install failed",
  "lena-okafor": "Crashed on start",
  "sam-whitfield": "Timed out",
  "noor-a": "Missing env var",
};

/** A minimal run for mock submissions without a hand-written one. */
export function mockRunFor(s: Submission): Run | null {
  if (MOCK_RUNS[s.owner]) return MOCK_RUNS[s.owner];
  if (s.status === "queued") return null;
  const failed = s.status === "build_failed" || s.status === "timeout";
  return {
    id: `run_${s.forkNumber}`,
    owner: s.owner,
    commitSha: s.commitSha,
    status: s.status,
    startedAt: s.scannedAt ?? s.discoveredAt,
    finishedAt: s.status === "running" ? null : s.scannedAt,
    timings:
      s.status === "skipped"
        ? []
        : [{ surface: "Sandbox", create: 70 + ((s.forkNumber * 37) % 90), clone: 1_800, install: failed ? 24_600 : 18_200, boot: failed ? null : 4_100, demo: null, release: 3 }],
    logs: {
      install: `$ git clone --depth 50 ${s.repoUrl} /work/repo\nCloning into '/work/repo'...\n${s.status === "build_failed" ? (s.errorTail ?? []).join("\n") : "# install finished"}`,
      run: s.status === "timeout" || s.status === "needs_secrets" ? (s.errorTail ?? []).join("\n") : "",
      demo: "",
    },
    steps: [],
    streamUrl: null,
    vmCount: MOCK_VM_COUNTS[s.owner] ?? 0,
    failureReason: MOCK_FAILURE_REASONS[s.owner] ?? null,
  };
}

// Real SDK quirks found while building the screener, kept as sample rows.
export const MOCK_ISSUES: SdkIssue[] = [
  {
    id: "mock-1",
    title: "commands.run drops early stdout from the result when onStdout is set",
    url: "https://github.com/solari-sdk/solari-cookbook/issues",
    kind: "issue",
    state: "open",
    openedAt: ago(60 * 26),
  },
  {
    id: "mock-2",
    title: "commands.run ignores timeoutMs once the control channel is connected",
    url: "https://github.com/solari-sdk/solari-cookbook/issues",
    kind: "issue",
    state: "open",
    openedAt: ago(60 * 25),
  },
  {
    id: "mock-3",
    title: "Browser replay polling: pending uploads throw with status undefined, not 404",
    url: "https://github.com/solari-sdk/solari-cookbook/pulls",
    kind: "pr",
    state: "merged",
    openedAt: ago(60 * 50),
  },
];
