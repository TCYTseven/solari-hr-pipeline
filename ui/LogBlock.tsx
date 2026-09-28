import type { ReactNode } from "react";
import { cx } from "./cx";

// Line tokenizer for build logs, colored with the syntax palette from
// getsolari.com's code sample (keywords purple, identifiers blue, strings
// green, numbers and warnings amber, comments muted).
const TOKEN =
  /("[^"]*"|'[^']*'|`[^`]*`)|(\b(?:import|export|const|let|await|async|function|return|new|def|class|raise|throw|lambda|yield|try|catch|finally)\b)|(\b\d+(?:\.\d+)?(?:ms|s|m|kB|MB|GB|%)?\b)|([A-Za-z_$][\w$]*(?=\())/g;

function highlight(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const [tok, str, kw, num, fn] = m;
    const color = str
      ? "var(--syn-string)"
      : kw
        ? "var(--syn-keyword)"
        : num
          ? "var(--syn-number)"
          : fn
            ? "var(--syn-fn)"
            : undefined;
    out.push(
      <span key={i++} style={{ color }}>
        {tok}
      </span>,
    );
    last = start + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Index of a trailing `//` comment that isn't inside a string or a URL, or -1. */
function commentStart(line: string): number {
  let quote: string | null = null;
  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote && line[i - 1] !== "\\") quote = null;
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
    } else if (c === "/" && line[i + 1] === "/" && line[i - 1] !== ":") {
      return i;
    }
  }
  return -1;
}

function Line({ line, code }: { line: string; code: boolean }) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("$ ")) {
    const [cmd, ...rest] = trimmed.slice(2).split(" ");
    return (
      <>
        <span style={{ color: "var(--syn-comment)" }}>$ </span>
        <span style={{ color: "var(--syn-fn)" }}>{cmd}</span>
        {rest.length > 0 && <> {highlight(rest.join(" "))}</>}
      </>
    );
  }
  if (/^(#|\/\/|>)/.test(trimmed)) return <span style={{ color: "var(--syn-comment)" }}>{line}</span>;
  if (code) {
    const cut = commentStart(line);
    return cut >= 0 ? (
      <>
        {highlight(line.slice(0, cut))}
        <span style={{ color: "var(--syn-comment)" }}>{line.slice(cut)}</span>
      </>
    ) : (
      <>{highlight(line)}</>
    );
  }
  if (/\b(error|ERR!|failed|fatal|exception|traceback|cannot find|not found|ENOENT|exit code [1-9])/i.test(line))
    return <span style={{ color: "var(--fail)" }}>{line}</span>;
  if (/\b(warn(ing)?|deprecated|timeout|timed out|missing)\b/i.test(line))
    return <span style={{ color: "var(--syn-number)" }}>{line}</span>;
  const cut = commentStart(line);
  if (cut > 0)
    return (
      <>
        {highlight(line.slice(0, cut))}
        <span style={{ color: "var(--syn-comment)" }}>{line.slice(cut)}</span>
      </>
    );
  return <>{highlight(line)}</>;
}

/**
 * Build-log viewer: teal-tinted surface, 1px teal border, 10px radius, 16px
 * padding, JetBrains Mono 13px with 1.6 line height, horizontal scroll.
 */
export function LogBlock({
  text,
  lines,
  className,
  tone = "default",
  label,
  maxHeight,
  mode = "log",
}: {
  text?: string;
  lines?: string[];
  className?: string;
  /** "fail" renders every line in the failure color (card error tails). */
  tone?: "default" | "fail";
  label?: string;
  maxHeight?: number;
  /** "code" skips the log heuristics (error/warning lines) and only highlights syntax. */
  mode?: "log" | "code";
}) {
  const all = lines ?? (text ?? "").replace(/\n$/, "").split("\n");
  return (
    <pre
      aria-label={label}
      tabIndex={0}
      className={cx(
        "overflow-auto rounded-card border border-teal-700 bg-teal-900 p-4 font-mono text-[13px] font-normal leading-[1.6] tracking-normal",
        className,
      )}
      style={{ color: tone === "fail" ? "var(--fail)" : "var(--syn-plain)", maxHeight }}
    >
      <code>
        {all.map((line, i) => (
          <span key={i} className="block min-h-[1.6em] whitespace-pre">
            {tone === "fail" ? line : <Line line={line} code={mode === "code"} />}
          </span>
        ))}
      </code>
    </pre>
  );
}
