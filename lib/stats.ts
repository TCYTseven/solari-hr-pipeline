import { median, percentile } from "./metrics";
import { PROJECT_TYPE_LABEL } from "./status";
import type { Product, ProjectType, SdkIssue, Submission } from "./types";

export interface Stats {
  bootByType: { type: ProjectType; label: string; medianMs: number | null; count: number }[];
  productUsage: { key: Product | "multiple"; label: string; count: number }[];
  vmsLaunched: number;
  vmMinutes: number;
  sandboxCreateP50Ms: number | null;
  sandboxCreateP95Ms: number | null;
  /** Share of finished runs that failed to boot (build failed, timeout, needs secrets). */
  failureRate: number | null;
  screened: number;
  failures: { reason: string; count: number }[];
  issues: SdkIssue[];
}

export interface StatsInput {
  submissions: Submission[];
  /** Create latency of every Solari sandbox launched, across runs. */
  sandboxCreateMs: number[];
  vmsLaunched: number;
  vmSeconds: number;
  /** failure_reason of each failed submission's latest run. */
  failureReasons: string[];
  issues: SdkIssue[];
}

const TYPES: ProjectType[] = ["web", "desktop_agent", "browser_agent", "cli"];
const FAILED = new Set(["build_failed", "timeout", "needs_secrets"]);

export function computeStats(input: StatsInput): Stats {
  const subs = input.submissions;
  const bootByType = TYPES.map((type) => {
    const boots = subs
      .filter((s) => s.projectType === type && s.status === "booted" && s.bootMs != null)
      .map((s) => s.bootMs as number);
    return { type, label: PROJECT_TYPE_LABEL[type], medianMs: median(boots), count: boots.length };
  });

  const usage = { browser: 0, sandbox: 0, desktop: 0, multiple: 0 };
  for (const s of subs) {
    if (s.productsUsed.length > 1) usage.multiple++;
    else if (s.productsUsed.length === 1) usage[s.productsUsed[0]]++;
  }

  const finished = subs.filter((s) => s.status === "booted" || FAILED.has(s.status));
  const failed = finished.filter((s) => FAILED.has(s.status));

  const reasons = new Map<string, number>();
  for (const r of input.failureReasons) reasons.set(r, (reasons.get(r) ?? 0) + 1);

  return {
    bootByType,
    productUsage: [
      { key: "browser", label: "Browser", count: usage.browser },
      { key: "sandbox", label: "Sandbox", count: usage.sandbox },
      { key: "desktop", label: "Desktop", count: usage.desktop },
      { key: "multiple", label: "Multiple", count: usage.multiple },
    ],
    vmsLaunched: input.vmsLaunched,
    vmMinutes: Math.round(input.vmSeconds / 60),
    sandboxCreateP50Ms: percentile(input.sandboxCreateMs, 50),
    sandboxCreateP95Ms: percentile(input.sandboxCreateMs, 95),
    failureRate: finished.length ? failed.length / finished.length : null,
    screened: finished.length,
    failures: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    issues: input.issues,
  };
}
