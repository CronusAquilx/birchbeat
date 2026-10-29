import { useEffect, useRef, useState, type RefObject } from "react";
import { Hand, Maximize, MonitorUp, Users } from "lucide-react";
import { toast } from "sonner";
import { myRoomId, onRoomMsg, sendRoomMsg, setRoomState, useRoom, type GameState } from "@/lib/rooms";

/**
 * Game party: the host streams their game area to everyone over WebRTC
 * (signalling goes through the room channel). Guests send their mouse/keys
 * back; the host forwards allowed input into the game frame.
 */
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };
type Rtc = { type: "offer" | "answer" | "ice"; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit };
type Input = { t: "key" | "mouse"; type: string; key?: string; code?: string; kc?: number; x?: number; y?: number; b?: number; bs?: number };

const canControl = (g: GameState | undefined, id: string) => !!g && (g.mode === "all" || g.controller === id);

export function TurnControls() {
  const room = useRoom("games");
  const g = room?.state?.game;
  if (!room || !g) return null;
  const me = myRoomId();
  const who = room.members.find((m) => m.id === g.controller)?.name;
  return (
    <div className="flex items-center gap-1 text-xs">
      <div className="flex rounded-md border p-0.5">
        <button onClick={() => setRoomState("games", { game: { ...g, mode: "all" } })} className={`rounded px-2 py-1 ${g.mode === "all" ? "bg-accent" : ""}`}>Everyone</button>
        <button onClick={() => setRoomState("games", { game: { ...g, mode: "turns", controller: g.controller ?? me } })} className={`rounded px-2 py-1 ${g.mode === "turns" ? "bg-accent" : ""}`}>Take turns</button>
      </div>
      {g.mode === "turns" && (
        g.controller === me
          ? <span className="rounded-md bg-primary px-2 py-1 text-primary-foreground">Your turn</span>
          : <button onClick={() => setRoomState("games", { game: { ...g, controller: me } })} className="flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-accent"><Hand className="size-3.5" />Take turn{who ? ` from ${who}` : ""}</button>
      )}
    </div>
  );
}

