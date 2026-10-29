import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/lib/astra/api-user.server";

/** Music relay: Deezer catalog (songs, albums, artists), artwork, lyrics and YouTube lookups load through Astra's server. */
const YT_KEY = "AIzaSyCc5PPxKMk7-hqMK284HwnMISd13wIF15Y";
const DZ = "https://api.deezer.com";

async function authed(request: Request, url: URL) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
  if (!token) return false;
  return Boolean(await authenticateRequest(new Request(request.url, { headers: { authorization: `Bearer ${token}` } })));
}

function json(data: unknown, cache = 300) {
  return Response.json(data, { headers: { "cache-control": `private, max-age=${cache}` } });
}

async function dz(path: string): Promise<any> {
  const r = await fetch(`${DZ}${path}`, { headers: { "user-agent": "Mozilla/5.0 Astra" } }).catch(() => null);
  if (!r?.ok) return {};
  return r.json().catch(() => ({}));
}

const track = (t: any, album?: any) => ({
  id: String(t.id), title: t.title ?? "", artist: t.artist?.name ?? "", artistId: String(t.artist?.id ?? ""),
  album: t.album?.title ?? album?.title ?? "", albumId: String(t.album?.id ?? album?.id ?? ""),
  art: t.album?.cover_big ?? album?.cover_big ?? "", duration: t.duration ?? 0, preview: t.preview ?? "",
});

const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36" };
let scId: { id: string; at: number } | null = null;
async function soundcloudId(): Promise<string> {
  if (scId && Date.now() - scId.at < 6 * 3600_000) return scId.id;
  const html = await (await fetch("https://soundcloud.com", { headers: UA })).text();
  const scripts = [...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js/g)].map((m) => m[0]).reverse();
  for (const src of scripts) {
    const m = (await (await fetch(src)).text()).match(/client_id:"([A-Za-z0-9]{32})"/);
    if (m) { scId = { id: m[1]!, at: Date.now() }; return m[1]!; }
  }
  throw new Error("SoundCloud unavailable");
}

type Want = { title: string; artist: string; duration: number };
const BAD = /\b(cover|covered|remix|nightcore|sped ?up|slowed|reverb|karaoke|instrumental|8d|mashup|bass ?boost(ed)?|tribute|parody|piano version|lofi|lo-fi|type beat|reaction)\b/i;
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
/** Scores how likely a candidate is the original studio recording of the wanted song. */
function matchScore(title: string, artist: string, dur: number, w: Want) {
  const wt = norm(w.title.replace(/\(.*?\)|\[.*?\]/g, "")), wa = norm(w.artist.split(/,|&| feat/i)[0] ?? w.artist);
  const ct = norm(title), ca = norm(artist);
  let s = 0;
  if (ct.includes(wt)) s += 5;
  else { const words = wt.split(" ").filter(Boolean); const hit = words.filter((x) => ct.includes(x)).length; s += words.length ? (hit / words.length) * 3 : 0; }
  if (wa && (ca.includes(wa) || ct.includes(wa) || wa.includes(ca))) s += 4;
  if (BAD.test(title) && !BAD.test(w.title)) s -= 8;
  if (/\blive\b/i.test(title) && !/\blive\b/i.test(w.title)) s -= 3;
  if (dur && w.duration) { const d = Math.abs(dur - w.duration); s += d <= 3 ? 4 : d <= 8 ? 2 : d <= 20 ? 0 : -4; }
  return s;
}

