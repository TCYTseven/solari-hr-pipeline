import type { ReactNode } from "react";
import { cx } from "./cx";

/** Compact page title row: title and one line of context on the left, actions or stats on the right. */
export function PageHeader({
  title,
  description,
  aside,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-5 pb-6 pt-8 md:pt-10 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[28px] font-medium leading-[1.15] tracking-[-0.025em] text-ink md:text-[32px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-[65ch] text-[15px] text-ink-muted">{description}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}