export function HostParty({ game, wrap, frame }: { game: { file: string; name: string }; wrap: RefObject<HTMLDivElement | null>; frame: RefObject<HTMLIFrameElement | null> }) {
  const room = useRoom("games");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const host = !!room?.host;

  // Announce the game to the room.
  useEffect(() => {
    if (!host) return;
    const cur = room?.state?.game;
    setRoomState("games", { game: { file: game.file, name: game.name, mode: cur?.mode ?? "all", controller: cur?.controller } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, game.file]);

  function call(to: string, s: MediaStream) {
    peers.current.get(to)?.close();
    const pc = new RTCPeerConnection(ICE);
    peers.current.set(to, pc);
    s.getTracks().forEach((t) => {
      // Separate streams per track: stops the viewer holding video back to lip-sync with audio.
      const sender = pc.addTrack(t, new MediaStream([t]));
      if (t.kind === "video") {
        // Prefer hardware-friendly H264, then VP8 — far lower encode delay than VP9/AV1.
        try {
          const tr = pc.getTransceivers().find((x) => x.sender === sender);
          const caps = RTCRtpSender.getCapabilities?.("video")?.codecs ?? [];
          const rank = (c: { mimeType: string }) => (c.mimeType === "video/H264" ? 0 : c.mimeType === "video/VP8" ? 1 : 2);
          tr?.setCodecPreferences?.([...caps].sort((a, b) => rank(a) - rank(b)));
        } catch { /* unsupported */ }
        const p = sender.getParameters();
        p.encodings = [{ ...(p.encodings?.[0] ?? {}), maxBitrate: 4_000_000, maxFramerate: 30, priority: "high", networkPriority: "high" } as RTCRtpEncodingParameters];
        // Keep frames flowing: under load lower sharpness, never freeze the picture.
        (p as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = "maintain-framerate";
        void sender.setParameters(p).catch(() => {});
      }
    });
    // Fast, unordered input channel: guests' mouse/keys skip the room server.
    const dc = pc.createDataChannel("input", { ordered: false, maxRetransmits: 0 });
    dc.onmessage = (e) => { try { forward(to, JSON.parse(e.data as string) as Input); } catch { /* ignore */ } };
    pc.onicecandidate = (e) => e.candidate && sendRoomMsg("games", "rtc", { type: "ice", ice: e.candidate.toJSON() } satisfies Rtc, to);
    // Start reasonably sharp, but never force a bitrate floor (a floor above the
    // real connection speed queues frames up and causes seconds of delay).
    const boost = (sdp = "") => sdp.replace(/(a=fmtp:\d+ [^\r\n]+)/g, "$1;x-google-start-bitrate=2000");
    void pc.createOffer().then(async (o) => { const tuned = { type: o.type, sdp: boost(o.sdp) }; await pc.setLocalDescription(tuned); sendRoomMsg("games", "rtc", { type: "offer", sdp: tuned } satisfies Rtc, to); }).catch(() => {});
  }

  useEffect(() => {
    if (!host) return;
    return onRoomMsg("games", (m) => {
      if (m.event === "want" && stream) { const ex = peers.current.get(m.from); if (!ex || ["failed","closed","disconnected"].includes(ex.connectionState)) call(m.from, stream); }
      if (m.event === "rtc") {
        const d = m.data as Rtc, pc = peers.current.get(m.from);
        if (!pc) return;
        if (d.type === "answer" && d.sdp) void pc.setRemoteDescription(d.sdp).catch(() => {});
        if (d.type === "ice" && d.ice) void pc.addIceCandidate(d.ice).catch(() => {});
      }
      if (m.event === "input") forward(m.from, m.data as Input);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, stream, room?.state?.game?.mode, room?.state?.game?.controller]);

  function forward(from: string, i: Input) {
    const g = (useRoomSnapshot() ?? room)?.state?.game;
    if (!canControl(g, from)) return;
    try { frame.current?.contentWindow?.postMessage({ bbInput: 1, ...i }, "*"); } catch { /* frame gone */ }
  }

  useEffect(() => () => { peers.current.forEach((p) => p.close()); stream?.getTracks().forEach((t) => t.stop()); }, [stream]);

  async function share() {
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 30 }, width: { max: 1280 }, height: { max: 720 }, cursor: "never" }, audio: true, preferCurrentTab: true } as DisplayMediaStreamOptions);
      const track = s.getVideoTracks()[0] as MediaStreamTrack & { cropTo?: (t: unknown) => Promise<void> };
      const CT = (window as unknown as { CropTarget?: { fromElement: (e: Element) => Promise<unknown> } }).CropTarget;
      if (CT && track?.cropTo && wrap.current) await track.cropTo(await CT.fromElement(wrap.current)).catch(() => {});
      // "motion" = game mode. "detail" (screen-share mode) drops to a few frames a second under load.
      if (track) track.contentHint = "motion";
      track?.addEventListener("ended", () => setStream(null));
      setStream(s);
      room?.members.filter((m) => m.id !== myRoomId()).forEach((m) => call(m.id, s));
      sendRoomMsg("games", "live", {});
      toast.success("Your game is now shared with the party");
    } catch { toast.error("Screen sharing was cancelled"); }
  }

  if (!room) return <RoomButtonLazy />;
  return (
    <>
      <TurnControls />
      {host && (stream
        ? <span className="flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs text-primary-foreground"><MonitorUp className="size-4" />Sharing · {room.members.length}</span>
        : <button onClick={share} className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm hover:bg-accent"><MonitorUp className="size-4" />Share with party</button>)}
      <RoomButtonLazy />
    </>
  );
}

// Latest room for message handlers without re-subscribing.
import { getRoom } from "@/lib/rooms";
import { RoomButton } from "@/components/RoomButton";
const useRoomSnapshot = () => getRoom("games");
const RoomButtonLazy = () => <RoomButton kind="games" />;

const KC: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, " ": 32, Enter: 13, Escape: 27, Shift: 16, Control: 17, Tab: 9, Backspace: 8 };
const keyCode = (k: string) => KC[k] ?? (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0);

export function GuestScreen() {
  const room = useRoom("games");
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const chan = useRef<RTCDataChannel | null>(null);
  const g = room?.state?.game;
  const hostId = room?.members.find((m) => m.host)?.id;
  const allowed = canControl(g, myRoomId());

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    const off = onRoomMsg("games", (m) => {
      if (m.event === "live") sendRoomMsg("games", "want", {}, m.from);
      if (m.event !== "rtc") return;
      const d = m.data as Rtc;
      if (d.type === "offer" && d.sdp) {
        pc?.close();
        pc = new RTCPeerConnection(ICE);
        pc.ondatachannel = (e) => { chan.current = e.channel; };
        pc.ontrack = (e) => {
          // Play frames as soon as they arrive instead of buffering.
          const rc = e.receiver as RTCRtpReceiver & { playoutDelayHint?: number; jitterBufferTarget?: number };
          try { rc.playoutDelayHint = 0; rc.jitterBufferTarget = 0; } catch { /* unsupported */ }
          // Video and sound play in separate elements so video never waits on audio.
          const el = e.track.kind === "video" ? video.current : audio.current;
          if (el) { el.srcObject = new MediaStream([e.track]); void el.play().catch(() => {}); }
          if (e.track.kind === "video") setLive(true);
        };
        pc.onicecandidate = (e) => e.candidate && sendRoomMsg("games", "rtc", { type: "ice", ice: e.candidate.toJSON() } satisfies Rtc, m.from);
        void pc.setRemoteDescription(d.sdp).then(async () => { const a = await pc!.createAnswer(); await pc!.setLocalDescription(a); sendRoomMsg("games", "rtc", { type: "answer", sdp: a } satisfies Rtc, m.from); }).catch(() => {});
      }
      if (d.type === "ice" && d.ice) void pc?.addIceCandidate(d.ice).catch(() => {});
    });
    if (hostId) sendRoomMsg("games", "want", {}, hostId);
    return () => { off(); pc?.close(); };
  }, [hostId]);

  const send = (i: Input) => {
    if (!allowed || !hostId) return;
    const c = chan.current;
    if (c?.readyState === "open") { try { if (c.bufferedAmount < 64_000) c.send(JSON.stringify(i)); } catch { /* closed */ } }
    else if (i.type !== "mousemove" || i.bs) sendRoomMsg("games", "input", i, hostId);
  };
  const lastMove = useRef(0);
  const mouse = (type: string) => (e: React.MouseEvent) => {
    box.current?.focus();
    const v = video.current; if (!v) return;
    const a = audio.current; if (a?.muted) { a.muted = false; void a.play().catch(() => {}); }
    const r = v.getBoundingClientRect();
    // Map to the actual video picture (object-contain letterboxing).
    const vw = v.videoWidth || r.width, vh = v.videoHeight || r.height, sc = Math.min(r.width / vw, r.height / vh);
    const w = vw * sc, h = vh * sc, ox = (r.width - w) / 2, oy = (r.height - h) / 2;
    const x = (e.clientX - r.left - ox) / w, y = (e.clientY - r.top - oy) / h;
    if (x < 0 || y < 0 || x > 1 || y > 1) return;
    if (type === "mousemove" && !e.buttons) { const now = performance.now(); if (now - lastMove.current < 33) return; lastMove.current = now; } // thin out hover traffic
    send({ t: "mouse", type, x, y, b: e.button, bs: e.buttons });
  };
  const key = (type: string) => (e: React.KeyboardEvent) => { e.preventDefault(); if (type === "keydown" && e.repeat) return; send({ t: "key", type, key: e.key, code: e.code, kc: keyCode(e.key) }); };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Users className="size-4" /><p className="truncate font-medium">{g?.name}</p>
        <span className="text-xs text-muted-foreground">{allowed ? "You can control the game — click it and play" : "Watching — wait for your turn"}</span>
        <div className="ml-auto flex items-center gap-2"><TurnControls />
          <button onClick={() => box.current?.requestFullscreen?.()} className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm hover:bg-accent" aria-label="Fullscreen"><Maximize className="size-4" />Fullscreen</button>
          <RoomButton kind="games" /></div>
      </div>
      <div ref={box} tabIndex={0} onKeyDown={key("keydown")} onKeyUp={key("keyup")} onMouseDown={mouse("mousedown")} onMouseUp={mouse("mouseup")} onMouseMove={mouse("mousemove")} onMouseLeave={(e) => { if (e.buttons) mouse("mouseup")(e); }} onContextMenu={(e) => e.preventDefault()}
        className="relative flex-1 cursor-crosshair select-none bg-background outline-none">
        <video ref={video} autoPlay muted playsInline className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
        <audio ref={audio} autoPlay muted className="hidden" />
        {!live && <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Waiting for the host to share their screen…</p>}
      </div>
    </div>
  );
}
