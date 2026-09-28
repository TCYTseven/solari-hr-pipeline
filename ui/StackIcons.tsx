import { resolveIcon } from "@/lib/icons";
import type { StackItem } from "@/lib/types";
import { cx } from "./cx";

/** Simple Icons glyphs for the detected stack, drawn in muted white. Unknown techs fall back to a mono tag. */
export function StackIcons({
  stack,
  max = 4,
  size = 16,
  className,
}: {
  stack: StackItem[];
  max?: number;
  size?: number;
  className?: string;
}) {
  const shown = stack.slice(0, max);
  return (
    <ul className={cx("flex items-center gap-2.5", className)} aria-label="Tech stack">
      {shown.map((item) => {
        const icon = resolveIcon(item.slug);
        return (
          <li key={item.slug} className="flex">
            {icon ? (
              <svg
                role="img"
                aria-label={item.name}
                viewBox="0 0 24 24"
                width={size}
                height={size}
                className="fill-ink-muted"
              >
                <title>{item.name}</title>
                <path d={icon.path} />
              </svg>
            ) : (
              <span
                className="rounded-badge border border-line px-1 font-mono text-[10px] uppercase leading-4 text-ink-muted"
                title={item.name}
              >
                {item.name.slice(0, 6)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
