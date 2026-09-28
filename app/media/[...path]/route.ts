// Serves demo media the pipeline writes to MEDIA_DIR (videos, thumbnails,
// captions, live frames), with Range support so videos can seek.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const TYPES: Record<string, string> = {
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".vtt": "text/vtt; charset=utf-8",
  ".svg": "image/svg+xml",
};

function mediaRoot(): string {
  return path.resolve(process.env.MEDIA_DIR || ".screener/media");
}

export async function GET(req: Request, ctx: RouteContext<"/media/[...path]">) {
  const { path: parts } = await ctx.params;
  const root = mediaRoot();
  const file = path.resolve(root, ...parts);
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type || (file !== root && !file.startsWith(root + path.sep))) {
    return new Response("Not found", { status: 404 });
  }

  let size: number;
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error("not a file");
    size = s.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }

  // Live frames change every second; everything else is immutable per run.
  const cache = path.basename(file).startsWith("live.") ? "no-store" : "public, max-age=3600";
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": cache };

  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
}
