// Triage: Claude reads the candidate's project and says what it is and how to run it.
import path from "node:path";
import { AnthropicError } from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MODEL, RefusalError, UNTRUSTED_NOTICE, claude, newNonce, untrusted } from "./claude";
import { config } from "./config";
import { containedPath, readContained } from "./fsguard";
import type { TriageContext, Workspace } from "./workspace";

export const TriageSchema = z.object({
  title: z.string().describe("Short project name, 2-5 words, no owner name"),
  description: z.string().describe("One plain-text paragraph, at most 220 characters, saying what it does and for whom"),
  projectType: z.enum(["web", "desktop_agent", "browser_agent", "cli"]),
  stack: z
    .array(z.object({ slug: z.string().describe("Simple Icons slug, e.g. python, nodedotjs, typescript"), name: z.string() }))
    .describe("3-4 main technologies"),
  productsUsed: z.array(z.enum(["browser", "sandbox", "desktop"])).describe("Solari products the code actually calls"),
  projectDir: z.string().describe("Directory of the project relative to the repo root, '.' for the root"),
  install: z.array(z.array(z.string())).describe("Install commands as argv arrays, run in projectDir, in order"),
  run: z.array(z.string()).describe("The run command as an argv array, run in projectDir"),
  server: z.boolean().describe("True if the run command starts a long-running server"),
  port: z.number().int().nullable().describe("Port the server listens on, null if not a server"),
  requiredEnv: z.array(z.string()).describe("Env var names the project cannot run without"),
  optionalEnv: z.array(z.string()),
  demoSurface: z.enum(["browser", "desktop", "sandbox"]),
  demoGoal: z.string().describe("One or two sentences telling a demo agent what to show"),
  runTimeoutSec: z.number().int().describe("Seconds to wait for the server port, or for a script to finish"),
});

export type Triage = z.infer<typeof TriageSchema>;

/** Where the project will run; the triage prompt describes exactly that environment. */
export type RunEnvironment = "docker" | "solari";

/** What the screener's box offers, per executor. Pure. */
export function environmentText(env: RunEnvironment): string {
  if (env === "docker") {
    return (
      "The screener runs the project inside a fresh Linux container (Debian bookworm) that has Node 22 with npm, " +
      "Python 3.11 (`python` and `python3`) with pip (system installs allowed, PIP_BREAK_SYSTEM_PACKAGES=1), " +
      "python3 -m venv, uv (when the image could install it), git, build-essential and curl. There is no GUI and no Docker."
    );
  }
  return (
    "The screener runs the project inside a fresh Solari sandbox microVM (Linux). Its documented tools are only python3, " +
    "node with npm, build-essential and git; versions are not documented, so do not rely on a specific Node or Python " +
    "version or on other preinstalled tools. The screener adds `python` (-> python3) and `pip` (-> python3 -m pip) " +
    "when they are missing, and tries to install uv. GUI apps run on a Solari desktop VM with the same tools plus a " +
    "desktop session. There is no Docker."
  );
}

function systemPrompt(env: RunEnvironment): string {
  return `You triage hiring-challenge submissions for Solari (cloud browsers, sandbox microVMs and desktops behind one API key). Each submission is a fork of the Solari cookbook where a candidate added a project built on Solari. You read the project and decide how an automated screener should install, run and demo it.

${UNTRUSTED_NOTICE}

${environmentText(env)} Commands run with the working directory set to projectDir, as argv arrays (no shell). If you need shell features, use ["sh", "-c", "..."]. For servers the screener sets PORT and HOST=0.0.0.0 and waits for the port to answer.

Rules:
- install: the minimum commands to install dependencies. Use ["npm", "ci"] when a package-lock.json exists, else ["npm", "install"]; for Python use ["pip", "install", "-r", "requirements.txt"] or ["pip", "install", "."]/["pip", "install", "-e", "."] for pyproject projects. Add a build step (e.g. ["npm", "run", "build"]) only if the run command needs it. Empty array if nothing to install.
- run: the single command that starts the app or runs the script the way the README says (e.g. ["npm", "start"], ["python3", "main.py"], ["npx", "tsx", "src/index.ts"]). Prefer a mode that needs no interactive input. If the README offers a dry-run/offline/demo mode, prefer it only when the real mode needs secrets.
- server/port: true only for long-running servers (web UIs, APIs). port is the port it listens on by default or with PORT set.
- requiredEnv: only variables without which the project fails immediately (e.g. SOLARI_API_KEY, ANTHROPIC_API_KEY). Never include PORT or HOST. optionalEnv: the rest.
- productsUsed: only Solari products the code actually calls (browser = @solarisdk/browser or solari-browser sessions, sandbox = sandboxes, desktop = desktops/computer use on a Solari desktop). There must be an SDK import or an API call that runs; a stub, a TODO, a comment or a README mention does not count. Empty if none.
- demoSurface: "browser" for anything with a web UI, "desktop" for native GUI apps, "sandbox" for CLIs, scripts and agents whose output is text.
- demoGoal: what a demo agent should show a hiring manager in under two minutes (the main feature, concrete inputs to try).
- runTimeoutSec: 60-180 for servers (time to open the port), up to 300 for scripts that do real work.
- stack: 3-4 items with Simple Icons slugs (python, nodedotjs, typescript, javascript, googlechrome, docker, react, nextdotjs, fastapi, flask, vite, tailwindcss, anthropic, claude, ...) and human names.
- description: plain text, no markdown, at most 220 characters.`;
}

