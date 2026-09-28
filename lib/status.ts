import { PRODUCTS, type Product, type ProjectType, type Status, type Submission } from "./types";

// `color` is the dot. `text` is the word next to it: --skip (#636363) fails
// contrast as text, so grey statuses print their word in --text-muted.
export const STATUS: Record<Status, { label: string; color: string; text: string }> = {
  booted: { label: "Booted", color: "var(--ok)", text: "var(--ok)" },
  running: { label: "Running", color: "var(--run)", text: "var(--run)" },
  build_failed: { label: "Build failed", color: "var(--fail)", text: "var(--fail)" },
  timeout: { label: "Timeout", color: "var(--warn)", text: "var(--warn)" },
  needs_secrets: { label: "Needs secrets", color: "var(--warn)", text: "var(--warn)" },
  skipped: { label: "Skipped", color: "var(--skip)", text: "var(--text-muted)" },
  opted_out: { label: "Opted out", color: "var(--skip)", text: "var(--text-muted)" },
  queued: { label: "Queued", color: "var(--skip)", text: "var(--text-muted)" },
};

export const PRODUCT_LABEL: Record<Product, string> = {
  browser: "Browser",
  sandbox: "Sandbox",
  desktop: "Desktop",
};

export const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  web: "Web app",
  desktop_agent: "Desktop agent",
  browser_agent: "Browser agent",
  cli: "CLI",
};

/** Badges for a submission: the products its code uses, plus the one the demo ran on. */
export function badgeProducts(s: Pick<Submission, "productsUsed" | "demoProduct">): Product[] {
  return PRODUCTS.filter((p) => s.productsUsed.includes(p) || s.demoProduct === p);
}
