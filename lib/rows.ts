// Postgres rows (snake_case) to the shared camelCase model.
import type { Run, SdkIssue, Score, StackItem, Submission } from "./types";

type Row = Record<string, unknown>;

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

export function toSubmission(r: Row): Submission {
  return {
    owner: r.owner as string,
    repo: r.repo as string,
    forkNumber: r.fork_number as number,
    title: (r.title as string) || (r.repo as string),
    description: (r.description as string) ?? "",
    repoUrl: r.repo_url as string,
    commitSha: (r.commit_sha as string) ?? null,
    status: r.status as Submission["status"],
    projectType: r.project_type as Submission["projectType"],
    stack: (r.stack as StackItem[]) ?? [],
    productsUsed: (r.products_used as Submission["productsUsed"]) ?? [],
    demoProduct: (r.demo_product as Submission["demoProduct"]) ?? null,
    bootMs: (r.boot_ms as number) ?? null,
    score: (r.score as Score) ?? null,
    summary: (r.summary as string) ?? null,
    thumbnailUrl: (r.thumbnail_url as string) ?? null,
    previewUrl: (r.preview_url as string) ?? null,
    videoUrl: (r.video_url as string) ?? null,
    captionsUrl: (r.captions_url as string) ?? null,
    errorTail: (r.error_tail as string[]) ?? null,
    discoveredAt: iso(r.discovered_at) as string,
    scannedAt: iso(r.scanned_at),
    hidden: !!r.hidden,
  };
}

export function toRun(r: Row): Run {
  const logs = (r.logs as Partial<Run["logs"]>) ?? {};
  return {
    id: r.id as string,
    owner: r.owner as string,
    commitSha: (r.commit_sha as string) ?? null,
    status: r.status as Run["status"],
    startedAt: iso(r.started_at) as string,
    finishedAt: iso(r.finished_at),
    timings: (r.timings as Run["timings"]) ?? [],
    logs: { install: logs.install ?? "", run: logs.run ?? "", demo: logs.demo ?? "" },
    steps: (r.steps as Run["steps"]) ?? [],
    streamUrl: (r.stream_url as string) ?? null,
    vmCount: (r.vm_count as number) ?? 0,
    failureReason: (r.failure_reason as string) ?? null,
  };
}

export function toIssue(r: Row): SdkIssue {
  return {
    id: r.id as string,
    title: r.title as string,
    url: r.url as string,
    kind: r.kind as SdkIssue["kind"],
    state: r.state as SdkIssue["state"],
    openedAt: iso(r.opened_at) as string,
  };
}
