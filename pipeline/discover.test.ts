import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { config } from "./config";
import { listGitHubForks, parseForkList, parseForkSpec, parseLsRemote, parseNextLink, safeName } from "./discover";

test("listGitHubForks follows Link pagination and sends the token", async () => {
  const seen: { url: string; auth?: string }[] = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url!, auth: req.headers.authorization });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const fork = (login: string) => ({
      name: "solari-cookbook",
      html_url: `https://github.com/${login}/solari-cookbook`,
      clone_url: `https://github.com/${login}/solari-cookbook.git`,
      owner: { login },
    });
    if (req.url!.includes("page=2")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([fork("kurtiz")]));
    } else {
      res.writeHead(200, { "content-type": "application/json", link: `<${base}/repos/o/r/forks?per_page=100&sort=oldest&page=2>; rel="next"` });
      res.end(JSON.stringify([fork("YesterdaysLemon"), fork("FireZenk")]));
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const prev = config.githubApi;
  config.githubApi = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const forks = await listGitHubForks("o/r", "tok123");
    assert.deepEqual(forks.map((f) => f.owner), ["YesterdaysLemon", "FireZenk", "kurtiz"]);
    assert.equal(forks[0]!.cloneUrl, "https://github.com/YesterdaysLemon/solari-cookbook");
    assert.equal(seen.length, 2);
    assert.equal(seen[0]!.url, "/repos/o/r/forks?per_page=100&sort=oldest");
    assert.ok(seen.every((s) => s.auth === "Bearer tok123"));
  } finally {
    config.githubApi = prev;
    server.close();
  }
});

test("parseForkSpec handles owner/repo, URLs, ssh and local paths", () => {
  assert.deepEqual(parseForkSpec("kurtiz/solari-cookbook"), {
    owner: "kurtiz",
    repo: "solari-cookbook",
    cloneUrl: "https://github.com/kurtiz/solari-cookbook",
    repoUrl: "https://github.com/kurtiz/solari-cookbook",
    local: false,
  });
  assert.equal(parseForkSpec("https://github.com/FireZenk/solari-cookbook.git").owner, "FireZenk");
  assert.equal(parseForkSpec("https://github.com/FireZenk/solari-cookbook/").cloneUrl, "https://github.com/FireZenk/solari-cookbook");
  assert.equal(parseForkSpec("git@github.com:jh1nresh/solari-cookbook.git").owner, "jh1nresh");
  const other = parseForkSpec("https://gitlab.com/alice/cookbook.git");
  assert.equal(other.owner, "alice");
  assert.equal(other.cloneUrl, "https://gitlab.com/alice/cookbook.git");

  const local = parseForkSpec("/tmp/fixtures/demo-fork");
  assert.equal(local.local, true);
  assert.equal(local.owner, "demo-fork");
  assert.equal(local.cloneUrl, "/tmp/fixtures/demo-fork");

  const named = parseForkSpec("price-watch-demo=/tmp/fixtures/demo-fork");
  assert.equal(named.owner, "price-watch-demo");
  assert.equal(named.cloneUrl, "/tmp/fixtures/demo-fork");
  assert.equal(parseForkSpec("alice=kurtiz/solari-cookbook").owner, "alice");
});

test("parseForkList splits, trims and de-duplicates by owner", () => {
  const list = parseForkList(" kurtiz/solari-cookbook, ,FireZenk/solari-cookbook,KURTIZ/solari-cookbook ");
  assert.deepEqual(
    list.map((f) => f.owner),
    ["kurtiz", "FireZenk"],
  );
});

test("parseLsRemote reads the HEAD symref and branches", () => {
  const out = [
    "ref: refs/heads/main\tHEAD",
    "d304843f5ea0edb5c27829bb2ca30868645bef7a\tHEAD",
    "3c175eb95c3d09b5e32041e9f5580043ccd3f22c\trefs/heads/feat/worldline",
    "d304843f5ea0edb5c27829bb2ca30868645bef7a\trefs/heads/main",
    "1111111111111111111111111111111111111111\trefs/tags/v1",
  ].join("\n");
  const r = parseLsRemote(out);
  assert.equal(r.defaultBranch, "main");
  assert.equal(r.headSha, "d304843f5ea0edb5c27829bb2ca30868645bef7a");
  assert.deepEqual(
    r.heads.map((h) => h.name),
    ["feat/worldline", "main"],
  );
});

test("parseLsRemote falls back to the default branch sha when HEAD line is missing", () => {
  const r = parseLsRemote("ref: refs/heads/dev\tHEAD\nabababababababababababababababababababab\trefs/heads/dev\n");
  assert.equal(r.headSha, "abababababababababababababababababababab");
});

test("parseNextLink finds rel=next", () => {
  const link =
    '<https://api.github.com/repositories/1/forks?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/1/forks?per_page=100&page=5>; rel="last"';
  assert.equal(parseNextLink(link), "https://api.github.com/repositories/1/forks?per_page=100&page=2");
  assert.equal(parseNextLink('<https://x/?page=1>; rel="prev"'), null);
  assert.equal(parseNextLink(null), null);
});

test("safeName makes directory-safe owner keys", () => {
  assert.equal(safeName("my fork!"), "my-fork");
  assert.equal(safeName("..."), "fork");
});
