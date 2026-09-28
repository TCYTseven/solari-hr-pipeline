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
      <div className="relative mt-3 h-8" onMouseLeave={() => setOpen(null)}>
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
        <div
          aria-hidden
          className="absolute left-0 top-1/2 h-px bg-accent"
          style={{ width: `${Math.min(100, (current / duration) * 100)}%` }}
        />
        <ol className="contents">
          {steps.map((s, i) => {
            const left = Math.min(100, (s.t / duration) * 100);
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
                {shown === i && (
                  <div
                    id={`step-tip-${i}`}
                    role="tooltip"
                    className={cx(
                      "absolute bottom-full z-10 mb-2 w-72 rounded-card border border-line-strong bg-surface p-3 text-left shadow-none",
                      left < 20 ? "left-0" : left > 80 ? "right-0" : "left-1/2 -translate-x-1/2",
                    )}
                  >
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-accent">
                      {clock(s.t)} · {s.action}
                    </p>
                    <p className="mt-1 text-sm text-ink">{s.label}</p>
                    {s.reasoning && <p className="mt-1.5 text-[13px] leading-snug text-ink-muted">{s.reasoning}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
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
    <div id="demo" className="scroll-mt-20">
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
