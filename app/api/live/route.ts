// Server-sent events: every submissions / runs / scans change in Postgres,
// relayed to the browser as `event: change`.
import { hasDatabase } from "@/lib/db";
import { subscribe } from "@/lib/live";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Mock mode has nothing to stream. 204 tells EventSource not to reconnect.
  if (!hasDatabase()) return new Response(null, { status: 204 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send("retry: 3000\n\n");
      const unsubscribe = subscribe((e) => send(`event: change\ndata: ${JSON.stringify(e)}\n\n`));
      // Comment lines keep proxies from closing an idle stream.
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
