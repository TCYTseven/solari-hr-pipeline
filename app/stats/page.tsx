import type { Metadata } from "next";
import { BarChart } from "@/components/stats/BarChart";
import { getStats } from "@/lib/data";
import { formatDuration, formatNumber, formatStage } from "@/lib/format";
import type { SdkIssue } from "@/lib/types";
import { Container } from "@/ui/Container";
import { Divider } from "@/ui/Divider";
import { Label } from "@/ui/Label";
import { LiveRefresh } from "@/ui/LiveRefresh";
import { Metric } from "@/ui/Metric";

export const metadata: Metadata = {
  title: "Stats",
  description: "Boot times, product usage, build failures and SDK issues across every screened submission.",
};

const ISSUE_STATE: Record<SdkIssue["state"], { label: string; color: string; text: string }> = {
  open: { label: "Open", color: "var(--ok)", text: "var(--ok)" },
  merged: { label: "Merged", color: "var(--syn-keyword)", text: "var(--syn-keyword)" },
  closed: { label: "Closed", color: "var(--skip)", text: "var(--text-muted)" },
};

function Section({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h2 id={id} className="font-display text-xl font-medium leading-[1.2] tracking-[-0.01em] text-ink md:text-2xl">
        {title}
      </h2>
      <p className="mt-1.5 text-sm text-ink-muted">{sub}</p>
      <div className="mt-8">{children}</div>
    </section>
  );
}

export default async function StatsPage() {
  const stats = await getStats();

  const bootRows = stats.bootByType.map((b) => ({
    key: b.type,
    label: b.label,
    value: b.medianMs == null ? null : b.medianMs / 1000,
    display: formatDuration(b.medianMs),
    detail: `${b.count} booted`,
  }));
  const withBoot = bootRows.filter((r) => r.value != null);
  const fastest = withBoot.length ? withBoot.reduce((a, b) => ((a.value ?? 0) <= (b.value ?? 0) ? a : b)).key : null;

  const usageRows = stats.productUsage.map((u) => ({
    key: u.key,
    label: u.label,
    value: u.count,
    display: formatNumber(u.count),
    detail: `${u.count} submission${u.count === 1 ? "" : "s"}`,
  }));
  const mostUsed = usageRows.some((r) => r.value > 0)
    ? usageRows.reduce((a, b) => (a.value >= b.value ? a : b)).key
    : null;

  const totalFailures = stats.failures.reduce((a, f) => a + f.count, 0);

  return (
    <Container className="pb-24 pt-16 md:pt-24">
      <LiveRefresh minIntervalMs={5000} />
      <Label className="text-accent">Stats</Label>
      <h1 className="mt-4 font-display text-[32px] font-medium leading-[1.2] tracking-[-0.03em] text-ink md:text-[44px]">
        Screening at scale
      </h1>
      <p className="mt-3 max-w-[60ch] text-base text-ink-muted">
        How {formatNumber(stats.screened)} screened submissions booted, which Solari products they reach for, and what
        broke along the way.
      </p>

      <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
        <Metric value={formatNumber(stats.vmsLaunched)} label="VMs launched" />
        <Metric value={formatNumber(stats.vmMinutes)} label="VM-minutes" />
        <Metric
          value={
            <>
              {formatStage(stats.sandboxCreateP50Ms)}
              <span className="text-ink-muted"> / </span>
              {formatStage(stats.sandboxCreateP95Ms)}
            </>
          }
          label="Sandbox create p50 / p95"
        />
        <Metric
          value={stats.failureRate == null ? "-" : `${Math.round(stats.failureRate * 100)}%`}
          label="Failure rate"
        />
      </dl>

      <Divider className="my-14 md:my-16" />

      <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-12">
        <Section id="boot-title" title="Median boot time by project type" sub="Create, clone, install and boot, for runs that booted. Fastest in amber.">
          <BarChart
            rows={bootRows}
            highlight={fastest}
            tickFormat={(v) => `${Math.round(v)}s`}
            caption="Median boot time by project type"
            valueHeader="Median boot time"
          />
        </Section>
        <Section id="usage-title" title="Which Solari products submissions use" sub="Detected from each project's code. Most common in amber.">
          <BarChart
            rows={usageRows}
            highlight={mostUsed}
            tickFormat={(v) => formatNumber(Math.round(v))}
            caption="Solari products used by submissions"
            valueHeader="Submissions"
          />
        </Section>
      </div>

      <Divider className="my-14 md:my-16" />

      <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-12">
        <Section id="failures-title" title="Most common build failures" sub="The failure category of each submission that did not boot.">
          {stats.failures.length ? (
            <div className="overflow-x-auto rounded-card border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-[0.04em] text-ink-muted">
                    <th scope="col" className="px-4 py-3 font-semibold">Failure</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Count</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.failures.map((f) => (
                    <tr key={f.reason} className="border-b border-line last:border-b-0">
                      <th scope="row" className="px-4 py-3 text-left font-medium text-ink-body">
                        {f.reason}
                      </th>
                      <td className="px-4 py-3 text-right font-mono text-ink tabular-nums">{f.count}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-body tabular-nums">
                        {Math.round((f.count / totalFailures) * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">No failed builds yet.</p>
          )}
        </Section>

        <Section id="issues-title" title="Issues found in the SDK" sub="Issues and pull requests opened against the Solari SDK while screening.">
          {stats.issues.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
              {stats.issues.map((i) => (
                <li key={i.id} className="flex items-start gap-3 px-4 py-3.5">
                  <span className="mt-0.5 shrink-0 rounded-badge border border-line px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-ink-muted">
                    {i.kind === "pr" ? "PR" : "Issue"}
                  </span>
                  <a href={i.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-sm text-ink-body hover:text-ink hover:underline">
                    {i.title}
                  </a>
                  <span
                    className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-semibold uppercase leading-4 tracking-[0.04em]"
                    style={{ color: ISSUE_STATE[i.state].text }}
                  >
                    <span aria-hidden className="size-1.5 rounded-full" style={{ background: ISSUE_STATE[i.state].color }} />
                    {ISSUE_STATE[i.state].label}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">None opened yet.</p>
          )}
        </Section>
      </div>
    </Container>
  );
}
