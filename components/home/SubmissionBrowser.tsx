"use client";

import { useMemo, useRef, useState } from "react";
import {
  DEFAULT_BROWSE,
  PRODUCT_FILTERS,
  SORTS,
  STATUS_FILTERS,
  applyBrowse,
  browseQuery,
  productCounts,
  statusCounts,
  type BrowseState,
  type Sort,
} from "@/lib/browse";
import { topScoreThreshold } from "@/lib/metrics";
import type { Submission } from "@/lib/types";
import { cx } from "@/ui/cx";
import { SubmissionCard } from "./SubmissionCard";

function FilterGroup<T extends string>({
  label,
  options,
  value,
  counts,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  counts: Record<T, number>;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-medium text-ink-muted">{label}</legend>
      <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <li key={o.value} className="shrink-0">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(o.value)}
                className={cx(
                  "flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-btn border px-2.5 py-1.5 text-left text-[13px] transition-colors duration-150 lg:border-transparent",
                  active
                    ? "border-line-strong bg-white/[0.07] text-ink"
                    : "border-line text-ink-muted hover:bg-white/[0.04] hover:text-ink",
                )}
              >
                {o.label}
                <span className="font-mono text-[11px] tabular-nums text-ink-muted">{counts[o.value]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

export function SubmissionBrowser({ submissions, initial }: { submissions: Submission[]; initial: BrowseState }) {
  const [state, setState] = useState(initial);
  const search = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => applyBrowse(submissions, state), [submissions, state]);
  const sCounts = useMemo(() => statusCounts(submissions, state), [submissions, state]);
  const pCounts = useMemo(() => productCounts(submissions, state), [submissions, state]);
  const threshold = useMemo(() => topScoreThreshold(submissions), [submissions]);
  const query = browseQuery(state);

  // Owners present on first paint. Anything that arrives later (live scan) fades in.
  const [initialOwners] = useState(() => new Set(submissions.map((s) => s.owner)));

  function update(patch: Partial<BrowseState>) {
    const next = { ...state, ...patch };
    setState(next);
    window.history.replaceState(null, "", browseQuery(next) || window.location.pathname);
  }

  const filtered = state.status !== "all" || state.product !== "all" || state.q !== "";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
      <aside aria-label="Filters" className="flex flex-col gap-4 lg:sticky lg:top-[72px] lg:gap-6 lg:self-start">
        <FilterGroup
          label="Status"
          options={STATUS_FILTERS}
          value={state.status}
          counts={sCounts}
          onChange={(status) => update({ status })}
        />
        <FilterGroup
          label="Solari product"
          options={PRODUCT_FILTERS}
          value={state.product}
          counts={pCounts}
          onChange={(product) => update({ product })}
        />
      </aside>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Search submissions</span>
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted"
            >
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={search}
              type="search"
              value={state.q}
              onChange={(e) => update({ q: e.target.value })}
              placeholder="Search by name, project or stack"
              className="h-9 w-full rounded-btn border border-line bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            Sort
            <select
              value={state.sort}
              onChange={(e) => update({ sort: e.target.value as Sort })}
              className="h-9 cursor-pointer rounded-btn border border-line bg-surface px-2.5 text-sm text-ink focus:border-line-strong"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mt-3 text-[13px] text-ink-muted" aria-live="polite">
          {visible.length} of {submissions.length} submission{submissions.length === 1 ? "" : "s"}
          {filtered && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => {
                  update(DEFAULT_BROWSE);
                  search.current?.focus();
                }}
                className="text-blue hover:underline"
              >
                Clear filters
              </button>
            </>
          )}
        </p>

        <div id="submission-results">
          {visible.length > 0 ? (
            <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((s) => (
                <li key={s.owner} className={cx("flex [&>article]:w-full", !initialOwners.has(s.owner) && "fade-in")}>
                  <SubmissionCard
                    s={s}
                    href={`/s/${encodeURIComponent(s.owner)}${query}`}
                    top={threshold != null && s.score != null && s.score.total >= threshold}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-card border border-dashed border-line-strong px-6 py-16 text-center">
              <p className="text-ink">No submissions match these filters.</p>
              <button
                type="button"
                onClick={() => {
                  update(DEFAULT_BROWSE);
                  search.current?.focus();
                }}
                className="mt-2 text-sm text-blue hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
