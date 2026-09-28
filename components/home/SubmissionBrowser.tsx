"use client";

import { useMemo, useState } from "react";
import { topScoreThreshold } from "@/lib/metrics";
import type { Submission } from "@/lib/types";
import { Container } from "@/ui/Container";
import { Tabs } from "@/ui/Tabs";
import { cx } from "@/ui/cx";
import { SubmissionCard } from "./SubmissionCard";
import { DEFAULT_STATE, SORTS, TABS, type BrowserState, type Sort } from "./state";

function toQuery(s: BrowserState): string {
  const p = new URLSearchParams();
  if (s.tab !== "all") p.set("tab", s.tab);
  if (s.q) p.set("q", s.q);
  if (s.sort !== "newest") p.set("sort", s.sort);
  if (s.booted) p.set("booted", "1");
  const q = p.toString();
  return q ? `?${q}` : window.location.pathname;
}

function applyFilters(subs: Submission[], s: BrowserState): Submission[] {
  const q = s.q.trim().toLowerCase();
  const out = subs.filter((x) => {
    if (s.tab !== "all" && !x.productsUsed.includes(s.tab)) return false;
    if (s.booted && x.status !== "booted") return false;
    if (!q) return true;
    return [x.owner, x.title, x.description, ...x.stack.map((t) => t.name)].some((f) => f.toLowerCase().includes(q));
  });
  const byNewest = (a: Submission, b: Submission) => b.discoveredAt.localeCompare(a.discoveredAt);
  switch (s.sort) {
    case "score":
      return out.sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1) || byNewest(a, b));
    case "boot":
      return out.sort((a, b) => (a.bootMs ?? Infinity) - (b.bootMs ?? Infinity) || byNewest(a, b));
    case "fork":
      return out.sort((a, b) => a.forkNumber - b.forkNumber);
    default:
      return out.sort(byNewest);
  }
}

export function SubmissionBrowser({
  submissions,
  initial,
}: {
  submissions: Submission[];
  initial: BrowserState;
}) {
  const [state, setState] = useState(initial);
  const visible = useMemo(() => applyFilters(submissions, state), [submissions, state]);
  const threshold = useMemo(() => topScoreThreshold(submissions), [submissions]);

  // Owners present on first paint. Anything that arrives later (live scan) fades in.
  const [initialOwners] = useState(() => new Set(submissions.map((s) => s.owner)));

  function update(patch: Partial<BrowserState>) {
    const next = { ...state, ...patch };
    setState(next);
    window.history.replaceState(null, "", toQuery(next));
  }

  return (
    <Container className="pb-16 pt-10 md:pb-24">
      <h2 className="sr-only">Submissions</h2>
      <div className="flex flex-col gap-5 border-b border-line lg:flex-row lg:items-end lg:justify-between">
        <Tabs label="Filter by Solari product" items={TABS} value={state.tab} onChange={(tab) => update({ tab })} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pb-3">
          <label className="relative block w-full sm:w-64">
            <span className="sr-only">Search submissions</span>
            <input
              type="search"
              value={state.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Search..."
              className="h-9 w-full rounded-btn border border-line bg-surface px-3 text-sm text-ink placeholder:font-mono placeholder:text-[13px] placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
            Sort:
            <span className="relative">
              <select
                value={state.sort}
                onChange={(e) => update({ sort: e.target.value as Sort })}
                className="h-9 cursor-pointer appearance-none rounded-btn border border-transparent bg-transparent pl-1 pr-6 font-sans text-sm normal-case tracking-normal text-ink hover:border-line"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value} className="bg-surface">
                    {s.label}
                  </option>
                ))}
              </select>
              <span aria-hidden className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted">
                ▾
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-body">
            <input
              type="checkbox"
              checked={state.booted}
              onChange={(e) => update({ booted: e.target.checked })}
              className="size-4 cursor-pointer rounded-badge accent-[#F5B301]"
            />
            Only booted
          </label>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {visible.length} submission{visible.length === 1 ? "" : "s"} shown
      </p>

      {visible.length > 0 ? (
        <ul className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <li
              key={s.owner}
              className={cx("flex [&>article]:w-full", !initialOwners.has(s.owner) && "fade-in")}
            >
              <SubmissionCard s={s} top={threshold != null && s.score != null && s.score.total >= threshold} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-16 text-center text-ink-muted">
          No submissions match these filters.{" "}
          <button type="button" onClick={() => update(DEFAULT_STATE)} className="text-blue hover:underline">
            Clear filters
          </button>
        </p>
      )}
    </Container>
  );
}
