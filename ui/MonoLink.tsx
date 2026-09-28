import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./cx";

export const monoLinkClass =
  "font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink underline decoration-1 underline-offset-4 transition-colors duration-150 hover:text-accent-soft";

/** JetBrains Mono 12px uppercase link, like "EXPLORE BROWSERS" on getsolari.com. */
export function MonoLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={cx(monoLinkClass, className)} {...props} />;
}

/** Same look for links that leave the site. */
export function MonoAnchor({ className, ...props }: ComponentProps<"a">) {
  return <a className={cx(monoLinkClass, className)} target="_blank" rel="noreferrer" {...props} />;
}
