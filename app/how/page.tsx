import type { Metadata } from "next";
import { CodeTabs, type CodeSample } from "@/components/how/CodeTabs";
import { Container } from "@/ui/Container";
import { Divider } from "@/ui/Divider";
import { Label } from "@/ui/Label";

export const metadata: Metadata = {
  title: "How it works",
  description: "Discover forks, triage with Claude, build in a Solari Sandbox, demo in a Solari Browser or Desktop, score.",
};

const STEPS = [
  {
    n: "01",
    title: "Discover forks",
    tag: "GitHub",
    body: "Every 30 minutes the screener lists the forks of the Solari cookbook and checks each one's latest commit. New or changed forks are queued; forks that opted out are skipped.",
  },
  {
    n: "02",
    title: "Triage with Claude",
    tag: "Claude Sonnet",
    body: "Claude reads the diff against upstream, the README and the manifests, then returns the project's type, stack, the Solari products it uses, how to install and run it, and what the demo should show.",
  },
  {
    n: "03",
    title: "Build in a Sandbox",
    tag: "Solari Sandbox",
    body: "The fork is cloned into a fresh Solari Sandbox, installed and booted with a timeout. Every stage is timed and logged. Servers are exposed on a preview URL.",
  },
  {
    n: "04",
    title: "Demo in a Browser or Desktop",
    tag: "Solari Browser · Desktop",
    body: "A Claude computer-use agent opens the app in a Solari Browser, or a Solari Desktop for GUI projects, and walks through the main feature while the session is recorded.",
  },
  {
    n: "05",
    title: "Score",
    tag: "Claude Sonnet",
    body: "Claude scores five things from 1 to 5 (boots, works, uses Solari, use case, polish) from the logs, the demo and the code, and writes a two-paragraph summary.",
  },
];

const SAMPLES: CodeSample[] = [
  {
    value: "sandbox",
    label: "Sandbox",
    file: "pipeline/executors/solari.ts",
    code: `import { SolariClient } from "@solarisdk/sdk"

const solari = new SolariClient({ apiKey: process.env.SOLARI_API_KEY! })

// python3 + node + git, booted from a snapshot
const sandbox = await solari.sandboxes.create({
  template: "base", cpu: 2, memMb: 4096, diskGb: 10,
  envs: submissionEnv,                  // only SUBMISSION_* secrets
  idleTimeoutMs: 15 * 60_000,
  lifecycle: { onTimeout: "kill" },
})
try {
  await sandbox.connect()
  // No shell: argv goes in args. timeoutMs is ignored on this channel,
  // so every stage runs under an in-guest timeout.
  const install = await sandbox.commands.start("sh", {
    args: ["-c", "cd /tmp/screener/repo/app && exec timeout 600 sh -c 'npm ci'"],
  })
  install.onData((chunk) => log.install(chunk.data))
  const exitCode = await install.wait()

  const { url } = await sandbox.previewUrl(port)   // public preview URL
} finally {
  await sandbox.kill()   // kill() ends the VM; close() would leave it running
}`,
  },
  {
    value: "browser",
    label: "Browser",
    file: "pipeline/demo/surfaces.ts",
    code: `import { Solari } from "@solarisdk/browser"
import { chromium } from "playwright"

const solari = new Solari({ apiKey: process.env.SOLARI_API_KEY! })
const session = await solari.sessions.create({})
// CDP has no client-version gate, so plain Playwright can attach
const browser = await chromium.connectOverCDP(session.cdpEndpoint)
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: mediaDir, size: { width: 1280, height: 800 } },
  })
  const page = await context.newPage()
  await page.goto(previewUrl)

  // Claude drives: screenshot in, actions out, until it calls finish_demo
  const shot = await page.screenshot({ type: "png" })
  await page.mouse.click(x, y)
  await page.keyboard.type(text)
  await context.close()          // flushes demo.webm
} finally {
  await solari.sessions.releaseAndWait(session.id)
}`,
  },
  {
    value: "desktop",
    label: "Desktop",
    file: "pipeline/demo/surfaces.ts",
    code: `import { SolariClient } from "@solarisdk/sdk"

const solari = new SolariClient({ apiKey: process.env.SOLARI_API_KEY! })
const desktop = await solari.sandboxes.createDesktop({
  template: "default", resolution: "1280x800", record: true,
  envs: submissionEnv, lifecycle: { onTimeout: "kill" },
})
try {
  await desktop.connect()
  await desktop.record.start({ fps: 15 })

  const png = await desktop.screenshot({ format: "png" })
  await desktop.mouse.click(x, y)
  await desktop.keyboard.type(text)
  await desktop.keyboard.press("Return")

  const { path } = await desktop.record.stop()    // mp4 in the guest
  const mp4 = await desktop.files.read(path)
} finally {
  await desktop.kill()
}`,
  },
];

export default function HowPage() {
  return (
    <Container className="pb-24 pt-16 md:pt-24">
      <Label className="text-accent">How it works</Label>
      <h1 className="mt-4 max-w-[20ch] font-display text-[32px] font-medium leading-[1.2] tracking-[-0.03em] text-ink md:text-[44px]">
        From fork to scored demo in five steps
      </h1>
      <p className="mt-4 max-w-[60ch] text-base text-ink-muted">
        One Solari key covers the sandbox that builds each project and the browser or desktop that demos it. Claude
        Sonnet does the reading, the clicking and the judging.
      </p>

      {/* Diagram */}
      <figure className="mt-14" aria-label="Pipeline diagram">
        <ol className="grid grid-cols-1 gap-3 lg:grid-cols-5 lg:gap-0">
          {STEPS.map((s, i) => (
            <li key={s.n} className="relative flex lg:pr-6">
              <div className="flex w-full flex-col justify-between gap-6 rounded-card border border-line bg-surface p-4">
                <p className="font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
                  Step {s.n}
                </p>
                <div>
                  <p className="font-display text-lg font-medium leading-[1.2] tracking-[-0.01em] text-ink">{s.title}</p>
                  <p className="mt-2 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-accent">{s.tag}</p>
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute right-0 top-1/2 hidden h-px w-6 lg:block"
                  style={{ background: "linear-gradient(90deg, rgba(245,179,1,0.2), rgba(245,179,1,0.9))" }}
                />
              )}
            </li>
          ))}
        </ol>
        <figcaption className="mt-4 font-mono text-xs text-ink-muted">
          Runs every 30 minutes. Each stage writes to Postgres as it finishes, so the dashboard updates live.
        </figcaption>
      </figure>

      <Divider className="my-14 md:my-16" />

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <ol className="flex flex-col gap-8">
          {STEPS.map((s) => (
            <li key={s.n} className="grid grid-cols-[40px_1fr] gap-3">
              <span className="font-mono text-sm text-accent tabular-nums">{s.n}</span>
              <div>
                <h2 className="font-display text-xl font-medium leading-[1.2] tracking-[-0.01em] text-ink">{s.title}</h2>
                <p className="mt-2 max-w-[65ch] text-sm leading-normal text-ink-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="min-w-0">
          <Label className="mb-4 text-ink-muted">One client per product</Label>
          <CodeTabs samples={SAMPLES} />
        </div>
      </div>
    </Container>
  );
}
