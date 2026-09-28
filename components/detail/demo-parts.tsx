"use client";

// Pieces of the demo viewer: the live frame, the step timeline under the video.

import { useEffect, useRef, useState } from "react";
import type { DemoStep } from "@/lib/types";
import { cx } from "@/ui/cx";

export function clock(t: number): string {
  const s = Math.max(0, Math.round(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Latest frame of an active run, refreshed every second. */
export function LiveView({ src, title }: { src: string; title: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const url = `${src}${src.includes("?") ? "&" : "?"}t=${tick}`;
  return (
    <div className="relative aspect-video overflow-hidden rounded-card border border-line bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Live view of ${title}`} className="size-full object-contain" />
      <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-badge bg-black/70 px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-run">
        <span aria-hidden className="live-pulse size-1.5 rounded-full bg-run" />
        Live
      </span>
    </div>
  );
}

const DOT = 24; // px: minimum target size and spacing (WCAG 2.5.8)

/**
 * Dot centers as a % of the track. Proportional to time, but nudged so no two
 * are closer than DOT px (when the track is wide enough for that at all).
 */
function layoutDots(times: number[], duration: number, width: number): number[] {
  if (width <= 0 || times.length * DOT > width) return times.map((t) => Math.min(100, (t / duration) * 100));
  const half = DOT / 2;
  const x = times.map((t) => Math.min(width - half, Math.max(half, (t / duration) * width)));
  for (let i = 1; i < x.length; i++) x[i] = Math.max(x[i], x[i - 1] + DOT);
  for (let i = x.length - 1; i >= 0; i--) {
    const limit = i === x.length - 1 ? width - half : x[i + 1] - DOT;
    x[i] = Math.min(x[i], limit);
  }
  return x.map((v) => (v / width) * 100);
}

export function Timeline({
  steps,
  duration,
  current,
  onSeek,
}: {
  steps: DemoStep[];
  duration: number;
  current: number;
  onSeek: (i: number) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const lefts = layoutDots(steps.map((s) => s.t), duration, width);
  const dense = width > 0 && steps.length * DOT > width;
  const activeIdx = steps.reduce((acc, s, i) => (s.t <= current + 0.25 ? i : acc), -1);
  const shown = open ?? null;

  return (
    <div className="mt-2">
      <div ref={track} className="relative h-8" onMouseLeave={() => setOpen(null)}>
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
        <div
          aria-hidden
          className="absolute left-0 top-1/2 h-px bg-accent"
          style={{ width: `${Math.min(100, (current / duration) * 100)}%` }}
        />
        {dense && (
          <div aria-hidden>
            {steps.map((s, i) => (
              <span
                key={i}
                className={cx(
                  "absolute top-1/2 h-2.5 w-px -translate-y-1/2",
                  i <= activeIdx ? "bg-accent" : "bg-ink-muted",
                )}
                style={{ left: `${lefts[i]}%` }}
              />
            ))}
          </div>
        )}
        <ol className={dense ? "hidden" : "contents"}>
          {steps.map((s, i) => {
            const left = lefts[i];
            const isActive = i === activeIdx;
            return (
              <li key={i} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${left}%` }}>
                <button
                  type="button"
                  onClick={() => {
                    onSeek(i);
                    setOpen(i);
                  }}
                  onMouseEnter={() => setOpen(i)}
                  onFocus={() => setOpen(i)}
                  onBlur={() => setOpen(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setOpen(null);
                  }}
                  aria-label={`${clock(s.t)} ${s.label}`}
                  aria-describedby={shown === i ? `step-tip-${i}` : undefined}
                  className="grid size-6 place-items-center rounded-full"
                >
                  <span
                    aria-hidden
                    className={cx(
                      "size-2.5 rounded-full border transition-colors duration-150",
                      isActive
                        ? "border-accent bg-accent"
                        : i < activeIdx
                          ? "border-ink bg-ink"
                          : "border-ink-muted bg-bg hover:border-accent",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ol>
        {shown != null && steps[shown] && (
          <div
            id={`step-tip-${shown}`}
            role="tooltip"
            className="absolute bottom-full z-10 mb-1 w-[min(18rem,100%)] rounded-card border border-line-strong bg-surface p-3 text-left"
            // Centered on its dot, clamped so it never leaves the track.
            style={{
              left: `clamp(0px, calc(${lefts[shown]}% - min(9rem, 50%)), calc(100% - min(18rem, 100%)))`,
            }}
          >
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-accent">
              {clock(steps[shown].t)} · {steps[shown].action}
            </p>
            <p className="mt-1 text-sm text-ink">{steps[shown].label}</p>
            {steps[shown].reasoning && (
              <p className="mt-1.5 text-[13px] leading-snug text-ink-muted">{steps[shown].reasoning}</p>
            )}
          </div>
        )}
      </div>
      <div className="mt-1 flex min-h-5 items-center justify-between gap-4 font-mono text-xs text-ink-muted">
        <p className="truncate">
          {activeIdx >= 0 ? (
            <>
              <span className="text-ink-body">{clock(steps[activeIdx].t)}</span> {steps[activeIdx].label}
            </>
          ) : (
            dense ? "Every agent action is listed under Agent steps." : "Each dot is one agent action. Click to jump to it."
          )}
        </p>
        <span className="shrink-0 tabular-nums">
          {steps.length} actions · {clock(duration)}
        </span>
      </div>
    </div>
  );
}
