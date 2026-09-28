import { timingSafeEqual } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReviewBoard } from "@/components/review/ReviewBoard";
import { listSubmissions } from "@/lib/data";
import { Container } from "@/ui/Container";
import { Label } from "@/ui/Label";
import { LiveRefresh } from "@/ui/LiveRefresh";

export const metadata: Metadata = {
  title: "Review",
  robots: { index: false, follow: false, nocache: true },
  // The key is in the URL; don't hand it to other sites in the Referer header.
  referrer: "no-referrer",
};

function keyMatches(given: string | undefined): boolean {
  const expected = process.env.REVIEW_KEY;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function ReviewPage({ searchParams }: PageProps<"/review">) {
  const sp = await searchParams;
  const key = Array.isArray(sp.key) ? sp.key[0] : sp.key;
  // A wrong or missing key looks exactly like a page that doesn't exist.
  if (!keyMatches(key)) notFound();

  const subs = await listSubmissions();
  const ranked = [...subs].sort(
    (a, b) =>
      (b.score?.total ?? -1) - (a.score?.total ?? -1) ||
      Number(b.status === "booted") - Number(a.status === "booted") ||
      a.forkNumber - b.forkNumber,
  );

  return (
    <Container className="pb-24 pt-12 md:pt-16">
      <LiveRefresh />
      <Label className="text-accent">Private review</Label>
      <h1 className="mt-3 font-display text-[28px] font-medium leading-[1.2] tracking-[-0.03em] text-ink md:text-4xl">
        Submissions by score
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        {ranked.length} submissions. Not indexed; share this link only with people reviewing.
      </p>
      <div className="mt-10">
        <ReviewBoard submissions={ranked} />
      </div>
    </Container>
  );
}
