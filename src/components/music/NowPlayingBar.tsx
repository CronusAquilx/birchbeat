import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Download, ListMusic, Pause, Play, SkipBack, SkipForward, Volume2, X } from "lucide-react";
import { artUrl, downloadUrl, next, prev, seek, setPlayerPrefs, setVolume, stop, toggle, usePlayer } from "@/lib/music/player";
import { usePrefs } from "@/lib/astra/prefs";
import { cn } from "@/lib/utils";

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

/** Mini player shown on every page so music keeps going while you browse. */
export function NowPlayingBar() {
  const p = usePlayer();
  const prefs = usePrefs();
  useEffect(() => { setPlayerPrefs(prefs); }, [prefs]);
  const t = p.cur >= 0 ? p.queue[p.cur] : undefined;
  if (!t) return null;
  const dur = p.dur || t.duration || 0;
  return (
    <div className="now-playing shrink-0 border-t">
      {p.mode === "audio" && dur > 0 && (
        <input type="range" min={0} max={dur} step={1} value={Math.min(p.time, dur)} onChange={(e) => seek(Number(e.target.value))} aria-label="Seek" className="music-range block w-full" />
      )}
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-2">
        {t.art && <img src={artUrl(t.art)} alt="" className={cn("size-11 rounded-md object-cover shadow", !p.paused && "music-spin-slow")} />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{t.title}</div>
          <div className="truncate text-xs text-muted-foreground">{p.status || t.artist}{p.mode === "audio" && dur ? ` · ${fmt(p.time)} / ${fmt(dur)}` : ""}</div>
        </div>
        <button onClick={prev} className="rounded-md p-2 hover:bg-accent" aria-label="Previous"><SkipBack className="size-4" /></button>
        <button onClick={toggle} className="rounded-full bg-primary p-2.5 text-primary-foreground shadow" aria-label={p.paused ? "Play" : "Pause"}>{p.paused ? <Play className="size-4" /> : <Pause className="size-4" />}</button>
        <button onClick={next} className="rounded-md p-2 hover:bg-accent" aria-label="Next"><SkipForward className="size-4" /></button>
        {p.mode === "audio" && (
          <label className="hidden items-center gap-1 sm:flex"><Volume2 className="size-4 text-muted-foreground" />
            <input type="range" min={0} max={1} step={0.05} value={p.volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" className="music-range w-20" />
          </label>
        )}
        <a href={downloadUrl(t)} download className="hidden rounded-md p-2 hover:bg-accent sm:block" aria-label="Download song"><Download className="size-4" /></a>
        <Link to="/music" className="hidden rounded-md p-2 hover:bg-accent sm:block" aria-label="Open music"><ListMusic className="size-4" /></Link>
        <button onClick={stop} className="rounded-md p-2 hover:bg-accent" aria-label="Stop"><X className="size-4" /></button>
      </div>
    </div>
  );
}
