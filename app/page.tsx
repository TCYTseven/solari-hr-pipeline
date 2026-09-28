import { OverviewStats } from "@/components/home/OverviewStats";
import { SubmissionBrowser } from "@/components/home/SubmissionBrowser";
import { parseBrowse } from "@/lib/browse";
import { getOverview, listSubmissions } from "@/lib/data";
import { Container } from "@/ui/Container";
import { LiveRefresh } from "@/ui/LiveRefresh";
import { PageHeader } from "@/ui/PageHeader";

export default async function Home({ searchParams }: PageProps<"/">) {
  const [submissions, overview, sp] = await Promise.all([listSubmissions(), getOverview(), searchParams]);
  return (
    <Container>
      <LiveRefresh />
      <PageHeader
        title="Submissions"
        description="Every fork of the Solari cookbook, built in a Solari Sandbox and demoed by an AI agent. Rescanned every 30 minutes."
        aside={<OverviewStats overview={overview} />}
      />
      <SubmissionBrowser submissions={submissions} initial={parseBrowse(sp)} />
    </Container>
  );
}
