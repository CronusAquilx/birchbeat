import { supabase } from "@/integrations/supabase/client";

type RawHeaders = [string, string][];
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/**
 * Proxy transport that sends every request to Astra's own server (/api/proxy),
 * so the browser never contacts the target site or a third-party Wisp server.
 */
export class AstraRelayTransport {
  ready = false;
  async init() { this.ready = true; }

  async request(remote: URL, method: string, body: BodyInit | null, headers: RawHeaders, signal: AbortSignal | undefined) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? "";
    const payload = body == null || method === "GET" || method === "HEAD" ? new Uint8Array(0) : new Uint8Array(await new Response(body).arrayBuffer());
    const meta = new TextEncoder().encode(JSON.stringify({ url: remote.href, method, headers: Array.isArray(headers) ? headers : Object.entries(headers ?? {}) }));
    const framed = new Uint8Array(4 + meta.length + payload.length);
    new DataView(framed.buffer).setUint32(0, meta.length);
    framed.set(meta, 4);
    framed.set(payload, 4 + meta.length);
    const res = await fetch("/api/proxy", {
      method: "POST",
      signal: signal ?? null,
      headers: { authorization: `Bearer ${token}`, "x-astra-framed": "1", "content-type": "application/octet-stream" },
      body: framed,
    });
    if (res.headers.get("x-astra-status") !== "framed" || !res.body) {
      const text = await res.text().catch(() => "");
      throw new Error(`Astra relay error ${res.status}: ${text.slice(0, 200)}`);
    }
    // Read the metadata prefix, then pass the rest through as the page body.
    const reader = res.body.getReader();
    let buf = new Uint8Array(0);
    const pull = async () => {
      const { done, value } = await reader.read();
      if (done) throw new Error("Astra relay closed early");
      const n = new Uint8Array(buf.length + value.length); n.set(buf); n.set(value, buf.length); buf = n;
    };
    while (buf.length < 4) await pull();
    const len = new DataView(buf.buffer).getUint32(0);
    while (buf.length < 4 + len) await pull();
    const info = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + len))) as { status: number; statusText: string; headers: RawHeaders };
    const rest = buf.slice(4 + len);
    const stream = new ReadableStream<Uint8Array>({
      start(c) { if (rest.length) c.enqueue(rest); },
      async pull(c) { const { done, value } = await reader.read(); if (done) c.close(); else c.enqueue(value); },
      cancel() { void reader.cancel(); },
    });
    return {
      body: (NULL_BODY.has(info.status) ? null : stream) as ReadableStream,
      headers: info.headers ?? [],
      status: info.status,
      statusText: info.statusText,
    };
  }

  connect(
    url: URL, protocols: string[], _h: RawHeaders,
    onopen: (p: string, e: string) => void, onmessage: (d: unknown) => void,
    onclose: (code: number, reason: string) => void, onerror: (e: string) => void,
  ): [(d: unknown) => void, (code: number, reason: string) => void] {
    let ws: WebSocket | null = null;
    let opened = false;
    const pending: unknown[] = [];
    void supabase.auth.getSession().then(({ data }) => {
      const loc = window.location;
      const q = new URLSearchParams({ url: url.href, protocols: (protocols ?? []).join(","), origin: new URL(url.href.replace(/^ws/, "http")).origin, token: data.session?.access_token ?? "" });
      ws = new WebSocket(`${loc.protocol === "https:" ? "wss" : "ws"}://${loc.host}/api/proxy-ws?${q}`);
      ws.binaryType = "arraybuffer";
      ws.onmessage = (e) => {
        if (!opened && typeof e.data === "string" && e.data.startsWith('{"__astra"')) {
          opened = true;
          let p = ""; try { p = JSON.parse(e.data).protocol ?? ""; } catch { /* ignore */ }
          onopen(p, "");
          for (const d of pending.splice(0)) ws!.send(d as string);
          return;
        }
        onmessage(e.data);
      };
      ws.onclose = (e) => onclose(e.code, e.reason);
      ws.onerror = () => onerror("Live connection failed");
    });
    return [
      (d) => { if (ws && opened) ws.send(d as string); else pending.push(d); },
      (code, reason) => { try { ws?.close(code, reason); } catch { /* ignore */ } },
    ];
  }
}
