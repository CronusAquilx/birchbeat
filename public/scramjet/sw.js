importScripts("/scramjet/controller.sw.js");
// Take over immediately so proxied game/site frames never fall through to the app (404).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const PREFIX = "/scramjet/p/";

// Is a full-tab player (/play, cross-origin isolated) open? Then proxied pages must
// also opt in to isolation, or the browser refuses to load them inside it.
async function isolatedTabOpen() {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return all.some((c) => { try { return new URL(c.url).pathname === "/play"; } catch { return false; } });
}

async function withIsolation(res) {
  if (!(await isolatedTabOpen())) return res;
  if (res.type === "opaqueredirect" || res.status === 0) return res;
  const h = new Headers(res.headers);
  h.set("Cross-Origin-Embedder-Policy", "credentialless");
  h.set("Cross-Origin-Resource-Policy", "same-origin");
  const nullBody = [101, 103, 204, 205, 304].includes(res.status);
  return new Response(nullBody ? null : res.body, { status: res.status, statusText: res.statusText, headers: h });
}

// Proxied page asked for a root path on Astra's own domain (e.g. "/manifest.json"
// built from location.origin). Send it to the real site through the proxy instead.
async function rescue(event) {
  const req = event.request;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || u.pathname.startsWith("/scramjet/") || u.pathname.startsWith("/api/")) return null;
  const client = event.clientId ? await self.clients.get(event.clientId) : null;
  if (!client) return null;
  const cu = new URL(client.url);
  if (!cu.pathname.startsWith(PREFIX)) return null;
  const parts = cu.pathname.slice(PREFIX.length).split("/");
  if (parts.length < 3) return null;
  let real;
  try { real = new URL(decodeURIComponent(parts.slice(2).join("/"))); } catch { return null; }
  if (!/^https?:$/.test(real.protocol)) return null;
  const target = real.origin + u.pathname + u.search;
  return Response.redirect(`${PREFIX}${parts[0]}/${parts[1]}/${encodeURIComponent(target)}`, 307);
}

// Proxied URL that points back at Astra's own domain (the site learned the real
// origin, e.g. inside a worker). Swap in the site's real origin and retry.
function fixLeak(req) {
  const u = new URL(req.url);
  if (!u.pathname.startsWith(PREFIX)) return null;
  const parts = u.pathname.slice(PREFIX.length).split("/");
  if (parts.length < 3) return null;
  let inner;
  try { inner = new URL(decodeURIComponent(parts.slice(2).join("/"))); } catch { return null; }
  if (inner.origin !== self.location.origin) return null;
  const io = u.searchParams.get("$io");
  if (!io) return null;
  let real;
  try { real = new URL(io); } catch { return null; }
  if (!/^https?:$/.test(real.protocol) || real.origin === self.location.origin) return null;
  const target = real.origin + inner.pathname + inner.search;
  return `${PREFIX}${parts[0]}/${parts[1]}/${encodeURIComponent(target)}${u.search}`;
}

self.addEventListener("fetch", (event) => {
  const fixed = fixLeak(event.request);
  if (fixed) { event.respondWith(Response.redirect(fixed, 307)); return; }
  if ($scramjetController.shouldRoute(event)) {
    event.respondWith(Promise.resolve($scramjetController.route(event)).then(withIsolation));
    return;
  }
  const u = new URL(event.request.url);
  if (event.request.mode === "navigate" || !event.clientId || u.origin !== self.location.origin || u.pathname.startsWith("/scramjet/") || u.pathname.startsWith("/api/")) return;
  event.respondWith(rescue(event).then((r) => r ?? fetch(event.request)).catch(() => fetch(event.request)));
});
