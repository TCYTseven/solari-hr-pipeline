import type { Submission } from "./types";

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
}

/** Score at or above which a submission is in the top 10% of scored submissions. */
export function topScoreThreshold(subs: Submission[]): number | null {
  const scores = subs.map((s) => s.score?.total).filter((n): n is number => n != null);
  if (scores.length === 0) return null;
  return percentile(scores, 90);
}
