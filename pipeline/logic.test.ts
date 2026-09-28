// Tests for scoring, triage normalization, the store's SQL mapping, change
// detection and CLI flags.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseArgs } from "./cli";
import { parseListeningPorts, pickAppPort, portsInLog } from "./executors/types";
import { escapeHtml, terminalHtml, terminalLines } from "./media";
import { applyStatusCaps, computeScore } from "./score";
import { fingerprint, missingSecretsTail, shouldSkip } from "./screen";
import { type LastRun, buildUpdate, patchColumns } from "./store";
import { type Triage, heuristicTriage, normalizeTriage } from "./triage";

test("computeScore clamps to 1-5 and averages to one decimal", () => {
  assert.deepEqual(computeScore({ boots: 5, works: 4, usesSolari: 4, useCase: 5, polish: 3 }), {
    boots: 5, works: 4, usesSolari: 4, useCase: 5, polish: 3, total: 4.2,
  });
  const s = computeScore({ boots: 9, works: 0, usesSolari: 2.6, useCase: 1, polish: 1 });
  assert.equal(s.boots, 5);
  assert.equal(s.works, 1);
  assert.equal(s.usesSolari, 3);
  assert.equal(s.total, 2.2);
});

test("patchColumns maps camelCase to snake_case and mirrors score_total", () => {
  const cols = patchColumns(
    { score: { boots: 5, works: 4, usesSolari: 4, useCase: 5, polish: 3, total: 4.2 }, bootMs: 1200, errorTail: null, productsUsed: ["sandbox"] },
    { score: "score", bootMs: "boot_ms", errorTail: "error_tail", productsUsed: "products_used" },
  );
  assert.deepEqual(cols.map((c) => c.col), ["score", "score_total", "boot_ms", "error_tail", "products_used"]);
  assert.equal(cols[1]!.value, 4.2);
  assert.equal(typeof cols[0]!.value, "string"); // jsonb serialized
  assert.equal(cols[3]!.value, null); // null stays SQL null
  assert.deepEqual(cols[4]!.value, ["sandbox"]); // text[] passes through
  const cleared = patchColumns({ score: null }, { score: "score" });
  assert.deepEqual(cleared, [{ col: "score", value: null }, { col: "score_total", value: null }]);
});

test("buildUpdate writes parameterized SQL with jsonb casts and guards", () => {
  const q = buildUpdate("submissions", "owner", "alice", { status: "booted", stack: [{ slug: "python", name: "Python" }] }, {
    set: ["updated_at = now()"],
    where: ["not exists (select 1)"],
  })!;
  assert.equal(q.text, "update submissions set status = $2, stack = $3::jsonb, updated_at = now() where owner = $1 and not exists (select 1)");
  assert.deepEqual(q.values, ["alice", "booted", '[{"slug":"python","name":"Python"}]']);
  assert.throws(() => buildUpdate("runs", "id", "x", { nope: 1 }), /unknown field/);
  assert.equal(buildUpdate("runs", "id", "x", {}), null);
  const r = buildUpdate("runs", "id", "r1", { streamUrl: null, vmSeconds: 12.5 })!;
  assert.equal(r.text, "update runs set stream_url = $2, vm_seconds = $3 where id = $1");
});

const heads = (headSha: string, ...others: string[]) => ({
  defaultBranch: "main",
  headSha,
  heads: [{ name: "main", sha: headSha }, ...others.map((s, i) => ({ name: `b${i}`, sha: s }))],
});

test("shouldSkip compares the fork fingerprint with the last finished run", () => {
  const skip = (history: LastRun[], h: ReturnType<typeof heads>, env?: Set<string>) => shouldSkip(history, h, env) != null;
  assert.equal(skip([], heads("a")), false);
  const last: LastRun = { id: "r", commitSha: "x", status: "booted", failureReason: null, triage: { _source: fingerprint(heads("a", "b")) } };
  assert.equal(skip([last], heads("a", "b")), true);
  assert.match(shouldSkip([last], heads("a", "b"))!, /unchanged/);
  assert.equal(skip([last], heads("a", "c")), false, "a feature branch moved");
  assert.equal(skip([last], heads("z", "b")), false, "default branch moved");
  // needs_secrets is retried once the missing variables are provided.
  const ns: LastRun = { ...last, status: "needs_secrets", triage: { requiredEnv: ["SOLARI_API_KEY"], _source: fingerprint(heads("a", "b")) } };
  assert.equal(skip([ns], heads("a", "b"), new Set()), true);
  assert.equal(skip([ns], heads("a", "b"), new Set(["SOLARI_API_KEY"])), false);
  // Runs without a fingerprint fall back to the commit sha.
  assert.equal(skip([{ ...last, triage: null, commitSha: "a" }], heads("a")), true);
  assert.equal(skip([{ ...last, triage: null, commitSha: "a" }], heads("b")), false);
});

