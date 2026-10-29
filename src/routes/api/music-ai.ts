import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { authenticateRequest } from "@/lib/astra/api-user.server";
import { hostedFallback } from "@/lib/astra/provider.server";

/** AI playlist maker: turns a description into real Deezer tracks. */
async function handle({ request }: { request: Request }) {
  if (!(await authenticateRequest(request))) return new Response("Unauthorized", { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { prompt?: string; mode?: string };
  const prompt = String(body.prompt ?? "").slice(0, 500).trim();
  if (!prompt) return Response.json({ error: "Tell me what you want to hear" }, { status: 400 });
  const single = body.mode === "find";
  const p = hostedFallback();
  if (!p || !p.ok) return Response.json({ error: "AI is not available right now" }, { status: 503 });

  let text = "";
  try {
    const result = streamText({
      model: p.model,
      providerOptions: p.providerOptions ?? {},
      system:
        "You are a music curator. Only suggest real, released songs that exist on major streaming services, using their exact official titles and primary artist. " +
        "Output format: first line is 'NAME: <short catchy playlist name>'. Then one song per line as 'Artist - Title'. No numbering, no commentary.",
      prompt: single
        ? `Find the songs that best match this description (the user may be trying to remember a song). Give the 8 most likely matches, best first: ${prompt}`
        : `Make a playlist of 20 songs for: ${prompt}`,
    });
    text = await result.text;
  } catch (e) {
    const status = (e as { statusCode?: number })?.statusCode;
    if (status === 402) return Response.json({ error: "AI credits have run out for this workspace." }, { status: 402 });
    if (status === 429) return Response.json({ error: "Too many requests — try again in a moment." }, { status: 429 });
    return Response.json({ error: "AI couldn't make that playlist" }, { status: 502 });
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const name = lines.find((l) => /^NAME:/i.test(l))?.replace(/^NAME:\s*/i, "") || prompt.slice(0, 40);
  const picks = lines.filter((l) => !/^NAME:/i.test(l) && l.includes(" - ")).slice(0, 25).map((l) => {
    const [artist, ...rest] = l.replace(/^[\d.\-)\s]+/, "").split(" - ");
    return { artist: artist!.trim(), title: rest.join(" - ").replace(/^"|"$/g, "").trim() };
  });

  const found = await Promise.all(picks.map(async ({ artist, title }) => {
    const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(`artist:"${artist}" track:"${title}"`)}&limit=1`).then((x) => x.json()).catch(() => ({}));
    let t = r?.data?.[0];
    if (!t) {
      const r2 = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(`${artist} ${title}`)}&limit=1`).then((x) => x.json()).catch(() => ({}));
      t = r2?.data?.[0];
    }
    if (!t) return null;
    return {
      id: String(t.id), title: t.title ?? "", artist: t.artist?.name ?? "", artistId: String(t.artist?.id ?? ""),
      album: t.album?.title ?? "", albumId: String(t.album?.id ?? ""), art: t.album?.cover_big ?? "", duration: t.duration ?? 0, preview: t.preview ?? "",
    };
  }));
  const seen = new Set<string>();
  const tracks = found.filter((t): t is NonNullable<typeof t> => !!t && !seen.has(t.id) && !!seen.add(t.id));
  return Response.json({ name, tracks });
}

export const Route = createFileRoute("/api/music-ai")({ server: { handlers: { POST: handle } } });
