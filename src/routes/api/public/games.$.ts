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
// Outside hosts many games pull their files from. School/work networks often
// block these, so we relay them through our own domain instead.
const CDN_HOSTS = ["cdn.jsdelivr.net", "fastly.jsdelivr.net", "gcore.jsdelivr.net", "testingcf.jsdelivr.net", "raw.githubusercontent.com", "unpkg.com", "cdnjs.cloudflare.com"];
const CDN_RE = new RegExp("(?:https?:)?//(" + CDN_HOSTS.map((h) => h.replace(/\./g, "\\.")).join("|") + ")/", "g");
const TEXT_EXT = new Set(["html", "htm", "js", "mjs", "css", "json"]);
const rewrite = (text: string, origin: string) => text.replace(CDN_RE, (_m, host) => `${origin}/api/public/games/cdn/${host}/`);
const MIME: Record<string, string> = { html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", js: "text/javascript", mjs: "text/javascript", css: "text/css", json: "application/json", wasm: "application/wasm", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", ico: "image/x-icon", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm", ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2", data: "application/octet-stream", unityweb: "application/octet-stream", txt: "text/plain" };

// Games run in a sandboxed (opaque-origin) frame, where touching localStorage
// throws. This shim gives them an in-memory store so they still boot.
const SHIM = `<script>(function(){try{var UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",N=navigator,D=function(k,v){try{Object.defineProperty(N,k,{get:function(){return v},configurable:true})}catch(e){}};D("userAgent",UA);D("appVersion",UA.slice(8));D("vendor","Google Inc.");D("userAgentData",{brands:[{brand:"Google Chrome",version:"130"},{brand:"Chromium",version:"130"}],mobile:false,platform:"Windows",getHighEntropyValues:function(){return Promise.resolve({platform:"Windows",uaFullVersion:"130.0.0.0"})}});if(!window.chrome)window.chrome={runtime:{},app:{}};}catch(e){}})();(function(){
var H=${JSON.stringify(CDN_HOSTS)},P=new URL("/api/public/games/cdn/",location.href).href;
function rw(u){if(typeof u!=="string")return u;var m=/^(?:https?:)?\\/\\/([^\\/]+)\\//.exec(u);return m&&H.indexOf(m[1])>=0?P+u.replace(/^(?:https?:)?\\/\\//,""):u}
var of=window.fetch;if(of)window.fetch=function(i,o){try{if(typeof i==="string")i=rw(i);else if(i&&i.url&&rw(i.url)!==i.url)i=new Request(rw(i.url),i)}catch(e){}return of.call(this,i,o)};
var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){arguments[1]=rw(String(u));return xo.apply(this,arguments)};
[["HTMLScriptElement","src"],["HTMLImageElement","src"],["HTMLMediaElement","src"],["HTMLSourceElement","src"],["HTMLLinkElement","href"],["HTMLIFrameElement","src"]].forEach(function(p){try{var pr=window[p[0]].prototype,d=Object.getOwnPropertyDescriptor(pr,p[1]);Object.defineProperty(pr,p[1],{configurable:true,enumerable:true,get:d.get,set:function(v){d.set.call(this,rw(v))}})}catch(e){}});
var sa=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(n==="src"||n==="href")v=rw(String(v));return sa.call(this,n,v)};
if(window.Worker){var OW=window.Worker;window.Worker=function(u,o){return new OW(rw(String(u)),o)};window.Worker.prototype=OW.prototype}
var SV={},st;try{if(window.name.indexOf("bbsave:")===0){SV=JSON.parse(window.name.slice(7))||{};window.name=""}}catch(e){}
function sync(){clearTimeout(st);st=setTimeout(function(){try{parent.postMessage({bbSave:1,data:SV},"*")}catch(e){}},1500)}
function m(p){var d=p?SV:{};var A={getItem:function(k){return k in d?d[k]:null},setItem:function(k,v){d[k]=String(v);p&&sync()},removeItem:function(k){delete d[k];p&&sync()},clear:function(){for(var k in d)delete d[k];p&&sync()},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}};return new Proxy(A,{get:function(t,k){if(k in t)return t[k];return typeof k==="string"&&k in d?d[k]:undefined},set:function(t,k,v){d[k]=String(v);p&&sync();return true},deleteProperty:function(t,k){delete d[k];p&&sync();return true},has:function(t,k){return k in t||k in d},ownKeys:function(){return Object.keys(d)},getOwnPropertyDescriptor:function(t,k){if(k in d)return{value:d[k],enumerable:true,configurable:true,writable:true}}})}
function fl(){clearTimeout(st);try{parent.postMessage({bbSave:1,data:SV},"*")}catch(e){}}addEventListener("pagehide",fl);addEventListener("visibilitychange",function(){document.hidden&&fl()});
var SP=1,opn=performance.now.bind(performance),rb=opn(),vb=rb,odn=Date.now;function vt(){return vb+(opn()-rb)*SP}performance.now=vt;Date.now=function(){return Math.round(odn()+vt()-opn())};var orf=window.requestAnimationFrame;if(orf)window.requestAnimationFrame=function(cb){return orf.call(window,function(){cb(vt())})};
addEventListener("message",function(ev){var d=ev.data;if(d&&d.bbSpeed===1&&d.value>0&&d.value<=4){vb=vt();rb=opn();SP=d.value}});
["localStorage","sessionStorage"].forEach(function(n){try{window[n].length}catch(e){try{Object.defineProperty(window,n,{value:m(n==="localStorage"),configurable:true})}catch(_){}}});
function cs(){var s={};return{open:function(n){s[n]=s[n]||new Map();var m=s[n];return Promise.resolve({match:function(r){var v=m.get(String(r.url||r));return Promise.resolve(v?v.clone():undefined)},put:function(r,v){m.set(String(r.url||r),v);return Promise.resolve()},add:function(){return Promise.resolve()},addAll:function(){return Promise.resolve()},delete:function(r){return Promise.resolve(m.delete(String(r.url||r)))},keys:function(){return Promise.resolve([])}})},has:function(n){return Promise.resolve(n in s)},delete:function(n){var h=n in s;delete s[n];return Promise.resolve(h)},keys:function(){return Promise.resolve(Object.keys(s))},match:function(){return Promise.resolve(undefined)}}}
try{window.caches}catch(e){try{Object.defineProperty(window,"caches",{value:cs(),configurable:true})}catch(_){}}
try{window.indexedDB}catch(e){try{Object.defineProperty(window,"indexedDB",{value:undefined,configurable:true})}catch(_){}}
try{navigator.serviceWorker}catch(e){try{Object.defineProperty(navigator,"serviceWorker",{value:undefined,configurable:true})}catch(_){}}
try{document.cookie}catch(e){Object.defineProperty(document,"cookie",{get:function(){return""},set:function(){},configurable:true})}
window.open=function(u){if(u){try{location.href=u}catch(e){}}return null};
addEventListener("pointerdown",function(){try{window.focus()}catch(e){}},true);
addEventListener("load",function(){try{window.focus()}catch(e){}});
var L=window.__bbLock=Object.create(null);try{(new URLSearchParams(location.search).get("mods")||"").split(",").forEach(function(p){if(!/^[A-Za-z0-9_$]{1,40}$/.test(p))return;var k="__bb"+p;Object.defineProperty(Object.prototype,p,{configurable:true,get:function(){var v=L[p];return v!==undefined?v:this[k]},set:function(v){if(this===Object.prototype)return;Object.defineProperty(this,k,{value:v,writable:true,configurable:true,enumerable:false})}})})}catch(e){}
try{var MQ=new URLSearchParams(location.search),MF=MQ.get("mapfn"),MP=MQ.get("probe");if(MF&&/^[A-Za-z0-9_$]{1,40}$/.test(MF)){var MT=0,MI=setInterval(function(){var o=window[MF];if(typeof o==="function"&&!o.__bb){clearInterval(MI);var w=function(m,k){if(typeof k==="string"){var v=L["map:"+k];if(v===undefined&&/^(max_)?(skill|speed|strength|stamina)$/.test(k))v=L["map:*"];if(v!==undefined){try{var pr=o.call(this,m,MP);if(pr!==undefined&&pr!==null)return v}catch(e){}}}return o.apply(this,arguments)};w.__bb=1;window[MF]=w}else if(++MT>600)clearInterval(MI)},100)}}catch(e){}
addEventListener("message",function(ev){var d=ev.data;if(d&&d.bbMod===1&&typeof d.prop==="string"){if(d.value==null)delete L[d.prop];else L[d.prop]=d.value}});
addEventListener("message",function(ev){var d=ev.data;if(!d||d.bbInput!==1)return;try{
if(d.t==="key"){var o={key:d.key,code:d.code,keyCode:d.kc,which:d.kc,bubbles:true,cancelable:true};var tg=document.activeElement||document.body;[tg,document,window].forEach(function(x){x.dispatchEvent(new KeyboardEvent(d.type,o))});}
else{var x=d.x*innerWidth,y=d.y*innerHeight,el=(window.__bbDrag&&d.type!=="mousedown"?window.__bbDrag:null)||document.elementFromPoint(x,y)||document.body;
var bs=typeof d.bs==="number"?d.bs:(d.type==="mousedown"?1:0);var o2={clientX:x,clientY:y,screenX:x,screenY:y,pageX:x,pageY:y,button:d.b||0,buttons:bs,bubbles:true,cancelable:true,composed:true,view:window,pointerId:1,pointerType:"mouse",isPrimary:true,pressure:bs?0.5:0};
if(d.type==="mousedown")window.__bbDrag=el;var pt=d.type.replace("mouse","pointer");try{el.dispatchEvent(new PointerEvent(pt,o2))}catch(e){}el.dispatchEvent(new MouseEvent(d.type,o2));
if(d.type==="mouseup"){el.dispatchEvent(new MouseEvent("click",o2));window.__bbDrag=null}}
}catch(e){}});})();</script>`;

