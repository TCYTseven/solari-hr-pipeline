import type { Metadata } from "next";
import { Container } from "@/ui/Container";
import { Label } from "@/ui/Label";
import { OptOutForm } from "./OptOutForm";

export const metadata: Metadata = { title: "Opt out", description: "Remove your submission from Solari Screener." };

export default function OptOutPage() {
  return (
    <Container className="pb-24 pt-16 md:pt-24">
      <Label className="text-accent">Opt out</Label>
      <h1 className="mt-4 font-display text-[32px] font-medium leading-[1.2] tracking-[-0.03em] text-ink md:text-[44px]">
        Remove a submission
      </h1>
      <p className="mt-4 max-w-[60ch] text-base text-ink-muted">
        Want your submission removed? Enter your GitHub username. It will be hidden within 24 hours.
      </p>
      <OptOutForm />
    </Container>
  );
}
