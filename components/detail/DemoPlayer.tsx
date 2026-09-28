"use client";

import { useEffect, useRef, useState } from "react";
import type { DemoStep, Run, Submission } from "@/lib/types";
import { Label } from "@/ui/Label";
import { LogBlock } from "@/ui/LogBlock";
import { VideoFrame, type VideoFrameHandle } from "@/ui/VideoFrame";
import { cx } from "@/ui/cx";

function clock(t: number): string {
  const s = Math.max(0, Math.round(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Latest frame of an active run, refreshed every second. */
function LiveView({ src, title }: { src: string; title: string }) {
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

function Timeline({
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
  const activeIdx = steps.reduce((acc, s, i) => (s.t <= current + 0.25 ? i : acc), -1);
  const shown = open ?? null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <Label className="text-ink-muted">Agent steps</Label>
        <span className="font-mono text-xs text-ink-muted tabular-nums">
          {steps.length} actions · {clock(duration)}
        </span>
      </div>
      <div ref={track} className="relative mt-3 h-8" onMouseLeave={() => setOpen(null)}>
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
        <div
          aria-hidden
          className="absolute left-0 top-1/2 h-px bg-accent"
          style={{ width: `${Math.min(100, (current / duration) * 100)}%` }}
        />
        <ol className="contents">
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
      <p className="mt-2 min-h-5 font-mono text-xs text-ink-muted">
        {activeIdx >= 0 ? (
          <>
            <span className="text-ink-body">{clock(steps[activeIdx].t)}</span> {steps[activeIdx].label}
          </>
        ) : (
          "Click a step to jump to it."
        )}
      </p>
    </div>
  );
}

export function DemoPlayer({
  submission,
  run,
  startLive,
}: {
  submission: Submission;
  run: Run | null;
  startLive: boolean;
}) {
  const video = useRef<VideoFrameHandle>(null);
  const [current, setCurrent] = useState(0);
  const live = run?.status === "running" && run.streamUrl ? run.streamUrl : null;
  const [showLive, setShowLive] = useState(startLive && !!live);
  const steps = run?.steps ?? [];
  const duration = Math.max(1, ...steps.map((s) => s.t + 3));
  const title = `${submission.owner} / ${submission.title}`;

  const failed = submission.status === "build_failed" || submission.status === "timeout" || submission.status === "needs_secrets";
  // For failures, show the tail of the log that failed rather than only the card's four lines.
  const failLog = (submission.status === "build_failed" ? run?.logs.install : run?.logs.run) ?? "";
  const failLines = failLog.split("\n").filter((l) => l.trim()).slice(-18);
  const tail = failLines.length > (submission.errorTail?.length ?? 0) ? failLines : (submission.errorTail ?? []);

  return (
    <div id="demo" className="min-w-0 scroll-mt-20">
      {live && (
        <div className="mb-3 flex gap-5">
          {[
            { v: true, l: "Live" },
            { v: false, l: "Last recording" },
          ].map((o) => (
            <button
              key={o.l}
              type="button"
              aria-pressed={showLive === o.v}
              onClick={() => setShowLive(o.v)}
              className={cx(
                "border-b-2 pb-1 text-[13px]",
                showLive === o.v ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {o.l}
            </button>
          ))}
        </div>
      )}

      {showLive && live ? (
        <LiveView src={live} title={title} />
      ) : !submission.videoUrl && failed && tail.length ? (
        <LogBlock
          lines={tail}
          tone={submission.status === "build_failed" ? "fail" : "default"}
          className="aspect-video"
          label="Last lines of the log"
        />
      ) : (
        <VideoFrame
          ref={video}
          src={submission.videoUrl}
          poster={submission.thumbnailUrl}
          captionsSrc={submission.captionsUrl}
          title={`Demo of ${title}`}
          onTimeUpdate={setCurrent}
        />
      )}

      {steps.length > 0 && !showLive && (
        <Timeline
          steps={steps}
          duration={duration}
          current={current}
          onSeek={(i) => {
            setCurrent(steps[i].t);
            video.current?.seek(steps[i].t);
          }}
        />
      )}
    </div>
  );
}
