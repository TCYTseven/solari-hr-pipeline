// Data access for the dashboard. Pages only talk to this module.
import { MOCK_SCAN, MOCK_SUBMISSIONS, MOCK_VM_COUNTS, mockRunFor } from "./mock";
import { median } from "./metrics";
import type { Run, ScanInfo, Submission } from "./types";

export interface Overview {
  forksFound: number;
  booted: number;
  vmsLaunched: number;
  medianBootMs: number | null;
}

export async function listSubmissions(): Promise<Submission[]> {
  return MOCK_SUBMISSIONS.filter((s) => !s.hidden);
}

export async function getScanInfo(): Promise<ScanInfo> {
  return MOCK_SCAN;
}

export async function getOverview(): Promise<Overview> {
  const subs = await listSubmissions();
  const booted = subs.filter((s) => s.status === "booted");
  return {
    forksFound: subs.length,
    booted: booted.length,
    vmsLaunched: Object.values(MOCK_VM_COUNTS).reduce((a, b) => a + b, 0),
    medianBootMs: median(booted.map((s) => s.bootMs).filter((n): n is number => n != null)),
  };
}

export async function getSubmission(owner: string): Promise<{ submission: Submission; run: Run | null } | null> {
  const key = owner.toLowerCase();
  const submission = MOCK_SUBMISSIONS.find((s) => s.owner.toLowerCase() === key && !s.hidden);
  if (!submission) return null;
  return { submission, run: mockRunFor(submission) };
}
