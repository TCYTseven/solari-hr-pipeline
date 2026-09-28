// Runtime configuration for the screening pipeline. Everything comes from the
// environment (loaded from .env by `tsx --env-file-if-exists=.env`).
import path from "node:path";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw == null || raw.trim() === "" ? fallback : raw.trim();
}

function opt(name: string): string | undefined {
  const raw = process.env[name];
  return raw == null || raw.trim() === "" ? undefined : raw.trim();
}

const root = process.cwd();

export const config = {
  root,
  /** Claude model for triage, the demo agent and scoring. */
  model: str("SCREENER_MODEL", "claude-sonnet-5"),
  /** `owner/repo` whose forks are screened. */
  upstream: str("SCREENER_UPSTREAM", "solari-sdk/solari-cookbook"),
  /** Comma-separated fork list that replaces GitHub discovery. */
  forks: opt("SCREENER_FORKS"),
  githubToken: opt("GITHUB_TOKEN"),
  githubApi: str("GITHUB_API_URL", "https://api.github.com"),
  databaseUrl: opt("DATABASE_URL"),
  solariApiKey: opt("SOLARI_API_KEY"),
  solariBaseUrl: opt("SOLARI_BASE_URL"),
  intervalMin: num("SCREENER_INTERVAL_MIN", 30),
  workDir: path.resolve(root, str("SCREENER_WORK_DIR", ".screener/work")),
  mediaDir: path.resolve(root, str("MEDIA_DIR", ".screener/media")),
  /** URL prefix the dashboard serves MEDIA_DIR under. */
  mediaUrlPrefix: str("MEDIA_URL_PREFIX", "/media"),
  chromiumPath: opt("CHROMIUM_PATH"),
  dockerImage: str("SCREENER_DOCKER_IMAGE", "solari-screener-sandbox:latest"),
  dockerCpus: str("SCREENER_DOCKER_CPUS", "2"),
  dockerMemory: str("SCREENER_DOCKER_MEMORY", "4g"),
  installTimeoutSec: num("SCREENER_INSTALL_TIMEOUT_SEC", 600),
  /** Upper bound for the triaged run timeout (seconds). */
  maxRunTimeoutSec: num("SCREENER_MAX_RUN_TIMEOUT_SEC", 300),
  demoMaxActions: num("SCREENER_DEMO_MAX_ACTIONS", 25),
  demoMaxSec: num("SCREENER_DEMO_MAX_SEC", 120),
  /** Port the in-guest TCP relay listens on (forwards to the app's port). */
  relayPort: 39999,
  viewport: { width: 1280, height: 800 },
  desktopResolution: { width: 1280, height: 720 },
};

export type Config = typeof config;

/** Env vars named SUBMISSION_<NAME> become <NAME> inside a submission. */
export function submissionEnv(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith("SUBMISSION_") || v == null || v === "") continue;
    const name = k.slice("SUBMISSION_".length);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) out[name] = v;
  }
  return out;
}

/** Values that must never appear in logs, captions or labels. */
export function secretValues(env: Record<string, string | undefined> = process.env): string[] {
  const names = ["ANTHROPIC_API_KEY", "SOLARI_API_KEY", "GITHUB_TOKEN", "DATABASE_URL"];
  const vals = names.map((n) => env[n]).filter((v): v is string => !!v && v.length >= 8);
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith("SUBMISSION_") && v && v.length >= 8) vals.push(v);
  }
  return vals;
}