test("shouldSkip retries screener errors, but not a 4th time on the same state", () => {
  const err = (kind: string, head = "a"): LastRun => ({
    id: kind, commitSha: head, status: "skipped", failureReason: "Screener error",
    triage: { _source: fingerprint(heads(head)), _screener: { error: kind } },
  });
  assert.equal(shouldSkip([err("error")], heads("a")), null);
  assert.equal(shouldSkip([err("error"), err("error")], heads("a")), null);
  assert.match(shouldSkip([err("error"), err("error"), err("error")], heads("a"))!, /3 screener errors/);
  // A new commit resets the count; interruptions (Ctrl-C) and crashes do not count.
  assert.equal(shouldSkip([err("error"), err("error"), err("error")], heads("b")), null);
  assert.equal(shouldSkip([err("error"), err("interrupted"), err("error")], heads("a")), null);
  assert.equal(shouldSkip([err("stale"), err("error"), err("error")], heads("a")), null);
});

test("missingSecretsTail names the missing variables", () => {
  const tail = missingSecretsTail(["SOLARI_API_KEY", "ANTHROPIC_API_KEY"]);
  assert.equal(tail[0], "Missing required env: SOLARI_API_KEY, ANTHROPIC_API_KEY");
  assert.match(tail[1]!, /SUBMISSION_SOLARI_API_KEY/);
});

function fixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "screener-test-"));
  for (const [f, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), body);
  }
  return dir;
}

const baseTriage: Triage = {
  title: "  Price   Watch ",
  description: "x".repeat(300),
  projectType: "web",
  stack: [
    { slug: "NodeDotJs", name: "Node.js" },
    { slug: "html5", name: "HTML" },
    { slug: "css", name: "CSS" },
    { slug: "docker", name: "Docker" },
    { slug: "extra", name: "Extra" },
  ],
  productsUsed: ["sandbox", "sandbox"],
  projectDir: "./applications/price-watch/",
  install: [["npm", "ci"], []],
  run: ["npm", "start"],
  server: true,
  port: null,
  requiredEnv: ["SOLARI_API_KEY", "PORT", "bad-name"],
  optionalEnv: ["SOLARI_API_KEY", "DEBUG"],
  demoSurface: "browser",
  demoGoal: "Add a product.",
  runTimeoutSec: 5000,
};

test("normalizeTriage clamps and cleans model output", () => {
  const dir = fixture({ "applications/price-watch/package.json": "{}" });
  const t = normalizeTriage(baseTriage, { dir, projectDir: "applications/price-watch" });
  assert.equal(t.title, "Price Watch");
  assert.equal(t.description.length, 220);
  assert.equal(t.stack.length, 4);
  assert.equal(t.stack[0]!.slug, "nodedotjs");
  assert.deepEqual(t.productsUsed, ["sandbox"]);
  assert.equal(t.projectDir, "applications/price-watch");
  assert.deepEqual(t.install, [["npm", "ci"]]);
  assert.equal(t.port, 3000, "servers without a port default to 3000");
  assert.deepEqual(t.requiredEnv, ["SOLARI_API_KEY"]);
  assert.deepEqual(t.optionalEnv, ["DEBUG"]);
  assert.ok(t.runTimeoutSec <= 300);
});

test("normalizeTriage rejects escaping or missing project dirs and fixes surfaces", () => {
  const dir = fixture({ "main.py": "print(1)" });
  const t = normalizeTriage({ ...baseTriage, projectDir: "../../etc", server: false, port: 8080, demoSurface: "browser" }, { dir, projectDir: "." });
  assert.equal(t.projectDir, ".");
  assert.equal(t.port, null);
  assert.equal(t.demoSurface, "sandbox", "a non-server cannot be demoed in a browser");
});

test("heuristicTriage reads manifests", () => {
  const node = heuristicTriage({ dir: fixture({ "package.json": '{"scripts":{"start":"node s.js"}}', "package-lock.json": "{}" }), projectDir: "." });
  assert.deepEqual(node.install, [["npm", "ci"]]);
  assert.deepEqual(node.run, ["npm", "start"]);
  const py = heuristicTriage({ dir: fixture({ "requirements.txt": "requests", "app.py": "" }), projectDir: "." });
  assert.deepEqual(py.install, [["pip", "install", "-r", "requirements.txt"]]);
  assert.deepEqual(py.run, ["python3", "app.py"]);
});

