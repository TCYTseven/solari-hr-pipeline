import { MonoAnchor } from "./MonoLink";
import { RelativeTime } from "./RelativeTime";

export function Footer({ lastScanAt }: { lastScanAt: string | null }) {
  const repoUrl = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/TCYTseven/solari-hr-pipeline";
  const xUrl = process.env.NEXT_PUBLIC_X_URL;
  return (
    <footer className="mt-auto border-t border-line bg-raised">
      <div className="mx-auto flex w-full max-w-content flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-8">
        <p className="text-[13px] text-ink-muted">
          Built on Solari. Not affiliated with Pinetree Research.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <MonoAnchor href={repoUrl}>GitHub</MonoAnchor>
          {xUrl && <MonoAnchor href={xUrl}>X</MonoAnchor>}
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
            <RelativeTime iso={lastScanAt} prefix="Last scan: " />
          </span>
        </div>
      </div>
    </footer>
  );
}
