"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

/** "4 min ago", refreshed every 30s. */
export function RelativeTime({ iso, prefix = "" }: { iso: string | null; prefix?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <time dateTime={iso ?? undefined} suppressHydrationWarning>
      {prefix}
      {timeAgo(iso, now)}
    </time>
  );
}
