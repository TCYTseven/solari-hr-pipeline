import type { Product, ProjectType, Status } from "./types";

export const STATUS: Record<Status, { label: string; color: string }> = {
  booted: { label: "Booted", color: "var(--ok)" },
  running: { label: "Running", color: "var(--run)" },
  build_failed: { label: "Build failed", color: "var(--fail)" },
  timeout: { label: "Timeout", color: "var(--warn)" },
  needs_secrets: { label: "Needs secrets", color: "var(--warn)" },
  skipped: { label: "Skipped", color: "var(--skip)" },
  opted_out: { label: "Opted out", color: "var(--skip)" },
  queued: { label: "Queued", color: "var(--skip)" },
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
