// Local workspace per fork: fetch it next to an upstream mirror, find what the
// candidate changed, pick the project directory, and gather triage context.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { GIT_ENV, type ForkRef, upstreamRef } from "./discover";
import { mustRun, runProc } from "./util";

export interface FileChange {
  /** git name-status letter: A, M, D, R, C, T */
  status: string;
  path: string;
}

export interface Workspace {
  dir: string;
  /** Commit being screened. */
  sha: string;
  /** Branch (or "upstream PR #N") the commit came from. */
  branch: string;
  defaultBranch: string | null;
  defaultSha: string | null;
  source: "default" | "branch" | "upstream-pr";
  /** Where a remote VM can `git clone` the commit from, or null when only local. */
  sourceUrl: string | null;
  baseSha: string | null;
  changes: FileChange[];
  projectDir: string;
}

const git = (dir: string, args: string[], timeoutMs = 300_000) =>
  mustRun("git", ["-C", dir, ...args], { env: GIT_ENV, timeoutMs });
const gitTry = (dir: string, args: string[], timeoutMs = 120_000) =>
  runProc("git", ["-C", dir, ...args], { env: GIT_ENV, timeoutMs });

let mirrorPromise: Promise<{ dir: string; defaultBranch: string }> | null = null;

/** Full bare mirror of the upstream, shared by every fork workspace. */
export function ensureUpstreamMirror(): Promise<{ dir: string; defaultBranch: string }> {
  mirrorPromise ??= (async () => {
    const up = upstreamRef();
    const dir = path.join(path.dirname(config.workDir), "upstream.git");
    if (!fs.existsSync(path.join(dir, "HEAD"))) {
      fs.mkdirSync(path.dirname(dir), { recursive: true });
      await mustRun("git", ["clone", "--bare", "--quiet", up.cloneUrl, dir], { env: GIT_ENV, timeoutMs: 600_000 });
    } else {
      await git(dir, ["fetch", "--quiet", "--prune", "origin", "+refs/heads/*:refs/heads/*"]);
    }
    const head = await gitTry(dir, ["symbolic-ref", "--short", "HEAD"]);
    const defaultBranch = head.code === 0 ? head.stdout.trim() : "main";
    return { dir, defaultBranch };
  })().catch((err) => {
    mirrorPromise = null;
    throw err;
  });
  return mirrorPromise;
}

/** Parse `git diff --name-status` output. Renames report the new path. */
export function parseNameStatus(out: string): FileChange[] {
  const changes: FileChange[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = (parts[0] ?? "").charAt(0);
    const p = parts[parts.length - 1];
    if (status && p) changes.push({ status, path: p });
  }
  return changes;
}

const NOISE = /^(readme(\.[a-z]+)?|license(\.[a-z]+)?|\.gitignore|\.gitattributes|\.editorconfig|package-lock\.json|contributing\.md|\.github\/.*)$/i;

const MANIFEST_FILE = /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|setup\.py|Cargo\.toml|go\.mod|deno\.json|Gemfile)$/;
const VENDORED = /(^|\/)(node_modules|\.venv|venv|dist|build|__pycache__)\//;

/**
 * Pick the directory holding the candidate's project from the changed files.
 * 1. Directories where the candidate added or changed a manifest (package.json,
 *    pyproject.toml, ...): the one owning the most changed files wins (a file
 *    belongs to its deepest manifest directory).
 * 2. Otherwise the cookbook layout (`applications/<x>/`, `examples/<x>/`), then
 *    the top-level directory with the most changes; root-only changes give ".".
 */
