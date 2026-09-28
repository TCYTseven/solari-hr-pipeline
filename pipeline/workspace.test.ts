import assert from "node:assert/strict";
import { test } from "node:test";
import { type FileChange, deriveProjectDir, findUpstreamPrMerges, parseNameStatus } from "./workspace";

const ch = (...paths: string[]): FileChange[] => paths.map((p) => ({ status: "A", path: p }));

test("deriveProjectDir prefers the cookbook layout", () => {
  assert.equal(
    deriveProjectDir(ch("README.md", "applications/worldline/pyproject.toml", "applications/worldline/worldline/main.py", "applications/worldline/README.md")),
    "applications/worldline",
  );
  assert.equal(deriveProjectDir(ch("examples/foo-ts/index.ts", "examples/foo-ts/package.json", "README.md")), "examples/foo-ts");
});

test("deriveProjectDir picks the directory with the most changes", () => {
  assert.equal(deriveProjectDir(ch("price-watch/server.js", "price-watch/package.json", "docs/notes.md")), "price-watch");
  assert.equal(deriveProjectDir(ch("examples/a/x.ts", "examples/b/1.ts", "examples/b/2.ts")), "examples/b");
});

test("deriveProjectDir prefers the directory whose manifest the candidate added", () => {
  // Many doc files, but the project is where package.json is.
  const docs = Array.from({ length: 20 }, (_, i) => `docs/de/file${i}.html`);
  assert.equal(deriveProjectDir(ch(...docs, "apps/gauntlet/package.json", "apps/gauntlet/src/cli.ts", "apps/gauntlet/README.md")), "apps/gauntlet");
  // Nested manifests claim their own files; a root manifest does not swallow them.
  assert.equal(
    deriveProjectDir(ch("package.json", "examples/foo-ts/package.json", "examples/foo-ts/a.ts", "examples/foo-ts/b.ts", "tsconfig.json")),
    "examples/foo-ts",
  );
  assert.equal(deriveProjectDir(ch("pyproject.toml", "main.py", "lib/x.py")), ".");
  // Vendored files never count.
  assert.equal(deriveProjectDir(ch("app/package.json", "app/node_modules/x/package.json", "app/node_modules/x/i.js", "app/node_modules/x/j.js")), "app");
});

test("deriveProjectDir ignores deletions and falls back to the root", () => {
  assert.equal(deriveProjectDir([{ status: "D", path: "examples/old/index.ts" }, { status: "M", path: "main.py" }]), ".");
  assert.equal(deriveProjectDir(ch("README.md")), ".");
  assert.equal(deriveProjectDir([]), ".");
});

test("parseNameStatus reads adds, modifies and renames", () => {
  const out = "A\tapplications/x/app.py\nM\tREADME.md\nR100\told/name.ts\tnew/name.ts\n";
  assert.deepEqual(parseNameStatus(out), [
    { status: "A", path: "applications/x/app.py" },
    { status: "M", path: "README.md" },
    { status: "R", path: "new/name.ts" },
  ]);
});

test("findUpstreamPrMerges matches the owner's merged PRs only", () => {
  const log = [
    ["m1", "p1 p2", "Merge pull request #20 from YesterdaysLemon/worldline"].join("\x1f"),
    ["m2", "p3 p4", "Merge pull request #43 from kurtiz/workers-cdp"].join("\x1f"),
    ["m3", "p5 p6", "Merge remote-tracking branch 'origin/main' into feat/worldline"].join("\x1f"),
  ].join("\n");
  assert.deepEqual(findUpstreamPrMerges(log, "yesterdayslemon"), [{ merge: "m1", parents: ["p1", "p2"], pr: "20" }]);
  assert.deepEqual(findUpstreamPrMerges(log, "nobody"), []);
});
