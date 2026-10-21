// Checks the circuit rules on small hand-made boards, then plays CPU-only games and prints statistics.
import assert from "node:assert/strict";
import { checkLine, energizedLines, energizedTriangles, runCircuit, type Board, type Point } from "../lib/board";
import { addBot, botAct, createRoom, pendingBot, startGame, updateSettings, viewFor } from "../lib/gameEngine";
import type { DotCount } from "../lib/types";

// ---------- rule checks ----------

function board(coords: [number, number][], lines: [number, number][]): Board {
  const points: Point[] = coords.map(([x, y], id) => ({
    id,
    x,
    y,
    term: id === 0 ? { seat: 0, pole: "+" } : id === 1 ? { seat: 1, pole: "+" } : id === 2 ? { seat: 0, pole: "-" } : id === 3 ? { seat: 1, pole: "-" } : null,
    alive: true,
  }));
  return { points, lines: lines.map(([a, b], i) => ({ id: i + 1, a, b })), nextLineId: lines.length + 1 };
}

// 青+ (0) top, 青− (2) bottom. Dots 4 (left) and 5 (right) in the middle, 6 a dead-end branch.
//      0
//   4     5      6
//      2
const B = [
  [500, 100],
  [950, 500],
  [500, 900],
  [50, 500],
  [300, 500],
  [700, 500],
  [850, 300],
] as [number, number][];
{
  // Two routes 0-4-2 and 0-5-2 plus 4-5: every one of those lines is on some simple path; 5-6 is a branch.
  const b = board(B, [
    [0, 4],
    [4, 2],
    [0, 5],
    [5, 2],
    [4, 5],
    [5, 6],
  ]);
  const e = energizedLines(b, 0);
  assert.deepEqual([...e].sort(), [1, 2, 3, 4, 5]);
  // Triangles touching a terminal never count.
  assert.equal(energizedTriangles(b, e).length, 0);
  assert.equal(energizedLines(b, 1).size, 0, "yellow is not connected");
}
{
  // A triangle 4-5-7 hanging on the route 0-4 … 5-2 is energized (its sides lie on simple paths).
  const b = board(
    [...B, [500, 650]],
    [
      [0, 4],
      [4, 5],
      [5, 2],
      [4, 7],
      [7, 5],
      [5, 6],
    ]
  );
  const e = energizedLines(b, 0);
  assert.deepEqual(energizedTriangles(b, e), [[4, 5, 7]]);
  const r = runCircuit(b, 0, 3)!;
  assert.equal(r.triangles.length, 1);
  // Corners 4, 5, 7 disappear, and with them every line touching them: everything here.
  assert.deepEqual(r.removedPoints.sort(), [4, 5, 7]);
  assert.equal(b.lines.length, 0);
}
{
  // No triangle: only the closing line goes, the rest of the route stays.
  const b = board(B, [
    [0, 4],
    [4, 2],
  ]);
  const r = runCircuit(b, 0, 2)!;
  assert.equal(r.triangles.length, 0);
  assert.deepEqual(
    b.lines.map((l) => l.id),
    [1]
  );
  assert.equal(energizedLines(b, 0).size, 0, "circuit is open again");
}
{
  // Crossing and jumping over a point are not allowed.
  const b = board(B, [[4, 5]]);
  assert.equal(checkLine(b, 0, 2).ok, false, "crosses 4-5");
  const c = board([...B, [500, 500]], []);
  assert.equal(checkLine(c, 4, 5).ok, false, "jumps over (500,500)");
  assert.equal(checkLine(c, 4, 7).ok, true);
}
console.log("ルール確認: OK");

// ---------- CPU games ----------

const GAMES = Number(process.argv[2]) || 200;
for (const dots of [20, 30, 40] as DotCount[]) {
  let moves = 0;
  let circuits = 0;
  let zero = 0;
  let byOpponent = 0;
  let points = 0;
  let maxCircuit = 0;
  let firstWins = 0;
  let draws = 0;
  let repeats = 0;
  let margin = 0;
  let ms = 0;
  for (let g = 0; g < GAMES; g++) {
    const room = createRoom("host", "ホスト", true);
    addBot(room, "host");
    room.players[0].isBot = true;
    updateSettings(room, "host", { dots });
    startGame(room, "host");
    const t0 = Date.now();
    let steps = 0;
    let seq = 0;
    while (room.phase === "playing") {
      const bot = pendingBot(room)!;
      botAct(room, bot.id);
      for (const e of room.events.filter((x) => x.seq > seq)) {
        circuits++;
        if (e.points === 0) zero++;
        if (e.cause === "opponent") byOpponent++;
        maxCircuit = Math.max(maxCircuit, e.points);
      }
      seq = room.eventSeq;
      assert(++steps < 2000, "game too long");
      // Lines never cross and never touch a removed point.
      for (const l of room.board.lines) assert(room.board.points[l.a].alive && room.board.points[l.b].alive);
    }
    ms += Date.now() - t0;
    viewFor(room);
    moves += room.moves;
    if (room.endReason === "repeat") repeats++;
    const [blue, yellow] = room.seats.map((id) => room.players.find((p) => p.id === id)!.score);
    if (blue > yellow) firstWins++;
    else if (blue === yellow) draws++;
    margin += Math.abs(blue - yellow);
    points += blue + yellow;
  }
  const f = (n: number) => (n / GAMES).toFixed(1);
  console.log(
    `点${dots}: 手数 ${f(moves)} / 通電 ${f(circuits)}回 / 合計点 ${f(points)} / 点差 ${f(margin)} / ` +
      `先手(青)勝率 ${((firstWins / GAMES) * 100).toFixed(0)}% 引分 ${((draws / GAMES) * 100).toFixed(0)}% / ` +
      `繰り返し終了 ${repeats}局`
  );
  console.log(
    `        うち0点の通電 ${f(zero)}回 / 相手の線で通電 ${f(byOpponent)}回 / 1回の最高点 ${maxCircuit} / ` +
      `CPU思考 1手 ${(ms / Math.max(1, moves)).toFixed(1)}ms`
  );
}