export function deriveProjectDir(changes: FileChange[]): string {
  const live = changes.filter((c) => c.status !== "D" && !VENDORED.test(c.path)).map((c) => c.path);
  const manifestDirs = [...new Set(live.filter((p) => MANIFEST_FILE.test(p)).map((p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ".")))];
  if (manifestDirs.length) {
    const owned = new Map<string, number>(manifestDirs.map((d) => [d, 0]));
    const byDepth = [...manifestDirs].sort((a, b) => b.split("/").length - a.split("/").length || b.length - a.length);
    for (const p of live) {
      const owner = byDepth.find((d) => d === "." || p.startsWith(`${d}/`));
      if (owner) owned.set(owner, owned.get(owner)! + 1);
    }
    const best = [...owned.entries()].sort((a, b) => b[1] - a[1] || a[0].split("/").length - b[0].split("/").length || a[0].localeCompare(b[0]))[0]!;
    return best[0];
  }
  const counts = new Map<string, number>();
  for (const p of live) {
    const seg = p.split("/");
    let key: string;
    if (seg.length >= 3 && (seg[0] === "applications" || seg[0] === "examples")) key = `${seg[0]}/${seg[1]}`;
    else if (seg.length >= 2) key = seg[0]!;
    else key = ".";
    if (key === "." && NOISE.test(p)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return ".";
  const ranked = [...counts.entries()].sort((a, b) => {
    const cookA = /^(applications|examples)\//.test(a[0]) ? 1 : 0;
    const cookB = /^(applications|examples)\//.test(b[0]) ? 1 : 0;
    if (a[0] === "." && b[0] !== ".") return 1;
    if (b[0] === "." && a[0] !== ".") return -1;
    return b[1] - a[1] || cookB - cookA || a[0].localeCompare(b[0]);
  });
  return ranked[0]![0];
}

/** Find `Merge pull request #N from <owner>/...` merges in the upstream log. */
export function findUpstreamPrMerges(log: string, owner: string): { merge: string; parents: string[]; pr: string }[] {
  const out: { merge: string; parents: string[]; pr: string }[] = [];
  const re = new RegExp(`^Merge pull request #(\\d+) from ${owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "i");
  for (const line of log.split("\n")) {
    const [merge, parents, subject] = line.split("\x1f");
    if (!merge || !parents || !subject) continue;
    const m = re.exec(subject);
    if (m) out.push({ merge, parents: parents.split(" "), pr: m[1]! });
  }
  return out;
}

async function diffChanges(dir: string, base: string | null, sha: string, upstreamTip: string): Promise<FileChange[]> {
  const from = base ?? upstreamTip;
  const r = await git(dir, ["diff", "--name-status", "-M", "--no-color", from, sha]);
  return parseNameStatus(r.stdout);
}

async function mergeBase(dir: string, a: string, b: string): Promise<string | null> {
  const r = await gitTry(dir, ["merge-base", a, b]);
  return r.code === 0 ? r.stdout.trim() || null : null;
}

export async function prepareWorkspace(fork: ForkRef, defaultBranch: string | null, defaultSha: string | null): Promise<Workspace> {
  const mirror = await ensureUpstreamMirror();
  const dir = path.join(config.workDir, fork.owner);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(path.join(dir, ".git"))) await git(dir, ["init", "--quiet"]);
  for (const [name, url] of [["fork", fork.cloneUrl], ["upstream", mirror.dir]] as const) {
    const has = await gitTry(dir, ["remote", "get-url", name]);
    await git(dir, has.code === 0 ? ["remote", "set-url", name, url] : ["remote", "add", name, url]);
  }
  await git(dir, ["fetch", "--quiet", "--no-tags", "--prune", "upstream", "+refs/heads/*:refs/remotes/upstream/*"]);
  await git(dir, ["fetch", "--quiet", "--no-tags", "--prune", "fork", "+refs/heads/*:refs/remotes/fork/*"], 900_000);

  const upstreamTip = `refs/remotes/upstream/${mirror.defaultBranch}`;
  const branches = (await git(dir, ["for-each-ref", "--format=%(refname:strip=3)\x1f%(objectname)\x1f%(committerdate:unix)", "refs/remotes/fork/"]))
    .stdout.split("\n")
    .filter(Boolean)
    .map((l) => {
      const [name, sha, ts] = l.split("\x1f");
      return { name: name!, sha: sha!, ts: Number(ts) };
    })
    .filter((b) => b.name !== "HEAD");

  const defName = defaultBranch ?? branches.find((b) => b.sha === defaultSha)?.name ?? branches[0]?.name ?? null;
  const defSha = defaultSha ?? branches.find((b) => b.name === defName)?.sha ?? null;
  if (!defSha) throw new Error("fork has no branches");

  let pick: { sha: string; branch: string; source: Workspace["source"]; base: string | null; changes: FileChange[]; sourceUrl: string | null } | null = null;

  const tryCommit = async (sha: string) => {
    const base = await mergeBase(dir, sha, upstreamTip);
    const changes = await diffChanges(dir, base, sha, upstreamTip);
    return { base, changes };
  };

  const def = await tryCommit(defSha);
  if (def.changes.length > 0) {
    pick = { sha: defSha, branch: defName ?? "HEAD", source: "default", ...def, sourceUrl: fork.local ? null : fork.cloneUrl };
  } else {
    // Default branch equals upstream: the work may be on a feature branch.
    // (A branch already merged upstream diffs empty here; the PR fallback below covers it.)
    const others = branches.filter((b) => b.sha !== defSha).sort((a, b) => b.ts - a.ts);
    for (const b of others) {
      const r = await tryCommit(b.sha);
      if (r.changes.length > 0) {
        pick = { sha: b.sha, branch: b.name, source: "branch", ...r, sourceUrl: fork.local ? null : fork.cloneUrl };
        break;
      }
    }
  }

  if (!pick) {
    // Work merged upstream through a PR and the branch is gone: screen the PR head.
    const log = await git(dir, ["log", "--merges", "--format=%H\x1f%P\x1f%s", upstreamTip]);
    const prs = findUpstreamPrMerges(log.stdout, fork.owner);
    for (const pr of prs) {
      const [p1, p2] = pr.parents;
      if (!p1 || !p2) continue;
      const base = await mergeBase(dir, p1, p2);
      const changes = await diffChanges(dir, base, p2, upstreamTip);
      if (changes.length > 0) {
        pick = { sha: p2, branch: `upstream PR #${pr.pr}`, source: "upstream-pr", base, changes, sourceUrl: upstreamRef().cloneUrl };
        break;
      }
    }
  }

  const chosen = pick ?? { sha: defSha, branch: defName ?? "HEAD", source: "default" as const, base: def.base, changes: [], sourceUrl: fork.local ? null : fork.cloneUrl };
  await git(dir, ["-c", "advice.detachedHead=false", "checkout", "--quiet", "--force", chosen.sha]);
  await git(dir, ["clean", "-fdxq"]);

  let projectDir = deriveProjectDir(chosen.changes);
  if (projectDir !== "." && !fs.existsSync(path.join(dir, projectDir))) projectDir = ".";

  return {
    dir,
    sha: chosen.sha,
    branch: chosen.branch,
    defaultBranch: defName,
    defaultSha: defSha,
    source: chosen.source,
    sourceUrl: chosen.sourceUrl,
    baseSha: chosen.base,
    changes: chosen.changes,
    projectDir,
  };
}

