// Read files from an untrusted checkout without ever leaving it. A candidate
// controls every path and symlink in their repo (and paths named in their
// package.json), so each read is contained lexically and after resolving links.
import fs from "node:fs";
import path from "node:path";

function realRoot(root: string): string | null {
  try {
    return fs.realpathSync(root);
  } catch {
    return null;
  }
}

function within(parent: string, child: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}

/**
 * The real path of `rel` inside `root`, or null when it escapes the root
 * (`..`, an absolute path, or a symlink anywhere along the way that points
 * outside), does not exist, or is not of the wanted kind.
 */
export function containedPath(root: string, rel: string, kind: "file" | "dir" = "file"): string | null {
  if (rel.includes("\0")) return null;
  const rootReal = realRoot(root);
  if (!rootReal) return null;
  const lexical = path.resolve(rootReal, rel);
  if (!within(rootReal, lexical)) return null;
  let real: string;
  try {
    real = fs.realpathSync(lexical);
  } catch {
    return null;
  }
  if (!within(rootReal, real)) return null;
  try {
    const st = fs.statSync(real);
    if (kind === "file" ? !st.isFile() : !st.isDirectory()) return null;
  } catch {
    return null;
  }
  return real;
}

/** Read up to `max` bytes of a text file inside `root`. Null for escapes, binaries and missing files. */
export function readContained(root: string, rel: string, max: number): string | null {
  const real = containedPath(root, rel, "file");
  if (!real) return null;
  let fd: number | null = null;
  try {
    fd = fs.openSync(real, "r");
    // fstat on the opened descriptor: what we read is what we checked.
    const st = fs.fstatSync(fd);
    if (!st.isFile()) return null;
    const buf = Buffer.alloc(Math.min(st.size, max));
    fs.readSync(fd, buf, 0, buf.length, 0);
    if (buf.includes(0)) return null; // binary
    const text = buf.toString("utf8");
    return st.size > max ? `${text}\n... (truncated, ${st.size} bytes total)` : text;
  } catch {
    return null;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

/** Entry names of a directory inside `root` (empty when it escapes or is missing). */
export function listContained(root: string, rel: string): fs.Dirent[] {
  const real = containedPath(root, rel, "dir");
  if (!real) return [];
  try {
    return fs.readdirSync(real, { withFileTypes: true });
  } catch {
    return [];
  }
}
