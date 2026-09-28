"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { topScoreThreshold } from "@/lib/metrics";
import { PRODUCTS, type Submission } from "@/lib/types";
import { SubmissionCard } from "@/components/home/SubmissionCard";
import { ProductBadge } from "@/ui/ProductBadge";
import { StatusPill } from "@/ui/StatusPill";
import { Tabs } from "@/ui/Tabs";
import { cx } from "@/ui/cx";

type View = "grid" | "table";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-badge border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-ink-body">{children}</kbd>
  );
}

export function ReviewBoard({ submissions }: { submissions: Submission[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>("table");
  const [sel, setSel] = useState(0);
  const rows = useRef<Array<HTMLElement | null>>([]);
  // Only scroll after j/k. Scrolling on mount moves the browser's Tab
  // starting point past the skip link and nav.
  const moved = useRef(false);
  const threshold = topScoreThreshold(submissions);
  const selected = Math.min(sel, Math.max(0, submissions.length - 1));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const s = submissions[selected];
      if (e.key === "j") {
        e.preventDefault();
        moved.current = true;
        setSel(Math.min(submissions.length - 1, selected + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        moved.current = true;
        setSel(Math.max(0, selected - 1));
      } else if (e.key === "Enter" && s && (!t || t === document.body || t.dataset.reviewRow != null)) {
        e.preventDefault();
        router.push(`/s/${encodeURIComponent(s.owner)}`);
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

  const current = submissions[selected];

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-line md:flex-row md:items-end md:justify-between">
        <Tabs
          label="Layout"
          value={view}
          onChange={setView}
          idPrefix="review-view"
          panelId="review-board"
          items={[
            { value: "table", label: "Table" },
            { value: "grid", label: "Grid" },
          ]}
        />
        <p className="flex flex-wrap items-center gap-2 pb-3 font-mono text-xs uppercase tracking-[0.04em] text-ink-muted">
          <Kbd>J</Kbd>/<Kbd>K</Kbd> move{" "}
          <span aria-hidden className="mx-1 text-ink-faint">
            ·
          </span>{" "}
          <Kbd>Enter</Kbd> open{" "}
          <span aria-hidden className="mx-1 text-ink-faint">
            ·
          </span>{" "}
          <Kbd>O</Kbd> repo
        </p>
      </div>

      <h2 className="sr-only">Ranked submissions</h2>
      <p className="sr-only" aria-live="polite">
        {current ? `Selected ${selected + 1} of ${submissions.length}: ${current.owner}, ${current.title}` : ""}
      </p>

      <div id="review-board" role="tabpanel" aria-labelledby={`review-view-tab-${view}`}>
      {submissions.length === 0 ? (
        <p className="mt-12 text-ink-muted">No submissions yet.</p>
      ) : view === "table" ? (
        <div className="mt-6 overflow-x-auto rounded-card border border-line">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-[0.04em] text-ink-muted">
                {["#", "Owner", "Project", "Products", "Booted", "Score", "Demo"].map((h) => (
                  <th key={h} scope="col" className={cx("px-4 py-3 font-semibold", (h === "Score" || h === "#") && "text-right")}>
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
                    onDoubleClick={() => router.push(`/s/${encodeURIComponent(s.owner)}`)}
                    className={cx(
                      "cursor-default border-b border-line transition-colors duration-150 last:border-b-0",
                      isSel ? "bg-teal-800 shadow-[inset_2px_0_0_var(--accent)]" : "hover:bg-white/[0.02]",
                    )}
                  >
                    <td className="px-4 py-3 text-right font-mono text-ink-muted tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-ink">{s.owner}</td>
                    <td className="max-w-[280px] px-4 py-3">
                      <Link href={`/s/${encodeURIComponent(s.owner)}`} className="text-ink-body hover:text-ink hover:underline">
                        {s.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {PRODUCTS.filter((p) => s.productsUsed.includes(p)).map((p) => (
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
                        <Link
                          href={`/s/${encodeURIComponent(s.owner)}#demo`}
                          className="font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink underline underline-offset-4 hover:text-accent-soft"
                        >
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
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {submissions.map((s, i) => (
            <li
              key={s.owner}
              ref={(el) => {
                rows.current[i] = el;
              }}
              onClick={() => setSel(i)}
              className="flex [&>article]:w-full"
            >
              <SubmissionCard
                s={s}
                top={threshold != null && s.score != null && s.score.total >= threshold}
                selected={i === selected}
              />
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
