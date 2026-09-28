import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoPlayer } from "@/components/detail/DemoPlayer";
import { LogTabs } from "@/components/detail/LogTabs";
import { RunBreakdown } from "@/components/detail/RunBreakdown";
import { ScorePanel } from "@/components/detail/ScorePanel";
import { getSubmission } from "@/lib/data";
import { shortSha } from "@/lib/format";
import { PROJECT_TYPE_LABEL } from "@/lib/status";
import { Container } from "@/ui/Container";
import { Divider } from "@/ui/Divider";
import { Label } from "@/ui/Label";
import { LiveRefresh } from "@/ui/LiveRefresh";
import { MonoAnchor, monoLinkClass, monoQuietLinkClass } from "@/ui/MonoLink";
import { ProductBadge } from "@/ui/ProductBadge";
import { RelativeTime } from "@/ui/RelativeTime";
import { StackIcons } from "@/ui/StackIcons";
import { badgeProducts } from "@/lib/status";
import { StatusPill } from "@/ui/StatusPill";
import { cx } from "@/ui/cx";

export async function generateMetadata({ params }: PageProps<"/s/[owner]">): Promise<Metadata> {
  const { owner } = await params;
  const data = await getSubmission(decodeURIComponent(owner));
  if (!data) return { title: "Not found" };
  const { submission: s } = data;
  return { title: `${s.owner} / ${s.title}`, description: s.description };
}

export default async function SubmissionPage({ params, searchParams }: PageProps<"/s/[owner]">) {
  const [{ owner }, sp] = await Promise.all([params, searchParams]);
  const data = await getSubmission(decodeURIComponent(owner));
  if (!data) notFound();
  const { submission: s, run } = data;
  const active = run?.status === "running";
  const liveAvailable = active && !!run?.streamUrl;
  const paragraphs = (s.summary ?? "").split(/\n\s*\n/).filter(Boolean);

  return (
    <Container className="pb-24 pt-10 md:pt-12">
      <LiveRefresh owner={s.owner} />
      <Link href="/" className={monoQuietLinkClass}>
        ← All submissions
      </Link>

      <header className="mt-8 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="break-words font-display text-[28px] font-medium leading-[1.2] tracking-[-0.03em] text-ink md:text-4xl">
            {s.owner} <span className="text-ink-muted">/</span> {s.title}
          </h1>
          {s.description && <p className="mt-3 max-w-[70ch] text-base text-ink-muted">{s.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
            <StatusPill status={s.status} />
            {s.commitSha && (
              <span>
                Commit{" "}
                <a
                  href={`${s.repoUrl}/commit/${s.commitSha}`}
                  target="_blank"
                  rel="noreferrer"
                  className="normal-case text-ink-body underline decoration-line-strong underline-offset-4 hover:text-ink"
                >
                  {shortSha(s.commitSha)}
                </a>
              </span>
            )}
            <span>
              <RelativeTime iso={s.scannedAt} prefix="Scanned " />
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-5 md:pt-2">
          <MonoAnchor href={s.repoUrl}>View repo</MonoAnchor>
          {liveAvailable && (
            <Link href={`?live=1#demo`} className={cx(monoLinkClass, "flex items-center gap-1.5 text-run")}>
              <span aria-hidden className="live-pulse size-1.5 rounded-full bg-run" />
              Watch live
            </Link>
          )}
        </div>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <DemoPlayer submission={s} run={run} startLive={sp.live === "1"} />
        <div className="flex flex-col gap-4">
          <ScorePanel score={s.score} />
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 rounded-card border border-line p-4 text-sm">
            <dt className="font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">Type</dt>
            <dd className="text-ink-body">{PROJECT_TYPE_LABEL[s.projectType]}</dd>
            <dt className="font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">Stack</dt>
            <dd>
              {s.stack.length ? (
                <div className="flex items-center gap-3">
                  <StackIcons stack={s.stack} max={6} size={18} />
                  <span className="sr-only">{s.stack.map((t) => t.name).join(", ")}</span>
                </div>
              ) : (
                <span className="text-ink-muted">-</span>
              )}
            </dd>
            <dt className="font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">Products</dt>
            <dd className="flex flex-wrap gap-1.5">
              {badgeProducts(s).length ? (
                badgeProducts(s).map((p) => (
                  <ProductBadge key={p} product={p} used={s.demoProduct === p} />
                ))
              ) : (
                <span className="text-ink-muted">-</span>
              )}
            </dd>
            <dt className="font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">VMs</dt>
            <dd className="font-mono text-ink-body tabular-nums">{run?.vmCount ?? 0}</dd>
          </dl>
        </div>
      </div>

      <Divider className="my-14" />

      <section aria-labelledby="summary-title">
        <Label id="summary-title" className="text-accent">
          AI summary
        </Label>
        {paragraphs.length ? (
          <div className="mt-4 flex max-w-[72ch] flex-col gap-4 text-base leading-normal text-ink-body">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-ink-muted">No summary yet. It is written by the scoring step after a run finishes.</p>
        )}
      </section>

      <section aria-labelledby="breakdown-title" className="mt-14">
        <Label id="breakdown-title" className="text-ink-muted">
          Run breakdown
        </Label>
        <div className="mt-4">
          <RunBreakdown timings={run?.timings ?? []} />
        </div>
      </section>

      <section aria-labelledby="logs-title" className="mt-14">
        <Label id="logs-title" className="mb-4 text-ink-muted">
          Logs
        </Label>
        <LogTabs logs={run?.logs ?? { install: "", run: "", demo: "" }} />
      </section>
    </Container>
  );
}
