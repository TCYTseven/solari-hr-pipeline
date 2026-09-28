"use client";

import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { PlayGlyph } from "./PlayButton";
import { cx } from "./cx";

export interface VideoFrameHandle {
  seek: (seconds: number) => void;
}

/**
 * 16:9 frame, 10px radius, 1px border, black background and a custom play
 * button. Captions come from the agent's step log as WebVTT.
 */
export function VideoFrame({
  src,
  poster,
  captionsSrc,
  title,
  ref,
  onTimeUpdate,
  className,
}: {
  src: string | null;
  poster?: string | null;
  captionsSrc?: string | null;
  title: string;
  ref?: Ref<VideoFrameHandle>;
  onTimeUpdate?: (seconds: number) => void;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  useImperativeHandle(ref, () => ({
    seek(seconds: number) {
      const v = video.current;
      if (!v) return;
      v.currentTime = seconds;
      setStarted(true);
      void v.play().catch(() => {});
    },
  }));

  function play() {
    setStarted(true);
    void video.current?.play().catch(() => {});
  }

  return (
    <div
      className={cx(
        "relative aspect-video w-full overflow-hidden rounded-card border border-line bg-black",
        className,
      )}
    >
      {src ? (
        <>
          <video
            ref={video}
            className="size-full object-contain"
            src={src}
            poster={poster ?? undefined}
            controls={started}
            playsInline
            preload="metadata"
            aria-label={title}
            onPlay={() => setStarted(true)}
            onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
          >
            {captionsSrc && <track kind="captions" src={captionsSrc} srcLang="en" label="Agent steps" default />}
          </video>
          {!started && (
            <button
              type="button"
              onClick={play}
              className="group absolute inset-0 grid place-items-center"
              aria-label={`Play ${title}`}
            >
              <PlayGlyph className="group-hover:bg-accent-soft" />
            </button>
          )}
        </>
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt={title} className="size-full object-contain" />
      ) : (
        <div className="grid size-full place-items-center font-mono text-xs uppercase tracking-[0.04em] text-ink-muted">
          No demo recorded
        </div>
      )}
    </div>
  );
}
