"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { formatDuration } from "@/lib/format";
import { badgeProducts } from "@/lib/status";
import type { Submission } from "@/lib/types";
import { LogBlock } from "@/ui/LogBlock";
import { ProductBadge } from "@/ui/ProductBadge";
import { StatusPill } from "@/ui/StatusPill";
import { cx } from "@/ui/cx";

function Media({ s, hovering }: { s: Submission; hovering: boolean }) {
  if (s.thumbnailUrl) {
    return (
      <div className="relative aspect-video overflow-hidden bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.thumbnailUrl} alt={`Demo of ${s.title}`} loading="lazy" className="size-full object-cover" />
        {hovering && s.previewUrl && (
          <video src={s.previewUrl} className="absolute inset-0 size-full object-cover" autoPlay muted loop playsInline aria-hidden />
        )}
      </div>
    );
  }
  if (s.errorTail?.length) {
    return (
      <div className="aspect-video overflow-hidden bg-teal-900">
        <LogBlock
          lines={s.errorTail.slice(-4)}
          tone={s.status === "build_failed" ? "fail" : "default"}
          variant="card"
          className="h-full"
        />
      </div>
    );
  }
  return (
    <div className="grid aspect-video place-items-center bg-teal-900 text-[13px] text-ink-muted">
      {s.status === "queued" ? "Waiting for a sandbox" : s.status === "running" ? "Screening now..." : "Nothing to demo"}
    </div>
  );
}

function statusDetail(s: Submission): string | null {
  if (s.status === "booted" && s.bootMs != null) return formatDuration(s.bootMs);
  return null;
}

export function SubmissionCard({
  s,
  top,
  href,
  selected = false,
}: {
  s: Submission;
  top: boolean;
  href: string;
  selected?: boolean;
}) {
  const [hovering, setHovering] = useState(false);
  const reduced = useRef<boolean | null>(null);

  function onEnter() {
    if (reduced.current == null) reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced.current) setHovering(true);
  }

  const detail = statusDetail(s);
  const products = badgeProducts(s);

  return (
    <article
      onPointerEnter={onEnter}
      onPointerLeave={() => setHovering(false)}
      className={cx(
        "group relative flex flex-col overflow-hidden rounded-card border bg-surface transition-colors duration-150",
        "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent",
        selected ? "border-accent" : "border-line hover:border-line-strong",
      )}
    >
      <div className="border-b border-line">
        <Media s={s} hovering={hovering} />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-base font-medium leading-snug tracking-[-0.01em] text-ink">
            <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
              <span className="text-ink-muted">{s.owner} /</span> {s.title}
            </Link>
          </h3>
          {s.score ? (
            <span
              className={cx("shrink-0 font-mono text-[15px] tabular-nums", top ? "text-accent" : "text-ink")}
              title={top ? "Top 10% score" : "Score out of 5"}
            >
              {s.score.total.toFixed(1)}
              <span className="sr-only"> out of 5{top ? ", top 10%" : ""}</span>
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-[13.5px] leading-normal text-ink-muted">{s.description}</p>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-4">
          <span className="flex shrink-0 items-center gap-2">
            <StatusPill status={s.status} />
            {detail && <span className="font-mono text-[11px] text-ink-muted">{detail}</span>}
          </span>
          {products.length > 0 && (
            <span className="ml-auto flex flex-wrap justify-end gap-1">
              {products.map((p) => (
                <ProductBadge key={p} product={p} used={s.demoProduct === p} />
              ))}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
