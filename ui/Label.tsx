import type { ComponentProps } from "react";
import { cx } from "./cx";

/** Uppercase JetBrains Mono eyebrow: 12px, 600, 0.04em. */
export function Label({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cx("font-mono text-xs font-semibold uppercase tracking-[0.04em]", className)}
      {...props}
    />
  );
}
