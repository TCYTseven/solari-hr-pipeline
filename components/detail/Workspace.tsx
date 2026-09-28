"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Run, Submission } from "@/lib/types";
import { LogBlock } from "@/ui/LogBlock";
import { Tabs } from "@/ui/Tabs";
import { VideoFrame, type VideoFrameHandle } from "@/ui/VideoFrame";
import { cx } from "@/ui/cx";
import { LiveView, Timeline, clock } from "./demo-parts";
import { DEFAULT_VIEW, type View } from "./views";


/**
 * The demo (live frame, recording, or the failing log) with its step
 * timeline, and one tabbed panel below it for everything else, so the page
 * reads as two panels rather than one long scroll.
 */
export function Workspace({
  submission,
  run,
  startLive,
  initialView,
  summary,
  timing,
  logs,
}: {
  submission: Submission;
  run: Run | null;
  startLive: boolean;
  initialView: View;
  summary: ReactNode;
  timing: ReactNode;
  logs: ReactNode;
}) {
  const video = useRef<VideoFrameHandle>(null);
  const media = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [view, setView] = useState<View>(initialView);
  const live = run?.status === "running" && run.streamUrl ? run.streamUrl : null;
  const [showLive, setShowLive] = useState(startLive && !!live);
  const steps = run?.steps ?? [];
  const duration = Math.max(1, ...steps.map((s) => s.t + 3));
  const title = `${submission.owner} / ${submission.title}`;

  const failed = submission.status === "build_failed" || submission.status === "timeout" || submission.status === "needs_secrets";
  const failLog = (submission.status === "build_failed" ? run?.logs.install : run?.logs.run) ?? "";
  const failLines = failLog.split("\n").filter((l) => l.trim()).slice(-8);
  const tail = failLines.length > (submission.errorTail?.length ?? 0) ? failLines : (submission.errorTail ?? []);
  const activeStep = steps.reduce((acc, s, i) => (s.t <= current + 0.25 ? i : acc), -1);

  function changeView(v: View) {
    setView(v);
    const url = new URL(window.location.href);
    if (v === DEFAULT_VIEW) url.searchParams.delete("view");
    else url.searchParams.set("view", v);
    window.history.replaceState(null, "", url);
  }

  function seek(i: number) {
    setShowLive(false);
    setCurrent(steps[i].t);
    video.current?.seek(steps[i].t);
    const box = media.current?.getBoundingClientRect();
    if (box && box.top < 64) media.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // `v` jumps to the video from anywhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && ["INPUT", "TEXTAREA", "SELECT", "VIDEO"].includes(t.tagName))) return;
      if (e.key === "v") media.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tabItems = [
    { value: "summary" as const, label: "Summary" },
    {
      value: "steps" as const,
      label: (
        <>
          Agent steps{steps.length > 0 && <span className="ml-1.5 font-mono text-[11px] text-ink-muted">{steps.length}</span>}
        </>
      ),
    },
    { value: "timing" as const, label: "Timing" },
    { value: "logs" as const, label: "Logs" },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div id="demo" ref={media} className="scroll-mt-32">
        {live && (
          <div className="mb-2 flex gap-1" role="group" aria-label="Demo source">
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
                  "rounded-btn px-2.5 py-1 text-[13px]",
                  showLive === o.v ? "bg-white/[0.07] text-ink" : "text-ink-muted hover:text-ink",
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
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <p className="text-sm font-semibold text-ink">
                {submission.status === "needs_secrets"
                  ? "Couldn't run without secrets"
                  : submission.status === "timeout"
                    ? "Timed out before it answered"
                    : "The build failed"}
                {run?.failureReason && <span className="font-normal text-ink-muted"> · {run.failureReason}</span>}
              </p>
              <button type="button" onClick={() => changeView("logs")} className="text-[13px] text-blue hover:underline">
                Full log
              </button>
            </div>
            <LogBlock
              lines={tail}
              tone={submission.status === "build_failed" ? "fail" : "default"}
              variant="bare"
              label="Last lines of the log"
            />
          </div>
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

        {steps.length > 0 && !showLive && <Timeline steps={steps} duration={duration} current={current} onSeek={seek} />}
      </div>

      <section className="rounded-card border border-line bg-surface" aria-label="Submission details">
        <div className="overflow-x-auto border-b border-line px-4 pt-3">
          <Tabs label="Details" items={tabItems} value={view} onChange={changeView} idPrefix="view" panelId="view-panel" />
        </div>
        <div id="view-panel" role="tabpanel" aria-labelledby={`view-tab-${view}`} className="p-4 md:p-5">
          {view === "summary" && summary}
          {view === "timing" && timing}
          {view === "logs" && logs}
          {view === "steps" &&
            (steps.length ? (
              <ol className="-mx-2 flex flex-col">
                {steps.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => seek(i)}
                      className={cx(
                        "grid w-full grid-cols-[44px_1fr] gap-x-3 rounded-btn px-2 py-2.5 text-left transition-colors duration-150 hover:bg-white/[0.04]",
                        i === activeStep && "bg-white/[0.05] shadow-[inset_2px_0_0_var(--accent)]",
                      )}
                    >
                      <span className="pt-0.5 font-mono text-xs text-ink-muted tabular-nums">{clock(s.t)}</span>
                      <span>
                        <span className="text-sm text-ink">{s.label}</span>
                        {s.reasoning && s.reasoning !== s.label && (
                          <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">{s.reasoning}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-muted">
                {submission.status === "booted"
                  ? "This project ran as a script, so there's no agent walkthrough. Its output is under Logs."
                  : "The demo agent runs once a submission boots."}
              </p>
            ))}
        </div>
      </section>
    </div>
  );
}

