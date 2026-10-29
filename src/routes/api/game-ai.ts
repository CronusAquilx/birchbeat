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
  const saveText = JSON.stringify(save).slice(0, 12000);
  if (saveText.length < 3) return Response.json({ error: "Play the game a bit first so it makes a save, then try again." }, { status: 400 });
  const p = hostedFallback();
  if (!p || !p.ok) return Response.json({ error: "AI is not available right now" }, { status: 503 });
  let text = "";
  try {
    const r = streamText({
      model: p.model,
      providerOptions: p.providerOptions ?? {},
      system:
        "You edit browser game save data (localStorage key/value strings). Given the save and a request, return ONLY a JSON object of the keys to change, each value a full replacement string in the exact same format as the original (keep JSON/encoding intact). No commentary. If impossible, return {}.",
      prompt: `Game: ${String(body.game ?? "").slice(0, 80)}\nRequest: ${prompt}\nSave: ${saveText}`,
    });
    text = await r.text;
  } catch (e) {
    const status = (e as { statusCode?: number })?.statusCode;
    if (status === 402) return Response.json({ error: "AI credits have run out." }, { status: 402 });
    if (status === 429) return Response.json({ error: "Too many requests — try again soon." }, { status: 429 });
    return Response.json({ error: "AI couldn't make that mod" }, { status: 502 });
  }
  let changes: Record<string, string> = {};
  try {
    const raw = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    for (const [k, v] of Object.entries(raw ?? {})) if (k in save) changes[k] = typeof v === "string" ? v : JSON.stringify(v);
  } catch { changes = {}; }
  if (!Object.keys(changes).length) return Response.json({ error: "AI couldn't find anything to change for that in this game's save." }, { status: 422 });
  return Response.json({ changes });
}

export const Route = createFileRoute("/api/game-ai")({ server: { handlers: { POST: handle } } });
