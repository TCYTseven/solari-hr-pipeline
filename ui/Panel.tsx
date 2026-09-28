import type { ReactNode } from "react";
import { cx } from "./cx";

/** A bordered surface with an optional title bar. Most page content lives in these. */
export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  id,
  as: Tag = "section",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Replaces the default 16px body padding (e.g. "p-0" for an edge-to-edge table). */
  bodyClassName?: string;
  id?: string;
  as?: "section" | "div" | "aside";
}) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <Tag id={id} aria-labelledby={title ? titleId : undefined} className={cx("rounded-card border border-line bg-surface", className)}>
      {(title || actions) && (
        <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          {title && (
            <h2 id={titleId} className="text-sm font-semibold text-ink">
              {title}
            </h2>
          )}
          {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName ?? "p-4"}>{children}</div>
    </Tag>
  );
}