/** Finds a playable audio URL for a song on the chosen server, preferring the original recording. */
async function resolveAudio(server: string, w: Want, preview: string): Promise<string | null> {
  const q = `${w.artist} ${w.title}`;
  if (server === "deezer") return /^https:\/\/[a-z0-9-]+\.dzcdn\.net\//i.test(preview) ? preview : null;
  if (server === "audius") {
    const r: any = await fetch(`https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(q)}&app_name=birchblock`).then((x) => x.json()).catch(() => ({}));
    const ranked = (r.data ?? []).filter((x: any) => x?.is_streamable !== false)
      .map((x: any) => ({ x, s: matchScore(x.title ?? "", x.user?.name ?? "", x.duration ?? 0, w) }))
      .sort((a: any, b: any) => b.s - a.s);
    const t = ranked[0]?.s >= 7 ? ranked[0].x : null;
    return t ? `https://api.audius.co/v1/tracks/${encodeURIComponent(t.id)}/stream?app_name=birchblock` : null;
  }
  if (server === "soundcloud") {
    const cid = await soundcloudId();
    const r: any = await fetch(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&limit=20&client_id=${cid}`, { headers: UA }).then((x) => x.json()).catch(() => ({}));
    const ranked = (r.collection ?? [])
      .filter((t: any) => t.policy !== "BLOCK" && t.policy !== "SNIP")
      .map((t: any) => ({ t, s: matchScore(t.title ?? "", t.publisher_metadata?.artist || t.user?.username || "", Math.round((t.full_duration ?? t.duration ?? 0) / 1000), w) }))
      .sort((a: any, b: any) => b.s - a.s);
    for (const { t, s } of ranked.slice(0, 5)) {
      if (s < 7) break;
      const prog = (t.media?.transcodings ?? []).find((x: any) => x.format?.protocol === "progressive");
      if (!prog) continue;
      const j: any = await fetch(`${prog.url}?client_id=${cid}`, { headers: UA }).then((x) => x.json()).catch(() => ({}));
      if (j.url) return j.url;
    }
    return null;
  }
  return null;
}
const AUDIO_HOST = /^https:\/\/(([a-z0-9-]+\.)*(dzcdn\.net|sndcdn\.com)\/|api\.audius\.co\/v1\/tracks\/)/i;
const albumOf = (a: any) => ({ id: String(a.id), title: a.title ?? "", artist: a.artist?.name ?? "", art: a.cover_big ?? "", year: (a.release_date ?? "").slice(0, 4) });
const artistOf = (a: any) => ({ id: String(a.id), name: a.name ?? "", art: a.picture_big ?? "", fans: a.nb_fan ?? 0 });
const playlistOf = (p: any) => ({ id: String(p.id), title: p.title ?? "", art: p.picture_big ?? "", count: p.nb_tracks ?? 0, by: p.user?.name ?? "" });
const id = (v: string | null) => (/^\d{1,15}$/.test(v ?? "") ? v : null);

async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  if (!(await authed(request, url))) return new Response("Unauthorized", { status: 401 });
  const q = encodeURIComponent((url.searchParams.get("q") ?? "").slice(0, 200));

  switch (url.searchParams.get("op")) {
    case "home": {
      const d = await dz("/chart/0?limit=30");
      return json({
        tracks: (d.tracks?.data ?? []).map((t: any) => track(t)),
        albums: (d.albums?.data ?? []).map(albumOf),
        artists: (d.artists?.data ?? []).map(artistOf),
      }, 1800);
    }
    case "search": {
      const [t, al, ar] = await Promise.all([dz(`/search?q=${q}&limit=30`), dz(`/search/album?q=${q}&limit=20`), dz(`/search/artist?q=${q}&limit=12`)]);
      return json({ tracks: (t.data ?? []).map((x: any) => track(x)), albums: (al.data ?? []).map(albumOf), artists: (ar.data ?? []).map(artistOf) });
    }
    case "album": {
      const i = id(url.searchParams.get("id"));
      if (!i) return new Response("Bad id", { status: 400 });
      const a = await dz(`/album/${i}`);
      return json({ ...albumOf(a), tracks: (a.tracks?.data ?? []).map((t: any) => track(t, a)) }, 3600);
    }
    case "artist": {
      const i = id(url.searchParams.get("id"));
      if (!i) return new Response("Bad id", { status: 400 });
      const [a, top, albums] = await Promise.all([dz(`/artist/${i}`), dz(`/artist/${i}/top?limit=20`), dz(`/artist/${i}/albums?limit=40`)]);
      return json({ ...artistOf(a), tracks: (top.data ?? []).map((t: any) => track(t)), albums: (albums.data ?? []).map((x: any) => albumOf({ ...x, artist: a })) }, 3600);
    }
    case "art": {
      const src = url.searchParams.get("src") ?? "";
      if (!/^https:\/\/([a-z0-9-]+\.)*(dzcdn\.net|deezer\.com|mzstatic\.com)\//i.test(src)) return new Response("Bad url", { status: 400 });
      const r = await fetch(src);
      return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "image/jpeg", "cache-control": "private, max-age=86400" } });
    }
    case "resolve": {
      const raw = (url.searchParams.get("q") ?? "").slice(0, 200);
      try {
        const want: Want = { title: url.searchParams.get("title") || raw, artist: url.searchParams.get("artist") ?? "", duration: Number(url.searchParams.get("duration") ?? 0) || 0 };
        const audio = await resolveAudio(url.searchParams.get("server") ?? "", want, url.searchParams.get("preview") ?? "");
        return json({ url: audio }, 0);
      } catch (e) { return json({ url: null, error: e instanceof Error ? e.message : "failed" }, 0); }
    }
    case "audio": {
      const src = url.searchParams.get("u") ?? "";
      if (!AUDIO_HOST.test(src)) return new Response("Bad url", { status: 400 });
      const range = request.headers.get("range");
      const r = await fetch(src, { headers: { ...UA, ...(range ? { range } : {}) }, redirect: "follow" });
      const h = new Headers({ "content-type": r.headers.get("content-type") ?? "audio/mpeg", "cache-control": "private, max-age=3600", "accept-ranges": "bytes" });
      for (const k of ["content-length", "content-range"]) { const v = r.headers.get(k); if (v) h.set(k, v); }
      return new Response(r.body, { status: r.status, headers: h });
    }
    case "genres": {
      const d = await dz("/genre");
      return json({ genres: (d.data ?? []).filter((g: any) => g.id !== 0).map((g: any) => ({ id: String(g.id), name: g.name, art: g.picture_big ?? "" })) }, 86400);
    }
    case "genre": {
      const i = id(url.searchParams.get("id"));
      if (!i) return new Response("Bad id", { status: 400 });
      const [c, g] = await Promise.all([dz(`/chart/${i}?limit=40`), dz(`/genre/${i}`)]);
      return json({ name: g.name ?? "Genre", tracks: (c.tracks?.data ?? []).map((t: any) => track(t)), albums: (c.albums?.data ?? []).map(albumOf), artists: (c.artists?.data ?? []).map(artistOf), playlists: (c.playlists?.data ?? []).map(playlistOf) }, 1800);
    }
    case "charts-playlists": {
      const d = await dz("/chart/0/playlists?limit=24");
      return json({ playlists: (d.data ?? []).map(playlistOf) }, 1800);
    }
    case "playlist": {
      const i = id(url.searchParams.get("id"));
      if (!i) return new Response("Bad id", { status: 400 });
      const p = await dz(`/playlist/${i}`);
      return json({ ...playlistOf(p), tracks: (p.tracks?.data ?? []).map((t: any) => track(t)) }, 3600);
    }
    case "lyrics": {
      const artist = url.searchParams.get("artist") ?? "";
      let text = "", synced = "";
      try {
        const lr = await fetch(`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${q}`, { headers: { "user-agent": "BirchBlock/1.0" } });
        if (lr.ok) { const d: any = await lr.json(); text = d.plainLyrics ?? ""; synced = d.syncedLyrics ?? ""; }
      } catch { /* fall through */ }
      if (!text && !synced) {
        try {
          const ls = await fetch(`https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${q}`, { headers: { "user-agent": "BirchBlock/1.0" } });
          if (ls.ok) { const arr: any[] = await ls.json(); const hit = arr.find((x) => x.plainLyrics || x.syncedLyrics); if (hit) { text = hit.plainLyrics ?? ""; synced = hit.syncedLyrics ?? ""; } }
        } catch { /* fall through */ }
      }
      if (!text && !synced) {
        const r = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${q}`).catch(() => null);
        const d: any = r?.ok ? await r.json().catch(() => ({})) : {};
        text = String(d.lyrics ?? "").trim();
      }
      return json({ lyrics: text, synced }, 86400);
    }
    case "download": {
      const want: Want = { title: url.searchParams.get("title") || q, artist: url.searchParams.get("artist") ?? "", duration: Number(url.searchParams.get("duration") ?? 0) || 0 };
      const preview = url.searchParams.get("preview") ?? "";
      const candidates: string[] = [];
      if (/^https:\/\/[a-z0-9-]+\.dzcdn\.net\//i.test(preview)) candidates.push(preview);
      for (const sv of ["soundcloud", "audius"]) {
        try { const u = await resolveAudio(sv, want, ""); if (u) candidates.push(u); } catch { /* ignore */ }
      }
      let r: Response | null = null;
      for (const src of candidates) {
        try {
          const res = await fetch(src, { headers: UA, redirect: "follow" });
          if (res.ok && res.body) { r = res; break; }
        } catch { /* try next */ }
      }
      if (!r) return new Response("No downloadable version found", { status: 404 });
      const fname = `${want.artist} - ${want.title}`.replace(/[\\/:*?"<>|]/g, "").slice(0, 100).trim() || "song";
      return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "audio/mpeg", "content-disposition": `attachment; filename="${fname}.mp3"`, "cache-control": "private, no-store" } });
    }
    case "video": {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=8&videoEmbeddable=true&q=${q}&key=${YT_KEY}`);
      if (!r.ok) return json({ ids: [], error: `YouTube ${r.status}` }, 0);
      const d: any = await r.json();
      const want: Want = { title: url.searchParams.get("title") ?? "", artist: url.searchParams.get("artist") ?? "", duration: 0 };
      const items = (d.items ?? []).filter((i: any) => typeof i?.id?.videoId === "string" && /^[\w-]{11}$/.test(i.id.videoId));
      const ranked = want.title
        ? items.map((i: any, n: number) => ({ i, s: matchScore(i.snippet?.title ?? "", i.snippet?.channelTitle ?? "", 0, want) + (/official (audio|video)|topic$/i.test(`${i.snippet?.title} ${i.snippet?.channelTitle}`) ? 3 : 0) - n * 0.3 })).sort((a: any, b: any) => b.s - a.s).map((x: any) => x.i)
        : items;
      const ids = ranked.map((i: any) => i.id.videoId);
      return json({ ids }, 86400);
    }
  }
  return new Response("Unknown op", { status: 400 });
}

export const Route = createFileRoute("/api/music")({ server: { handlers: { GET: handle } } });
