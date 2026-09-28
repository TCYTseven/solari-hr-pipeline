import { timingSafeEqual } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewBoard } from "@/components/review/ReviewBoard";
import { sortSubmissions } from "@/lib/browse";
import { listSubmissions } from "@/lib/data";
import { Container } from "@/ui/Container";
import { LiveRefresh } from "@/ui/LiveRefresh";


function keyMatches(given: string | undefined): boolean {
  const expected = process.env.REVIEW_KEY;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function generateMetadata({ searchParams }: PageProps<"/review">): Promise<Metadata> {
  const sp = await searchParams;
  const key = Array.isArray(sp.key) ? sp.key[0] : sp.key;
  return {
    // Same title as any other 404 when the key is wrong.
    title: keyMatches(key) ? "Review" : "Not found",
    robots: { index: false, follow: false, nocache: true },
    // The key is in the URL; don't hand it to other sites in the Referer header.
    referrer: "no-referrer",
  };
}

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const sp = await searchParams;
  const key = Array.isArray(sp.key) ? sp.key[0] : sp.key;
  // A wrong or missing key looks exactly like a page that doesn't exist.
  if (!keyMatches(key)) notFound();

  const ranked = sortSubmissions(await listSubmissions(), "score");

  return (
    <Container>
      <LiveRefresh />
      <ReviewBoard
        submissions={ranked}
        description={`${ranked.length} submissions, best score first. Private and not indexed; share this link only with reviewers.`}
      />
    </Container>
  );
}
