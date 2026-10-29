import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Download, ListPlus, Loader2, Mic2, Music2, Play, Plus, Search, Sparkles, Trash2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { RoomButton } from "@/components/RoomButton";
import { getRoom, myRoomId, setRoomState, useRoom } from "@/lib/rooms";
import { artUrl, downloadUrl, getAudio, musicApi, musicToken, playList, SERVERS, setServer, usePlayer, type Server, type Track } from "@/lib/music/player";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/music")({
  head: () => ({ meta: [{ title: "Music — BirchBlock" }, { name: "description", content: "Play songs, build playlists and let AI make mixes in BirchBlock." }] }),
  component: Music,
});

type Album = { id: string; title: string; artist: string; art: string; year?: string };
type Artist = { id: string; name: string; art: string; fans?: number };
type Pl = { id: string; title: string; art: string; count: number; by: string };
type Genre = { id: string; name: string; art: string };
type Mine = { id: string; name: string; description: string | null; tracks: Track[] };
type View =
  | { kind: "home" | "search" | "genre"; title: string; tracks: Track[]; albums: Album[]; artists: Artist[]; playlists?: Pl[] }
  | { kind: "album"; data: Album & { tracks: Track[] } }
  | { kind: "artist"; data: Artist & { tracks: Track[]; albums: Album[] } }
  | { kind: "playlist"; data: Pl & { tracks: Track[] } }
  | { kind: "mine"; id: string }
  | { kind: "ai"; name: string; prompt: string; tracks: Track[] };

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function Music() {
  const player = usePlayer();
  const [q, setQ] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [stack, setStack] = useState<View[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyrics, setLyrics] = useState<{ text: string; synced: string } | null>(null);
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [featured, setFeatured] = useState<Pl[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [aiText, setAiText] = useState("");
  const [aiMode, setAiMode] = useState<"playlist" | "find">("playlist");
  const [aiBusy, setAiBusy] = useState(false);
  const [, force] = useState(0);
  const track = player.cur >= 0 ? player.queue[player.cur] : undefined;

  async function go(load: () => Promise<View>, push = true) {
    setLoading(true); setError("");
    try {
      const nextView = await load();
      if (push && view) setStack((s) => [...s, view]);
      setView(nextView);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't load music"); }
    setLoading(false);
  }
  const push = (v: View) => { if (view) setStack((s) => [...s, view]); setView(v); };

  async function loadMine() {
    const { data } = await supabase.from("playlists").select("id,name,description,tracks").order("updated_at", { ascending: false });
    setMine((data ?? []).map((r) => ({ ...r, tracks: (r.tracks as unknown as Track[]) ?? [] })));
  }

  useEffect(() => {
    void musicToken().then(() => force((x) => x + 1));
    go(async () => ({ kind: "home", title: "Top charts", ...(await musicApi<any>({ op: "home" })) }), false);
    musicApi<{ genres: Genre[] }>({ op: "genres" }).then((r) => setGenres(r.genres)).catch(() => {});
    musicApi<{ playlists: Pl[] }>({ op: "charts-playlists" }).then((r) => setFeatured(r.playlists)).catch(() => {});
    void loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term) go(async () => ({ kind: "search", title: `Results for "${term}"`, ...(await musicApi<any>({ op: "search", q: term })) }));
  };
  const openAlbum = (id: string) => go(async () => ({ kind: "album", data: await musicApi<any>({ op: "album", id }) }));
  const openArtist = (id: string) => go(async () => ({ kind: "artist", data: await musicApi<any>({ op: "artist", id }) }));
  const openGenre = (g: Genre) => go(async () => { const r = await musicApi<any>({ op: "genre", id: g.id }); return { kind: "genre", title: g.name, ...r }; });
  const openPlaylist = (id: string) => go(async () => ({ kind: "playlist", data: await musicApi<any>({ op: "playlist", id }) }));
  const back = () => { const p = stack.at(-1); if (p) { setView(p); setStack((s) => s.slice(0, -1)); } };

  // Listen party sync
  const room = useRoom("music");
  function play(list: Track[], i: number) {
    if (getRoom("music")) setRoomState("music", { music: { queue: list.slice(0, 100), cur: i, server: player.server, paused: false, t: 0 } });
    return playList(list, i);
  }
  const seenV = useRef(0);
  useEffect(() => {
    const st = room?.state;
    if (!st?.music || st.v === seenV.current) return;
    seenV.current = st.v;
    if (st.by === myRoomId()) return;
    const m = st.music;
    if (!track || track.id !== m.queue[m.cur]?.id) { void playList(m.queue, m.cur); return; }
    const a = getAudio();
    if (a?.src) {
      if (Math.abs(a.currentTime - m.t) > 3) a.currentTime = m.t;
      if (m.paused && !a.paused) a.pause();
      if (!m.paused && a.paused) void a.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.state?.v]);

  // Playlists
  async function createPlaylist(name: string, tracks: Track[] = [], description: string | null = null) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return null;
    const { data, error: err } = await supabase.from("playlists").insert({ user_id: u.user.id, name, description, tracks: tracks as never }).select("id").single();
    if (err) { toast.error("Couldn't save playlist"); return null; }
    await loadMine();
    return data.id;
  }
  async function saveTracks(id: string, tracks: Track[]) {
    await supabase.from("playlists").update({ tracks: tracks as never, updated_at: new Date().toISOString() }).eq("id", id);
    await loadMine();
  }
  async function addTo(pl: Mine, t: Track) {
    if (pl.tracks.some((x) => x.id === t.id)) { toast("Already in " + pl.name); return; }
    await saveTracks(pl.id, [...pl.tracks, t]);
    toast.success(`Added to ${pl.name}`);
  }
  async function newPlaylistPrompt(t?: Track) {
    const name = window.prompt("Playlist name");
    if (!name?.trim()) return;
    await createPlaylist(name.trim(), t ? [t] : []);
    toast.success(`Created ${name.trim()}`);
  }
  async function deletePlaylist(id: string) {
    if (!window.confirm("Delete this playlist?")) return;
    await supabase.from("playlists").delete().eq("id", id);
    await loadMine();
    back();
  }

  async function runAi(e?: React.FormEvent) {
    e?.preventDefault();
    const prompt = aiText.trim();
    if (!prompt || aiBusy) return;
    setAiBusy(true);
    try {
      const token = await musicToken();
      const res = await fetch("/api/music-ai", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ prompt, mode: aiMode }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "AI couldn't help with that");
      if (!j.tracks.length) throw new Error("No matching songs found — try describing it differently");
      push({ kind: "ai", name: aiMode === "find" ? `Matches for "${prompt}"` : j.name, prompt, tracks: j.tracks });
    } catch (err) { toast.error(err instanceof Error ? err.message : "AI failed"); }
    setAiBusy(false);
  }

  function toggleLyrics() { if (track) setLyricsOpen((v) => !v); }

  // While the lyrics panel is open, fetch the words for the current song and refresh when it changes.
  const lyricTrackId = track?.id;
  useEffect(() => {
    if (!lyricsOpen || !track) return;
    let dead = false;
    setLyricsBusy(true);
    setLyrics(null);
    musicApi<{ lyrics: string; synced?: string }>({ op: "lyrics", q: track.title, artist: track.artist })
      .then((r) => { if (!dead) setLyrics({ text: r.lyrics || "", synced: r.synced ?? "" }); })
      .catch(() => { if (!dead) setLyrics(null); })
      .finally(() => { if (!dead) setLyricsBusy(false); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyricsOpen, lyricTrackId]);

  const AddMenu = ({ t }: { t: Track }) => (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-md p-1.5 text-muted-foreground opacity-70 hover:bg-accent hover:opacity-100" aria-label="Add to playlist"><ListPlus className="size-4" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Add to playlist</DropdownMenuLabel>
        {mine.map((p) => <DropdownMenuItem key={p.id} onClick={() => addTo(p, t)}>{p.name}{p.tracks.some((x) => x.id === t.id) && <Check className="ml-auto size-3.5" />}</DropdownMenuItem>)}
        {mine.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => newPlaylistPrompt(t)}><Plus className="size-3.5" /> New playlist</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><a href={downloadUrl(t)} download><Download className="size-3.5" /> Download</a></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const Tracks = ({ list, onRemove }: { list: Track[]; onRemove?: (i: number) => void }) => (
    <ol className="music-panel mt-3 divide-y divide-border/60 overflow-hidden rounded-xl">
      {list.map((t, i) => {
        const on = track?.id === t.id;
        return (
          <li key={`${t.id}-${i}`} className={cn("group flex items-center gap-3 px-3 py-2 transition hover:bg-accent/60", on && "bg-accent")}>
            <span className={cn("w-5 text-right text-xs tabular-nums text-muted-foreground", on && "text-primary")}>{on && !player.paused ? <span className="music-eq" aria-hidden><i /><i /><i /></span> : i + 1}</span>
            <button onClick={() => play(list, i)} className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted" aria-label={`Play ${t.title}`}>
              {t.art && <img src={artUrl(t.art)} alt="" loading="lazy" className="size-full object-cover" />}
              <span className="absolute inset-0 grid place-items-center bg-background/60 opacity-0 transition group-hover:opacity-100"><Play className="size-4" /></span>
            </button>
            <div className="min-w-0 flex-1">
              <button onClick={() => play(list, i)} className={cn("block max-w-full truncate text-left text-sm font-medium", on && "text-primary")}>{t.title}</button>
              <div className="truncate text-xs text-muted-foreground">
                <button onClick={() => openArtist(t.artistId)} className="hover:underline">{t.artist}</button>
                {t.album && <> · <button onClick={() => openAlbum(t.albumId)} className="hover:underline">{t.album}</button></>}
              </div>
            </div>
            <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">{t.duration ? fmt(t.duration) : ""}</span>
            <AddMenu t={t} />
            {onRemove && <button onClick={() => onRemove(i)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" aria-label="Remove"><Trash2 className="size-4" /></button>}
          </li>
        );
      })}
      {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">No songs yet.</li>}
    </ol>
  );
  const Card = ({ art, title, sub, onClick, round }: { art: string; title: string; sub?: string | undefined; onClick: () => void; round?: boolean }) => (
    <button onClick={onClick} className="music-card group w-36 shrink-0 text-left sm:w-40">
      <div className={cn("relative aspect-square overflow-hidden bg-muted shadow-md", round ? "rounded-full" : "rounded-xl")}>
        {art ? <img src={artUrl(art)} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="music-gradient grid size-full place-items-center"><Music2 className="size-8 opacity-70" /></div>}
        {!round && <span className="absolute bottom-2 right-2 grid size-9 translate-y-2 place-items-center rounded-full bg-primary text-primary-foreground opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100"><Play className="size-4" /></span>}
      </div>
      <div className={cn("mt-2 truncate text-sm font-medium", round && "text-center")}>{title}</div>
      {sub && <div className={cn("truncate text-xs text-muted-foreground", round && "text-center")}>{sub}</div>}
    </button>
  );
  const Row = ({ children }: { children: React.ReactNode }) => <div className="mt-3 flex gap-4 overflow-x-auto pb-3">{children}</div>;
  const H = ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => <div className="mt-9 flex items-end justify-between"><h2 className="font-display text-2xl">{children}</h2>{action}</div>;
  const Hero = ({ art, label, title, sub, tracks, round, extra }: { art?: string | undefined; label: string; title: string; sub: string; tracks: Track[]; round?: boolean; extra?: React.ReactNode }) => (
    <div className="music-hero relative overflow-hidden rounded-2xl p-5 sm:p-7">
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end">
        <div className={cn("size-36 shrink-0 overflow-hidden bg-muted shadow-2xl sm:size-48", round ? "rounded-full" : "rounded-xl")}>
          {art ? <img src={artUrl(art)} alt="" className="size-full object-cover" /> : <div className="music-gradient grid size-full place-items-center"><Music2 className="size-12 opacity-70" /></div>}
        </div>
        <div className="min-w-0">
          <div className="label-mono">{label}</div>
          <h1 className="font-display text-3xl leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button disabled={!tracks.length} onClick={() => play(tracks, 0)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-lg disabled:opacity-50"><Play className="size-4" /> Play</button>
            {extra}
          </div>
        </div>
      </div>
    </div>
  );

  const mineView = view?.kind === "mine" ? mine.find((m) => m.id === view.id) : undefined;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <MobileMenuButton />
        {stack.length > 0 && <button onClick={back} className="rounded-md p-1.5 hover:bg-accent" aria-label="Back"><ArrowLeft className="size-4" /></button>}
        <form onSubmit={search} className="flex flex-1 items-center gap-2 rounded-full border bg-card px-3 py-1.5">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search songs, albums, artists" className="w-full bg-transparent text-sm outline-none" />
        </form>
        {track && <button onClick={toggleLyrics} className={cn("rounded-md p-2 hover:bg-accent", lyricsOpen && "bg-accent")} aria-label="Lyrics"><Mic2 className="size-4" /></button>}
        <RoomButton kind="music" />
        <select value={player.server} onChange={(e) => setServer(e.target.value as Server)} aria-label="Music source" className="hidden rounded-md border bg-card px-2 py-1.5 text-sm sm:block">
          {SERVERS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-6">
          {error && <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">{error} <button onClick={() => location.reload()} className="ml-2 underline">Retry</button></div>}
          {lyricsOpen && track && <section className="music-panel mb-6 rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="label-mono flex shrink-0 items-center gap-1.5"><Mic2 className="size-3.5" /> Lyrics</div>
              <span className="truncate text-xs text-muted-foreground">{track.artist} · {track.title}</span>
            </div>
            {lyricsBusy ? <p className="mt-3 text-sm text-muted-foreground">Looking up lyrics…</p>
              : lyrics?.synced ? <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">{lyrics.synced.replace(/\[\d{1,2}:\d{1,2}(?:\.\d+)?\]/g, "")}</pre>
              : lyrics?.text ? <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">{lyrics.text}</pre>
              : <p className="mt-3 text-sm text-muted-foreground">No lyrics found for this song.</p>}
          </section>}
          {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</p>}

          {!loading && view?.kind === "home" && <>
            <section className="music-hero relative overflow-hidden rounded-2xl p-6 sm:p-8">
              <div className="relative">
                <div className="label-mono flex items-center gap-1.5"><Sparkles className="size-3.5" /> AI DJ</div>
                <h1 className="mt-1 font-display text-3xl sm:text-5xl">What do you want to hear?</h1>
                <div className="mt-4 inline-flex rounded-full border bg-background/40 p-1 text-sm">
                  <button onClick={() => setAiMode("playlist")} className={cn("rounded-full px-3 py-1", aiMode === "playlist" && "bg-primary text-primary-foreground")}>Make a playlist</button>
                  <button onClick={() => setAiMode("find")} className={cn("rounded-full px-3 py-1", aiMode === "find" && "bg-primary text-primary-foreground")}>Find a song</button>
                </div>
                <form onSubmit={runAi} className="mt-3 flex gap-2">
                  <input value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder={aiMode === "playlist" ? "e.g. chill late-night drive, 2000s R&B and some lo-fi" : "e.g. that song that goes 'is this the real life'"} className="min-w-0 flex-1 rounded-full border bg-background/60 px-4 py-2.5 text-sm outline-none focus:border-primary" />
                  <button disabled={aiBusy || !aiText.trim()} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground shadow-lg disabled:opacity-50">{aiBusy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} {aiBusy ? "Thinking" : "Go"}</button>
                </form>
              </div>
            </section>

            {genres.length > 0 && <>
              <H>Browse by type</H>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {genres.map((g) => (
                  <button key={g.id} onClick={() => openGenre(g)} className="group relative h-20 overflow-hidden rounded-xl bg-muted text-left">
                    {g.art && <img src={artUrl(g.art)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-60 transition duration-500 group-hover:scale-110" />}
                    <span className="music-genre-shade absolute inset-0" />
                    <span className="relative block p-3 font-display text-lg leading-tight">{g.name}</span>
                  </button>
                ))}
              </div>
            </>}

            <H action={<button onClick={() => newPlaylistPrompt()} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm hover:bg-accent"><Plus className="size-3.5" /> New</button>}>Your playlists</H>
            {mine.length ? <Row>{mine.map((p) => <Card key={p.id} art={p.tracks[0]?.art ?? ""} title={p.name} sub={`${p.tracks.length} songs`} onClick={() => push({ kind: "mine", id: p.id })} />)}</Row>
              : <p className="mt-2 text-sm text-muted-foreground">No playlists yet — make one, or ask the AI DJ above.</p>}

            {featured.length > 0 && <><H>Featured playlists</H><Row>{featured.map((p) => <Card key={p.id} art={p.art} title={p.title} sub={`${p.count} songs`} onClick={() => openPlaylist(p.id)} />)}</Row></>}
            <H>Top songs</H><Tracks list={view.tracks.slice(0, 15)} />
            {view.artists.length > 0 && <><H>Top artists</H><Row>{view.artists.map((a) => <Card key={a.id} round art={a.art} title={a.name} onClick={() => openArtist(a.id)} />)}</Row></>}
            {view.albums.length > 0 && <><H>Top albums</H><Row>{view.albums.map((a) => <Card key={a.id} art={a.art} title={a.title} sub={a.artist} onClick={() => openAlbum(a.id)} />)}</Row></>}
          </>}

          {!loading && view && (view.kind === "search" || view.kind === "genre") && <>
            {view.kind === "genre"
              ? <Hero label="Genre" title={view.title} sub={`Top ${view.tracks.length} songs right now`} tracks={view.tracks} art={view.albums[0]?.art} />
              : <h1 className="font-display text-3xl">{view.title}</h1>}
            {view.artists.length > 0 && <><H>Artists</H><Row>{view.artists.map((a) => <Card key={a.id} round art={a.art} title={a.name} onClick={() => openArtist(a.id)} />)}</Row></>}
            <H>Songs</H><Tracks list={view.tracks} />
            {view.playlists && view.playlists.length > 0 && <><H>Playlists</H><Row>{view.playlists.map((p) => <Card key={p.id} art={p.art} title={p.title} sub={`${p.count} songs`} onClick={() => openPlaylist(p.id)} />)}</Row></>}
            {view.albums.length > 0 && <><H>Albums</H><Row>{view.albums.map((a) => <Card key={a.id} art={a.art} title={a.title} sub={a.artist} onClick={() => openAlbum(a.id)} />)}</Row></>}
          </>}

          {!loading && view?.kind === "album" && <>
            <Hero label="Album" art={view.data.art} title={view.data.title} sub={`${view.data.artist}${view.data.year ? ` · ${view.data.year}` : ""} · ${view.data.tracks.length} songs`} tracks={view.data.tracks}
              extra={<button onClick={async () => { await createPlaylist(view.data.title, view.data.tracks); toast.success("Saved to your playlists"); }} className="rounded-full border px-4 py-2 text-sm hover:bg-accent">Save as playlist</button>} />
            <Tracks list={view.data.tracks} />
          </>}

          {!loading && view?.kind === "artist" && <>
            <Hero round label="Artist" art={view.data.art} title={view.data.name} sub={view.data.fans ? `${view.data.fans.toLocaleString()} fans` : ""} tracks={view.data.tracks} />
            <H>Popular</H><Tracks list={view.data.tracks} />
            <H>Albums</H><Row>{view.data.albums.map((a) => <Card key={a.id} art={a.art} title={a.title} sub={a.year} onClick={() => openAlbum(a.id)} />)}</Row>
          </>}

          {!loading && view?.kind === "playlist" && <>
            <Hero label="Playlist" art={view.data.art} title={view.data.title} sub={`${view.data.by ? `By ${view.data.by} · ` : ""}${view.data.tracks.length} songs`} tracks={view.data.tracks}
              extra={<button onClick={async () => { await createPlaylist(view.data.title, view.data.tracks); toast.success("Saved to your playlists"); }} className="rounded-full border px-4 py-2 text-sm hover:bg-accent">Save to my playlists</button>} />
            <Tracks list={view.data.tracks} />
          </>}

          {!loading && view?.kind === "ai" && <>
            <Hero label="Made by AI" title={view.name} sub={`${view.tracks.length} songs · "${view.prompt}"`} tracks={view.tracks} art={view.tracks[0]?.art}
              extra={<button onClick={async () => { const id = await createPlaylist(view.name, view.tracks, view.prompt); if (id) toast.success("Saved to your playlists"); }} className="rounded-full border px-4 py-2 text-sm hover:bg-accent">Save playlist</button>} />
            <Tracks list={view.tracks} />
          </>}

          {!loading && view?.kind === "mine" && (mineView ? <>
            <Hero label="Your playlist" art={mineView.tracks[0]?.art} title={mineView.name} sub={`${mineView.description ? mineView.description + " · " : ""}${mineView.tracks.length} songs`} tracks={mineView.tracks}
              extra={<>
                <button onClick={async () => { const n = window.prompt("Rename playlist", mineView.name); if (n?.trim()) { await supabase.from("playlists").update({ name: n.trim() }).eq("id", mineView.id); await loadMine(); } }} className="rounded-full border px-4 py-2 text-sm hover:bg-accent">Rename</button>
                <button onClick={() => deletePlaylist(mineView.id)} className="rounded-full border px-4 py-2 text-sm text-destructive hover:bg-accent">Delete</button>
              </>} />
            <Tracks list={mineView.tracks} onRemove={(i) => saveTracks(mineView.id, mineView.tracks.filter((_, n) => n !== i))} />
            <p className="mt-3 text-xs text-muted-foreground">Tip: use the <ListPlus className="inline size-3" /> button next to any song to add it here.</p>
          </> : <p className="text-sm text-muted-foreground">Playlist not found.</p>)}
        </div>
      </div>
    </div>
  );
}
