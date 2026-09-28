"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders the current page when the screener database changes, via the
 * /api/live event stream. Refreshes are throttled so a busy scan (logs stream
 * in every few seconds) doesn't hammer the server.
 */
export function LiveRefresh({ owner, minIntervalMs = 1500 }: { owner?: string; minIntervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const es = new EventSource("/api/live");
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function schedule() {
      if (timer) return;
      const wait = Math.max(0, last + minIntervalMs - Date.now());
      timer = setTimeout(() => {
        timer = undefined;
        last = Date.now();
        router.refresh();
      }, wait);
    }

    es.addEventListener("change", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { table: string; owner?: string };
        if (owner && d.table !== "scans" && d.owner?.toLowerCase() !== owner.toLowerCase()) return;
      } catch {
        return;
      }
      schedule();
    });

    return () => {
      es.close();
      if (timer) clearTimeout(timer);
    };
  }, [owner, minIntervalMs, router]);

  return null;
}
