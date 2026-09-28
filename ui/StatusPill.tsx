import { STATUS } from "@/lib/status";
import type { Status } from "@/lib/types";
import { cx } from "./cx";

/** 6px dot plus the status word. Never color alone. */
export function StatusPill({
  status,
  pulse = status === "running",
  className,
}: {
  status: Status;
  pulse?: boolean;
  className?: string;
}) {
  const { label, color, text } = STATUS[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase leading-none tracking-[0.04em]",
        className,
      )}
      style={{ color: text }}
    >
      <span
        aria-hidden
        className={cx("size-1.5 shrink-0 rounded-full", pulse && "live-pulse")}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
