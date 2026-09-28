"use client";

import { useEffect, useRef } from "react";

/**
 * Counts from 0 to `value` over 600ms once, after hydration. The server
 * renders the final value, so no-JS and reduced-motion visitors see it as is.
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

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const format = (n: number) => `${n.toLocaleString("en-US")}${suffix}`;
    if (animated.current || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
    <span ref={el} className="tabular-nums">
      {value.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
