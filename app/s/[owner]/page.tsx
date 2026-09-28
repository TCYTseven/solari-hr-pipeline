import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PagerBar } from "@/components/detail/PagerBar";
import { RunBreakdown } from "@/components/detail/RunBreakdown";
import { LogTabs } from "@/components/detail/LogTabs";
import { ScorePanel } from "@/components/detail/ScorePanel";
import { DEFAULT_VIEW, VIEWS, type View } from "@/components/detail/views";
import { Workspace } from "@/components/detail/Workspace";
import { browseQuery, neighbours, parseBrowse } from "@/lib/browse";
import { getSubmission, listSubmissions } from "@/lib/data";
import { formatStage, padFork, shortSha } from "@/lib/format";
import { PROJECT_TYPE_LABEL, badgeProducts } from "@/lib/status";
import { STAGES } from "@/lib/types";
import { buttonClass } from "@/ui/Button";
import { Container } from "@/ui/Container";
import { LiveRefresh } from "@/ui/LiveRefresh";
import { Panel } from "@/ui/Panel";
import { ProductBadge } from "@/ui/ProductBadge";
import { RelativeTime } from "@/ui/RelativeTime";
import { StackIcons } from "@/ui/StackIcons";
import { StatusPill } from "@/ui/StatusPill";

export async function generateMetadata({ params }: PageProps<"/s/[owner]">): Promise<Metadata> {
  const { owner } = await params;
  const data = await getSubmission(decodeURIComponent(owner));
  if (!data) return { title: "Not found" };
  const { submission: s } = data;
  return { title: `${s.owner} / ${s.title}`, description: s.description };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-[13px] text-ink-body">{children}</dd>
    </>
  );
}

export default async function SubmissionPage({ params, searchParams }: PageProps<"/s/[owner]">) {
  const [{ owner }, sp] = await Promise.all([params, searchParams]);
  const [data, all] = await Promise.all([getSubmission(decodeURIComponent(owner)), listSubmissions()]);
  if (!data) notFound();
  const { submission: s, run } = data;

  // Previous / next walk the same filtered, sorted list the visitor came from.
  const browse = parseBrowse(sp);
  const query = browseQuery(browse);
  const nav = neighbours(all, browse, s.owner);
  const link = (o: string) => `/s/${encodeURIComponent(o)}${query}`;

  const requested = (Array.isArray(sp.view) ? sp.view[0] : sp.view) as View | undefined;
  const initialView = requested && VIEWS.includes(requested) ? requested : DEFAULT_VIEW;
  const liveAvailable = run?.status === "running" && !!run?.streamUrl;
  const paragraphs = (s.summary ?? "").split(/\n\s*\n/).filter(Boolean);
  const products = badgeProducts(s);
  const runTotal = run?.timings.reduce((sum, t) => sum + STAGES.reduce((a, st) => a + (t[st] ?? 0), 0), 0) ?? 0;

  return (
    <>
      <LiveRefresh owner={s.owner} />
      <PagerBar
        back={`/${query}`}
        prev={nav.prev ? { href: link(nav.prev.owner), label: `${nav.prev.owner} / ${nav.prev.title}` } : null}
        next={nav.next ? { href: link(nav.next.owner), label: `${nav.next.owner} / ${nav.next.title}` } : null}
        position={nav.index >= 0 ? { index: nav.index, total: nav.total } : null}
      />
      <Container>

      <header className="flex flex-col gap-4 pb-6 pt-6 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="break-words font-display text-2xl font-medium leading-tight tracking-[-0.02em] text-ink md:text-[28px]">
              <span className="text-ink-muted">{s.owner} /</span> {s.title}
            </h1>
            <StatusPill status={s.status} />
          </div>
          {s.description && <p className="mt-2 max-w-[70ch] text-[15px] text-ink-muted">{s.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {liveAvailable && (
            <Link href="?live=1#demo" className={buttonClass("ghost", "gap-2", "sm")}>
              <span aria-hidden className="live-pulse size-1.5 rounded-full bg-run" />
              Watch live
            </Link>
          )}
          <a href={s.repoUrl} target="_blank" rel="noreferrer" className={buttonClass("ghost", undefined, "sm")}>
            View repo <span aria-hidden>↗</span>
          </a>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Workspace
          submission={s}
          run={run}
          startLive={sp.live === "1"}
          initialView={initialView}
          summary={
            paragraphs.length ? (
              <div className="flex max-w-[72ch] flex-col gap-3 text-[15px] leading-normal text-ink-body">
                {paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">The summary is written when scoring finishes.</p>
            )
          }
          timing={
            <div className="flex flex-col gap-3">
              <RunBreakdown timings={run?.timings ?? []} />
              {run && run.timings.length > 0 && (
                <p className="text-[13px] text-ink-muted">
                  {formatStage(runTotal)} end to end across {run.vmCount} Solari VM{run.vmCount === 1 ? "" : "s"}.
                </p>
              )}
            </div>
          }
          logs={<LogTabs logs={run?.logs ?? { install: "", run: "", demo: "" }} />}
        />

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[120px] lg:self-start">
          <ScorePanel score={s.score} />
          <Panel title="About">
            <dl className="grid grid-cols-[88px_1fr] items-center gap-x-3 gap-y-2.5">
              <Fact label="Type">{PROJECT_TYPE_LABEL[s.projectType]}</Fact>
              <Fact label="Stack">
                {s.stack.length ? (
                  <span className="flex items-center gap-2.5">
                    <StackIcons stack={s.stack} max={6} size={16} />
                    <span className="sr-only">{s.stack.map((t) => t.name).join(", ")}</span>
                  </span>
                ) : (
                  "-"
                )}
              </Fact>
              <Fact label="Products">
                {products.length ? (
                  <span className="flex flex-wrap gap-1">
                    {products.map((p) => (
                      <ProductBadge key={p} product={p} used={s.demoProduct === p} />
                    ))}
                  </span>
                ) : (
                  "-"
                )}
              </Fact>
              <Fact label="Fork">#{padFork(s.forkNumber)}</Fact>
              <Fact label="Commit">
                {s.commitSha ? (
                  <a
                    href={`${s.repoUrl}/commit/${s.commitSha}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-ink-body underline decoration-line-strong underline-offset-4 hover:text-ink"
                  >
                    {shortSha(s.commitSha)}
                  </a>
                ) : (
                  "-"
                )}
              </Fact>
              <Fact label="Scanned">
                <RelativeTime iso={s.scannedAt} />
              </Fact>
            </dl>
          </Panel>
        </aside>
      </div>
      </Container>
    </>
  );
}
