// `npm run setup`: first-run setup on a laptop.
//  1. Creates .env from .env.example if there isn't one.
//  2. Gives Postgres a random password (submission code in the Docker fallback
//     could otherwise log in with a well-known one) and points DATABASE_URL at it.
//  3. Starts Postgres with Docker Compose and applies the schema.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";

const ENV = ".env";
const DEFAULT_URL = "postgres://screener:screener@localhost:5432/solari_screener";

/** True when nothing is listening on 127.0.0.1:port. */
function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => srv.close(() => resolve(true)))
      .listen(port, "127.0.0.1");
  });
}

function run(cmd: string, args: string[]) {
  execFileSync(cmd, args, { stdio: "inherit" });
}

if (!existsSync(ENV)) {
  copyFileSync(".env.example", ENV);
  console.log("created .env from .env.example");
}

let env = readFileSync(ENV, "utf8");
const has = (key: string) => new RegExp(`^${key}=.+`, "m").test(env);
const get = (key: string) => env.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim();

if (!has("POSTGRES_PASSWORD")) {
  const password = randomBytes(18).toString("base64url");
  env = env.replace(/^POSTGRES_PASSWORD=.*$/m, "").trimEnd() + `\nPOSTGRES_PASSWORD=${password}\n`;

  // Homebrew or Postgres.app often already holds 5432; use the next free port instead.
  let port = Number(process.env.POSTGRES_PORT ?? get("POSTGRES_PORT") ?? 5432);
  if (!process.env.POSTGRES_PORT && !has("POSTGRES_PORT")) {
    while (!(await portFree(port)) && port < 5450) port++;
    if (port !== 5432) {
      env += `POSTGRES_PORT=${port}\n`;
      console.log(`port 5432 is taken; the screener's Postgres will use ${port}`);
    }
  }
  const url = DEFAULT_URL.replace("screener:screener@", `screener:${password}@`).replace(":5432/", `:${port}/`);
  if (!has("DATABASE_URL") || env.includes(`DATABASE_URL=${DEFAULT_URL}`)) {
    env = has("DATABASE_URL") ? env.replace(`DATABASE_URL=${DEFAULT_URL}`, `DATABASE_URL=${url}`) : env + `DATABASE_URL=${url}\n`;
  }
  writeFileSync(ENV, env);
  console.log("generated a Postgres password in .env");
}

try {
  run("docker", ["compose", "up", "-d", "--wait"]);
} catch {
  console.error("\nCouldn't start Postgres. Is Docker Desktop running? (open -a Docker)");
  process.exit(1);
}

try {
  run("npm", ["run", "-s", "db:migrate"]);
} catch {
  console.error(
    "\nPostgres started but the schema couldn't be applied. If this machine ran the screener's " +
      "Postgres before with another password, reset it with `docker compose down -v` and run setup again.",
  );
  process.exit(1);
}

if (!has("ANTHROPIC_API_KEY")) console.log("\nNext: add ANTHROPIC_API_KEY (and SOLARI_API_KEY) to .env.");
console.log("\nReady. `npm run dev` for the dashboard, `npm run scan` to screen forks.");
