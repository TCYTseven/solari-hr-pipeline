/** 6px bar: surface track, amber fill, 2px radius. Value out of `max`. */
export function ScoreBar({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="grid grid-cols-[96px_1fr_20px] items-center gap-3">
      <span className="text-[13px] text-ink-body">{label}</span>
      <div
        className="h-1.5 rounded-[2px] bg-surface"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div className="h-full rounded-[2px] bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-right font-mono text-sm text-ink tabular-nums">{value}</span>
    </div>
  );
}