const injectShim = (html: string) => (/<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + SHIM) : SHIM + html);

export const Route = createFileRoute("/api/public/games/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const origin = new URL(request.url).origin;
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

        if (kind === "cdn") {
          const [, host, ...rest] = parts;
          if (!host || !CDN_HOSTS.includes(host) || !rest.length || rest.some((x) => x === ".." || x === ".")) return new Response("Not found", { status: 404 });
          const upstream = await fetch(`https://${host}/${rest.join("/")}${new URL(request.url).search}`, {
            headers: request.headers.get("range") ? { range: request.headers.get("range")! } : {},
          });
          if (!upstream.ok && upstream.status !== 206) return new Response("Not found", { status: upstream.status === 404 ? 404 : 502, headers: { "access-control-allow-origin": "*" } });
          const ext = (rest[rest.length - 1]!.split(".").pop() ?? "").toLowerCase();
          const headers = new Headers({ "content-type": MIME[ext] ?? upstream.headers.get("content-type") ?? "application/octet-stream", "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" });
          for (const h of ["content-range", "accept-ranges"]) { const v = upstream.headers.get(h); if (v) headers.set(h, v); }
          if (TEXT_EXT.has(ext)) {
            const body = rewrite(await upstream.text(), origin);
            return new Response(ext === "html" || ext === "htm" ? injectShim(body) : body, { status: upstream.status, headers });
          }
          return new Response(upstream.body, { status: upstream.status, headers });
        }

        if (kind === "play" && (parts.length > 2 || (file && !/\.html?$/i.test(file)))) {
          // Relative assets (scripts, images, sounds) requested by a game page.
          const rest = parts.slice(1);
          if (!rest.every((x) => SAFE.test(x) && x !== "..")) return new Response("Not found", { status: 404 });
          const res = await fetch(`${RAW}/html/main/${rest.map(encodeURIComponent).join("/")}`);
          if (!res.ok) return new Response("Not found", { status: 404 });
          const ext = (rest[rest.length - 1]!.split(".").pop() ?? "").toLowerCase();
          const h = { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" };
          if (TEXT_EXT.has(ext)) return new Response(rewrite(await res.text(), origin), { headers: h });
          return new Response(res.body, { headers: h });
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
          const html = injectShim(rewrite(await res.text(), origin));
          return new Response(html, {
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
          });
        }

        return new Response("Not found", { status: 404 });
      },
    },
  },
});