test("parseArgs reads scan flags", () => {
  assert.deepEqual(parseArgs(["scan"]), { command: "scan", concurrency: 2, executor: "auto", demo: true, force: false, verbose: false });
  const f = parseArgs(["scan", "--owner", "kurtiz", "--limit", "3", "--concurrency=4", "--executor", "docker", "--no-demo", "--forks", "a/b,c/d"]);
  assert.equal(f.owner, "kurtiz");
  assert.equal(f.force, true, "--owner implies --force");
  assert.equal(f.limit, 3);
  assert.equal(f.concurrency, 4);
  assert.equal(f.executor, "docker");
  assert.equal(f.demo, false);
  assert.equal(f.forks, "a/b,c/d");
  assert.equal(parseArgs(["watch"]).command, "watch");
  assert.throws(() => parseArgs(["scan", "--limit", "0"]), /positive integer/);
  assert.throws(() => parseArgs(["scan", "--executor", "vm"]), /--executor/);
  assert.throws(() => parseArgs(["scan", "--bogus"]), /Unknown flag/);
  assert.throws(() => parseArgs(["deploy"]), /Usage/);
});

test("terminal thumbnail helpers escape and trim output", () => {
  assert.equal(escapeHtml(`<a href="x">&</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  const lines = terminalLines(`${Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n")}\n\n`, 24, 200);
  assert.equal(lines.length, 24);
  assert.equal(lines[23], "line 39");
  assert.equal(terminalLines("x".repeat(300), 24, 50)[0]!.length, 50);
  const html = terminalHtml("t", ["$ npm start", "<script>"]);
  assert.ok(html.includes('class="l cmd">$ npm start'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("#0F1514") && html.includes("#E7E7E2"));
});

test("applyStatusCaps enforces boots = 1 when not booted and works <= 3 when not run", () => {
  const s = computeScore({ boots: 3, works: 5, usesSolari: 5, useCase: 4, polish: 5 });
  assert.deepEqual(applyStatusCaps(s, "booted"), s);
  const ns = applyStatusCaps(s, "needs_secrets");
  assert.equal(ns.boots, 1);
  assert.equal(ns.works, 3);
  assert.equal(ns.total, 3.6);
  const bf = applyStatusCaps(s, "build_failed");
  assert.equal(bf.boots, 1);
  assert.equal(bf.works, 5);
});

test("parseListeningPorts reads LISTEN sockets from /proc/net/tcp{,6}", () => {
  const tcp = [
    "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode",
    "   0: 0100007F:10AD 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 1 1 0000000000000000 100 0 0 10 0",
    "   1: 00000000:9C3F 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 2 1 0000000000000000 100 0 0 10 0",
    "   2: 0100007F:10AD 0100007F:A2C4 01 00000000:00000000 00:00000000 00000000     0        0 3 1 0000000000000000 20 4 30 10 -1",
  ].join("\n");
  const tcp6 = "   0: 00000000000000000000000000000000:1F40 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000 0 0 4 1";
  assert.deepEqual(parseListeningPorts(`${tcp}\n${tcp6}`), [4269, 8000, 39999]);
});

test("pickAppPort follows the port the app really listens on", () => {
  const log = "Worldline report: http://127.0.0.1:4173\n";
  assert.equal(portsInLog(log)[0], 4173);
  assert.deepEqual(portsInLog("Listening on port 5000; also http://localhost:5173/"), [5000, 5173]);
  // Triaged :8000 is silent, the app printed and listens on :4173.
  assert.equal(pickAppPort([4173, 9229, 39999], [], [39999], log, 8000), 4173);
  // Nothing announced: lowest new port. Baseline ports are ignored.
  assert.equal(pickAppPort([22, 5000, 6000, 39999], [22], [39999], "", 8000), 5000);
  // The wanted port is listening (just not answering yet), or nothing new: keep waiting.
  assert.equal(pickAppPort([8000, 39999], [], [39999], "", 8000), null);
  assert.equal(pickAppPort([39999], [], [39999], "", 8000), null);
});

test("terminal thumbnails scale the font to the output", async () => {
  const { terminalFontPx } = await import("./media");
  assert.equal(terminalFontPx(["$ npm run sample", "wrote docs/sample-report.html"]), 30);
  assert.equal(terminalFontPx(Array.from({ length: 24 }, () => "x".repeat(60))), 16);
  assert.ok(terminalFontPx(["y".repeat(110)]) <= 17);
});
