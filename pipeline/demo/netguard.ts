// Network policy for the demo browser. The page under test is untrusted: it may
// try to reach the screener's machine (localhost services, the Docker host,
// the LAN, cloud metadata). Only the app's own origin is allowed among those.

function ipv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

function privateV4([a, b]: number[]): boolean {
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) // benchmarking nets, sometimes used internally
  );
}

/** True for loopback, private, link-local and internal host names/addresses. Pure. */
export function isPrivateHost(hostname: string): boolean {
  let h = hostname.toLowerCase().replace(/\.$/, "");
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "host.docker.internal" || h === "gateway.docker.internal" || h.endsWith(".internal")) return true;
  if (h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".home.arpa")) return true;
  const v4 = ipv4(h);
  if (v4) return privateV4(v4);
  if (h.includes(":")) {
    if (h === "::" || h === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
    if (mapped) return privateV4(ipv4(mapped[1]!) ?? [0]);
    return /^f[cd]/.test(h) || /^fe[89ab]/.test(h); // unique-local, link-local
  }
  // A bare single-label name ("router", "postgres") resolves on the local network only.
  return !h.includes(".");
}

/** host:port with default ports filled in, for comparing http(s) and ws(s) origins. */
function hostPort(u: URL): string {
  const port = u.port || (u.protocol === "https:" || u.protocol === "wss:" ? "443" : "80");
  return `${u.hostname.toLowerCase()}:${port}`;
}

/**
 * Should the demo browser refuse this request? Private/loopback hosts are blocked
 * unless they are the app's own origin (compared by host and port, so the app's
 * WebSockets pass too). Non-network schemes (data:, blob:) pass. Pure.
 */
export function shouldBlockRequest(url: string, appOrigin: string | null): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/^(https?|wss?):$/.test(u.protocol)) return u.protocol === "file:";
  if (appOrigin) {
    try {
      if (hostPort(u) === hostPort(new URL(appOrigin))) return false;
    } catch {
      /* bad origin: fall through */
    }
  }
  return isPrivateHost(u.hostname);
}

/**
 * Solari preview URLs carry `?pt_token=`; sub-requests the page makes to the same
 * origin may not. Returns the URL with the token added, or null when nothing to do. Pure.
 */
export function withPreviewToken(url: string, appUrl: string | null): string | null {
  if (!appUrl) return null;
  let app: URL;
  let u: URL;
  try {
    app = new URL(appUrl);
    u = new URL(url);
  } catch {
    return null;
  }
  const token = app.searchParams.get("pt_token");
  if (!token || hostPort(u) !== hostPort(app) || u.searchParams.has("pt_token")) return null;
  u.searchParams.set("pt_token", token);
  return u.toString();
}
