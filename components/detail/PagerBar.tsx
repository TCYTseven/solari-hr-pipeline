"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { cx } from "@/ui/cx";

interface Target {
  href: string;
  label: string;
}

const pagerLink =
  "inline-flex h-8 items-center gap-1.5 rounded-btn border border-line px-2.5 text-[13px] text-ink-body transition-colors duration-150 hover:border-line-strong hover:text-ink";

/**
 * Sticky bar under the nav: back to the list you came from on the left,
 * previous / next through that same list on the right (also ← and →).
 */
export function PagerBar({
  back,
  prev,
  next,
  position,
}: {
  back: string;
  prev: Target | null;
  next: Target | null;
  position: { index: number; total: number } | null;
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "VIDEO"].includes(t.tagName))) return;
      if (t?.getAttribute("role") === "tab") return; // arrows move between tabs there
      if (e.key === "ArrowLeft" && prev) router.push(prev.href);
      else if (e.key === "ArrowRight" && next) router.push(next.href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  return (
    <div
      className="sticky top-14 z-30 border-b border-line"
      style={{ background: "var(--glass)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
    >
      <nav
        aria-label="Submission navigation"
        className="mx-auto flex h-12 w-full max-w-content items-center justify-between gap-4 px-4 md:px-8"
      >
        <Link href={back} className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted transition-colors duration-150 hover:text-ink">
          <span aria-hidden>←</span> Submissions
        </Link>
        <div className="flex items-center gap-2">
          {position && position.index >= 0 && (
            <span className="hidden font-mono text-xs text-ink-muted tabular-nums sm:inline">
              {position.index + 1} of {position.total}
            </span>
          )}
          {prev ? (
            <Link href={prev.href} className={pagerLink} title={`Previous: ${prev.label} (←)`} rel="prev">
              <span aria-hidden>‹</span> Previous
            </Link>
          ) : (
            <span className={cx(pagerLink, "pointer-events-none opacity-40")} aria-disabled>
              <span aria-hidden>‹</span> Previous
            </span>
          )}
          {next ? (
            <Link href={next.href} className={pagerLink} title={`Next: ${next.label} (→)`} rel="next">
              Next <span aria-hidden>›</span>
            </Link>
          ) : (
            <span className={cx(pagerLink, "pointer-events-none opacity-40")} aria-disabled>
              Next <span aria-hidden>›</span>
            </span>
          )}
        </div>
      </nav>
    </div>
  );
}
