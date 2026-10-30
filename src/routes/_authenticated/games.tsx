import { AAA_GAMES } from "@/lib/games/aaa";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Gamepad2, Globe, Maximize, RotateCw, Search, Wand2 } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { presetsFor, modsFor, mapReaderFor } from "@/lib/games/mods";
import { RoomButton } from "@/components/RoomButton";
import { useRoom } from "@/lib/rooms";
import { GuestScreen, HostParty } from "@/components/games/GameParty";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { usePrefs } from "@/lib/astra/prefs";
import { openProxied } from "@/lib/astra/proxy";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, SlidersHorizontal } from "lucide-react";
import { AutoMods } from "@/components/games/AutoMods";
import { ExternalLink, Heart, Trophy } from "lucide-react";
import { useGameStats, toggleFavorite, recordPlay, addSeconds, recordMod, recordParty, achievements, totals } from "@/lib/games/stats";

export const Route = createFileRoute("/_authenticated/games")({
  head: () => ({ meta: [{ title: "Games — BirchBlock" }] }),
  component: Games,
});

const SERVERS = [
  { name: "GN Math", url: "https://gn-math-t.github.io/" },
  { name: "Lumin", url: "https://lumin-game.github.io/" },
  { name: "Cloud", url: "https://web.cloudmoonapp.com/" },
  { name: "Emulator", url: "https://demo.emulatorjs.org/" },
  { name: "Arcade", url: "https://www.crazygames.com/" },
  { name: "CKV", url: "https://wanocapy.github.io/ChickenKingsVault/" },
  { name: "Seraph", url: "https://seraph.reveriestudios.online/" },
  { name: "Truffled", url: "https://truffled.lol/" },
  { name: "UGS", url: "https://0288007.github.io/ugs/" },
] as const;

/** Cloud gaming services: big games (GTA V, Call of Duty, Fortnite) stream from their servers. */
const CLOUD = [
  ...AAA_GAMES,
  { name: "Xbox Cloud (GTA V, COD)", url: "https://www.xbox.com/play" },
  { name: "GeForce NOW", url: "https://play.geforcenow.com/" },
  { name: "now.gg", url: "https://now.gg/" },
  { name: "EasyFun", url: "https://www.easyfun.gg/" },
  { name: "Boosteroid", url: "https://cloud.boosteroid.com/" },
  { name: "Amazon Luna", url: "https://luna.amazon.com/" },
  { name: "Krunker", url: "https://krunker.io/" },
  { name: "Shell Shockers", url: "https://shellshock.io/" },
  { name: "Venge.io", url: "https://venge.io/" },
  { name: "Smash Karts", url: "https://smashkarts.io/" },
  { name: "Bloxd.io", url: "https://bloxd.io/" },
  { name: "Minecraft Classic", url: "https://classic.minecraft.net/" },
  { name: "Eaglercraft", url: "https://eaglercraft.com/" },
  { name: "Slither.io", url: "https://slither.io/" },
  { name: "Agar.io", url: "https://agar.io/" },
  { name: "Diep.io", url: "https://diep.io/" },
  { name: "Zombs Royale", url: "https://zombsroyale.io/" },
  { name: "Ev.io", url: "https://ev.io/" },
  { name: "Kirka.io", url: "https://kirka.io/" },
  { name: "1v1.LOL", url: "https://1v1.lol/" },
  { name: "Doom (js-dos)", url: "https://dos.zone/doom-dec-1993/" },
  { name: "Quake (WebQuake)", url: "https://www.netquake.io/" },
  { name: "Polytrack", url: "https://www.kodub.com/apps/polytrack" },
  { name: "Drift Hunters", url: "https://drift-hunters.co/" },
] as const;

type Mode = "games" | "sites" | "cloud";
type Game = { id: number; name: string; author: string; file: string; cover: string };