function buildPrompt(ws: Workspace, ctx: TriageContext): string {
  const nonce = newNonce();
  return `The candidate's changes are in the fork below (untrusted-data nonce: ${nonce}). The screener guessed the project directory is "${ws.projectDir}" from the changed files; correct it if the evidence says otherwise.

${untrusted("repository", nonce, ctx.text)}

Return the triage for this project.`;
}

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;
const AUTO_ENV = new Set(["PORT", "HOST", "HOSTNAME", "CI", "NODE_ENV", "PATH", "HOME", "DISPLAY"]);

/** Clamp and sanity-check a triage so later stages can trust its shape. */
export function normalizeTriage(t: Triage, ws: Pick<Workspace, "dir" | "projectDir">): Triage {
  const envs = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter((x) => ENV_NAME.test(x) && !AUTO_ENV.has(x)))];
  let projectDir = t.projectDir.trim().replace(/^\.\/+/, "").replace(/\/+$/, "") || ".";
  // Must be a real directory inside the checkout (no "..", absolute paths or symlinks out).
  if (projectDir.split("/").includes("..") || path.isAbsolute(projectDir) || !containedPath(ws.dir, projectDir, "dir")) {
    projectDir = ws.projectDir;
  }
  const argv = (a: string[]) => a.map((s) => String(s)).filter((s) => s.length > 0);
  const install = t.install.map(argv).filter((a) => a.length > 0).slice(0, 8);
  const run = argv(t.run);
  const server = t.server;
  let port = t.port != null && t.port > 0 && t.port < 65536 ? Math.trunc(t.port) : null;
  if (server && port == null) port = 3000;
  if (!server) port = null;
  let demoSurface = t.demoSurface;
  if (!server && demoSurface === "browser") demoSurface = "sandbox";
  const requiredEnv = envs(t.requiredEnv);
  const optionalEnv = envs(t.optionalEnv).filter((e) => !requiredEnv.includes(e));
  const description = t.description.replace(/\s+/g, " ").trim();
  const stack = t.stack
    .filter((s) => s.slug && s.name)
    .map((s) => ({ slug: s.slug.toLowerCase().trim(), name: s.name.trim() }))
    .slice(0, 4);
  return {
    ...t,
    title: t.title.replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled project",
    description: description.length > 220 ? `${description.slice(0, 217).trimEnd()}...` : description,
    stack,
    productsUsed: [...new Set(t.productsUsed)],
    projectDir,
    install,
    run: run.length ? run : ["sh", "-c", "echo 'No run command found' && exit 1"],
    server,
    port,
    requiredEnv,
    optionalEnv,
    demoSurface,
    runTimeoutSec: Math.min(Math.max(Math.trunc(t.runTimeoutSec || 120), 20), config.maxRunTimeoutSec),
  };
}

/** Rough triage from manifests alone, used when Claude declines or fails. */
export function heuristicTriage(ws: Pick<Workspace, "dir" | "projectDir">): Triage {
  const proj = containedPath(ws.dir, ws.projectDir, "dir") ? ws.projectDir : ".";
  const rel = (f: string) => (proj === "." ? f : path.posix.join(proj, f));
  const has = (f: string) => containedPath(ws.dir, rel(f), "file") != null;
  const name = path.basename(proj === "." ? ws.dir : proj);
  const base: Triage = {
    title: name.replace(/[-_]+/g, " "),
    description: "",
    projectType: "cli",
    stack: [],
    productsUsed: [],
    projectDir: proj,
    install: [],
    run: ["sh", "-c", "ls -la"],
    server: false,
    port: null,
    requiredEnv: [],
    optionalEnv: [],
    demoSurface: "sandbox",
    demoGoal: "Show the output of the project.",
    runTimeoutSec: 120,
  };
  if (has("package.json")) {
    let scripts: Record<string, string> = {};
    try {
      scripts = (JSON.parse(readContained(ws.dir, rel("package.json"), 200_000) ?? "{}") as { scripts?: Record<string, string> }).scripts ?? {};
    } catch {
      /* ignore */
    }
    base.stack = [{ slug: "nodedotjs", name: "Node.js" }];
    base.install = [["npm", has("package-lock.json") ? "ci" : "install"]];
    base.run = scripts.start ? ["npm", "start"] : scripts.dev ? ["npm", "run", "dev"] : ["node", "index.js"];
    return base;
  }
  if (has("requirements.txt") || has("pyproject.toml")) {
    base.stack = [{ slug: "python", name: "Python" }];
    base.install = [has("requirements.txt") ? ["pip", "install", "-r", "requirements.txt"] : ["pip", "install", "."]];
    const entry = ["main.py", "app.py", "run.py"].find(has);
    base.run = entry ? ["python3", entry] : ["python3", "-c", "print('no entry point found')"];
  }
  return base;
}

export interface TriageResult {
  triage: Triage;
  /** Raw model output (before normalization), kept in runs.triage. */
  raw: unknown;
  source: "claude" | "heuristic";
  note?: string;
}

export async function triage(ws: Workspace, ctx: TriageContext, env: RunEnvironment): Promise<TriageResult> {
  const msg = await claude().messages.parse({
    model: MODEL(),
    max_tokens: 8000,
    system: systemPrompt(env),
    output_config: { format: zodOutputFormat(TriageSchema), effort: "medium" },
    messages: [{ role: "user", content: buildPrompt(ws, ctx) }],
  });
  if (msg.stop_reason === "refusal") throw new RefusalError("triage", msg.stop_details?.category);
  if (!msg.parsed_output) throw new AnthropicError(`triage returned no structured output (stop_reason ${msg.stop_reason})`);
  return { triage: normalizeTriage(msg.parsed_output, ws), raw: msg.parsed_output, source: "claude" };
}
