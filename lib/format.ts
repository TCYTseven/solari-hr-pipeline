/** 41000 -> "41s", 850 -> "850ms", 1.2 -> "1.2ms", 95000 -> "1m 35s" */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "-";
  if (ms < 10) return `${Number(ms.toFixed(1))}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

/** Same as formatDuration but keeps one decimal between 1s and 60s, for tables. */
export function formatStage(ms: number | null | undefined): string {
  if (ms == null) return "-";
  if (ms < 10) return `${Number(ms.toFixed(1))}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return formatDuration(ms);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function padFork(n: number): string {
  return String(n).padStart(3, "0");
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : "-";
}
