import type { Metadata } from "next";
import { ButtonLink } from "@/ui/Button";
import { Container } from "@/ui/Container";
import { CountUp } from "@/ui/CountUp";
import { Divider } from "@/ui/Divider";
import { Label } from "@/ui/Label";
import { LogBlock } from "@/ui/LogBlock";
import { Metric } from "@/ui/Metric";
import { MonoLink } from "@/ui/MonoLink";
import { ProductBadge } from "@/ui/ProductBadge";
import { ScoreBar } from "@/ui/ScoreBar";
import { StackIcons } from "@/ui/StackIcons";
import { StatusPill } from "@/ui/StatusPill";
import { VideoFrame } from "@/ui/VideoFrame";
import type { Status } from "@/lib/types";
import { TabsDemo } from "./TabsDemo";

export const metadata: Metadata = { title: "UI kit", robots: { index: false } };

const STATUSES: Status[] = ["booted", "running", "build_failed", "timeout", "needs_secrets", "skipped", "opted_out", "queued"];

const LOG = `$ npm install
added 412 packages in 29s
npm warn deprecated inflight@1.0.6: This module is not supported
# build
$ npm run build
> solari-price-watch@1.0.0 build
const browser = await solari.launch({ stealth: true })
Error: Cannot find module '@solarisdk/browser'`;

export default function UiKit() {
  return (
    <Container className="flex flex-col gap-12 py-16">
      <section className="flex flex-col gap-4">
        <Label className="text-accent">Components</Label>
        <h1 className="font-display text-[40px] font-medium leading-[1.1] tracking-[-0.03em] text-ink">UI kit</h1>
        <p className="max-w-[60ch] text-ink-muted">Section 4 of the design plan, rendered.</p>
      </section>
      <Divider />
      <section className="flex flex-wrap items-center gap-4">
        <ButtonLink href="/ui-kit">Primary button</ButtonLink>
        <ButtonLink href="/ui-kit" variant="ghost">Ghost button</ButtonLink>
        <MonoLink href="/ui-kit">Watch demo</MonoLink>
        <MonoLink href="/ui-kit">View repo</MonoLink>
      </section>
      <section className="flex flex-wrap gap-6">
        {STATUSES.map((s) => (
          <StatusPill key={s} status={s} />
        ))}
      </section>
      <section className="flex flex-wrap items-center gap-2">
        <ProductBadge product="desktop" used />
        <ProductBadge product="sandbox" />
        <ProductBadge product="browser" />
        <span className="w-6" />
        <StackIcons stack={[{ slug: "python", name: "Python" }, { slug: "nodedotjs", name: "Node.js" }, { slug: "googlechrome", name: "Chrome" }, { slug: "zig-ish", name: "Zigish" }]} />
      </section>
      <dl className="grid grid-cols-2 gap-8 md:grid-cols-4">
        <Metric value={<CountUp value={214} />} label="Forks found" />
        <Metric value={<CountUp value={163} />} label="Booted" />
        <Metric value={<CountUp value={1902} />} label="VMs launched" />
        <Metric value={<CountUp value={38} suffix="s" />} label="Median boot" />
      </dl>
      <Divider variant="line" />
      <section className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <ScoreBar label="Boots" value={5} />
          <ScoreBar label="Works" value={4} />
          <ScoreBar label="Uses Solari" value={4} />
          <ScoreBar label="Use case" value={5} />
          <ScoreBar label="Polish" value={3} />
        </div>
        <VideoFrame src={null} title="Demo" />
      </section>
      <TabsDemo />
      <LogBlock text={LOG} label="Install log" />
      <LogBlock lines={["npm ERR! code ENOENT", "npm ERR! syscall open", "npm ERR! path /work/package.json", "npm ERR! enoent Could not read package.json"]} tone="fail" />
    </Container>
  );
}
