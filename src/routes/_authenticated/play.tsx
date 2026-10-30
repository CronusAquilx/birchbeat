import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { usePrefs } from "@/lib/astra/prefs";
import { openProxied } from "@/lib/astra/proxy";

// Full-tab game player: opens a game through the Astra proxy in its own browser tab.
export const Route = createFileRoute("/_authenticated/play")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ url: typeof s.url === "string" ? s.url : "", name: typeof s.name === "string" ? s.name : "" }),
  head: () => ({ meta: [{ title: "Playing — Astra" }, { name: "description", content: "Play a browser game in its own tab through Astra." }, { property: "og:title", content: "Playing — Astra" }, { property: "og:description", content: "Play a browser game in its own tab through Astra." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Play,
});

function Play() {
  const { url, name } = Route.useSearch();
  const prefs = usePrefs();
  const ref = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (name) document.title = `${name} — Astra`;
    const iframe = ref.current;
    if (!iframe || !url) return;
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
  }, [url, prefs.transport, prefs.wisp]);

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {error && <p className="absolute left-0 right-0 top-0 z-10 bg-background px-4 py-2 text-sm text-destructive">Couldn't load: {error}</p>}
      {!url && <p className="p-6 text-sm text-muted-foreground">No game selected.</p>}
      <iframe ref={ref} title={name || "Game"} className="h-full w-full border-0" allow="fullscreen; autoplay; gamepad; microphone; clipboard-read; clipboard-write; keyboard-map; pointer-lock" allowFullScreen />
    </div>
  );
}