/** Tar stream of the screened commit (what executors copy into the sandbox). */
export async function archiveCommit(ws: Workspace): Promise<Buffer> {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", ws.dir, "archive", "--format=tar", "--prefix=repo/", ws.sha], { env: GIT_ENV });
    const chunks: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`git archive failed: ${err.trim()}`))));
  });
}

// ---------------------------------------------------------------------------
// Triage context

const SKIP_DIRS = /(^|\/)(node_modules|\.venv|venv|dist|build|\.next|__pycache__|\.git|coverage|\.turbo|\.cache)(\/|$)/;
const MANIFESTS = [
  "package.json", "requirements.txt", "pyproject.toml", "setup.py", "Pipfile", ".env.example", ".env.sample",
  ".env.template", "Dockerfile", "docker-compose.yml", "Makefile", "Procfile", "deno.json", "go.mod", "Cargo.toml",
  "Gemfile", ".nvmrc", ".python-version", "vite.config.ts", "vite.config.js", "next.config.js", "next.config.ts",
];
const ENTRY_CANDIDATES = [
  "main.py", "app.py", "server.py", "__main__.py", "cli.py", "run.py", "index.ts", "index.js", "index.mjs",
  "server.ts", "server.js", "server.mjs", "main.ts", "main.js", "app.ts", "app.js", "src/index.ts", "src/index.js",
  "src/main.ts", "src/main.py", "src/server.ts", "src/app.ts", "src/cli.ts", "index.html", "public/index.html",
  "app/page.tsx", "src/App.tsx", "streamlit_app.py",
];

function readCapped(file: string, max: number): string | null {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return null;
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(Math.min(st.size, max));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (buf.includes(0)) return null; // binary
    const text = buf.toString("utf8");
    return st.size > max ? `${text}\n... (truncated, ${st.size} bytes total)` : text;
  } catch {
    return null;
  }
}

function headLines(text: string, n: number): string {
  const lines = text.split("\n");
  return lines.length > n ? `${lines.slice(0, n).join("\n")}\n... (${lines.length - n} more lines)` : text;
}

