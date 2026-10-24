"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BOARD_H, BOARD_W, checkMove, legalPartners, type Board, type Line, type Seat } from "@/lib/board";
import type { ClientToServerEvents } from "@/lib/socketEvents";
import type { CircuitEvent, ClientPlayer, ClientRoom } from "@/lib/types";
import { installAudioUnlock, isMuted, play, setMuted } from "@/lib/sound";

type Act = <E extends keyof ClientToServerEvents>(
  event: E,
  payload: Omit<Parameters<ClientToServerEvents[E]>[0], "code">
) => Promise<string | null>;

const SEAT_COLOR: Record<Seat, string> = { 0: "#4cc9ff", 1: "#ffd23f" };
const SEAT_NAME: Record<Seat, string> = { 0: "青", 1: "黄" };
const WIRE = "#8b95a8";
/** How long a circuit animation plays (matches the CSS animations). */
const ANIM_MS = 2400;

const primaryBtn =
  "rounded-full bg-blue px-6 py-2.5 font-bold text-background hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40";
const ghostBtn = "rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/10";

export default function GameBoard({ room, viewerId, act }: { room: ClientRoom; viewerId: string; act: Act }) {
  const board = room.board;
  const me = room.players.find((p) => p.id === viewerId);
  const myTurn = room.phase === "playing" && room.turn === viewerId;
  const bySeat = (seat: Seat) => room.players.find((p) => p.seat === seat);

  // The chosen points belong to one board position; once a line is drawn or removed they are dropped.
  const boardKey = `${room.game}:${board.lines.map((l) => l.id).join(",")}`;
  const [pick, setPick] = useState<{ key: string; a: number | null; b: number | null }>({ key: "", a: null, b: null });
  const selected = pick.key === boardKey ? pick.a : null;
  const target = pick.key === boardKey ? pick.b : null;
  const setSelected = (a: number | null) => setPick({ key: boardKey, a, b: null });
  const setTarget = (b: number | null) => setPick({ key: boardKey, a: selected, b });
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [muted, setMutedState] = useState(() => isMuted());

  useEffect(() => installAudioUnlock(), []);

  // Each circuit plays once. Events already on the room when the page opens are not replayed.
  const latestEvent = room.events.at(-1);
  const [doneSeq, setDoneSeq] = useState(() => latestEvent?.seq ?? 0);
  const anim = latestEvent && latestEvent.seq > doneSeq ? latestEvent : null;
  useEffect(() => {
    if (!anim) return;
    play("complete");
    const t = setTimeout(() => setDoneSeq(anim.seq), ANIM_MS);
    return () => clearTimeout(t);
  }, [anim]);

  // A soft tick whenever a line goes down, and a fanfare at the end.
  const moves = useRef(room.moves);
  useEffect(() => {
    if (room.moves > moves.current) play("select");
    moves.current = room.moves;
  }, [room.moves]);
  const phase = useRef(room.phase);
  useEffect(() => {
    if (phase.current === "playing" && room.phase === "gameover") setTimeout(() => play("fanfare"), ANIM_MS);
    phase.current = room.phase;
  }, [room.phase]);

  const partners = useMemo(() => (selected === null ? new Set<number>() : new Set(legalPartners(board, me?.seat ?? 0, selected))), [board, selected, me?.seat]);

  const canTouch = myTurn && !anim && !sending;

  function tap(id: number) {
    if (!canTouch) return;
    setMessage(null);
    if (selected === null || id === selected) {
      setSelected(id === selected ? null : id);
      return;
    }
    const check = checkMove(board, me?.seat ?? 0, selected, id);
    if (!check.ok) {
      // Tapping another point that can't be joined starts over from that point instead.
      setSelected(id);
      setMessage(check.reason);
      return;
    }
    setTarget(id);
    play("select", { volume: 0.5 });
  }

  async function confirmLine() {
    if (selected === null || target === null) return;
    setSending(true);
    const err = await act("game:line", { a: selected, b: target });
    setSending(false);
    setMessage(err);
    setSelected(null);
  }

  function cancelLine() {
    setSelected(null);
  }

  const turnPlayer = room.players.find((p) => p.id === room.turn);
  const winners = room.phase === "gameover" ? topPlayers(room.players) : [];

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex flex-col gap-3 lg:order-2 lg:w-72">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {([0, 1] as Seat[]).map((seat) => (
            <ScoreChip key={seat} seat={seat} player={bySeat(seat)} active={room.turn === bySeat(seat)?.id} you={bySeat(seat)?.id === viewerId} />
          ))}
        </div>
        <StatusLine room={room} myTurn={myTurn} turnPlayer={turnPlayer} anim={anim} mySeat={me?.seat ?? null} />
        {room.phase === "playing" && turnPlayer && !turnPlayer.connected && me?.isHost && (
          <button className={ghostBtn} onClick={async () => setMessage(await act("game:hostSkip", {}))}>
            {turnPlayer.name} さんの代わりに1本引く(ランダム)
          </button>
        )}
        <div className="hidden text-xs leading-relaxed text-white/40 lg:block">
          <p>点をタップ → 結ぶ点をタップ → 「はい」。</p>
          <p>選んだ点から結べる点が明るく光ります。</p>
          <p className="mt-2">手数 {room.moves} / 残りの点 {board.points.filter((p) => p.alive && !p.term).length}</p>
        </div>
        <button
          className={`${ghostBtn} self-start`}
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
          }}
        >
          {muted ? "🔇 音なし" : "🔊 音あり"}
        </button>
      </div>

      <div className="relative mx-auto w-full max-w-[min(100%,78vh)] lg:order-1 lg:flex-1">
        <BoardSvg
          board={board}
          lastLine={room.lastLine}
          selected={selected}
          target={target}
          partners={partners}
          anim={anim}
          interactive={canTouch}
          onTap={tap}
        />
        {anim && <CircuitBanner event={anim} player={room.players.find((p) => p.id === anim.playerId)} />}
        <div className="mt-3 flex min-h-11 items-center justify-center gap-2">
          {message ? (
            <p className="text-center text-sm text-red-300">{message}</p>
          ) : selected !== null ? (
            <p className="text-center text-sm text-white/50">結ぶ点をタップ(光っている点と結べます)</p>
          ) : myTurn && !anim ? (
            <p className="text-center text-sm text-white/40 lg:hidden">点をタップして線を引く</p>
          ) : null}
        </div>
      </div>

      {target !== null && <ConfirmLine seat={me?.seat ?? 0} sending={sending} onYes={confirmLine} onNo={cancelLine} />}

      {room.phase === "gameover" && !anim && (
        <GameOver room={room} viewerId={viewerId} winners={winners} act={act} />
      )}
    </div>
  );
}

