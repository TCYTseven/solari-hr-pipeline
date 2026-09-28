import { cx } from "@/ui/cx";

export interface BarRow {
  key: string;
  label: string;
  /** null = no data for this row yet. */
  value: number | null;
  /** Text at the bar end, e.g. "38s". */
  display: string;
  /** Extra line in the tooltip, e.g. "12 booted". */
  detail?: string;
}

/** Clean axis ticks from 0 past `v` in 1/2/5 x 10^k steps, about four intervals. */
function niceTicks(v: number, integer: boolean): number[] {
  const raw = Math.max(v, integer ? 1 : 0.001) / 4;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / exp;
  let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * exp;
  if (integer) step = Math.max(1, Math.round(step));
  const ticks = [0];
  while (ticks[ticks.length - 1] < v) ticks.push(ticks.length * step);
  return ticks;
}

/**
 * Horizontal bars in the style of getsolari.com's "fastest browser" chart:
 * dark track, mono value at the bar end, amber for the highlighted bar and
 * #3B3B3B for the rest, a faint vertical rule at each tick and no border.
 */
export function BarChart({
  rows,
  highlight,
  tickFormat,
  caption,
  valueHeader,
}: {
  rows: BarRow[];
  /** Key of the bar drawn in amber. */
  highlight: string | null;
  tickFormat: (v: number) => string;
  caption: string;
  valueHeader: string;
}) {
  const integer = rows.every((r) => r.value == null || Number.isInteger(r.value));
  // Headroom so the value label at the longest bar's end stays inside the plot.
  const ticks = niceTicks(Math.max(0, ...rows.map((r) => r.value ?? 0)) * 1.18, integer);
  const max = ticks[ticks.length - 1];

  return (
    <figure className="m-0">
      <div className="relative" aria-hidden>
        <div className="flex flex-col gap-3">
          {rows.map((r) => {
            const pct = r.value == null ? 0 : (r.value / max) * 100;
            const hot = r.key === highlight;
            return (
              <div key={r.key} className="grid grid-cols-[104px_1fr] items-center gap-4 md:grid-cols-[120px_1fr]">
                <span className="truncate font-mono text-xs uppercase tracking-[0.04em] text-ink-muted">{r.label}</span>
                <div className="relative h-7">
                  {/* tick rules */}
                  {ticks.slice(1).map((t) => (
                    <span
                      key={t}
                      className="absolute inset-y-[-6px] w-px"
                      style={{ left: `${(t / max) * 100}%`, background: "rgba(255,255,255,0.04)" }}
                    />
                  ))}
                  <div className="absolute inset-y-0 left-0 right-0 rounded-r-[4px] bg-surface" />
                  {r.value == null ? (
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-muted">no data yet</span>
                  ) : (
                    <div
                      className="group absolute inset-y-0 left-0 flex items-center"
                      style={{ width: `${Math.max(pct, 0.6)}%` }}
                    >
                      <span
                        className={cx(
                          "h-5 w-full rounded-r-[4px] transition-opacity duration-150 group-hover:opacity-85",
                          hot ? "bg-accent" : "bg-[#3B3B3B]",
                        )}
                      />
                      <span className="absolute left-full ml-2 whitespace-nowrap font-mono text-[13px] text-ink tabular-nums">
                        {r.display}
                      </span>
                      {/* Hover detail. Every value is also printed at the bar end and in the table below. */}
                      <span
                        className="pointer-events-none absolute bottom-full left-full z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-btn border border-line-strong bg-raised px-2.5 py-1.5 font-mono text-xs text-ink-body group-hover:block"
                      >
                        {r.label}: <span className="text-ink">{r.display}</span>
                        {r.detail && <span className="text-ink-muted"> · {r.detail}</span>}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {/* x axis */}
        <div className="mt-2 grid grid-cols-[104px_1fr] gap-4 md:grid-cols-[120px_1fr]">
          <span />
          <div className="relative h-4">
            {ticks.map((t, i) => (
              <span
                key={t}
                className={cx(
                  "absolute font-mono text-xs text-ink-muted tabular-nums",
                  i === 0 ? "left-0" : i === ticks.length - 1 ? "right-0" : "-translate-x-1/2",
                )}
                style={i === 0 || i === ticks.length - 1 ? undefined : { left: `${(t / max) * 100}%` }}
              >
                {tickFormat(t)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">{valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              <td>
                {r.value == null ? "no data" : r.display}
                {r.detail ? ` (${r.detail})` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
