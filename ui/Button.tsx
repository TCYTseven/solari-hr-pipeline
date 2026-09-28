import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "./cx";

type Variant = "primary" | "ghost";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-btn border font-semibold leading-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

const sizes: Record<Size, string> = {
  md: "px-4 py-2.5 text-sm",
  sm: "px-3 py-2 text-[13px]",
};

const variants: Record<Variant, string> = {
  // Amber background, near-black text. Hover goes to the soft amber.
  primary: "border-transparent bg-accent text-bg hover:bg-accent-soft",
  // Transparent with a strong 1px border and white text.
  ghost: "border-line-strong text-ink hover:bg-white/[0.04]",
};

export function buttonClass(variant: Variant = "primary", className?: string, size: Size = "md") {
  return cx(base, sizes[size], variants[variant], className);
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
