import { useMemo, useState } from "react";

/**
 * Auto mod menu: scans a game's save for numbers (JSON, key=value / ini lines,
 * base64-wrapped text) and lets the player set any of them. No AI call.
 */
type Field = { key: string; path: string; label: string; value: number; b64: boolean; bool?: boolean };

const decode = (raw: string) => {
  if (raw.length > 16 && /^[A-Za-z0-9+/=\s]+$/.test(raw)) {
    try { const d = atob(raw.replace(/\s/g, "")); if (/^[\x09\x0a\x0d\x20-\x7e]+$/.test(d)) return { text: d, b64: true }; } catch { /* not base64 */ }
  }
  return { text: raw, b64: false };
};

export function detectFields(save: Record<string, string>): Field[] {
  const out: Field[] = [];
  for (const [key, raw] of Object.entries(save)) {
    const { text, b64 } = decode(String(raw ?? ""));
    if (/^-?\d+(\.\d+)?$/.test(text.trim())) { out.push({ key, path: "", label: key, value: Number(text), b64 }); continue; }
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = undefined; }
    if (json && typeof json === "object") {
      const walk = (o: unknown, p: string[]) => {
        if (out.length > 300) return;
        if (typeof o === "number") out.push({ key, path: JSON.stringify(p), label: p.join(" › ") || key, value: o, b64 });
        else if (typeof o === "boolean") out.push({ key, path: JSON.stringify(p), label: p.join(" › ") || key, value: o ? 1 : 0, b64, bool: true });
        else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, [...p, k]);
      };
      walk(json, []);
      continue;
    }
    for (const m of text.matchAll(/^\s*([A-Za-z_][\w. -]{0,40})\s*=\s*"?(-?\d+(?:\.\d+)?)"?\s*$/gm)) {
      out.push({ key, path: `ini:${m[1]}`, label: m[1]!.trim(), value: Number(m[2]), b64 });
    }
  }
  return out.slice(0, 300);
}

function applyField(save: Record<string, string>, f: Field, v: number): string {
  const { text } = decode(String(save[f.key] ?? ""));
  let next = text;
  if (!f.path) next = String(v);
  else if (f.path.startsWith("ini:")) {
    const name = f.path.slice(4).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = text.replace(new RegExp(`^(\\s*${name}\\s*=\\s*"?)-?\\d+(?:\\.\\d+)?("?\\s*)$`, "m"), `$1${v}$2`);
  } else {
    const o = JSON.parse(text); const p = JSON.parse(f.path) as string[];
    let cur = o; for (const k of p.slice(0, -1)) cur = cur[k];
    cur[p[p.length - 1]!] = f.bool ? v !== 0 : v; next = JSON.stringify(o);
  }
  return f.b64 ? btoa(next) : next;
}

/** Groups detected values by what they look like, so quick buttons can act on whole groups. */
const KINDS = [
  { id: "level", re: /level|lvl|stage|world|chapter|wave|mission|round|night|day/i, title: "Levels" },
  { id: "money", re: /coin|gold|cash|money|gem|diamond|credit|point|score|buck|token|star|xp|exp|currency|balance/i, title: "Coins & currency" },
  { id: "unlock", re: /unlock|owned|own|bought|purchas|have|has|got|skin|character|hero|weapon|gun|item|car|outfit|ball|hat|costume|upgrade|ammo/i, title: "Unlockables" },
] as const;
const kindOf = (f: Field) => KINDS.find((k) => k.re.test(f.label))?.id;
const isFlag = (f: Field) => f.value === 0 || f.value === 1;

/** Guess game type from its name for a friendly hint. */
function genreOf(name: string) {
  const n = name.toLowerCase();
  if (/granny|horror|fnaf|freddy|baldi|backrooms|evil/.test(n)) return "Horror game: look for weapons/items under Unlockables.";
  if (/basket|bowl|soccer|football|ball|golf|hockey|sport|stars/.test(n)) return "Sports game: unlock all characters/balls and max coins.";
  if (/shoot|1v1|gun|war|sniper|zombie|bowmaster/.test(n)) return "Shooter: unlock all weapons and skins.";
  if (/run|dash|jump|geometry|subway|slope/.test(n)) return "Runner/platformer: jump to max level and max coins.";
  return "";
}

