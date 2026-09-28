import type { ReactNode } from "react";
import { cx } from "./cx";

// Line tokenizer for build logs, colored with the syntax palette from
// getsolari.com's code sample (keywords purple, identifiers blue, strings
// green, numbers and warnings amber, comments muted).
const TOKEN =
  /("[^"]*"|'[^']*'|`[^`]*`)|(\b(?:import|export|const|let|await|async|function|return|new|def|class|raise|throw|lambda|yield)\b)|(\b\d+(?:\.\d+)?(?:ms|s|m|kB|MB|GB|%)?\b)|([A-Za-z_$][\w$]*(?=\())/g;

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

function Line({ line }: { line: string }) {
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
  if (/\b(error|ERR!|failed|fatal|exception|traceback|cannot find|not found|ENOENT|exit code [1-9])/i.test(line))
    return <span style={{ color: "var(--fail)" }}>{line}</span>;
  if (/\b(warn(ing)?|deprecated|timeout|timed out|missing)\b/i.test(line))
    return <span style={{ color: "var(--syn-number)" }}>{line}</span>;
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
}: {
  text?: string;
  lines?: string[];
  className?: string;
  /** "fail" renders every line in the failure color (card error tails). */
  tone?: "default" | "fail";
  label?: string;
  maxHeight?: number;
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
            {tone === "fail" ? line : <Line line={line} />}
          </span>
        ))}
      </code>
    </pre>
  );
}
