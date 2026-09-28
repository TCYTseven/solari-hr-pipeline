import assert from "node:assert/strict";
import { test } from "node:test";
import { submissionEnv, secretValues } from "./config";
import { capLog, cleanOutput, errorTail, pool, redact, shellQuote, stripAnsi, truncate, twoParagraphs } from "./util";

test("errorTail keeps the last non-empty lines, ANSI stripped", () => {
  const out = "npm ERR! code 1\n\n\u001b[31mnpm ERR! missing script: start\u001b[0m\n  \nnpm ERR! A\nnpm ERR! B\n\n";
  assert.deepEqual(errorTail(out, 4), ["npm ERR! code 1", "npm ERR! missing script: start", "npm ERR! A", "npm ERR! B"]);
  assert.deepEqual(errorTail("", 4), []);
  const npm404 = [
    "npm error 404 Not Found - GET https://registry.npmjs.org/x - Not found",
    "npm error 404",
    "npm error 404  'x@^9.9.9' is not in this registry.",
    "npm error 404 Note that you can also install from a",
    "npm error 404 tarball, folder, http url, or git url.",
    "npm error A complete log of this run can be found in: /root/.npm/_logs/debug-0.log",
  ].join("\n");
  assert.deepEqual(errorTail(npm404, 4), [
    "npm error 404 Not Found - GET https://registry.npmjs.org/x - Not found",
    "npm error 404  'x@^9.9.9' is not in this registry.",
    "npm error 404 Note that you can also install from a",
    "npm error 404 tarball, folder, http url, or git url.",
  ]);
});

test("cleanOutput resolves carriage-return progress lines", () => {
  assert.equal(cleanOutput("50%\r100%\r\ndone\n"), "100%\ndone\n");
  assert.equal(stripAnsi("\u001b[1mbold\u001b[22m"), "bold");
});

test("capLog keeps head and tail", () => {
  const big = "a".repeat(1000) + "b".repeat(1000);
  const capped = capLog(big, 500);
  assert.ok(capped.length < 600);
  assert.ok(capped.startsWith("aaa"));
  assert.ok(capped.endsWith("bbb"));
  assert.match(capped, /characters truncated/);
  assert.equal(capLog("short", 500), "short");
});

test("shellQuote quotes only when needed", () => {
  assert.equal(shellQuote(["npm", "ci"]), "npm ci");
  assert.equal(shellQuote(["python3", "-c", "print('hi')"]), `python3 -c 'print('\\''hi'\\'')'`);
  assert.equal(shellQuote(["echo", ""]), "echo ''");
  assert.equal(shellQuote(["sh", "-c", "a && b"]), "sh -c 'a && b'");
});

test("redact masks known secrets and key shapes", () => {
  const s = redact("key=sk-ant-api03-abcdefghijklmnop and slr_live_abcdef123 and mysecretvalue", ["mysecretvalue"]);
  assert.ok(!s.includes("sk-ant-api03"));
  assert.ok(!s.includes("slr_live_abc"));
  assert.ok(!s.includes("mysecretvalue"));
  assert.equal(redact("https://x.preview.getsolari.com/?pt_token=abc123&x=1"), "https://x.preview.getsolari.com/?pt_token=••••&x=1");
});

test("truncate collapses whitespace and adds an ellipsis", () => {
  assert.equal(truncate("hello   world", 50), "hello world");
  assert.equal(truncate("abcdefghij", 6), "abc...");
  assert.equal(truncate("Scrolled down on Evidence screenshot for Surgical update", 40), "Scrolled down on Evidence screenshot...");
});

test("pool runs every item with bounded concurrency", async () => {
  let active = 0;
  let peak = 0;
  const seen: number[] = [];
  await pool([1, 2, 3, 4, 5], 2, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    seen.push(n);
    active--;
  });
  assert.equal(peak, 2);
  assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5]);
});

test("submissionEnv renames SUBMISSION_* and never passes the screener's own keys", () => {
  const env = {
    ANTHROPIC_API_KEY: "sk-ant-screener",
    SOLARI_API_KEY: "slr_live_screener",
    SUBMISSION_SOLARI_API_KEY: "slr_live_candidate",
    SUBMISSION_ANTHROPIC_API_KEY: "sk-ant-candidate",
    SUBMISSION_: "x",
    SUBMISSION_BAD_NAME$: "x",
    SUBMISSION_EMPTY: "",
  };
  assert.deepEqual(submissionEnv(env), { SOLARI_API_KEY: "slr_live_candidate", ANTHROPIC_API_KEY: "sk-ant-candidate" });
  const secrets = secretValues(env);
  assert.ok(secrets.includes("sk-ant-screener"));
  assert.ok(secrets.includes("slr_live_candidate"));
});

test("twoParagraphs keeps a blank-line split and splits a single block near the middle", () => {
  assert.equal(twoParagraphs("One.\n\nTwo."), "One.\n\nTwo.");
  const long =
    "The project boots a sandbox and serves a dashboard. It records every step of the run. " +
    "The demo agent opened three pages and compared the results. Strengths are the README and tests. " +
    "Weaknesses are the thin error handling and a hard-coded port.";
  const out = twoParagraphs(long);
  const parts = out.split("\n\n");
  assert.equal(parts.length, 2);
  assert.equal(parts.join(" "), long);
  assert.equal(twoParagraphs("Short single paragraph."), "Short single paragraph.");
});
