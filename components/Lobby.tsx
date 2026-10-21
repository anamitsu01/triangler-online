"use client";

import { useState } from "react";
import type { ClientRoom, RoomSettings } from "@/lib/types";
import { DOT_COUNTS, PLAYERS } from "@/lib/types";
import RulesPanel from "./RulesPanel";

export default function Lobby({
  room,
  viewerId,
  onStart,
  onSettings,
  onAddBot,
  onRemoveBot,
}: {
  room: ClientRoom;
  viewerId: string;
  onStart: () => Promise<string | null>;
  onSettings: (settings: Partial<RoomSettings>) => Promise<string | null>;
  onAddBot: () => Promise<string | null>;
  onRemoveBot: (botId: string) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const me = room.players.find((p) => p.id === viewerId);
  const isHost = !!me?.isHost;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/room/${room.code}` : "";
  const count = room.players.length;
  const startBlocker = count < PLAYERS ? "相手が来るのを待っています(2人対戦)" : null;
  const botControls = room.isTest && isHost;

  async function handleStart() {
    setStarting(true);
    const err = await onStart();
    setStarting(false);
    setError(err);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // clipboard unavailable; user can copy manually
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl text-center">
      {room.isTest ? (
        <p className="mb-6 rounded-lg border border-yellow/40 bg-yellow/10 px-4 py-2 text-sm text-yellow">
          🤖 CPU対戦: CPUが相手をします。
        </p>
      ) : (
        <>
          <p className="mb-1 text-white/60">部屋コード</p>
          <div className="mb-4 flex items-center justify-center gap-3">
            <span className="pl-[0.3em] text-5xl font-black tracking-[0.3em]">
              <span className="text-blue">{room.code.slice(0, 3)}</span>
              <span className="text-yellow">{room.code.slice(3)}</span>
            </span>
          </div>
          <div className="mb-6 flex items-center justify-center gap-2">
            <input
              readOnly
              value={shareUrl}
              className="w-full max-w-sm rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/70"
            />
            <button onClick={copyLink} className="whitespace-nowrap rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
              リンクをコピー
            </button>
          </div>
        </>
      )}

      <ul className="mb-6 space-y-2 text-left">
        {room.players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3">
            <span className={`min-w-0 flex-1 truncate ${p.connected ? "" : "opacity-40"}`}>
              {p.name}
              {p.isBot && " 🤖"}
              {p.isHost && <span className="ml-1 text-xs text-white/40">(ホスト)</span>}
            </span>
            {p.id === viewerId && <span className="shrink-0 text-xs text-white/40">(あなた)</span>}
            {botControls && p.isBot && (
              <button
                onClick={async () => setError(await onRemoveBot(p.id))}
                className="rounded border border-white/15 px-1.5 text-xs text-white/60 hover:bg-white/10"
                title="CPUを外す"
              >
                ×
              </button>
            )}
          </li>
        ))}
        {botControls && count < PLAYERS && (
          <li>
            <button
              onClick={async () => setError(await onAddBot())}
              className="w-full rounded-lg border border-dashed border-white/15 py-2 text-sm text-white/60 hover:bg-white/10"
            >
              + CPUを追加
            </button>
          </li>
        )}
      </ul>

      <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-white/50">盤面の点の数</span>
          {DOT_COUNTS.map((n) => (
            <button
              key={n}
              disabled={!isHost}
              onClick={async () => setError(await onSettings({ dots: n }))}
              className={`rounded-lg border px-3 py-1.5 ${
                room.settings.dots === n ? "border-blue bg-blue/20 text-white" : "border-white/10 text-white/50 enabled:hover:bg-white/10"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-white/40">ほかに電源の端子が4つ。点が多いほど長い勝負になる。盤面は毎回ランダム。</p>
      </div>

      {startBlocker && <p className="mb-4 text-sm text-white/50">{startBlocker}</p>}

      {isHost ? (
        <button
          onClick={handleStart}
          disabled={starting || !!startBlocker}
          className="rounded-full bg-blue px-8 py-3 font-bold text-background hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {starting ? "開始中..." : "ゲームを始める"}
        </button>
      ) : (
        <p className="text-white/60">ホストの開始を待っています…</p>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-10 text-left">
        <RulesPanel defaultOpen />
      </div>
    </div>
  );
}