export function AutoMods({ save, onApply, game = "" }: { save: Record<string, string>; onApply: (changes: Record<string, string>) => void; game?: string }) {
  const fields = useMemo(() => detectFields(save), [save]);
  const [q, setQ] = useState("");
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [lvl, setLvl] = useState("");
  if (!fields.length) return <p className="text-sm text-muted-foreground">Nothing to mod yet. Play a bit so the game saves, then reopen this.</p>;
  const shown = fields.map((f, i) => ({ f, i })).filter(({ f }) => f.label.toLowerCase().includes(q.toLowerCase()));
  const commit = (e: Record<number, string>) => {
    let work = { ...save };
    for (const [i, s] of Object.entries(e)) {
      const f = fields[Number(i)]; const v = Number(s);
      if (f && s !== "" && Number.isFinite(v)) work = { ...work, [f.key]: applyField(work, f, v) };
    }
    const changes: Record<string, string> = {};
    for (const k of Object.keys(work)) if (work[k] !== save[k]) changes[k] = work[k]!;
    if (Object.keys(changes).length) onApply(changes);
    setEdits({});
  };
  const apply = () => commit(edits);
  const idx = (kind: string, pred: (f: Field) => boolean = () => true) =>
    fields.map((f, i) => ({ f, i })).filter(({ f }) => kindOf(f) === kind && pred(f));
  const levels = idx("level", (f) => !isFlag(f) || /level|stage/i.test(f.label));
  const money = idx("money", (f) => !isFlag(f));
  const unlocks = fields.map((f, i) => ({ f, i })).filter(({ f }) => isFlag(f) && (kindOf(f) === "unlock" || /unlock|owned|bought/i.test(f.label)));
  const bulk = (list: { i: number }[], v: number | ((i: number) => number)) =>
    commit(Object.fromEntries(list.map(({ i }) => [i, String(typeof v === "function" ? v(i) : v)])));
  const hint = genreOf(game);
  return (
    <div className="space-y-2">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {levels.length > 0 && (
          <span className="flex items-center gap-1 rounded-md border px-2 py-1">
            Levels ({levels.length})
            <input type="number" value={lvl} onChange={(e) => setLvl(e.target.value)} placeholder="go to…" className="w-16 rounded border bg-background px-1" />
            <button onClick={() => lvl && bulk(levels, Number(lvl))} className="rounded border px-1">Set</button>
            <button onClick={() => bulk(levels, 999)} className="rounded border px-1">Max</button>
          </span>
        )}
        {money.length > 0 && <button onClick={() => bulk(money, 9999999)} className="rounded-md border px-2 py-1">Max coins & currency ({money.length})</button>}
        {unlocks.length > 0 && <button onClick={() => bulk(unlocks, 1)} className="rounded-md bg-primary px-2 py-1 text-primary-foreground">Unlock all ({unlocks.length})</button>}
        {!levels.length && !money.length && !unlocks.length && <span className="text-muted-foreground">No levels, coins or unlockables recognized — edit values below.</span>}
      </div>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${fields.length} detected values…`} className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm" />
        <button onClick={apply} disabled={!Object.keys(edits).length} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">Apply</button>
      </div>
      <div className="grid max-h-56 gap-1 overflow-auto sm:grid-cols-2">
        {shown.map(({ f, i }) => (
          <label key={i} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
            <span className="min-w-0 flex-1 truncate" title={f.label}>{f.label}</span>
            <input type="number" value={edits[i] ?? f.value} onChange={(e) => setEdits((s) => ({ ...s, [i]: e.target.value }))} className="w-24 rounded border bg-background px-1 py-0.5" />
            <button type="button" onClick={() => setEdits((s) => ({ ...s, [i]: String(Math.max(f.value, 1) >= 1000 ? 9999999 : f.value <= 10 ? 99 : 99999) }))} className="rounded border px-1">Max</button>
          </label>
        ))}
      </div>
    </div>
  );
}
