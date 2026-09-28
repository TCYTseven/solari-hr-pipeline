import type { Metadata } from "next";
import { Container } from "@/ui/Container";
import { PageHeader } from "@/ui/PageHeader";
import { Panel } from "@/ui/Panel";
import { OptOutForm } from "./OptOutForm";

export const metadata: Metadata = { title: "Opt out", description: "Remove your submission from Solari Screener." };

export default function OptOutPage() {
  return (
    <Container>
      <PageHeader title="Opt out" description="Want your submission removed? Enter your GitHub username. It will be hidden within 24 hours." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="Remove my submission">
          <OptOutForm />
        </Panel>
        <Panel title="What happens" as="aside">
          <ul className="flex list-disc flex-col gap-2 pl-4 text-sm leading-normal text-ink-muted">
            <li>Your fork disappears from the dashboard, including its demo and score.</li>
            <li>The screener never clones or runs it again.</li>
            <li>Nothing about your repository changes on GitHub.</li>
          </ul>
        </Panel>
      </div>
    </Container>
  );
}
