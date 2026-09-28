import { MonoAnchor } from "./MonoLink";

export function Footer() {
  const repoUrl = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/TCYTseven/solari-hr-pipeline";
  const xUrl = process.env.NEXT_PUBLIC_X_URL;
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex w-full max-w-content flex-col gap-3 px-4 py-6 text-[13px] text-ink-muted md:flex-row md:items-center md:justify-between md:px-8">
        <p>Built on Solari. Not affiliated with Pinetree Research.</p>
        <div className="flex items-center gap-5">
          <MonoAnchor href={repoUrl}>GitHub</MonoAnchor>
          {xUrl && <MonoAnchor href={xUrl}>X</MonoAnchor>}
        </div>
      </div>
    </footer>
  );
}
