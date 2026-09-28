import type { Metadata } from "next";
import { ReviewBoard } from "@/components/review/ReviewBoard";
import { sortSubmissions } from "@/lib/browse";
import { listSubmissions } from "@/lib/data";
import { Container } from "@/ui/Container";
import { LiveRefresh } from "@/ui/LiveRefresh";

export const metadata: Metadata = {
  title: "Review",
  description: "Every submission ranked by score, with a live preview of the selected one.",
};

export default async function ReviewPage() {
  const ranked = sortSubmissions(await listSubmissions(), "score");

  return (
    <Container>
      <LiveRefresh />
      <ReviewBoard submissions={ranked} description={`${ranked.length} submissions, best score first.`} />
    </Container>
  );
}
