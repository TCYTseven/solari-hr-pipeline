import type { ReactNode } from "react";
import { cx } from "./cx";

/** Number in mono white, label below in mono 12px uppercase muted. */
export function Metric({
  value,
  label,
  size = "lg",
  className,
}: {
  value: ReactNode;
  label: ReactNode;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <span
        className={cx(
          "font-mono font-medium leading-none tracking-normal text-ink tabular-nums",
          size === "lg" ? "text-[26px] md:text-[32px]" : "text-lg md:text-xl",
        )}
      >
        {value}
      </span>
      <span className="font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </span>
    </div>
  );
}
