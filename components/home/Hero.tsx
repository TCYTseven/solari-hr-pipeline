import { formatDuration } from "@/lib/format";
import type { Overview } from "@/lib/data";
import { Container } from "@/ui/Container";
import { CountUp } from "@/ui/CountUp";
import { Label } from "@/ui/Label";
import { Metric } from "@/ui/Metric";
import { cx } from "@/ui/cx";

export function Hero({ overview, scanning }: { overview: Overview; scanning: boolean }) {
  const bootSeconds = overview.medianBootMs == null ? null : Math.round(overview.medianBootMs / 1000);
  return (
    <Container className="pb-12 pt-16 md:pb-16 md:pt-24">
      <Label className="flex items-center gap-2 text-accent">
        <span aria-hidden className={cx("size-1.5 rounded-full bg-accent", scanning && "live-pulse")} />
        Live screening
        {scanning && <span className="sr-only">(a scan is running now)</span>}
      </Label>
      <h1 className="mt-4 max-w-[18ch] font-display text-4xl font-medium leading-[1.1] tracking-[-0.04em] text-ink md:text-[56px]">
        Every Solari submission, booted and demoed.
      </h1>
      <p className="mt-5 max-w-[60ch] text-base leading-normal text-ink-muted">
        Each fork of the Solari repo is cloned into a Solari Sandbox, opened in a Solari Browser or Desktop, and
        demoed by an AI agent. Updated every 30 minutes.
      </p>
      <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
        <Metric value={<CountUp value={overview.forksFound} />} label="Forks found" />
        <Metric value={<CountUp value={overview.booted} />} label="Booted" />
        <Metric value={<CountUp value={overview.vmsLaunched} />} label="VMs launched" />
        <Metric
          value={bootSeconds == null ? "-" : bootSeconds < 60 ? <CountUp value={bootSeconds} suffix="s" /> : formatDuration(overview.medianBootMs)}
          label="Median boot"
        />
      </dl>
    </Container>
  );
}
