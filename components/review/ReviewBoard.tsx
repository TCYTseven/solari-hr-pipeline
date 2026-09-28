"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { topScoreThreshold } from "@/lib/metrics";
import { badgeProducts } from "@/lib/status";
import type { Submission } from "@/lib/types";
import { buttonClass } from "@/ui/Button";
import { LogBlock } from "@/ui/LogBlock";
import { PageHeader } from "@/ui/PageHeader";
import { ProductBadge } from "@/ui/ProductBadge";
import { ScoreBar } from "@/ui/ScoreBar";
import { StatusPill } from "@/ui/StatusPill";
import { VideoFrame } from "@/ui/VideoFrame";
import { cx } from "@/ui/cx";

type View = "split" | "table";

// Detail links carry the ranking, so previous / next there walk this same order.
const detailHref = (s: Submission) => `/s/${encodeURIComponent(s.owner)}?sort=score`;

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-badge border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-ink-body">{children}</kbd>;
}

function Preview({ s }: { s: Submission }) {
  const paragraphs = (s.summary ?? "").split(/\n\s*\n/).filter(Boolean);
  const products = badgeProducts(s);
  return (
    <article className="rounded-card border border-line bg-surface" aria-label={`Preview of ${s.owner} / ${s.title}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium text-ink">
            <span className="text-ink-muted">{s.owner} /</span> {s.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusPill status={s.status} />
            {s.bootMs != null && s.status === "booted" && (
              <span className="font-mono text-[11px] text-ink-muted">{formatDuration(s.bootMs)}</span>
            )}
            {products.map((p) => (
              <ProductBadge key={p} product={p} used={s.demoProduct === p} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={s.repoUrl} target="_blank" rel="noreferrer" className={buttonClass("ghost", undefined, "sm")}>
            Repo <span aria-hidden>↗</span>
          </a>
          <Link href={detailHref(s)} className={buttonClass("primary", undefined, "sm")}>
            Open <span aria-hidden>→</span>
          </Link>
        </div>
      </div>

      <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          {s.videoUrl || s.thumbnailUrl ? (
            <VideoFrame key={s.owner} src={s.videoUrl} poster={s.thumbnailUrl} captionsSrc={s.captionsUrl} title={`Demo of ${s.title}`} />
          ) : s.errorTail?.length ? (
            <LogBlock lines={s.errorTail} tone={s.status === "build_failed" ? "fail" : "default"} label="Last lines of the log" />
          ) : (
            <div className="grid aspect-video place-items-center rounded-card border border-line bg-teal-900 text-[13px] text-ink-muted">
              No demo yet
            </div>
          )}
          {paragraphs.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 text-sm leading-normal text-ink-body">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="flex items-baseline justify-between text-sm font-semibold text-ink">
            Score
            <span className="font-mono text-lg font-medium tabular-nums">
              {s.score ? s.score.total.toFixed(1) : "-"}
              <span className="text-sm text-ink-muted"> / 5</span>
            </span>
          </p>
          {s.score && (
            <div className="mt-3 flex flex-col gap-2.5">
              <ScoreBar label="Boots" value={s.score.boots} />
              <ScoreBar label="Works" value={s.score.works} />
              <ScoreBar label="Uses Solari" value={s.score.usesSolari} />
              <ScoreBar label="Use case" value={s.score.useCase} />
              <ScoreBar label="Polish" value={s.score.polish} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function ReviewBoard({ submissions, description }: { submissions: Submission[]; description: string }) {
  const router = useRouter();
  const [view, setView] = useState<View>("split");
  const [sel, setSel] = useState(0);
  const rows = useRef<Array<HTMLElement | null>>([]);
  // Only scroll after j/k. Scrolling on mount moves the browser's Tab
  // starting point past the skip link and nav.
  const moved = useRef(false);
  const threshold = topScoreThreshold(submissions);
  const selected = Math.min(sel, Math.max(0, submissions.length - 1));
  const current = submissions[selected];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "VIDEO"].includes(t.tagName))) return;
      const s = submissions[selected];
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        moved.current = true;
        setSel(Math.min(submissions.length - 1, selected + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        moved.current = true;
        setSel(Math.max(0, selected - 1));
      } else if (e.key === "Enter" && s && (!t || t === document.body || t.dataset.reviewRow != null)) {
        e.preventDefault();
        router.push(detailHref(s));
      } else if (e.key === "o" && s) {
        e.preventDefault();
        window.open(s.repoUrl, "_blank", "noopener,noreferrer");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submissions, selected, router]);

  useEffect(() => {
    if (moved.current) rows.current[selected]?.scrollIntoView({ block: "nearest" });
  }, [selected, view]);

  const toggle = (
    <div className="flex items-center gap-4">
      <p className="hidden items-center gap-1.5 text-xs text-ink-muted lg:flex">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd> move
        <span aria-hidden className="mx-1 text-ink-faint">
          ·
        </span>
        <Kbd>Enter</Kbd> open
        <span aria-hidden className="mx-1 text-ink-faint">
          ·
        </span>
        <Kbd>O</Kbd> repo
      </p>
      <div role="group" aria-label="Layout" className="inline-flex rounded-btn border border-line p-0.5">
        {(["split", "table"] as View[]).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={cx(
              "rounded-[4px] px-3 py-1 text-[13px]",
              view === v ? "bg-white/[0.08] text-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {v === "split" ? "Preview" : "Table"}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Review" description={description} aside={toggle} />
      <h2 className="sr-only">Ranked submissions</h2>
      <p className="sr-only" aria-live="polite">
        {current ? `Selected ${selected + 1} of ${submissions.length}: ${current.owner}, ${current.title}` : ""}
      </p>

      {submissions.length === 0 ? (
        <p className="mt-12 text-ink-muted">No submissions yet.</p>
      ) : view === "split" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-card border border-line bg-surface lg:sticky lg:top-[72px] lg:max-h-[calc(100dvh-96px)] lg:self-start lg:overflow-y-auto">
            <ol aria-label="Ranked submissions">
              {submissions.map((s, i) => {
                const isSel = i === selected;
                const top = threshold != null && s.score != null && s.score.total >= threshold;
                return (
                  <li
                    key={s.owner}
                    ref={(el) => {
                      rows.current[i] = el;
                    }}
                    className="border-b border-line last:border-b-0"
                  >
                    <button
                      type="button"
                      data-review-row
                      aria-current={isSel ? "true" : undefined}
                      onClick={() => setSel(i)}
                      onDoubleClick={() => router.push(detailHref(s))}
                      className={cx(
                        "grid w-full grid-cols-[28px_1fr_auto] items-center gap-3 px-3 py-3 text-left transition-colors duration-150",
                        isSel ? "bg-teal-800 shadow-[inset_2px_0_0_var(--accent)]" : "hover:bg-white/[0.03]",
                      )}
                    >
                      <span className="text-right font-mono text-xs text-ink-muted tabular-nums">{i + 1}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">{s.owner}</span>
                        <span className="block truncate text-[13px] text-ink-muted">{s.title}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className={cx("font-mono text-sm tabular-nums", top ? "text-accent" : "text-ink")}>
                          {s.score ? s.score.total.toFixed(1) : "-"}
                        </span>
                        <StatusPill status={s.status} className="text-[10px]" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="min-w-0 lg:sticky lg:top-[72px] lg:self-start">{current && <Preview s={current} />}</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                {["#", "Owner", "Project", "Products", "Booted", "Score", "Demo"].map((h) => (
                  <th key={h} scope="col" className={cx("px-4 py-3 font-medium", (h === "Score" || h === "#") && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map((s, i) => {
                const isSel = i === selected;
                const top = threshold != null && s.score != null && s.score.total >= threshold;
                return (
                  <tr
                    key={s.owner}
                    ref={(el) => {
                      rows.current[i] = el;
                    }}
                    data-review-row
                    aria-selected={isSel}
                    onClick={() => setSel(i)}
                    onDoubleClick={() => router.push(detailHref(s))}
                    className={cx(
                      "cursor-default border-b border-line transition-colors duration-150 last:border-b-0",
                      isSel ? "bg-teal-800 shadow-[inset_2px_0_0_var(--accent)]" : "hover:bg-white/[0.02]",
                    )}
                  >
                    <td className="px-4 py-3 text-right font-mono text-ink-muted tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-ink">{s.owner}</td>
                    <td className="max-w-[280px] px-4 py-3">
                      <Link href={detailHref(s)} className="text-ink-body hover:text-ink hover:underline">
                        {s.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {badgeProducts(s).map((p) => (
                          <ProductBadge key={p} product={p} used={s.demoProduct === p} />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.status === "booted" ? (
                        <span className="font-mono text-[13px] text-ok">{s.bootMs != null ? formatDuration(s.bootMs) : "Yes"}</span>
                      ) : (
                        <StatusPill status={s.status} />
                      )}
                    </td>
                    <td className={cx("px-4 py-3 text-right font-mono tabular-nums", top ? "text-accent" : "text-ink")}>
                      {s.score ? s.score.total.toFixed(1) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {s.videoUrl || s.thumbnailUrl ? (
                        <Link href={`${detailHref(s)}#demo`} className="text-[13px] text-blue hover:underline">
                          Watch
                        </Link>
                      ) : (
                        <span className="text-ink-muted">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
