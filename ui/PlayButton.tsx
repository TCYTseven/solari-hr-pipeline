import { cx } from "./cx";

/** Amber circle with a dark triangle. */
export function PlayGlyph({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("grid place-items-center rounded-full bg-accent transition-colors duration-150", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.36} height={size * 0.36} viewBox="0 0 20 20" style={{ marginLeft: size * 0.05 }}>
        <path d="M4 2.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L5.5 1.64A1 1 0 0 0 4 2.5Z" fill="#080A0E" />
      </svg>
    </span>
  );
}
