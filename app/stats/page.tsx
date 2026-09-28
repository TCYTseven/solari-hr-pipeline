import type { Metadata } from "next";
import { BarChart } from "@/components/stats/BarChart";
import { getStats } from "@/lib/data";
import { formatDuration, formatNumber, formatStage } from "@/lib/format";
import type { SdkIssue } from "@/lib/types";
import { Container } from "@/ui/Container";
import { LiveRefresh } from "@/ui/LiveRefresh";
import { PageHeader } from "@/ui/PageHeader";
import { Panel } from "@/ui/Panel";

export const metadata: Metadata = {
  title: "Stats",
  description: "Boot times, product usage, build failures and SDK issues across every screened submission.",
};

const ISSUE_STATE: Record<SdkIssue["state"], { label: string; color: string; text: string }> = {
  open: { label: "Open", color: "var(--ok)", text: "var(--ok)" },
  merged: { label: "Merged", color: "var(--syn-keyword)", text: "var(--syn-keyword)" },
  closed: { label: "Closed", color: "var(--skip)", text: "var(--text-muted)" },
};

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3.5">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-medium text-ink tabular-nums">{children}</dd>
    </div>
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
  const mostUsed = usageRows.some((r) => r.value > 0) ? usageRows.reduce((a, b) => (a.value >= b.value ? a : b)).key : null;

  const totalFailures = stats.failures.reduce((a, f) => a + f.count, 0);
  const hint = (t: string) => <span className="text-xs text-ink-muted">{t}</span>;

  return (
    <Container>
      <LiveRefresh minIntervalMs={5000} />
      <PageHeader
        title="Stats"
        description={`${formatNumber(stats.screened)} submissions screened so far: how they booted, which Solari products they use, and what broke.`}
      />

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="VMs launched">{formatNumber(stats.vmsLaunched)}</Tile>
        <Tile label="VM-minutes">{formatNumber(stats.vmMinutes)}</Tile>
        <Tile label="Sandbox create, p50 / p95">
          {formatStage(stats.sandboxCreateP50Ms)}
          <span className="text-ink-muted"> / </span>
          {formatStage(stats.sandboxCreateP95Ms)}
        </Tile>
        <Tile label="Failure rate">{stats.failureRate == null ? "-" : `${Math.round(stats.failureRate * 100)}%`}</Tile>
      </dl>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel id="boot" title="Median boot time by project type" actions={hint("fastest in amber")}>
          <BarChart
            rows={bootRows}
            highlight={fastest}
            tickFormat={(v) => `${Math.round(v)}s`}
            caption="Median boot time by project type"
            valueHeader="Median boot time"
          />
        </Panel>
        <Panel id="usage" title="Solari products used" actions={hint("most common in amber")}>
          <BarChart
            rows={usageRows}
            highlight={mostUsed}
            tickFormat={(v) => formatNumber(Math.round(v))}
            caption="Solari products used by submissions"
            valueHeader="Submissions"
          />
        </Panel>

        <Panel id="failures" title="Most common build failures" bodyClassName="p-0">
          {stats.failures.length ? (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th scope="col" className="px-4 py-2.5 font-medium">Failure</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Count</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {stats.failures.map((f) => (
                  <tr key={f.reason} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal text-ink-body">
                      {f.reason}
                    </th>
                    <td className="px-4 py-3 text-right font-mono text-ink tabular-nums">{f.count}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink-muted tabular-nums">
                      {Math.round((f.count / totalFailures) * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-sm text-ink-muted">No failed builds yet.</p>
          )}
        </Panel>

        <Panel id="issues" title="Issues found in the SDK" bodyClassName="p-0">
          {stats.issues.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {stats.issues.map((i) => (
                <li key={i.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 shrink-0 rounded-badge border border-line px-1.5 py-0.5 font-mono text-[11px] leading-4 text-ink-muted">
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
            <p className="p-4 text-sm text-ink-muted">
              None recorded yet. Add one with <code className="font-mono text-xs">npm run sdk-issue</code>.
            </p>
          )}
        </Panel>
      </div>
    </Container>
  );
}
