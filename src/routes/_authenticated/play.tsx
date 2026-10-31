import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { usePrefs } from "@/lib/astra/prefs";
import { openProxied } from "@/lib/astra/proxy";

// Full-tab game player: opens a game through the Astra proxy in its own browser tab.
export const Route = createFileRoute("/_authenticated/play")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ url: typeof s["url"] === "string" ? s["url"] : "", name: typeof s["name"] === "string" ? s["name"] : "" }),
  head: () => ({ meta: [{ title: "Playing — Astra" }, { name: "description", content: "Play a browser game in its own tab through Astra." }, { property: "og:title", content: "Playing — Astra" }, { property: "og:description", content: "Play a browser game in its own tab through Astra." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Play,
});

function Play() {
  const { url, name } = Route.useSearch();
  const prefs = usePrefs();
  const ref = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Big games can run the browser out of memory. Never auto-start, so a restored/reloaded tab
  // doesn't instantly crash the browser again; remember if the last start didn't end cleanly.
  const crashKey = `astra:play-running:${url}`;
  const [started, setStarted] = useState(false);
  const [crashedBefore, setCrashedBefore] = useState(false);
  const [lowMemory, setLowMemory] = useState(false);

  useEffect(() => {
    try { setCrashedBefore(localStorage.getItem(crashKey) === "1"); } catch { /* ignore */ }
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    setLowMemory(typeof mem === "number" && mem < 8);
  }, [crashKey]);

  useEffect(() => {
    if (!started) return;
    try { localStorage.setItem(crashKey, "1"); } catch { /* ignore */ }
    const clean = () => { try { localStorage.removeItem(crashKey); } catch { /* ignore */ } };
    window.addEventListener("pagehide", clean);
    return () => { window.removeEventListener("pagehide", clean); clean(); };
  }, [started, crashKey]);

  useEffect(() => {
    if (name) document.title = `${name} — Astra`;
    const iframe = ref.current;
    if (!started || !iframe || !url) return;
    const keepInside = () => {
      try {
        const w = iframe.contentWindow as (Window & { open: typeof window.open }) | null;
        if (w) w.open = ((u?: string | URL) => { if (u) w.location.href = String(u); return null; }) as typeof window.open;
      } catch { /* ignore */ }
    };
    iframe.addEventListener("load", keepInside);
    openProxied(iframe, url, prefs).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => iframe.removeEventListener("load", keepInside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, url, prefs.transport, prefs.wisp]);

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {error && <p className="absolute left-0 right-0 top-0 z-10 bg-background px-4 py-2 text-sm text-destructive">Couldn't load: {error}</p>}
      {!url && <p className="p-6 text-sm text-muted-foreground">No game selected.</p>}
      {url && !started && (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-card-foreground">
            <h1 className="text-xl font-semibold">{name || "Game"}</h1>
            <p className="text-sm text-muted-foreground">This is a very big game. It can use several GB of memory, and if your computer runs out, the browser crashes.</p>
            {crashedBefore && <p className="text-sm text-destructive">This game didn't close properly last time, which usually means the browser ran out of memory.</p>}
            {lowMemory && <p className="text-sm text-destructive">Your device reports less than 8 GB of memory, so this game will probably crash.</p>}
            <p className="text-sm text-muted-foreground">Before starting: close other tabs and apps.</p>
            <div className="flex gap-2">
              <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" onClick={() => setStarted(true)}>Start game</button>
              <button className="rounded-md border border-border px-4 py-2 text-sm" onClick={() => window.close()}>Close tab</button>
            </div>
          </div>
        </div>
      )}
      <iframe ref={ref} title={name || "Game"} className={started ? "h-full w-full border-0" : "hidden"} allow="fullscreen; autoplay; gamepad; microphone; clipboard-read; clipboard-write; keyboard-map; pointer-lock" allowFullScreen />
    </div>
  );
}
