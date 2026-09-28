import "server-only";
import { Pool } from "pg";

// One pool per server process. Cached on globalThis so dev hot reloads reuse it.
const globalForPg = globalThis as unknown as { __screenerPool?: Pool };

export function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL;
}

export function db(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!globalForPg.__screenerPool) {
    globalForPg.__screenerPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
    });
  }
  return globalForPg.__screenerPool;
}
