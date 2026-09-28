import { ButtonLink } from "@/ui/Button";
import { Container } from "@/ui/Container";
import { PageHeader } from "@/ui/PageHeader";

export default function NotFound() {
  return (
    <Container>
      <PageHeader
        title="Nothing here"
        description="That submission doesn't exist, or its owner asked for it to be removed."
      />
      <ButtonLink href="/" variant="ghost" size="sm">
        ← Back to submissions
      </ButtonLink>
    </Container>
  );
}
