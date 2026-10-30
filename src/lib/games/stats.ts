import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Per-account game profile, stored as a special row in game_saves (game = "__profile"). */
export type GameStats = {
  favorites: string[];
  plays: Record<string, number>;
  seconds: Record<string, number>;
  last: Record<string, number>;
  mods: number;
  parties: number;
};
const EMPTY: GameStats = { favorites: [], plays: {}, seconds: {}, last: {}, mods: 0, parties: 0 };
const ROW = "__profile";
let state: GameStats = EMPTY;
let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const subs = new Set<() => void>();

async function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try { state = { ...EMPTY, ...JSON.parse(localStorage.getItem("astra-game-stats") || "{}") }; } catch { /* ignore */ }
  subs.forEach((f) => f());
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { data } = await supabase.from("game_saves").select("data").eq("user_id", u.user.id).eq("game", ROW).maybeSingle();
  if (data?.data) { state = { ...EMPTY, ...(data.data as unknown as GameStats) }; subs.forEach((f) => f()); }
}

function update(fn: (s: GameStats) => GameStats) {
  state = fn(state);
  localStorage.setItem("astra-game-stats", JSON.stringify(state));
  subs.forEach((f) => f());
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("game_saves").upsert({ user_id: u.user.id, game: ROW, data: state as never, updated_at: new Date().toISOString() });
  }, 2000);
}

export function useGameStats(): GameStats {
  return useSyncExternalStore((f) => { void start(); subs.add(f); return () => subs.delete(f); }, () => state, () => EMPTY);
}
export const toggleFavorite = (name: string) =>
  update((s) => ({ ...s, favorites: s.favorites.includes(name) ? s.favorites.filter((n) => n !== name) : [name, ...s.favorites] }));
export const recordPlay = (name: string) =>
  update((s) => ({ ...s, plays: { ...s.plays, [name]: (s.plays[name] ?? 0) + 1 }, last: { ...s.last, [name]: Date.now() } }));
export const addSeconds = (name: string, sec: number) =>
  update((s) => ({ ...s, seconds: { ...s.seconds, [name]: (s.seconds[name] ?? 0) + sec } }));
export const recordMod = () => update((s) => ({ ...s, mods: s.mods + 1 }));
export const recordParty = () => update((s) => ({ ...s, parties: s.parties + 1 }));

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
export function achievements(s: GameStats) {
  const plays = sum(s.plays), secs = sum(s.seconds), games = Object.keys(s.plays).length;
  return [
    { id: "first", title: "First game", desc: "Play any game", done: plays >= 1 },
    { id: "ten", title: "Regular", desc: "Play 10 times", done: plays >= 10 },
    { id: "fifty", title: "Addicted", desc: "Play 50 times", done: plays >= 50 },
    { id: "explorer", title: "Explorer", desc: "Try 10 different games", done: games >= 10 },
    { id: "collector", title: "Game collector", desc: "Try 30 different games", done: games >= 30 },
    { id: "hour", title: "One hour in", desc: "Play for 1 hour total", done: secs >= 3600 },
    { id: "tenhour", title: "No life", desc: "Play for 10 hours total", done: secs >= 36000 },
    { id: "fav", title: "Picky", desc: "Favorite 5 games", done: s.favorites.length >= 5 },
    { id: "modder", title: "Cheater", desc: "Make a mod", done: s.mods >= 1 },
    { id: "party", title: "Party starter", desc: "Host a game party", done: s.parties >= 1 },
  ];
}
export const totals = (s: GameStats) => ({ plays: sum(s.plays), seconds: sum(s.seconds), games: Object.keys(s.plays).length });
