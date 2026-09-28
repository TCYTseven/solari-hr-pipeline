import type { Score } from "@/lib/types";
import { Panel } from "@/ui/Panel";
import { ScoreBar } from "@/ui/ScoreBar";

export function ScorePanel({ score }: { score: Score | null }) {
  return (
    <Panel
      id="score"
      title="Score"
      actions={
        <span className="font-mono text-lg font-medium text-ink tabular-nums">
          {score ? score.total.toFixed(1) : "-"}
          <span className="text-sm text-ink-muted"> / 5</span>
        </span>
      }
    >
      {score ? (
        <div className="flex flex-col gap-3">
          <ScoreBar label="Boots" value={score.boots} />
          <ScoreBar label="Works" value={score.works} />
          <ScoreBar label="Uses Solari" value={score.usesSolari} />
          <ScoreBar label="Use case" value={score.useCase} />
          <ScoreBar label="Polish" value={score.polish} />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Scored after the next run finishes.</p>
      )}
    </Panel>
  );
}
