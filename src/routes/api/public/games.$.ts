import { createFileRoute } from "@tanstack/react-router";

/**
 * Game library relay. Pulls the GN Math catalog and individual game files from
 * GitHub (jsDelivr blocks that account) and serves them from Astra's domain.
 * Public on purpose: it only relays a fixed, public game catalog — no user data.
 *   /api/public/games/list            → [{ id, name, cover, file, author }]
 *   /api/public/games/play/<file>     → the game's HTML page
 *   /api/public/games/cover/<file>    → the cover image
 */
const RAW = "https://raw.githubusercontent.com/gn-math";
const SAFE = /^[A-Za-z0-9._-]{1,120}$/;
const MIME: Record<string, string> = { html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", js: "text/javascript", mjs: "text/javascript", css: "text/css", json: "application/json", wasm: "application/wasm", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", ico: "image/x-icon", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm", ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2", data: "application/octet-stream", unityweb: "application/octet-stream", txt: "text/plain" };

// Games run in a sandboxed (opaque-origin) frame, where touching localStorage
// throws. This shim gives them an in-memory store so they still boot.
const SHIM = `<script>(function(){function m(){var d={};return{getItem:function(k){return k in d?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}
["localStorage","sessionStorage"].forEach(function(n){try{window[n].length}catch(e){try{Object.defineProperty(window,n,{value:m(),configurable:true})}catch(_){}}});
function cs(){var s={};return{open:function(n){s[n]=s[n]||new Map();var m=s[n];return Promise.resolve({match:function(r){var v=m.get(String(r.url||r));return Promise.resolve(v?v.clone():undefined)},put:function(r,v){m.set(String(r.url||r),v);return Promise.resolve()},add:function(){return Promise.resolve()},addAll:function(){return Promise.resolve()},delete:function(r){return Promise.resolve(m.delete(String(r.url||r)))},keys:function(){return Promise.resolve([])}})},has:function(n){return Promise.resolve(n in s)},delete:function(n){var h=n in s;delete s[n];return Promise.resolve(h)},keys:function(){return Promise.resolve(Object.keys(s))},match:function(){return Promise.resolve(undefined)}}}
try{window.caches}catch(e){try{Object.defineProperty(window,"caches",{value:cs(),configurable:true})}catch(_){}}
try{window.indexedDB}catch(e){try{Object.defineProperty(window,"indexedDB",{value:undefined,configurable:true})}catch(_){}}
try{navigator.serviceWorker}catch(e){try{Object.defineProperty(navigator,"serviceWorker",{value:undefined,configurable:true})}catch(_){}}
try{document.cookie}catch(e){Object.defineProperty(document,"cookie",{get:function(){return""},set:function(){},configurable:true})}
window.open=function(u){if(u){try{location.href=u}catch(e){}}return null};
addEventListener("pointerdown",function(){try{window.focus()}catch(e){}},true);
addEventListener("load",function(){try{window.focus()}catch(e){}});
addEventListener("message",function(ev){var d=ev.data;if(!d||d.bbInput!==1)return;try{
if(d.t==="key"){var o={key:d.key,code:d.code,keyCode:d.kc,which:d.kc,bubbles:true,cancelable:true};var tg=document.activeElement||document.body;[tg,document,window].forEach(function(x){x.dispatchEvent(new KeyboardEvent(d.type,o))});}
else{var x=d.x*innerWidth,y=d.y*innerHeight,el=document.elementFromPoint(x,y)||document.body;var o2={clientX:x,clientY:y,button:d.b||0,buttons:d.type.indexOf("down")>0?1:0,bubbles:true,cancelable:true,pointerId:1,pointerType:"mouse",isPrimary:true};
var pt=d.type.replace("mouse","pointer");try{el.dispatchEvent(new PointerEvent(pt,o2))}catch(e){}el.dispatchEvent(new MouseEvent(d.type,o2));if(d.type==="mouseup")el.dispatchEvent(new MouseEvent("click",o2));}
}catch(e){}});})();</script>`;

export const Route = createFileRoute("/api/public/games/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parts = (params._splat ?? "").split("/");
        const [kind, file] = parts;

        if (kind === "list") {
          const res = await fetch(`${RAW}/assets/main/zones.json`);
          if (!res.ok) return new Response("Game list unavailable", { status: 502 });
          const zones = (await res.json()) as Array<{ id: number; name: string; cover: string; url: string; author?: string }>;
          const games = zones
            .filter((z) => z.id >= 0 && z.url.startsWith("{HTML_URL}/"))
            .map((z) => ({
              id: z.id,
              name: z.name,
              author: z.author ?? "",
              file: z.url.replace("{HTML_URL}/", ""),
              cover: z.cover.replace("{COVER_URL}/", ""),
            }));
          return Response.json(games, { headers: { "cache-control": "public, max-age=1800" } });
        }

        if (kind === "play" && (parts.length > 2 || (file && !/\.html?$/i.test(file)))) {
          // Relative assets (scripts, images, sounds) requested by a game page.
          const rest = parts.slice(1);
          if (!rest.every((x) => SAFE.test(x) && x !== "..")) return new Response("Not found", { status: 404 });
          const res = await fetch(`${RAW}/html/main/${rest.map(encodeURIComponent).join("/")}`);
          if (!res.ok) return new Response("Not found", { status: 404 });
          const ext = (rest[rest.length - 1]!.split(".").pop() ?? "").toLowerCase();
          return new Response(res.body, { headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" } });
        }

        if (!file || !SAFE.test(file)) return new Response("Not found", { status: 404 });

        if (kind === "cover") {
          const res = await fetch(`${RAW}/covers/main/${file}`);
          if (!res.ok) return new Response("Not found", { status: 404 });
          return new Response(res.body, {
            headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
          });
        }

        if (kind === "play") {
          const res = await fetch(`${RAW}/html/main/${file}`);
          if (!res.ok) return new Response("Game not found", { status: 404 });
          let html = await res.text();
          html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + SHIM) : SHIM + html;
          return new Response(html, {
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
          });
        }

        return new Response("Not found", { status: 404 });
      },
    },
  },
});
