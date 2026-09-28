"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Counts from 0 to `value` over 600ms once, the page's one load moment.
 *
 * The server renders the final value (so it's right without JavaScript), but
 * with JS on, `.count-pending` keeps it hidden until this runs; otherwise the
 * final number would flash, drop to 0, and count up again. The layout effect
 * runs before paint, so client-side navigations don't flash either.
 */
export function CountUp({
  value,
  suffix = "",
  duration = 600,
}: {
  value: number;
  suffix?: string;
  duration?: number;
}) {
  const el = useRef<HTMLSpanElement>(null);
  const animated = useRef(false);

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    node.classList.remove("count-pending");
    const format = (n: number) => `${n.toLocaleString("en-US")}${suffix}`;
    if (animated.current || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animated.current = true;
      node.textContent = format(value);
      return;
    }
    animated.current = true;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      node.textContent = format(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    node.textContent = format(0);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      node.textContent = format(value);
    };
  }, [value, suffix, duration]);

  return (
    <span ref={el} className="count-pending tabular-nums">
      {value.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
