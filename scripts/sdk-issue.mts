// Record an issue or PR opened against the Solari SDK, shown on /stats.
//   npm run sdk-issue -- <github url> "<title>" [--state open|closed|merged]
// Re-running with the same URL updates the title and state.
import { Pool } from "pg";

const [url, title] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const stateFlag = process.argv.indexOf("--state");
const state = stateFlag > 0 ? process.argv[stateFlag + 1] : "open";

if (!url || !title || !["open", "closed", "merged"].includes(state)) {
  console.error('usage: npm run sdk-issue -- <github url> "<title>" [--state open|closed|merged]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const kind = /\/pull\/\d+/.test(url) ? "pr" : "issue";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(
  `insert into sdk_issues (id, title, url, kind, state) values ($1, $2, $1, $3, $4)
   on conflict (id) do update set title = excluded.title, state = excluded.state`,
  [url, title, kind, state],
);
await pool.end();
console.log(`saved ${kind}: ${title} (${state})`);
