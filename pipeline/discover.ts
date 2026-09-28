// Fork discovery: GitHub REST (paginated) or an explicit list, plus
// `git ls-remote` to learn each fork's branches without cloning.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { runProc } from "./util";

export interface ForkRef {
  /** Fork owner login (or a local test name). The submissions key. */
  owner: string;
  repo: string;
  /** What `git clone` takes: an https URL or an absolute local path. */
  cloneUrl: string;
  /** Link shown on the dashboard. */
  repoUrl: string;
  local: boolean;
}

export interface RemoteHeads {
  /** Default branch name (from the HEAD symref). */
  defaultBranch: string | null;
  /** Default branch HEAD sha. */
  headSha: string | null;
  heads: { name: string; sha: string }[];
}

export const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "echo",
  GCM_INTERACTIVE: "never",
};

/** Sanitize a name for use as an owner key and a directory name. */
export function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80) || "fork";
}

/**
 * Parse one entry of `--forks` / SCREENER_FORKS:
 *   owner/repo | https://github.com/owner/repo(.git) | git@github.com:owner/repo.git
 *   /abs/or/./relative/path | name=<any of the above>
 */
export function parseForkSpec(specRaw: string, cwd = process.cwd()): ForkRef {
  let spec = specRaw.trim();
  let nameOverride: string | undefined;
  const named = /^([A-Za-z0-9._-]+)=(.+)$/.exec(spec);
  if (named && !/^[a-z]+:\/\//i.test(spec)) {
    nameOverride = named[1];
    spec = named[2]!.trim();
  }

  const gh = /^(?:https?:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(spec);
  if (gh) {
    const [, owner, repo] = gh;
    return {
      owner: nameOverride ?? owner!,
      repo: repo!,
      cloneUrl: `https://github.com/${owner}/${repo}`,
      repoUrl: `https://github.com/${owner}/${repo}`,
      local: false,
    };
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(spec)) {
    const u = new URL(spec);
    const parts = u.pathname.replace(/\.git\/?$/, "").split("/").filter(Boolean);
    const repo = parts[parts.length - 1] ?? "repo";
    const owner = parts[parts.length - 2] ?? u.hostname;
    const clean = spec.replace(/\.git\/?$/, "");
    return { owner: nameOverride ?? safeName(owner), repo, cloneUrl: spec, repoUrl: clean, local: false };
  }

  const looksLocal = /^(\/|\.\.?\/|~\/)/.test(spec) || fs.existsSync(path.resolve(cwd, spec));
  if (!looksLocal && /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(spec)) {
    const [owner, repo] = spec.split("/") as [string, string];
    const clean = repo.replace(/\.git$/, "");
    return {
      owner: nameOverride ?? owner,
      repo: clean,
      cloneUrl: `https://github.com/${owner}/${clean}`,
      repoUrl: `https://github.com/${owner}/${clean}`,
      local: false,
    };
  }

  const abs = path.resolve(cwd, spec.replace(/^~(?=\/)/, process.env.HOME ?? "~"));
  const base = path.basename(abs);
  return { owner: nameOverride ?? safeName(base), repo: base, cloneUrl: abs, repoUrl: abs, local: true };
}

export function parseForkList(list: string, cwd = process.cwd()): ForkRef[] {
  const seen = new Set<string>();
  const out: ForkRef[] = [];
  for (const part of list.split(/[,\n]/)) {
    if (!part.trim()) continue;
    const f = parseForkSpec(part, cwd);
    if (seen.has(f.owner.toLowerCase())) continue;
    seen.add(f.owner.toLowerCase());
    out.push(f);
  }
  return out;
}

/** Parse `git ls-remote --symref <url>` output. */
export function parseLsRemote(out: string): RemoteHeads {
  let defaultBranch: string | null = null;
  let headSha: string | null = null;
  const heads: { name: string; sha: string }[] = [];
  for (const line of out.split("\n")) {
    const sym = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/.exec(line.trim());
    if (sym) {
      defaultBranch = sym[1]!;
      continue;
    }
    const m = /^([0-9a-f]{40})\s+(\S+)$/.exec(line.trim());
    if (!m) continue;
    const [, sha, ref] = m;
    if (ref === "HEAD") headSha = sha!;
    else if (ref!.startsWith("refs/heads/")) heads.push({ name: ref!.slice("refs/heads/".length), sha: sha! });
  }
  if (!headSha && defaultBranch) headSha = heads.find((h) => h.name === defaultBranch)?.sha ?? null;
  return { defaultBranch, headSha, heads };
}

export async function lsRemote(cloneUrl: string): Promise<RemoteHeads> {
  const r = await runProc("git", ["ls-remote", "--symref", cloneUrl], { env: GIT_ENV, timeoutMs: 60_000 });
  if (r.code !== 0) throw new Error(`git ls-remote failed for ${cloneUrl}: ${r.stderr.trim().split("\n").pop() ?? r.code}`);
  const parsed = parseLsRemote(r.stdout);
  if (!parsed.headSha) throw new Error(`git ls-remote: no HEAD for ${cloneUrl} (empty repository?)`);
  return parsed;
}

/** Extract the `rel="next"` URL from a GitHub Link header. */
export function parseNextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (m) return m[1]!;
  }
  return null;
}

interface GitHubFork {
  name: string;
  html_url: string;
  clone_url: string;
  owner: { login: string };
}

/** Every fork of `upstream`, oldest first, via the GitHub REST API. */
export async function listGitHubForks(upstream = config.upstream, token = config.githubToken): Promise<ForkRef[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "solari-screener",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  let url: string | null = `${config.githubApi}/repos/${upstream}/forks?per_page=100&sort=oldest`;
  const out: ForkRef[] = [];
  for (let page = 0; url && page < 100; page++) {
    const res: Response = await fetch(url, { headers });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      const hint = res.status === 403 || res.status === 429 ? " (rate limited? set GITHUB_TOKEN)" : "";
      throw new Error(`GitHub API ${res.status} for ${url}${hint}: ${body}`);
    }
    const forks = (await res.json()) as GitHubFork[];
    for (const f of forks) {
      out.push({
        owner: f.owner.login,
        repo: f.name,
        cloneUrl: f.clone_url.replace(/\.git$/, ""),
        repoUrl: f.html_url,
        local: false,
      });
    }
    url = parseNextLink(res.headers.get("link"));
  }
  return out;
}

export function upstreamRef(upstream = config.upstream): ForkRef {
  return parseForkSpec(upstream);
}

/** The fork list for this scan: explicit (flag or env) or discovered on GitHub. */
export async function discoverForks(explicit?: string): Promise<ForkRef[]> {
  const list = explicit ?? config.forks;
  if (list) return parseForkList(list);
  return listGitHubForks();
}
