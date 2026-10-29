import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { openProxied } from "@/lib/astra/proxy";
import type { Prefs } from "@/lib/astra/prefs";

/**
 * App-wide music player. The audio element and YouTube frame live outside any page,
 * so music keeps playing while you move between tabs (Web, Movies, Chat…).
 */
export type Track = { id: string; title: string; artist: string; artistId: string; album: string; albumId: string; art: string; duration: number; preview?: string };

export const SERVERS = [
  { id: "soundcloud", name: "SoundCloud (no ads)" },
  { id: "youtube", name: "YouTube (may have ads)" },
  { id: "audius", name: "Audius" },
  { id: "deezer", name: "Deezer (preview)" },
] as const;
export type Server = (typeof SERVERS)[number]["id"];

type State = { queue: Track[]; cur: number; status: string; paused: boolean; time: number; dur: number; server: Server; mode: "audio" | "video" | null; volume: number };
let state: State = { queue: [], cur: -1, status: "", paused: true, time: 0, dur: 0, server: "soundcloud", mode: null, volume: 1 };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };

let audio: HTMLAudioElement | null = null;
let frame: HTMLIFrameElement | null = null;
let token = "";
let playId = 0;

export async function musicToken() {
  const { data } = await supabase.auth.getSession();
  token = data.session?.access_token ?? "";
  return token;
}
export const artUrl = (src: string) => (src && token ? `/api/music?op=art&src=${encodeURIComponent(src)}&token=${encodeURIComponent(token)}` : "");

export async function musicApi<T>(params: Record<string, string>): Promise<T> {
  if (!(await musicToken())) throw new Error("Please sign in again");
  const res = await fetch(`/api/music?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(res.status === 401 ? "Session expired — sign in again" : `Music couldn't load (${res.status})`);
  return res.json();
}

/** Direct download link for a track, streamed through Astra's server. */
export function downloadUrl(t: Track) {
  const p = new URLSearchParams({ op: "download", title: t.title, artist: t.artist, duration: String(t.duration || 0), ...(t.preview ? { preview: t.preview } : {}) });
  return `/api/music?${p.toString()}&token=${encodeURIComponent(token)}`;
}

function ensure() {
  if (typeof document === "undefined") return;
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    audio.addEventListener("timeupdate", () => set({ time: audio!.currentTime, dur: audio!.duration || state.dur }));
    audio.addEventListener("play", () => set({ paused: false }));
    audio.addEventListener("pause", () => set({ paused: true }));
    audio.addEventListener("ended", () => next());
  }
  if (!frame) {
    frame = document.createElement("iframe");
    frame.title = "Music player";
    frame.allow = "autoplay; encrypted-media";
    Object.assign(frame.style, { position: "fixed", width: "1px", height: "1px", bottom: "0", right: "0", opacity: "0", pointerEvents: "none", border: "0" });
    document.body.appendChild(frame);
  }
  try { const s = localStorage.getItem("bb-music-server2"); if (s && SERVERS.some((x) => x.id === s)) state.server = s as Server; } catch { /* ignore */ }
}

export function setServer(s: Server) { localStorage.setItem("bb-music-server2", s); set({ server: s }); }
export function setVolume(v: number) { ensure(); if (audio) audio.volume = v; set({ volume: v }); }

let prefsRef: Prefs | null = null;
export function setPlayerPrefs(p: Prefs) { prefsRef = p; }

export async function playList(list: Track[], i: number) {
  ensure();
  const t = list[i];
  if (!t || !audio || !frame) return;
  const my = ++playId;
  set({ queue: list, cur: i, status: "Finding the original…", paused: false, time: 0, dur: t.duration, mode: null });
  audio.pause(); audio.removeAttribute("src");
  frame.src = "about:blank";
  await musicToken();
  // Ad-free audio sources first; YouTube (ads) only as a last resort unless picked.
  const rest = (["soundcloud", "audius", "youtube", "deezer"] as Server[]).filter((x) => x !== state.server);
  const order = [state.server, ...rest];
  for (const sv of order) {
    if (my !== playId) return;
    try {
      if (sv === "youtube") {
        const { ids } = await musicApi<{ ids: string[] }>({ op: "video", q: `${t.artist} - ${t.title} official audio`, title: t.title, artist: t.artist });
        if (!ids[0] || my !== playId) continue;
        const src = `https://www.youtube.com/embed/${ids[0]}?autoplay=1&playsinline=1&rel=0`;
        if (prefsRef) await openProxied(frame, src, prefsRef); else frame.src = src;
        set({ status: sv === state.server ? "" : "Playing from YouTube", mode: "video", paused: false });
        return;
      }
      const { url } = await musicApi<{ url: string | null }>({ op: "resolve", server: sv, q: `${t.artist} ${t.title}`, title: t.title, artist: t.artist, duration: String(t.duration || 0), preview: t.preview ?? "" });
      if (!url || my !== playId) continue;
      audio.src = `/api/music?op=audio&u=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
      await audio.play();
      const name = SERVERS.find((x) => x.id === sv)!.name;
      set({ mode: "audio", status: sv === "deezer" ? "30-second preview" : sv === state.server ? "" : `Playing from ${name}` });
      return;
    } catch { /* try next */ }
  }
  if (my === playId) set({ status: "Couldn't find a playable version" });
}

export function toggle() {
  ensure();
  if (state.mode === "audio" && audio?.src) { if (audio.paused) void audio.play(); else audio.pause(); return; }
  if (state.mode === "video" && frame) {
    if (state.paused) { void playList(state.queue, state.cur); } else { frame.src = "about:blank"; set({ paused: true }); }
  }
}
export function next() { if (state.cur < state.queue.length - 1) void playList(state.queue, state.cur + 1); }
export function prev() { if (audio && state.mode === "audio" && audio.currentTime > 4) { audio.currentTime = 0; return; } void playList(state.queue, Math.max(0, state.cur - 1)); }
export function seek(t: number) { if (audio && state.mode === "audio") audio.currentTime = t; }
export function stop() { playId++; audio?.pause(); if (frame) frame.src = "about:blank"; set({ cur: -1, queue: [], mode: null, paused: true }); }
export function getAudio() { ensure(); return audio; }
export function getPlayer() { return state; }

export function usePlayer() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state, () => state);
}
