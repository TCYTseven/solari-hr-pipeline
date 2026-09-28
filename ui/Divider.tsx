import { cx } from "./cx";

/** Amber gradient hairline for section breaks, or a plain 1px border inside components. */
export function Divider({ variant = "amber", className }: { variant?: "amber" | "line"; className?: string }) {
  return (
    <div
      role="separator"
      className={cx("h-px w-full", variant === "line" && "bg-line", className)}
      style={
        variant === "amber"
          ? {
              background:
                "linear-gradient(90deg, rgba(245,179,1,0), rgba(245,179,1,0.96), rgba(245,179,1,0))",
            }
          : undefined
      }
    />
  );
}
