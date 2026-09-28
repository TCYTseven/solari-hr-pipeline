import type { Overview } from "@/lib/data";
import { formatDuration } from "@/lib/format";
import { CountUp } from "@/ui/CountUp";

/** The four headline numbers, compact enough to sit beside the page title. */
export function OverviewStats({ overview }: { overview: Overview }) {
  const bootSeconds = overview.medianBootMs == null ? null : Math.round(overview.medianBootMs / 1000);
  const items = [
    { label: "forks", value: <CountUp value={overview.forksFound} /> },
    { label: "booted", value: <CountUp value={overview.booted} /> },
    { label: "VMs launched", value: <CountUp value={overview.vmsLaunched} /> },
    {
      label: "median boot",
      value:
        bootSeconds == null ? "-" : bootSeconds < 60 ? <CountUp value={bootSeconds} suffix="s" /> : formatDuration(overview.medianBootMs),
    },
  ];
  return (
    // gap-px over a line-colored background draws the dividers in both 2 and 4 column layouts.
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col-reverse gap-0.5 bg-bg px-4 py-2.5 md:px-5">
          <dt className="whitespace-nowrap text-xs text-ink-muted">{it.label}</dt>
          <dd className="font-mono text-lg font-medium leading-tight text-ink tabular-nums md:text-xl">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
