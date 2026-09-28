import "server-only";
import { Client } from "pg";

export interface ChangeEvent {
  table: "submissions" | "runs" | "scans";
  op: "INSERT" | "UPDATE";
  owner?: string;
  id?: string;
  status?: string;
}

type Listener = (e: ChangeEvent) => void;

// One LISTEN connection per server process, fanned out to every open
// /api/live stream. It reconnects with backoff if Postgres goes away.
const state = globalThis as unknown as {
  __screenerLive?: { listeners: Set<Listener>; client: Client | null; connecting: boolean; retry: number };
};

function hub() {
  state.__screenerLive ??= { listeners: new Set(), client: null, connecting: false, retry: 0 };
  return state.__screenerLive;
}

async function connect() {
  const h = hub();
  // LISTEN needs a direct session. Behind a transaction pooler (Neon, Supabase,
  // PgBouncer) point LIVE_DATABASE_URL at the unpooled connection string.
  const url = process.env.LIVE_DATABASE_URL || process.env.DATABASE_URL;
  if (h.client || h.connecting || !url) return;
  h.connecting = true;
  const client = new Client({ connectionString: url });
  const drop = () => {
    if (h.client !== client) return;
    h.client = null;
    client.end().catch(() => {});
    if (h.listeners.size > 0) {
      const delay = Math.min(30_000, 1000 * 2 ** h.retry++);
      setTimeout(() => void connect(), delay).unref?.();
    }
  };
  try {
    await client.connect();
    client.on("notification", (msg) => {
      if (msg.channel !== "screener" || !msg.payload) return;
      let event: ChangeEvent;
      try {
        event = JSON.parse(msg.payload);
      } catch {
        return;
      }
      for (const l of h.listeners) l(event);
    });
    client.on("error", drop);
    client.on("end", drop);
    await client.query("LISTEN screener");
    h.client = client;
    h.retry = 0;
  } catch {
    client.end().catch(() => {});
    const delay = Math.min(30_000, 1000 * 2 ** h.retry++);
    setTimeout(() => void connect(), delay).unref?.();
  } finally {
    h.connecting = false;
  }
}

export function subscribe(listener: Listener): () => void {
  const h = hub();
  h.listeners.add(listener);
  void connect();
  return () => {
    h.listeners.delete(listener);
    if (h.listeners.size === 0 && h.client) {
      const c = h.client;
      h.client = null;
      c.end().catch(() => {});
    }
  };
}
