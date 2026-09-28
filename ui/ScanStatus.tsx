import type { ScanInfo } from "@/lib/types";
import { RelativeTime } from "./RelativeTime";
import { cx } from "./cx";

/** "Scanning now" with a pulsing dot while a scan runs, otherwise when the last one finished. */
export function ScanStatus({ scan, className }: { scan: ScanInfo; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-mono text-xs text-ink-muted", className)}>
      <span
        aria-hidden
        className={cx("size-1.5 shrink-0 rounded-full", scan.running ? "live-pulse bg-run" : "bg-ok")}
      />
      {scan.running ? (
        <span className="text-ink-body">Scanning now</span>
      ) : scan.lastScanAt ? (
        <RelativeTime iso={scan.lastScanAt} prefix="Updated " />
      ) : (
        <span>No scans yet</span>
      )}
    </span>
  );
}
