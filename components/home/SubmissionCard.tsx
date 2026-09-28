"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { formatDuration, padFork } from "@/lib/format";
import type { Submission } from "@/lib/types";
import { Divider } from "@/ui/Divider";
import { LogBlock } from "@/ui/LogBlock";
import { ProductBadge } from "@/ui/ProductBadge";
import { StackIcons } from "@/ui/StackIcons";
import { badgeProducts } from "@/lib/status";
import { StatusPill } from "@/ui/StatusPill";
import { cx } from "@/ui/cx";

function footerText(s: Submission): string {
  switch (s.status) {
    case "booted":
      return s.bootMs != null ? `Booted in ${formatDuration(s.bootMs)}` : "Booted";
    case "running":
      return "Screening now";
    case "build_failed":
      return "Build failed";
    case "timeout":
      return "Timed out";
    case "needs_secrets":
      return "Needs secrets";
    case "skipped":
      return "Nothing to run";
    case "queued":
      return "Queued";
    case "opted_out":
      return "Opted out";
  }
}

function Media({ s, hovering }: { s: Submission; hovering: boolean }) {
  if (s.thumbnailUrl) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-btn border border-line bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.thumbnailUrl} alt={`Demo of ${s.title}`} loading="lazy" className="size-full object-cover" />
        {hovering && s.previewUrl && (
          <video
            src={s.previewUrl}
            className="absolute inset-0 size-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
          />
        )}
      </div>
    );
  }
  if (s.errorTail?.length) {
    return (
      <LogBlock
        lines={s.errorTail.slice(-4)}
        tone={s.status === "build_failed" ? "fail" : "default"}
        label={`Last lines of the ${s.status === "build_failed" ? "error" : "run"} log`}
        variant="card"
        className="aspect-video"
      />
    );
  }
  return (
    <div className="grid aspect-video place-items-center rounded-btn border border-line bg-teal-900 font-mono text-xs uppercase tracking-[0.04em] text-ink-muted">
      {s.status === "queued" ? "Waiting for a sandbox" : s.status === "running" ? "Booting" : "No demo"}
    </div>
  );
}

export function SubmissionCard({ s, top, selected = false }: { s: Submission; top: boolean; selected?: boolean }) {
  const [hovering, setHovering] = useState(false);
  const reduced = useRef<boolean | null>(null);

  function onEnter() {
    if (reduced.current == null) reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced.current) setHovering(true);
  }

  return (
    <article
      onPointerEnter={onEnter}
      onPointerLeave={() => setHovering(false)}
      className={cx(
        "group relative flex flex-col rounded-card border p-4 transition-colors duration-150",
        "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent",
        selected
          ? "border-accent bg-teal-800"
          : "border-line bg-surface hover:border-line-strong hover:bg-teal-800",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
          Fork {padFork(s.forkNumber)}
        </span>
        <StatusPill status={s.status} />
      </div>

      <div className="mt-4">
        <Media s={s} hovering={hovering} />
      </div>

      <h3 className="mt-4 font-display text-lg font-medium leading-[1.2] tracking-[-0.01em] text-ink">
        <Link
          href={`/s/${encodeURIComponent(s.owner)}`}
          className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none"
        >
          {s.owner} <span className="text-ink-muted">/</span> {s.title}
        </Link>
      </h3>
      <p className="mt-1.5 line-clamp-2 min-h-[2lh] text-sm text-ink-muted">{s.description}</p>

      <div className="mt-4 flex min-h-5 items-center justify-between gap-3">
        <StackIcons stack={s.stack} max={4} />
        <div className="flex flex-wrap justify-end gap-1.5">
          {badgeProducts(s).map((p) => (
            <ProductBadge key={p} product={p} used={s.demoProduct === p} />
          ))}
        </div>
      </div>

      <Divider variant="line" className="mb-3 mt-4" />

      <div className="mt-auto flex items-center justify-between font-mono text-[13px] tabular-nums">
        <span className="text-ink-body">{footerText(s)}</span>
        {s.score ? (
          <span className={top ? "text-accent" : "text-ink"} title={top ? "Top 10% score" : undefined}>
            {s.score.total.toFixed(1)} / 5
            {top && <span className="sr-only"> (top 10%)</span>}
          </span>
        ) : (
          <span className="text-ink-muted">-</span>
        )}
      </div>
    </article>
  );
}
