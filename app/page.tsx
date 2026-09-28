const swatches = [
  ["bg", "bg-bg"],
  ["raised", "bg-raised"],
  ["surface", "bg-surface"],
  ["teal-900", "bg-teal-900"],
  ["teal-800", "bg-teal-800"],
  ["teal-700", "bg-teal-700"],
  ["accent", "bg-accent"],
  ["accent-soft", "bg-accent-soft"],
  ["blue", "bg-blue"],
  ["ok", "bg-ok"],
  ["fail", "bg-fail"],
  ["warn", "bg-warn"],
  ["skip", "bg-skip"],
] as const;

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-content px-4 py-24 md:px-8">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.04em] text-accent">
        Design tokens
      </p>
      <h1 className="mt-3 font-display text-5xl font-medium tracking-[-0.04em] text-ink">
        Solari Screener
      </h1>
      <p className="mt-4 max-w-[60ch] text-ink-muted">
        Token check. Every swatch below comes from the Tailwind config.
      </p>
      <ul className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {swatches.map(([name, cls]) => (
          <li key={name} className="rounded-card border border-line bg-surface p-3">
            <div className={`h-12 rounded-btn border border-line ${cls}`} />
            <p className="mt-2 font-mono text-xs uppercase text-ink-muted">{name}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
