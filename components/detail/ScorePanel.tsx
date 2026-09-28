import type { Score } from "@/lib/types";
import { Label } from "@/ui/Label";
import { ScoreBar } from "@/ui/ScoreBar";

export function ScorePanel({ score }: { score: Score | null }) {
  return (
    <section aria-labelledby="score-title" className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <Label id="score-title" className="text-ink-muted">
          Score
        </Label>
        <span className="font-mono text-2xl font-medium text-ink tabular-nums">
          {score ? score.total.toFixed(1) : "-"}
          <span className="text-base text-ink-muted">/5</span>
        </span>
      </div>
      {score ? (
        <div className="mt-5 flex flex-col gap-3.5">
          <ScoreBar label="Boots" value={score.boots} />
          <ScoreBar label="Works" value={score.works} />
          <ScoreBar label="Uses Solari" value={score.usesSolari} />
          <ScoreBar label="Use case" value={score.useCase} />
          <ScoreBar label="Polish" value={score.polish} />
        </div>
      ) : (
        <p className="mt-5 text-sm text-ink-muted">Scored after the next run finishes.</p>
      )}
    </section>
  );
}
