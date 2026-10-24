// Plays one CPU game against the deployed server with random legal lines.
import { io } from "socket.io-client";
import { legalLines, type Seat } from "../lib/board";
import type { ClientRoom } from "../lib/types";

const URL = process.argv[2] ?? "https://triangler-online-production.up.railway.app";
const s = io(URL, { transports: ["websocket"] });
let room: ClientRoom;
let me = "";
let busy = false;
const t0 = Date.now();

function emit<T>(ev: string, data: unknown): Promise<{ ok: boolean; error?: string; data?: T }> {
  return new Promise((r) => (s.emit as (e: string, d: unknown, cb: (x: never) => void) => void)(ev, data, r));
}

async function step() {
  if (busy || room.phase !== "playing" || room.turn !== me) return;
  busy = true;
  const seat = room.players.find((p) => p.id === me)!.seat as Seat;
  const lines = legalLines(room.board, seat);
  const [a, b] = lines[Math.floor(Math.random() * lines.length)];
  const res = await emit("game:line", { code: room.code, a, b });
  if (!res.ok) console.log("line refused:", res.error);
  busy = false;
}

s.on("connect", async () => {
  const res = await emit<{ room: ClientRoom; playerId: string }>("room:createTest", { name: "確認" });
  room = res.data!.room;
  me = res.data!.playerId;
  console.log("room", room.code, "players", room.players.map((p) => p.name).join(","));
  const st = await emit("room:start", { code: room.code });
  console.log("start", st.ok ? "ok" : st.error);
});
s.on("room:update", (r: ClientRoom) => {
  room = r;
  if (r.phase === "gameover") {
    console.log(
      `gameover after ${r.moves} moves, ${r.events.at(-1)?.seq ?? 0} circuits (event seq), ${((Date.now() - t0) / 1000).toFixed(0)}s:`,
      r.players.map((p) => `${p.name}=${p.score}`).join(" ")
    );
    s.close();
    process.exit(0);
  }
  void step();
});
setTimeout(() => {
  console.log("timeout; moves so far", room?.moves);
  process.exit(1);
}, 280_000);
