import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { searchUrl, usePrefs, type Prefs } from "@/lib/astra/prefs";
import { openProxied } from "@/lib/astra/proxy";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Home, Lock, Plus, RotateCw, Search, X } from "lucide-react";
import { webSearch } from "@/lib/astra/web.functions";
import { MobileMenuButton } from "@/components/astra/AppShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/web")({
  head: () => ({ meta: [{ title: "Web — BirchBlock" }] }),
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s["q"] === "string" && s["q"] ? { q: s["q"] } : {}),
  component: Web,
});

type Result = { title: string; url: string; snippet: string };
type Snap = { title: string; query: string; results: Result[] | null; url: string | null };
type Tab = Snap & { id: number; loading: boolean; back: Snap[]; fwd: Snap[]; nonce: number };
let nextId = 1;
const blank = (): Tab => ({ id: nextId++, title: "New tab", query: "", results: null, url: null, loading: false, back: [], fwd: [], nonce: 0 });

function Web() {
  const search = useServerFn(webSearch);
  const { q: initialQ } = Route.useSearch();
  const prefs = usePrefs();
  const [tabs, setTabs] = useState<Tab[]>(() => [blank()]);
  const [active, setActive] = useState(tabs[0]!.id);
  const [input, setInput] = useState(initialQ ?? "");
  const tab = tabs.find((t) => t.id === active) ?? tabs[0]!;
  const patch = (id: number, p: Partial<Tab>) => setTabs((ts) => ts.map((t) => {
    if (t.id !== id) return t;
    const nav = ("url" in p || "results" in p) && !("back" in p) && (t.url || t.results);
    const snap: Snap = { title: t.title, query: t.query, results: t.results, url: t.url };
    return nav ? { ...t, ...p, back: [...t.back, snap], fwd: [] } : { ...t, ...p };
  }));
  const step = (dir: "back" | "fwd") => {
    const from = dir === "back" ? tab.back : tab.fwd;
    const target = from[from.length - 1];
    if (!target) return;
    const cur: Snap = { title: tab.title, query: tab.query, results: tab.results, url: tab.url };
    const rest = from.slice(0, -1);
    patch(tab.id, dir === "back" ? { ...target, back: rest, fwd: [...tab.fwd, cur] } : { ...target, fwd: rest, back: [...tab.back, cur] });
    setInput(target.url ?? target.query);
  };
  const navBtn = "rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

  useEffect(() => {
    if (initialQ) void go(undefined, initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  async function go(e?: React.FormEvent, override?: string) {
    e?.preventDefault();
    const q = (override ?? input).trim();
    if (!q) return;
    const id = tab.id;
    if (/^https?:\/\/\S+$/i.test(q) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q)) {
      const url = q.startsWith("http") ? q : `https://${q}`;
      if (prefs.openLinksInNewTab) { window.open(url, "_blank", "noopener"); return; }
      patch(id, { url, title: new URL(url).hostname, query: q });
      return;
    }
    if (prefs.searchEngine === "astra") {
      patch(id, { loading: true, query: q, title: q, url: null });
      const { results } = await search({ data: { q } }).catch(() => ({ results: [] as Result[] }));
      patch(id, { results, loading: false });
      return;
    }
    patch(id, { url: searchUrl(q, prefs.searchEngine)!, title: q, query: q, results: null });
  }

  function newTab() {
    const t = blank();
    setTabs((ts) => [...ts, t]);
    setActive(t.id);
    setInput("");
  }
  function close(id: number) {
    setTabs((ts) => {
      const rest = ts.filter((t) => t.id !== id);
      const next = rest.length ? rest : [blank()];
      if (id === active) setActive(next[next.length - 1]!.id);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-end gap-1 overflow-x-auto bg-muted px-2 pt-2">
        <MobileMenuButton />
        {tabs.map((t) => (
          <div key={t.id} className={cn("group flex w-52 shrink-0 items-center gap-2 rounded-t-lg px-3 py-2 text-xs transition-colors", t.id === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60")}>
            <button className="flex min-w-0 flex-1 items-center gap-2" onClick={() => { setActive(t.id); setInput(t.url ?? t.query); }}>
              <Globe className="size-3.5 shrink-0" /><span className="truncate">{t.title}</span>
            </button>
            <button onClick={() => close(t.id)} className="rounded-full p-0.5 opacity-60 hover:bg-accent hover:opacity-100" aria-label="Close tab"><X className="size-3" /></button>
          </div>
        ))}
        <button onClick={newTab} className="mb-1 rounded-full p-1.5 text-muted-foreground hover:bg-card" aria-label="New tab"><Plus className="size-4" /></button>
      </div>
      <form onSubmit={go} className="flex items-center gap-1 border-b bg-card px-2 py-1.5">
        <button type="button" onClick={() => step("back")} disabled={!tab.back.length} className={navBtn} aria-label="Back"><ArrowLeft className="size-4" /></button>
        <button type="button" onClick={() => step("fwd")} disabled={!tab.fwd.length} className={navBtn} aria-label="Forward"><ArrowRight className="size-4" /></button>
        <button type="button" onClick={() => tab.url ? patch(tab.id, { nonce: tab.nonce + 1 }) : tab.query && void go(undefined, tab.query)} className={navBtn} aria-label="Reload"><RotateCw className="size-4" /></button>
        <button type="button" onClick={() => { patch(tab.id, { url: null, results: null, title: "New tab", query: "" }); setInput(""); }} className={navBtn} aria-label="Home"><Home className="size-4" /></button>
        <div className="mx-1 flex flex-1 items-center gap-2 rounded-full bg-muted px-4 py-1.5 focus-within:bg-background focus-within:ring-2 focus-within:ring-ring">
          {tab.url ? <Lock className="size-3.5 text-muted-foreground" /> : <Search className="size-3.5 text-muted-foreground" />}
          <input value={input} onChange={(e) => setInput(e.target.value)} onFocus={(e) => e.target.select()} placeholder="Search or type a URL"
            className="flex-1 bg-transparent text-sm outline-none" />
        </div>
        {tab.url && <a href={tab.url} target="_blank" rel="noreferrer" className={navBtn} aria-label="Open in new window"><ExternalLink className="size-4" /></a>}
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab.url ? (
          <ProxiedFrame key={`${tab.url}#${tab.nonce}`} url={tab.url} title={tab.title} prefs={prefs} onFail={() => {
            if (!/^https?:\/\//i.test(tab.query) && !/^[\w-]+(\.[\w-]+)+/.test(tab.query)) {
              const id = tab.id, q = tab.query;
              patch(id, { url: null, loading: true });
              void search({ data: { q } }).catch(() => ({ results: [] as Result[] })).then(({ results }) => patch(id, { results, loading: false }));
            }
          }} />
        ) : tab.loading ? (
          <p className="p-6 text-sm text-muted-foreground">Searching…</p>
        ) : tab.results ? (
          <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
            {tab.results.length === 0 && <p className="text-sm text-muted-foreground">No results.</p>}
            {tab.results.map((r) => (
              <div key={r.url}>
                <button onClick={() => { patch(tab.id, { url: r.url, title: r.title }); setInput(r.url); }} className="text-left text-base text-star hover:underline">{r.title}</button>
                <div className="truncate text-xs text-muted-foreground">{r.url}</div>
                <p className="mt-1 text-sm">{r.snippet}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <h1 className="font-display text-4xl">Search anything</h1>
            <p className="text-sm text-muted-foreground">Open as many tabs as you like.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProxiedFrame({ url, title, prefs, onFail }: { url: string; title: string; prefs: Prefs; onFail: () => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    openProxied(ref.current!, url, prefs)
      .then(() => { if (!cancelled) setStatus("ready"); })
      .catch(() => { if (!cancelled) { setStatus("error"); onFail(); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, prefs.transport, prefs.wisp]);
  if (status === "error") {
    return (
      <div className="flex h-full flex-col">
        <iframe src={url} title={title} className="w-full flex-1 bg-background" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
        <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">This browser can't run the proxy here, so the site is opened directly. If it stays blank, use the open-in-new-window button.</p>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <iframe ref={ref} title={title} className="w-full flex-1 bg-background" />
      <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
        {status === "loading" && "Starting the proxy…"}
        {status === "ready" && "Loaded through the BirchBlock proxy."}
      </p>
    </div>
  );
}
