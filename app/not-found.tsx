import { ButtonLink } from "@/ui/Button";
import { Container } from "@/ui/Container";
import { Label } from "@/ui/Label";

export default function NotFound() {
  return (
    <Container className="py-24 md:py-32">
      <Label className="text-accent">404</Label>
      <h1 className="mt-4 font-display text-4xl font-medium tracking-[-0.03em] text-ink">Nothing here.</h1>
      <p className="mt-3 max-w-[60ch] text-ink-muted">
        That submission doesn&apos;t exist, or its owner asked for it to be removed.
      </p>
      <ButtonLink href="/" className="mt-8">
        All submissions
      </ButtonLink>
    </Container>
  );
}