function Games() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const m = localStorage.getItem("astra-games-mode");
    if (m === "games" || m === "sites" || m === "cloud") setMode(m);
    setReady(true);
  }, []);
  const choose = (m: Mode) => { localStorage.setItem("astra-games-mode", m); setMode(m); };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <MobileMenuButton />
        <h1 className="font-display text-xl">Games</h1>
        {mode && (
          <div className="ml-3 flex rounded-md border p-0.5 text-xs">
            <button onClick={() => choose("games")} className={`rounded px-2 py-1 ${mode === "games" ? "bg-accent" : ""}`}>Just games</button>
            <button onClick={() => choose("sites")} className={`rounded px-2 py-1 ${mode === "sites" ? "bg-accent" : ""}`}>Actual website</button>
            <button onClick={() => choose("cloud")} className={`rounded px-2 py-1 ${mode === "cloud" ? "bg-accent" : ""}`}>Cloud</button>
          </div>
        )}
      </header>
      {!ready ? null : mode === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-lg font-medium">How do you want to play?</p>
          <div className="grid w-full max-w-lg gap-3 sm:grid-cols-2">
            <button onClick={() => choose("games")} className="flex flex-col items-center gap-2 rounded-xl border p-6 hover:bg-accent">
              <Gamepad2 className="size-8" /><span className="font-medium">Just view games</span>
              <span className="text-xs text-muted-foreground">Pick a game and play it here, full screen</span>
            </button>
            <button onClick={() => choose("sites")} className="flex flex-col items-center gap-2 rounded-xl border p-6 hover:bg-accent">
              <Globe className="size-8" /><span className="font-medium">View actual website</span>
              <span className="text-xs text-muted-foreground">Browse the original game sites inside BirchBlock</span>
            </button>
          </div>
        </div>
      ) : mode === "games" ? <Library /> : mode === "cloud" ? <CloudGrid key="cloud" list={CLOUD} note="AAA browser games from browser.wix3.com, plus cloud services. Big games like GTA V and Call of Duty stream from these services. Xbox Cloud needs an Xbox Game Pass Ultimate account, GeForce NOW needs games you own on Steam/Epic. now.gg and EasyFun are free." /> : <Sites key="sites" list={SERVERS} storeKey="astra-game-server" />}
    </div>
  );
}

type Tab = "all" | "favorites" | "recent" | "profile";

