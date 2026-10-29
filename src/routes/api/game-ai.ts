import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { authenticateRequest } from "@/lib/astra/api-user.server";
import { hostedFallback } from "@/lib/astra/provider.server";

/** AI mod maker: edits a game's save data to match what the player asks for. One small AI call. */
async function handle({ request }: { request: Request }) {
  if (!(await authenticateRequest(request))) return new Response("Unauthorized", { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { game?: string; prompt?: string; save?: Record<string, string> };
  const prompt = String(body.prompt ?? "").slice(0, 300).trim();
  const save = body.save && typeof body.save === "object" ? body.save : {};
  if (!prompt) return Response.json({ error: "Describe the mod you want" }, { status: 400 });
  // Decode base64 values so the AI sees readable text (many engines encode saves).
  const view: Record<string, { text: string; b64: boolean }> = {};
  for (const [k, v] of Object.entries(save)) {
    const raw = String(v ?? "");
    let text = raw, b64 = false;
    if (raw.length > 16 && /^[A-Za-z0-9+/=\s]+$/.test(raw)) {
      try { const d = atob(raw.replace(/\s/g, "")); if (/^[\x09\x0a\x0d\x20-\x7e]+$/.test(d)) { text = d; b64 = true; } } catch { /* not base64 */ }
    }
    view[k] = { text, b64 };
  }
  // Fair budget per key so one huge value doesn't hide the rest.
  const keys = Object.keys(view);
  if (!keys.length) return Response.json({ error: "Play the game a bit first so it makes a save, then try again." }, { status: 400 });
  const per = Math.max(800, Math.floor(20000 / keys.length));
  const saveText = keys.map((k) => `### KEY: ${k}\n${view[k]!.text.slice(0, per)}`).join("\n\n").slice(0, 24000);
  const p = hostedFallback();
  if (!p || !p.ok) return Response.json({ error: "AI is not available right now" }, { status: 503 });
  let text = "";
  try {
    const r = streamText({
      model: p.model,
      providerOptions: p.providerOptions ?? {},
      system:
        'You mod browser game saves. You get save entries (### KEY: name, then its text). Find values matching the request (numbers like coins, credits, stats, ratings, speed, levels, cash, xp, health, unlocks) even when names are short or cryptic, and raise them generously but plausibly (respect obvious maximums like 5 stars, 99/100 ratings). Return ONLY JSON: {"edits":[{"key":"exact key","find":"exact substring copied from the text","replace":"new substring"}]}. Each find must appear verbatim. Use many edits if needed (e.g. one per player). Try hard; return {"edits":[]} only if nothing at all is related.',
      prompt: `Game: ${String(body.game ?? "").slice(0, 80)}\nRequest: ${prompt}\n\n${saveText}`,
    });
    text = await r.text;
  } catch (e) {
    const status = (e as { statusCode?: number })?.statusCode;
    if (status === 402) return Response.json({ error: "AI credits have run out." }, { status: 402 });
    if (status === 429) return Response.json({ error: "Too many requests — try again soon." }, { status: 429 });
    return Response.json({ error: "AI couldn't make that mod" }, { status: 502 });
  }
  const work: Record<string, string> = {};
  try {
    const raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { edits?: { key?: string; find?: string; replace?: string }[] };
    for (const e of raw.edits ?? []) {
      const k = String(e.key ?? ""); const find = String(e.find ?? ""); const rep = String(e.replace ?? "");
      if (!(k in view) || !find || find === rep) continue;
      const cur = work[k] ?? view[k]!.text;
      if (cur.includes(find)) work[k] = cur.split(find).join(rep);
    }
  } catch { /* bad JSON */ }
  const changes: Record<string, string> = {};
  for (const [k, t] of Object.entries(work)) {
    if (!view[k]!.b64) { changes[k] = t; continue; }
    try { changes[k] = btoa(t); } catch { /* skip */ }
  }
  if (!Object.keys(changes).length) return Response.json({ error: "AI couldn't find anything to change for that in this game's save. Play a bit longer so the game saves more, then try again." }, { status: 422 });
  return Response.json({ changes });
}

export const Route = createFileRoute("/api/game-ai")({ server: { handlers: { POST: handle } } });
