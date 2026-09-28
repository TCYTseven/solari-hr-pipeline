import { getOverview, getScanInfo, listSubmissions } from "@/lib/data";
import { Hero } from "@/components/home/Hero";
import { SubmissionBrowser } from "@/components/home/SubmissionBrowser";
import { parseState } from "@/components/home/state";
import { Container } from "@/ui/Container";
import { Divider } from "@/ui/Divider";
import { LiveRefresh } from "@/ui/LiveRefresh";

export default async function Home({ searchParams }: PageProps<"/">) {
  const [submissions, overview, scan, sp] = await Promise.all([
    listSubmissions(),
    getOverview(),
    getScanInfo(),
    searchParams,
  ]);
  return (
    <>
      <LiveRefresh />
      <Hero overview={overview} scanning={scan.running} />
      <Container>
        <Divider />
      </Container>
      <SubmissionBrowser submissions={submissions} initial={parseState(sp)} />
    </>
  );
}
