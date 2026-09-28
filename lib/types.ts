// Shared data model for the dashboard, the database layer and the pipeline.

export type Product = "browser" | "sandbox" | "desktop";
export const PRODUCTS: Product[] = ["browser", "sandbox", "desktop"];

export type Status =
  | "queued"
  | "running"
  | "booted"
  | "build_failed"
  | "timeout"
  | "needs_secrets"
  | "skipped"
  | "opted_out";

export type ProjectType = "web" | "desktop_agent" | "browser_agent" | "cli";

export interface StackItem {
  /** simple-icons slug, e.g. "python" or "nodedotjs" */
  slug: string;
  /** Human name used for alt text, e.g. "Python" */
  name: string;
}

export interface Score {
  boots: number;
  works: number;
  usesSolari: number;
  useCase: number;
  polish: number;
  /** Mean of the five criteria, one decimal. */
  total: number;
}

export interface Submission {
  /** Fork owner login. Also the URL key: /s/[owner]. */
  owner: string;
  repo: string;
  /** Order the fork was discovered in, shown as FORK 017. */
  forkNumber: number;
  title: string;
  description: string;
  repoUrl: string;
  commitSha: string | null;
  status: Status;
  projectType: ProjectType;
  stack: StackItem[];
  /** Solari products the code uses. */
  productsUsed: Product[];
  /** Product the demo actually ran on. */
  demoProduct: Product | null;
  bootMs: number | null;
  score: Score | null;
  summary: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  videoUrl: string | null;
  captionsUrl: string | null;
  /** Last lines of the error log for failed builds. */
  errorTail: string[] | null;
  discoveredAt: string;
  scannedAt: string | null;
  hidden: boolean;
}

export type StageName = "create" | "clone" | "install" | "boot" | "demo" | "release";
export const STAGES: StageName[] = ["create", "clone", "install", "boot", "demo", "release"];

export interface StageTiming {
  surface: "Sandbox" | "Browser" | "Desktop" | "Local sandbox" | "Local browser";
  create: number | null;
  clone: number | null;
  install: number | null;
  boot: number | null;
  demo: number | null;
  release: number | null;
}

export type DemoAction =
  | "navigate"
  | "click"
  | "type"
  | "key"
  | "scroll"
  | "wait"
  | "screenshot"
  | "command"
  | "done";

export interface DemoStep {
  /** Seconds into the demo video. */
  t: number;
  action: DemoAction;
  /** Short caption, e.g. "Clicked Add Store". */
  label: string;
  /** The agent's reasoning for this step. */
  reasoning: string;
}

export type LogTab = "install" | "run" | "demo";

export interface Run {
  id: string;
  owner: string;
  commitSha: string | null;
  status: Status;
  startedAt: string;
  finishedAt: string | null;
  timings: StageTiming[];
  logs: Record<LogTab, string>;
  steps: DemoStep[];
  /** Live desktop/browser view while the run is active. */
  streamUrl: string | null;
  vmCount: number;
  /** Build-failure category for the stats table, e.g. "Missing env var". */
  failureReason: string | null;
}

export interface SdkIssue {
  id: string;
  title: string;
  url: string;
  kind: "issue" | "pr";
  state: "open" | "closed" | "merged";
  openedAt: string;
}

export interface ScanInfo {
  lastScanAt: string | null;
  running: boolean;
}
