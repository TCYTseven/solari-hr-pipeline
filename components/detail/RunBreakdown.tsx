import { formatStage } from "@/lib/format";
import { STAGES, type StageTiming } from "@/lib/types";

const HEAD: Record<(typeof STAGES)[number], string> = {
  create: "Create",
  clone: "Clone",
  install: "Install",
  boot: "Boot",
  demo: "Demo",
  release: "Release",
};

/** Per-run timing table, after getsolari.com's "Full Latency Breakdown". */
export function RunBreakdown({ timings }: { timings: StageTiming[] }) {
  if (timings.length === 0) return <p className="text-sm text-ink-muted">No stages ran.</p>;
  return (
    <div className="overflow-x-auto rounded-card border border-line" tabIndex={0} role="region" aria-label="Run breakdown table">
      <table className="w-full min-w-[720px] border-collapse font-mono text-sm tabular-nums">
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
            <th scope="col" className="px-4 py-3 font-semibold">Stage</th>
            {STAGES.map((s) => (
              <th key={s} scope="col" className="px-4 py-3 text-right font-semibold">
                {HEAD[s]}
              </th>
            ))}
            <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {timings.map((t) => {
            const total = STAGES.reduce((sum, s) => sum + (t[s] ?? 0), 0);
            return (
              <tr key={t.surface} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-4 py-3 text-left font-medium text-ink-body">
                  {t.surface}
                </th>
                {STAGES.map((s) => (
                  <td key={s} className="px-4 py-3 text-right text-ink-body">
                    {formatStage(t[s])}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-medium text-ink">{formatStage(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
