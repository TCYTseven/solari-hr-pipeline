import { getOverview, getScanInfo, listSubmissions } from "@/lib/data";
import { Hero } from "@/components/home/Hero";
import { SubmissionBrowser } from "@/components/home/SubmissionBrowser";
import { parseState } from "@/components/home/state";
import { Container } from "@/ui/Container";
import { Divider } from "@/ui/Divider";

export default async function Home({ searchParams }: PageProps<"/">) {
  const [submissions, overview, scan, sp] = await Promise.all([
    listSubmissions(),
    getOverview(),
    getScanInfo(),
    searchParams,
  ]);
  return (
    <>
      <Hero overview={overview} scanning={scan.running} />
      <Container>
        <Divider />
      </Container>
      <SubmissionBrowser submissions={submissions} initial={parseState(sp)} />
    </>
  );
}