/**
 * はい/いいえ in the middle of the screen, so it is always in view on tablets and phones.
 * The backdrop is light and the board stays visible, so the dashed line can still be checked.
 */
function ConfirmLine({ seat, sending, onYes, onNo }: { seat: Seat; sending: boolean; onYes: () => void; onNo: () => void }) {
  const color = SEAT_COLOR[seat];
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/25 px-4" role="dialog" aria-modal="true" onClick={onNo}>
      <div
        className="tr-pop w-full max-w-xs rounded-2xl border bg-panel/95 p-5 text-center backdrop-blur"
        style={{ borderColor: color, boxShadow: `0 0 30px ${color}44` }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4 text-lg font-bold">この線を引きますか?</p>
        <div className="flex gap-3">
          <button className={`${ghostBtn} flex-1 py-3 text-base`} onClick={onNo}>
            いいえ
          </button>
          <button className={`${primaryBtn} flex-1 py-3 text-base`} onClick={onYes} disabled={sending}>
            はい
          </button>
        </div>
      </div>
    </div>
  );
}

function topPlayers(players: ClientPlayer[]): ClientPlayer[] {
  const top = Math.max(...players.map((p) => p.score));
  return players.filter((p) => p.score === top);
}

function ScoreChip({ seat, player, active, you }: { seat: Seat; player?: ClientPlayer; active: boolean; you: boolean }) {
  const color = SEAT_COLOR[seat];
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${active ? "bg-white/[0.06]" : "border-white/10 bg-panel/70"}`}
      style={active ? { borderColor: color, boxShadow: `0 0 18px ${color}55` } : undefined}
    >
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold" style={{ color }}>
          {SEAT_NAME[seat]} {player?.name ?? ""}
          {player?.isBot && " 🤖"}
        </p>
        <p className="text-[11px] text-white/40">
          {you ? "あなた" : ""}
          {player && !player.connected ? " (切断中)" : ""}
        </p>
      </div>
      <span className="text-3xl font-black tabular-nums">{player?.score ?? 0}</span>
    </div>
  );
}

function StatusLine({
  room,
  myTurn,
  turnPlayer,
  anim,
  mySeat,
}: {
  room: ClientRoom;
  myTurn: boolean;
  turnPlayer?: ClientPlayer;
  anim: CircuitEvent | null;
  mySeat: Seat | null;
}) {
  if (room.phase === "gameover") return <p className="text-center text-sm font-bold text-white/70 lg:text-left">ゲーム終了</p>;
  if (anim) return <p className="text-center text-sm text-white/50 lg:text-left">通電中…</p>;
  if (myTurn)
    return (
      <p
        className="tr-breathe text-center text-base font-bold lg:text-left"
        style={{ color: SEAT_COLOR[mySeat ?? 0], textShadow: `0 0 12px ${SEAT_COLOR[mySeat ?? 0]}` }}
      >
        あなたの番 — 線を1本引いてください
      </p>
    );
  return <p className="text-center text-sm text-white/50 lg:text-left">{turnPlayer?.name ?? "相手"} さんの番…</p>;
}

function CircuitBanner({ event, player }: { event: CircuitEvent; player?: ClientPlayer }) {
  const color = SEAT_COLOR[event.seat];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[38%] flex justify-center">
      <div
        className="tr-pop rounded-2xl border bg-background/85 px-6 py-3 text-center backdrop-blur"
        style={{ borderColor: color, boxShadow: `0 0 30px ${color}66` }}
      >
        <p className="text-xs text-white/60">
          {event.cause === "opponent" ? `相手の線で${SEAT_NAME[event.seat]}の回路がつながった!` : `${SEAT_NAME[event.seat]} ${player?.name ?? ""}`}
        </p>
        <p className="text-2xl font-black" style={{ color, textShadow: `0 0 14px ${color}` }}>
          通電! +{event.points}点
        </p>
      </div>
    </div>
  );
}

function BoardSvg({
  board,
  lastLine,
  selected,
  target,
  partners,
  anim,
  interactive,
  onTap,
}: {
  board: Board;
  lastLine: number | null;
  selected: number | null;
  target: number | null;
  partners: Set<number>;
  anim: CircuitEvent | null;
  interactive: boolean;
  onTap: (id: number) => void;
}) {
  const pt = (id: number) => board.points[id];
  const seg = (l: { a: number; b: number }) => ({ x1: pt(l.a).x, y1: pt(l.a).y, x2: pt(l.b).x, y2: pt(l.b).y });
  const energizedIds = new Set(anim?.energized.map((l) => l.id));

  return (
    <svg
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      className="block aspect-square w-full touch-manipulation select-none rounded-2xl border border-white/10 bg-[#070b14]"
      style={{ boxShadow: "inset 0 0 80px rgba(76,201,255,0.06)" }}
    >
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* wires */}
      <g filter="url(#glow-soft)" strokeLinecap="round">
        {board.lines.map((l) => (
          <line
            key={l.id}
            {...seg(l)}
            stroke={l.id === lastLine ? "#c9f3ff" : WIRE}
            strokeOpacity={l.id === lastLine ? 0.95 : 0.75}
            strokeWidth={l.id === lastLine ? 5 : 4}
          />
        ))}
      </g>

      {/* the line about to be drawn */}
      {selected !== null && target !== null && (
        <line {...seg({ a: selected, b: target })} stroke="#ffffff" strokeWidth={4} strokeDasharray="14 10" strokeLinecap="round" opacity={0.9} />
      )}

      {/* circuit animation: triangles flash, current runs along the wires, removed parts fade */}
      {anim && (
        <g key={anim.seq}>
          {anim.triangles.map(([a, b, c], i) => (
            <polygon
              key={i}
              className="tr-flash"
              points={[a, b, c].map((id) => `${pt(id).x},${pt(id).y}`).join(" ")}
              fill={SEAT_COLOR[anim.seat]}
              fillOpacity={0.45}
            />
          ))}
          <g filter="url(#glow)" strokeLinecap="round">
            {anim.removedLines
              .filter((l) => !energizedIds.has(l.id))
              .map((l) => (
                <line key={`r${l.id}`} className="tr-current" pathLength={1} {...seg(l)} stroke={WIRE} strokeWidth={4} />
              ))}
            {anim.energized.map((l: Line) => (
              <line key={`e${l.id}`} className="tr-current" pathLength={1} {...seg(l)} stroke={SEAT_COLOR[anim.seat]} strokeWidth={7} />
            ))}
          </g>
          {anim.removedPoints.map((id) => (
            <circle key={`p${id}`} className="tr-vanish" cx={pt(id).x} cy={pt(id).y} r={14} fill={SEAT_COLOR[anim.seat]} />
          ))}
        </g>
      )}

      {/* points */}
      {board.points
        .filter((p) => p.alive)
        .map((p) => {
          const isSel = p.id === selected || p.id === target;
          const isPartner = partners.has(p.id);
          const dim = selected !== null && !isSel && !isPartner;
          if (p.term) {
            const color = SEAT_COLOR[p.term.seat];
            return (
              <g key={p.id} opacity={dim ? 0.45 : 1}>
                <circle cx={p.x} cy={p.y} r={27} fill="#070b14" stroke={color} strokeWidth={isSel ? 7 : 4} filter="url(#glow)" />
                <text
                  x={p.x}
                  y={p.y + 1}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={30}
                  fontWeight={900}
                  fill={color}
                  className="pointer-events-none"
                >
                  {p.term.pole === "+" ? "+" : "−"}
                </text>
                {isPartner && <circle cx={p.x} cy={p.y} r={36} fill="none" stroke="#ffffff" strokeOpacity={0.5} strokeWidth={2} />}
              </g>
            );
          }
          return (
            <g key={p.id} opacity={dim ? 0.3 : 1}>
              {isSel && <circle cx={p.x} cy={p.y} r={24} fill="none" stroke="#ffffff" strokeWidth={3} filter="url(#glow-soft)" />}
              {isPartner && <circle cx={p.x} cy={p.y} r={21} fill="#c9f3ff" fillOpacity={0.12} stroke="#c9f3ff" strokeOpacity={0.6} strokeWidth={2} />}
              <circle cx={p.x} cy={p.y} r={isSel ? 14 : 12} fill={isSel || isPartner ? "#ffffff" : "#dfe7f5"} filter="url(#glow-soft)" />
            </g>
          );
        })}

      {/* generous invisible hit areas, on top */}
      {interactive &&
        board.points
          .filter((p) => p.alive)
          .map((p) => (
            <circle
              key={`hit${p.id}`}
              cx={p.x}
              cy={p.y}
              r={34}
              fill="transparent"
              className="cursor-pointer"
              onPointerDown={(e) => {
                e.preventDefault();
                onTap(p.id);
              }}
            />
          ))}
    </svg>
  );
}

function GameOver({
  room,
  viewerId,
  winners,
  act,
}: {
  room: ClientRoom;
  viewerId: string;
  winners: ClientPlayer[];
  act: Act;
}) {
  const me = room.players.find((p) => p.id === viewerId);
  const draw = winners.length > 1;
  const winner = winners[0];
  const color = winner?.seat !== null && winner ? SEAT_COLOR[winner.seat as Seat] : "#ffffff";
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
      <div
        className="tr-pop w-full max-w-sm rounded-2xl border bg-panel p-6 text-center"
        style={{ borderColor: draw ? "#ffffff44" : color, boxShadow: draw ? undefined : `0 0 40px ${color}55` }}
      >
        <p className="mb-1 text-xs text-white/50">
          引ける線がなくなったので終了
        </p>
        <h2 className="mb-4 text-3xl font-black" style={{ color: draw ? "#e8edf7" : color, textShadow: draw ? undefined : `0 0 16px ${color}` }}>
          {draw ? "引き分け" : winner.id === viewerId ? "あなたの勝ち!" : `${winner.name} さんの勝ち`}
        </h2>
        <div className="mb-6 flex justify-center gap-6">
          {([0, 1] as Seat[]).map((seat) => {
            const p = room.players.find((x) => x.seat === seat);
            return (
              <div key={seat}>
                <p className="text-xs" style={{ color: SEAT_COLOR[seat] }}>
                  {SEAT_NAME[seat]} {p?.name}
                </p>
                <p className="text-4xl font-black tabular-nums">{p?.score ?? 0}</p>
              </div>
            );
          })}
        </div>
        {me?.isHost ? (
          <div className="flex justify-center gap-2">
            <button className={ghostBtn} onClick={() => act("game:backToLobby", {})}>
              ロビーへ
            </button>
            <button className={primaryBtn} onClick={() => act("game:playAgain", {})}>
              もう一度
            </button>
          </div>
        ) : (
          <p className="text-sm text-white/50">ホストが次のゲームを始めるのを待っています…</p>
        )}
      </div>
    </div>
  );
}
