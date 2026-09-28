// Scoring: Claude grades the submission from the code, the logs and the demo.
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { DemoStep, Score, Status } from "../lib/types";
import { MODEL, RefusalError, UNTRUSTED_NOTICE, claude } from "./claude";
import type { Triage } from "./triage";
import { errorTail } from "./util";

export const FAILURE_REASONS = [
  "Missing env var",
  "Wrong Node version",
  "Wrong Python version",
  "No run script",
  "Dependency install failed",
  "Build error",
  "Crashed on start",
  "Port never opened",
  "Timed out",
  "Demo failed",
  "Other",
] as const;

export type FailureReason = (typeof FAILURE_REASONS)[number];

export const ScoreSchema = z.object({
  boots: z.number().int().describe("1-5: installed and started cleanly"),
  works: z.number().int().describe("1-5: does what it claims in the demo/run"),
  usesSolari: z.number().int().describe("1-5: depth and correctness of Solari product usage"),
  useCase: z.number().int().describe("1-5: real-world value for Solari customers"),
  polish: z.number().int().describe("1-5: code quality, README, UX"),
  summary: z.string().describe("Two short plain-text paragraphs separated by a blank line"),
  failureReason: z.enum(FAILURE_REASONS).nullable().describe("Category for failed runs, null when the run booted"),
});

export type ScoreOutput = z.infer<typeof ScoreSchema>;

const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));

/** Clamp criteria to 1-5 and compute total = mean, one decimal. */
export function computeScore(s: Pick<ScoreOutput, "boots" | "works" | "usesSolari" | "useCase" | "polish">): Score {
  const boots = clamp(s.boots);
  const works = clamp(s.works);
  const usesSolari = clamp(s.usesSolari);
  const useCase = clamp(s.useCase);
  const polish = clamp(s.polish);
  const total = Math.round(((boots + works + usesSolari + useCase + polish) / 5) * 10) / 10;
  return { boots, works, usesSolari, useCase, polish, total };
}

/**
 * Policy caps the rubric states but the model may not apply: a project that did
 * not boot gets boots = 1, and one that was never run (missing secrets) cannot
 * score above 3 on works. The total is recomputed. Pure.
 */
export function applyStatusCaps(score: Score, status: Status): Score {
  if (status === "booted") return score;
  const works = status === "needs_secrets" ? Math.min(score.works, 3) : score.works;
  return computeScore({ ...score, boots: 1, works });
}

const SYSTEM = `You score hiring-challenge submissions for Solari (cloud browsers, sandbox microVMs and desktops behind one API key). Each submission is a project a candidate added to a fork of the Solari cookbook. An automated screener installed and ran it in a sandbox and, when it booted, had an agent demo it on camera. You grade it for a hiring manager.

${UNTRUSTED_NOTICE}

Rubric, each an integer from 1 (poor) to 5 (excellent):
- boots: installed and started cleanly. 5 = clean install and start; 3 = started with warnings or manual fixes implied; 1 = failed to install/start, or was not run.
- works: does what it claims, judged from the demo and the run output. If it was not run (for example missing secrets), judge from the code how likely it works and do not go above 3.
- usesSolari: depth and correctness of Solari product usage (browser sessions, sandboxes, desktops): real API calls, correct lifecycle (kill/release in finally, timeouts), more than a token call. 1 = no Solari usage.
- useCase: real-world value for Solari customers.
- polish: code quality, README, UX.

summary: two short paragraphs of plain text (no markdown, no bullet points), separated by a blank line. The first says what the project is and what happened when it was run and demoed, citing specific things that were observed. The second gives the main strengths and weaknesses. Refer to the candidate as "the candidate".

failureReason: pick the closest category when the run did not boot (status build_failed, timeout or needs_secrets), or "Demo failed" when it booted but the app visibly did not work. Use null for a clean boot.`;

export interface ScoreInput {
  status: Status;
  triage: Triage;
  context: string;
  installLog: string;
  runLog: string;
  steps: DemoStep[];
  demoSummary: string | null;
  missingEnv: string[];
  screenshots: Buffer[];
  notes: string[];
}

export interface ScoreResult {
  score: Score;
  summary: string;
  failureReason: FailureReason | null;
  raw: ScoreOutput;
}

function tail(text: string, lines: number): string {
  const t = errorTail(text, lines);
  return t.length ? t.join("\n") : "(empty)";
}

export async function scoreSubmission(input: ScoreInput): Promise<ScoreResult> {
  const steps = input.steps.length
    ? input.steps.map((s) => `${s.t.toFixed(1)}s ${s.action}: ${s.label}${s.reasoning && s.reasoning !== s.label ? ` (${s.reasoning})` : ""}`).join("\n")
    : "(no demo)";
  const text = `Screening result: status=${input.status}.
${input.missingEnv.length ? `Not run because these required env vars were not provided to the screener: ${input.missingEnv.join(", ")}.\n` : ""}${input.notes.map((n) => `Note: ${n}\n`).join("")}
Triage (how the screener understood the project):
${JSON.stringify(input.triage, null, 2)}

<repository>
${input.context}
</repository>

<logs>
=== INSTALL LOG (tail) ===
${tail(input.installLog, 40)}

=== RUN LOG (tail) ===
${tail(input.runLog, 40)}
</logs>

<page>
=== DEMO STEPS ===
${steps}

=== DEMO AGENT SUMMARY ===
${input.demoSummary ?? "(none)"}
</page>

${input.screenshots.length ? `The ${input.screenshots.length === 1 ? "image shows a frame" : "images show frames"} from the demo.` : "There are no demo frames."} Score the submission.`;

  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text }];
  for (const png of input.screenshots.slice(0, 2)) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } });
  }

  const msg = await claude().messages.parse({
    model: MODEL(),
    max_tokens: 8000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(ScoreSchema), effort: "medium" },
    messages: [{ role: "user", content }],
  });
  if (msg.stop_reason === "refusal") throw new RefusalError("scoring", msg.stop_details?.category);
  const out = msg.parsed_output;
  if (!out) throw new AnthropicError(`scoring returned no structured output (stop_reason ${msg.stop_reason})`);
  const score = applyStatusCaps(computeScore(out), input.status);
  const booted = input.status === "booted";
  let failureReason = out.failureReason;
  if (!booted && !failureReason) failureReason = input.status === "timeout" ? "Timed out" : input.status === "needs_secrets" ? "Missing env var" : "Other";
  return { score, summary: out.summary.trim(), failureReason, raw: out };
}