function listFiles(root: string, rel: string, limit: number): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    if (out.length >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, d), { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const p = d ? `${d}/${e.name}` : e.name;
      if (SKIP_DIRS.test(p)) continue;
      if (e.isDirectory()) walk(p);
      else if (out.length < limit) out.push(p);
      else return;
    }
  };
  walk(rel === "." ? "" : rel);
  return out;
}

export interface TriageContext {
  text: string;
  files: string[];
}

/** Build the (size-capped) text Claude sees for triage and code-based scoring. */
export function collectContext(ws: Workspace, budget = 60_000): TriageContext {
  const proj = ws.projectDir;
  const projAbs = path.join(ws.dir, proj);
  const files = listFiles(ws.dir, proj, 300);
  const sections: string[] = [];
  const add = (title: string, body: string) => {
    const used = sections.reduce((n, s) => n + s.length, 0);
    if (used >= budget) return;
    const room = budget - used - title.length - 32;
    const text = body.length > room ? `${body.slice(0, Math.max(0, room))}\n... (truncated)` : body;
    sections.push(`=== ${title} ===\n${text}\n`);
  };

  const changeList = ws.changes
    .slice(0, 150)
    .map((c) => `${c.status} ${c.path}`)
    .join("\n");
  add(
    "CHANGES VS UPSTREAM",
    `Screened ${ws.source === "default" ? "default branch" : ws.branch} at ${ws.sha.slice(0, 7)}. ${ws.changes.length} files changed.\n${changeList}${ws.changes.length > 150 ? "\n..." : ""}`,
  );
  add(`FILE TREE (${proj})`, files.map((f) => (proj === "." ? f : path.relative(proj, f))).join("\n"));

  const readmeName = fs.existsSync(projAbs) ? fs.readdirSync(projAbs).find((f) => /^readme(\.(md|rst|txt))?$/i.test(f)) : undefined;
  const readme = readmeName ? readCapped(path.join(projAbs, readmeName), 10_000) : null;
  if (readme) add(`README (${path.join(proj, readmeName!)})`, readme);
  else {
    const rootChanged = ws.changes.some((c) => /^readme\.md$/i.test(c.path));
    const root = rootChanged ? readCapped(path.join(ws.dir, "README.md"), 6_000) : null;
    if (root) add("ROOT README (changed by candidate)", root);
  }

  for (const m of MANIFESTS) {
    const t = readCapped(path.join(projAbs, m), 4_000);
    if (t) add(`MANIFEST ${m}`, t);
  }

  const entries = new Set<string>();
  const pkg = readCapped(path.join(projAbs, "package.json"), 20_000);
  if (pkg) {
    try {
      const j = JSON.parse(pkg) as { main?: string; bin?: string | Record<string, string>; scripts?: Record<string, string> };
      if (j.main) entries.add(j.main);
      if (typeof j.bin === "string") entries.add(j.bin);
      else if (j.bin) Object.values(j.bin).forEach((b) => entries.add(b));
      for (const s of Object.values(j.scripts ?? {})) {
        for (const m of s.matchAll(/([\w./-]+\.(?:ts|js|mjs|cjs|py|tsx))/g)) entries.add(m[1]!);
      }
    } catch {
      /* not JSON */
    }
  }
  for (const e of ENTRY_CANDIDATES) entries.add(e);
  let shown = 0;
  for (const e of entries) {
    if (shown >= 6) break;
    const t = readCapped(path.join(projAbs, e.replace(/^\.\//, "")), 12_000);
    if (!t) continue;
    add(`ENTRY FILE ${path.join(proj, e)} (head)`, headLines(t, 90));
    shown++;
  }

  // Where the code touches Solari, so product usage can be judged.
  const hits: string[] = [];
  for (const f of files) {
    if (!/\.(ts|tsx|js|mjs|cjs|py|rb|go|rs)$/.test(f) || hits.length >= 50) continue;
    const t = readCapped(path.join(ws.dir, f), 200_000);
    if (!t) continue;
    t.split("\n").forEach((line, i) => {
      if (hits.length < 50 && /solari|sandboxes\.|desktops\.|previewUrl|\.launch\(|computer/i.test(line)) {
        hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 160)}`);
      }
    });
  }
  if (hits.length) add("SOLARI-RELATED LINES", hits.join("\n"));

  return { text: sections.join("\n"), files };
}
