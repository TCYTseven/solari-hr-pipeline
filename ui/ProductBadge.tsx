import { PRODUCT_LABEL } from "@/lib/status";
import type { Product } from "@/lib/types";
import { cx } from "./cx";

/** Mono 11px uppercase badge. The product used for the demo gets an amber border. */
export function ProductBadge({ product, used = false }: { product: Product; used?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-badge border px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase leading-4 tracking-[0.04em]",
        used ? "border-accent text-ink" : "border-line text-ink-muted",
      )}
      title={used ? `${PRODUCT_LABEL[product]} (used for the demo)` : PRODUCT_LABEL[product]}
    >
      {PRODUCT_LABEL[product]}
    </span>
  );
}
