import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/astra/api-user.server";

/**
 * Astra relay: the browser proxy engine sends each page request here and Astra's
 * own server fetches it, so the browser only ever talks to Astra's domain.
 */
const NULL_BODY = new Set([101, 103, 204, 205, 304]);
const DROP_REQ = new Set(["host", "connection", "content-length", "accept-encoding", "transfer-encoding", "upgrade", "keep-alive", "proxy-connection", "te", "trailer"]);
const DROP_RES = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "content-security-policy", "content-security-policy-report-only", "x-frame-options", "cross-origin-opener-policy", "cross-origin-embedder-policy", "cross-origin-resource-policy"]);
// Big stylesheets sometimes fail on first load inside the proxy; retry any that didn't apply.
const RETRY_CSS = "(function(){function f(){document.querySelectorAll('link[rel=stylesheet]').forEach(function(l){if(!l.sheet&&!l.dataset.r){l.dataset.r='1';var n=l.cloneNode();n.dataset.r='1';l.after(n);}});}addEventListener('load',function(){f();setTimeout(f,3000);setTimeout(f,8000);});})();";
const tokenCache = new Map<string, number>();

function blockedHost(host: string) {
  const h = host.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h === "0.0.0.0" || h === "[::1]" ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

async function authorized(request: Request) {
  const token = request.headers.get("authorization") ?? "";
  const exp = tokenCache.get(token);
  if (exp && exp > Date.now()) return true;
  const user = await authenticateRequest(request);
  if (!user) return false;
  if (tokenCache.size > 500) tokenCache.clear();
  tokenCache.set(token, Date.now() + 60_000);
  return true;
}

async function handle(request: Request) {
  if (!(await authorized(request))) return new Response("Unauthorized", { status: 401 });
  // Framed request: [4-byte meta length][JSON meta][body]. Avoids header-size limits
  // (big cookies / header lists made many page files fail to load).
  const buf = new Uint8Array(await request.arrayBuffer());
  let meta: { url?: string; method?: string; headers?: [string, string][] } = {};
  let reqBody: Uint8Array | null = null;
  if (request.headers.get("x-astra-framed") === "1" && buf.length >= 4) {
    const len = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0);
    try { meta = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + len))); } catch { /* ignore */ }
    reqBody = buf.subarray(4 + len);
  } else {
    meta = { url: request.headers.get("x-astra-url") ?? "", method: request.headers.get("x-astra-method") ?? "GET" };
    try { meta.headers = JSON.parse(decodeURIComponent(request.headers.get("x-astra-headers") || "%5B%5D")); } catch { /* ignore */ }
    reqBody = buf;
  }
  const target = meta.url;
  const method = (meta.method || "GET").toUpperCase();
  let url: URL;
  try { url = new URL(target ?? ""); } catch { return new Response("Bad url", { status: 400 }); }
  if (!/^https?:$/.test(url.protocol) || blockedHost(url.hostname)) return new Response("Blocked url", { status: 400 });

  const raw: [string, string][] = Array.isArray(meta.headers) ? meta.headers : [];
  const headers = new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36", "accept-language": "en-US,en;q=0.9" });
  for (const [k, v] of raw) {
    if (typeof k !== "string" || typeof v !== "string" || DROP_REQ.has(k.toLowerCase())) continue;
    try { headers.set(k, v); } catch { /* invalid header */ }
  }
  // YouTube embeds refuse to play ("configuration error") without a referring site.
  if (/(^|\.)youtube(-nocookie)?\.com$/i.test(url.hostname)) headers.set("referer", "https://www.google.com/");
  const body = method === "GET" || method === "HEAD" || !reqBody?.length ? null : reqBody.slice().buffer;

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), { method, headers, body, redirect: "manual" });
  } catch (e) {
    return new Response(`Could not reach ${url.hostname}: ${e instanceof Error ? e.message : String(e)}`, { status: 502 });
  }

  const out: [string, string][] = [];
  upstream.headers.forEach((v, k) => { if (k !== "set-cookie" && !DROP_RES.has(k)) out.push([k, v]); });
  for (const c of upstream.headers.getSetCookie?.() ?? []) out.push(["set-cookie", c]);

  // Framed response: [4-byte meta length][JSON meta][body stream].
  const metaBytes = new TextEncoder().encode(JSON.stringify({ status: upstream.status, statusText: upstream.statusText || "", headers: out }));
  const head = new Uint8Array(4 + metaBytes.length);
  new DataView(head.buffer).setUint32(0, metaBytes.length);
  head.set(metaBytes, 4);
  let upBody: ReadableStream<Uint8Array> | null = NULL_BODY.has(upstream.status) || method === "HEAD" ? null : upstream.body;
  // The proxy rewrites scripts/styles, so integrity hashes would block them (Discord loads unstyled).
  if (upBody && /text\/html/i.test(upstream.headers.get("content-type") ?? "")) {
    const html = (await upstream.text()).replace(/\s(integrity|nonce|crossorigin)=("[^"]*"|'[^']*')/gi, "")
      .replace(/<\/head>/i, `<script>${RETRY_CSS}</script></head>`);
    upBody = new Response(html).body;
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      c.enqueue(head);
      if (upBody) {
        const r = upBody.getReader();
        try { for (;;) { const { done, value } = await r.read(); if (done) break; c.enqueue(value); } } catch (e) { c.error(e); return; }
      }
      c.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "x-astra-status": "framed", "content-type": "application/octet-stream", "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/proxy")({
  server: { handlers: { POST: ({ request }) => handle(request) } },
});