function Library() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [limit, setLimit] = useState(120);
  const [playing, setPlaying] = useState<Game | null>(null);
  const stats = useGameStats();

  useEffect(() => {
    fetch("/api/public/games/list")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
      .then(setGames)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const fav = new Set(stats.favorites);
    let list = (games ?? []).filter((g) => !s || g.name.toLowerCase().includes(s));
    if (tab === "favorites") list = list.filter((g) => fav.has(g.name));
    if (tab === "recent") list = list.filter((g) => stats.last[g.name]).sort((a, b) => (stats.last[b.name] ?? 0) - (stats.last[a.name] ?? 0));
    else list = [...list].sort((a, b) => Number(fav.has(b.name)) - Number(fav.has(a.name)));
    return list;
  }, [games, q, tab, stats]);

  const room = useRoom("games");
  if (room && !room.host && room.state?.game) return <GuestScreen />;
  if (playing) return <Player game={playing} onBack={() => setPlaying(null)} />;

  const tabs: [Tab, string][] = [["all", "All"], ["favorites", `Favorites${stats.favorites.length ? ` (${stats.favorites.length})` : ""}`], ["recent", "Recent"], ["profile", "Profile"]];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="flex rounded-md border p-0.5 text-xs">
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded px-2 py-1 transition-colors ${tab === id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{label}</button>
          ))}
        </div>
        {tab !== "profile" && (
          <div className="flex min-w-40 flex-1 items-center gap-2 rounded-md border px-2 py-1">
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(120); }} placeholder={games ? `Search ${games.length} games` : "Loading games…"}
              className="flex-1 bg-transparent text-sm outline-none" />
          </div>
        )}
        <RoomButton kind="games" />
      </div>
      {room && !room.host && <p className="border-b px-3 py-2 text-xs text-muted-foreground">Waiting for the host to start a game…</p>}
      {error && <p className="p-4 text-sm text-destructive">Couldn't load the game list ({error}). Try again later or use "Actual website".</p>}
      {tab === "profile" ? <Profile games={games ?? []} onPlay={setPlaying} /> : (
        <div className="flex-1 overflow-y-auto p-3" onScroll={(e) => { const t = e.currentTarget; if (t.scrollTop + t.clientHeight > t.scrollHeight - 600) setLimit((l) => l + 120); }}>
          {shown.length === 0 && games && <p className="p-6 text-center text-sm text-muted-foreground">{tab === "favorites" ? "Tap the heart on a game to add it here." : tab === "recent" ? "Games you play show up here." : "No games match."}</p>}
          <div className="grid auto-rows-min grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {shown.slice(0, limit).map((g) => {
              const fav = stats.favorites.includes(g.name);
              return (
                <div key={g.id} className="group relative overflow-hidden rounded-xl border bg-card transition-transform hover:-translate-y-0.5 hover:shadow-lg [content-visibility:auto]">
                  <button onClick={() => setPlaying(g)} className="block w-full text-left">
                    <img src={`/api/public/games/cover/${g.cover}`} alt={g.name} loading="lazy" decoding="async" className="aspect-square w-full bg-muted object-cover" />
                    <p className="truncate px-2 py-1.5 text-sm">{g.name}</p>
                  </button>
                  <button onClick={() => toggleFavorite(g.name)} aria-label={fav ? "Remove from favorites" : "Add to favorites"}
                    className={`absolute right-1.5 top-1.5 rounded-full bg-background/80 p-1.5 backdrop-blur transition-opacity ${fav ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}>
                    <Heart className={`size-4 ${fav ? "fill-primary text-primary" : ""}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function Profile({ games, onPlay }: { games: Game[]; onPlay: (g: Game) => void }) {
  const stats = useGameStats();
  const t = totals(stats);
  const ach = achievements(stats);
  const byName = new Map(games.map((g) => [g.name, g]));
  const top = Object.entries(stats.seconds).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Times played", t.plays], ["Games tried", t.games], ["Time played", fmtTime(t.seconds)], ["Mods made", stats.mods]].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="font-display text-2xl">{v}</p></div>
        ))}
      </div>
      <section>
        <h2 className="mb-2 font-medium">Most played</h2>
        {top.length === 0 ? <p className="text-sm text-muted-foreground">Play a game to see it here.</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {top.map(([name, sec]) => { const g = byName.get(name); return (
              <button key={name} disabled={!g} onClick={() => g && onPlay(g)} className="overflow-hidden rounded-xl border bg-card text-left hover:bg-accent">
                {g && <img src={`/api/public/games/cover/${g.cover}`} alt={name} loading="lazy" className="aspect-video w-full object-cover" />}
                <p className="truncate px-2 pt-1.5 text-sm">{name}</p><p className="px-2 pb-1.5 text-xs text-muted-foreground">{fmtTime(sec)}</p>
              </button>
            ); })}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 font-medium">Achievements · {ach.filter((a) => a.done).length}/{ach.length}</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ach.map((a) => (
            <div key={a.id} className={`flex items-center gap-3 rounded-xl border p-3 ${a.done ? "bg-card" : "opacity-50"}`}>
              <Trophy className={`size-6 shrink-0 ${a.done ? "text-primary" : "text-muted-foreground"}`} />
              <div><p className="text-sm font-medium">{a.title}</p><p className="text-xs text-muted-foreground">{a.desc}</p></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Player({ game, onBack }: { game: Game; onBack: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    recordPlay(game.name);
    let acc = 0;
    const id = setInterval(() => { if (!document.hidden) acc += 15; if (acc >= 60) { addSeconds(game.name, acc); acc = 0; } }, 15000);
    return () => { clearInterval(id); if (acc) addSeconds(game.name, acc); };
  }, [game.name]);
  const mods = useMemo(() => modsFor(game.name), [game.name]);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const sendMods = (state: Record<string, boolean>) => {
    mods.forEach((m) => { try { frame.current?.contentWindow?.postMessage({ bbMod: 1, prop: m.prop, value: state[m.id] ? m.value : null }, "*"); } catch { /* frame gone */ } });
  };
  const toggle = (id: string, v: boolean) => setOn((s) => { const n = { ...s, [id]: v }; sendMods(n); return n; });
  const [speed, setSpeed] = useState(1);
  const sendSpeed = (v: number) => { try { frame.current?.contentWindow?.postMessage({ bbSpeed: 1, value: v }, "*"); } catch { /* frame gone */ } };
  const [save, setSave] = useState<Record<string, string> | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState<Record<string, string> | null>(null);
  const applyAuto = async (changes: Record<string, string>) => {
    ignoreSaves.current = Date.now() + 6000;
    const next = { ...saveRef.current, ...changes };
    await persist(next); setSave(next); setAutoOpen(next); setNonce((n) => n + 1);
  };
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const saveRef = useRef<Record<string, string>>({});
  const ignoreSaves = useRef(0);
  const persist = async (data: Record<string, string>) => {
    saveRef.current = data;
    const { data: u } = await supabase.auth.getUser();
    if (u.user) await supabase.from("game_saves").upsert({ user_id: u.user.id, game: game.file, data, updated_at: new Date().toISOString() });
  };
  useEffect(() => {
    let live = true;
    setSave(null);
    supabase.from("game_saves").select("data").eq("game", game.file).maybeSingle().then(({ data }) => {
      if (!live) return;
      const d = (data?.data ?? {}) as Record<string, string>;
      saveRef.current = d; setSave(d);
    });
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || !e.data || e.data.bbSave !== 1) return;
      if (Date.now() < ignoreSaves.current) return; // old frame flushing its pre-mod save
      const d = e.data.data;
      if (d && typeof d === "object" && JSON.stringify(d).length < 2_000_000) void persist(d);
    };
    window.addEventListener("message", onMsg);
    return () => { live = false; window.removeEventListener("message", onMsg); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.file]);
  const runAi = async () => {
    setAiBusy(true); setAiMsg("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/game-ai", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${s.session?.access_token ?? ""}` }, body: JSON.stringify({ game: game.name, prompt: aiText, save: saveRef.current }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setAiMsg(j.error ?? "Couldn't make that mod"); return; }
      ignoreSaves.current = Date.now() + 6000;
      const next = { ...saveRef.current, ...j.changes };
      recordMod();
      await persist(next); setSave(next); setNonce((n) => n + 1);
      setAiMsg("Mod applied! The game reloaded with it."); setAiText("");
    } finally { setAiBusy(false); }
  };
  const qs = new URLSearchParams();
  const props = mods.filter((m) => !m.prop.startsWith("map:")).map((m) => m.prop);
  if (props.length) qs.set("mods", props.join(","));
  const mr = mapReaderFor(game.name);
  if (mr) { qs.set("mapfn", mr.fn); qs.set("probe", mr.probe); }
  const src = `/api/public/games/play/${game.file}${qs.size ? `?${qs}` : ""}`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button onClick={onBack} className="rounded-md border p-1.5" aria-label="Back"><ArrowLeft className="size-4" /></button>
        <p className="truncate font-medium">{game.name}</p>
        <div className="ml-auto flex gap-2">
          {mods.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm" aria-label="Mod menu"><Wand2 className="size-4" /> Mods</DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Mod menu</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {mods.map((m) => (
                  <DropdownMenuCheckboxItem key={m.id} checked={!!on[m.id]} onCheckedChange={(v) => toggle(m.id, !!v)} onSelect={(e) => e.preventDefault()}>{m.label}</DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <select value={speed} onChange={(e) => { const v = Number(e.target.value); setSpeed(v); sendSpeed(v); }} className="rounded-md border bg-background px-2 py-1.5 text-sm" aria-label="Game speed">
            {[0.25, 0.5, 0.75, 1, 1.5, 2, 3].map((v) => <option key={v} value={v}>{v}x speed</option>)}
          </select>
          <button onClick={() => setAutoOpen((v) => (v ? null : { ...saveRef.current }))} className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm" aria-label="Auto mod menu"><SlidersHorizontal className="size-4" /> Auto mods</button>
          <button onClick={() => setAiOpen((v) => !v)} className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm" aria-label="AI mod maker"><Sparkles className="size-4" /> AI mod</button>
          <span className="contents" onClickCapture={() => recordParty()}><HostParty game={game} wrap={wrap} frame={frame} /></span>
          <button onClick={() => setNonce((n) => n + 1)} className="rounded-md border p-1.5" aria-label="Reload"><RotateCw className="size-4" /></button>
          <button onClick={() => wrap.current?.requestFullscreen?.()} className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm" aria-label="Fullscreen">
            <Maximize className="size-4" /> Fullscreen
          </button>
        </div>
      </div>
      {autoOpen && <div className="border-b px-3 py-2"><AutoMods game={game.name} save={autoOpen} onApply={(c) => void applyAuto(c)} /></div>}
      {aiOpen && (
        <form onSubmit={(e) => { e.preventDefault(); if (aiText.trim() && !aiBusy) void runAi(); }} className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <input value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Describe a mod, e.g. give me 1,000,000 coins" className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-sm" />
          <button disabled={aiBusy || !aiText.trim()} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">{aiBusy ? "Making…" : "Make mod"}</button>
          {presetsFor(game.name).length > 0 && <div className="flex w-full flex-wrap gap-1">{presetsFor(game.name).map((p) => <button type="button" key={p} onClick={() => setAiText(p)} className="rounded-full border px-2 py-0.5 text-xs">{p}</button>)}</div>}
          {aiMsg && <p className="w-full text-xs text-muted-foreground">{aiMsg}</p>}
        </form>
      )}
      <div ref={wrap} className="relative min-h-0 flex-1 overflow-hidden bg-background [contain:strict]">
        {save === null ? <p className="p-4 text-sm text-muted-foreground">Loading your save…</p> : <iframe name={`bbsave:${JSON.stringify(saveRef.current)}`} ref={frame} key={nonce} title={game.name} src={src} onLoad={() => { sendMods(on); sendSpeed(speed); }}
          sandbox="allow-scripts allow-pointer-lock allow-forms allow-modals allow-orientation-lock allow-popups allow-downloads allow-presentation"
          allow="fullscreen; autoplay; gamepad; keyboard-map; clipboard-write" allowFullScreen className="h-full w-full border-0" />}
      </div>
    </div>
  );
}

/** Make embedded pages see Chrome (not Edge/Firefox) so "Chrome only" games run. */
function spoofChrome(w: Window | null, depth = 0) {
  if (!w || depth > 3) return;
  try {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
    const nav = w.navigator as Navigator & Record<string, unknown>;
    const def = (k: string, v: unknown) => { try { Object.defineProperty(nav, k, { get: () => v, configurable: true }); } catch { /* ignore */ } };
    def("userAgent", ua);
    def("appVersion", ua.slice(8));
    def("vendor", "Google Inc.");
    def("userAgentData", { brands: [{ brand: "Google Chrome", version: "130" }, { brand: "Chromium", version: "130" }, { brand: "Not?A_Brand", version: "99" }], mobile: false, platform: "Windows", getHighEntropyValues: async () => ({ platform: "Windows", platformVersion: "15.0.0", architecture: "x86", model: "", uaFullVersion: "130.0.0.0", fullVersionList: [{ brand: "Google Chrome", version: "130.0.0.0" }] }) });
    const ww = w as Window & { chrome?: unknown };
    if (!ww.chrome) ww.chrome = { runtime: {}, app: {}, csi: () => ({}), loadTimes: () => ({}) };
    for (let i = 0; i < w.frames.length; i++) spoofChrome(w.frames[i] as Window, depth + 1);
  } catch { /* cross-origin frame */ }
}

function tileHue(name: string) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

// Big browser ports (Skate 3, Madden, GTA V, Counter-Strike…) need "cross-origin
// isolation" and their own site address to boot, which no in-page proxy frame can
// provide. They open in their own tab by default; "inside Astra" stays as a fallback.
const AAA_NAMES = new Set(AAA_GAMES.map((g) => g.name));

function CloudGrid({ list, note }: { list: readonly { name: string; url: string }[]; note?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [inline, setInline] = useState(false);
  const [q, setQ] = useState("");
  const game = open ? list.find((g) => g.name === open) : undefined;
  if (open && game && AAA_NAMES.has(open) && !inline) {
    const h = tileHue(game.name);
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <button onClick={() => setOpen(null)} className="self-start px-3 pt-2 text-sm text-muted-foreground hover:text-foreground">← All cloud games</button>
        <div className="grid flex-1 place-items-center p-6">
          <div className="w-full max-w-md overflow-hidden rounded-xl border bg-card">
            <div className="grid aspect-video place-items-center" style={{ background: `linear-gradient(135deg, oklch(0.55 0.17 ${h}), oklch(0.3 0.12 ${(h + 50) % 360}))` }}>
              <span className="text-6xl font-black text-primary-foreground/90 drop-shadow">{game.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="space-y-3 p-5">
              <h2 className="text-lg font-semibold">{game.name}</h2>
              <p className="text-sm text-muted-foreground">This is a full console/PC game running in the browser. It runs best in its own tab, so it opens in a new tab through the Astra proxy.</p>
              <a href={`/play?url=${encodeURIComponent(game.url)}&name=${encodeURIComponent(game.name)}`} target="_blank" rel="noopener" className="block rounded-md bg-primary px-4 py-2.5 text-center font-medium text-primary-foreground hover:opacity-90">Play in new tab</a>
              <button onClick={() => setInline(true)} className="w-full rounded-md border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Try inside Astra anyway (may not load)</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (open) return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button onClick={() => { setOpen(null); setInline(false); }} className="self-start px-3 pt-2 text-sm text-muted-foreground hover:text-foreground">← All cloud games</button>
      <Sites list={list} storeKey="astra-cloud-server" initial={open} />
    </div>
  );
  const shown = list.filter((g) => g.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {note && <p className="mb-3 text-xs text-muted-foreground">{note}</p>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${list.length} games…`} className="mb-4 w-full max-w-sm rounded-md border bg-background px-3 py-1.5 text-sm" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {shown.map((g) => {
          const h = tileHue(g.name);
          let host = ""; try { host = new URL(g.url).hostname; } catch { /* ignore */ }
          return (
            <button key={g.name} onClick={() => setOpen(g.name)} className="group overflow-hidden rounded-lg border bg-card text-left transition hover:-translate-y-0.5 hover:border-primary">
              <div className="relative grid aspect-square place-items-center" style={{ background: `linear-gradient(135deg, oklch(0.55 0.17 ${h}), oklch(0.3 0.12 ${(h + 50) % 360}))` }}>
                <span className="text-5xl font-black text-primary-foreground/90 drop-shadow">{g.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()}</span>
                {host && <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=128`} alt="" loading="lazy" className="absolute bottom-2 right-2 size-8 rounded" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
              </div>
              <p className="truncate px-2 py-2 text-sm font-medium">{g.name}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Sites({ list, storeKey, note, initial }: { list: readonly { name: string; url: string }[]; storeKey: string; note?: string; initial?: string }) {
  const prefs = usePrefs();
  const ref = useRef<HTMLIFrameElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [server, setServer] = useState<string>(initial ?? list[0]!.name);
  const [nonce, setNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const current = list.find((s) => s.name === server) ?? list[0]!;

  useEffect(() => {
    const s = localStorage.getItem(storeKey);
    if (s && !initial) setServer(s);
  }, []);

  useEffect(() => {
    localStorage.setItem(storeKey, current.name);
    setError(null);
    const iframe = ref.current;
    if (!iframe) return;
    // Keep pop-ups ("open in new tab") inside this frame: a new tab has no proxy
    // attached and shows 404.
    const keepInside = () => {
      spoofChrome(iframe.contentWindow);
      try {
        const w = iframe.contentWindow as (Window & { open: typeof window.open }) | null;
        if (w) w.open = ((u?: string | URL) => { if (u) w.location.href = String(u); return null; }) as typeof window.open;
      } catch { /* cross-origin, ignore */ }
    };
    iframe.addEventListener("load", keepInside);
    const spoofTimer = setInterval(() => spoofChrome(iframe.contentWindow), 300);
    setTimeout(() => clearInterval(spoofTimer), 15000);
    openProxied(iframe, current.url, prefs).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => { clearInterval(spoofTimer); iframe.removeEventListener("load", keepInside); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.name, nonce, prefs.transport, prefs.wisp]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <select value={current.name} onChange={(e) => setServer(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm" aria-label="Site">
          {list.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          <a href={`/play?url=${encodeURIComponent(current.url)}&name=${encodeURIComponent(current.name)}`} target="_blank" rel="noopener" className="rounded-md border p-1.5" aria-label="Open in new tab" title="Open in new tab"><ExternalLink className="size-4" /></a>
          <button onClick={() => setNonce((n) => n + 1)} className="rounded-md border p-1.5" aria-label="Reload"><RotateCw className="size-4" /></button>
          <button onClick={() => wrap.current?.requestFullscreen?.()} className="rounded-md border p-1.5" aria-label="Fullscreen"><Maximize className="size-4" /></button>
        </div>
      </div>
      {note && <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">{note}</p>}
      {error && <p className="px-4 py-2 text-sm text-destructive">Couldn't load {current.name}: {error}. Try another site.</p>}
      <div ref={wrap} className="flex-1">
        <iframe key={`${current.name}-${nonce}`} ref={ref} title={current.name} className="h-full w-full border-0 bg-background" allow="fullscreen; autoplay; gamepad; microphone; clipboard-read; clipboard-write; keyboard-map; pointer-lock" allowFullScreen />
      </div>
    </div>
  );
}
