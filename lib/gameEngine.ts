import {
  checkMove,
  cloneBoard,
  generateBoard,
  hasLegalLine,
  legalLines,
  runCircuit,
  TERMINALS,
  type Board,
  type CircuitResult,
  type Seat,
} from "./board";
import { DOT_COUNTS, PLAYERS, type ClientRoom, type Player, type RoomSettings, type RoomState } from "./types";

export class GameError extends Error {}

/** Recent circuits kept for clients that reconnect mid-animation. */
const EVENTS_KEPT = 4;

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

function makeCode(): string {
  // No Z, so a real room can never collide with the test code.
  const letters = "ABCDEFGHJKLMNPQRSTUVWXY";
  return Array.from({ length: 5 }, () => letters[randInt(letters.length)]).join("");
}

function newPlayer(id: string, name: string, isHost: boolean, isBot = false): Player {
  return { id, name, connected: true, isHost, isBot, score: 0 };
}

function getPlayer(room: RoomState, playerId: string): Player {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new GameError("このプレイヤーは部屋にいません");
  return player;
}

function requireHost(room: RoomState, playerId: string): void {
  if (!getPlayer(room, playerId).isHost) throw new GameError("ホストだけができる操作です");
}

function requirePlaying(room: RoomState): void {
  if (room.phase !== "playing") throw new GameError("ゲーム中ではありません");
}

// ---------- lobby ----------

export function createRoom(hostId: string, name: string, isTest = false): RoomState {
  return {
    code: makeCode(),
    isTest,
    phase: "lobby",
    players: [newPlayer(hostId, name, true)],
    settings: { dots: 30 },
    game: 0,
    board: { points: [], lines: [], nextLineId: 1 },
    seats: [],
    turn: 0,
    moves: 0,
    lastLine: null,
    events: [],
    eventSeq: 0,
    createdAt: Date.now(),
  };
}

export function addPlayer(room: RoomState, playerId: string, name: string): RoomState {
  if (room.phase !== "lobby") throw new GameError("ゲームはすでに始まっています");
  if (room.players.length >= PLAYERS) throw new GameError("部屋が満員です(2人対戦)");
  room.players.push(newPlayer(playerId, name, false));
  return room;
}

export function removePlayer(room: RoomState, playerId: string): RoomState {
  room.players = room.players.filter((p) => p.id !== playerId);
  if (!room.players.some((p) => p.isHost)) {
    const next = room.players.find((p) => !p.isBot);
    if (next) next.isHost = true;
  }
  return room;
}

export function markConnection(room: RoomState, playerId: string, connected: boolean): RoomState {
  getPlayer(room, playerId).connected = connected;
  return room;
}

export function addBot(room: RoomState, hostId: string): RoomState {
  requireHost(room, hostId);
  if (!room.isTest) throw new GameError("CPUはCPU対戦の部屋でだけ使えます");
  if (room.phase !== "lobby") throw new GameError("ゲームはすでに始まっています");
  if (room.players.length >= PLAYERS) throw new GameError("部屋が満員です(2人対戦)");
  room.players.push(newPlayer(`bot-${Date.now()}-${randInt(1e6)}`, "CPU", false, true));
  return room;
}

export function removeBot(room: RoomState, hostId: string, botId: string): RoomState {
  requireHost(room, hostId);
  if (room.phase !== "lobby") throw new GameError("ゲームはすでに始まっています");
  room.players = room.players.filter((p) => !(p.isBot && p.id === botId));
  return room;
}

export function updateSettings(room: RoomState, hostId: string, settings: Partial<RoomSettings>): RoomState {
  requireHost(room, hostId);
  if (room.phase !== "lobby") throw new GameError("ゲームはすでに始まっています");
  if (settings.dots && DOT_COUNTS.includes(settings.dots)) room.settings.dots = settings.dots;
  return room;
}

// ---------- game ----------

export function startGame(room: RoomState, hostId: string): RoomState {
  requireHost(room, hostId);
  if (room.phase !== "lobby") throw new GameError("ゲームはすでに始まっています");
  if (room.players.length !== PLAYERS) throw new GameError("2人そろうと始められます");
  for (const p of room.players) p.score = 0;
  room.phase = "playing";
  room.game += 1;
  room.board = generateBoard(room.settings.dots);
  // Random seats; 青 always moves first.
  room.seats = room.players.map((p) => p.id).sort(() => Math.random() - 0.5);
  room.turn = 0;
  room.moves = 0;
  room.lastLine = null;
  room.events = [];
  return room;
}

export function playAgain(room: RoomState, hostId: string): RoomState {
  requireHost(room, hostId);
  if (room.phase !== "gameover") throw new GameError("ゲームはまだ終わっていません");
  room.phase = "lobby";
  return startGame(room, hostId);
}

export function backToLobby(room: RoomState, hostId: string): RoomState {
  requireHost(room, hostId);
  if (room.phase !== "gameover") throw new GameError("ゲームはまだ終わっていません");
  room.phase = "lobby";
  return room;
}

function seatOf(room: RoomState, playerId: string): Seat | null {
  const i = room.seats.indexOf(playerId);
  return i === 0 || i === 1 ? i : null;
}

function record(room: RoomState, result: CircuitResult, cause: "self" | "opponent", lastLineId: number): void {
  const playerId = room.seats[result.seat];
  const points = result.triangles.length;
  getPlayer(room, playerId).score += points;
  const lastLine = result.removedLines.find((l) => l.id === lastLineId)!;
  room.events.push({
    seq: ++room.eventSeq,
    seat: result.seat,
    playerId,
    cause,
    points,
    energized: result.energized,
    triangles: result.triangles,
    removedLines: result.removedLines,
    removedPoints: result.removedPoints,
    lastLine,
  });
  room.events = room.events.slice(-EVENTS_KEPT);
}

/** The player whose turn it is draws one line between points a and b. */
export function drawLine(room: RoomState, playerId: string, a: number, b: number): RoomState {
  requirePlaying(room);
  if (seatOf(room, playerId) !== room.turn) throw new GameError("あなたの番ではありません");
  const check = checkMove(room.board, room.turn, a, b);
  if (!check.ok) throw new GameError(check.reason);

  const id = room.board.nextLineId++;
  room.board.lines.push({ id, a, b });
  room.lastLine = id;
  room.moves += 1;

  // Only the mover's own circuit is checked now.
  const own = runCircuit(room.board, room.turn, id);
  if (own) {
    record(room, own, "self", id);
    room.lastLine = null;
  }
  endTurn(room);
  return room;
}

/**
 * Passes the turn. If the line just drawn closed the next player's circuit, it
 * runs now, at the start of their turn (the closing line is removed with it);
 * they then draw as usual. The game ends when the next player has no line to draw.
 *
 * Every move either leaves a line on the board or scores (removing points), and a
 * line that would close an empty circuit is not allowed, so the game always ends.
 */
function endTurn(room: RoomState): void {
  room.turn = room.turn === 0 ? 1 : 0;
  if (room.lastLine !== null) {
    const theirs = runCircuit(room.board, room.turn, room.lastLine);
    if (theirs) {
      record(room, theirs, "opponent", room.lastLine);
      room.lastLine = null;
    }
  }
  if (!hasLegalLine(room.board, room.turn)) room.phase = "gameover";
}

/** Host plays a random line for a player who is away. */
export function hostSkip(room: RoomState, hostId: string): RoomState {
  requireHost(room, hostId);
  requirePlaying(room);
  const lines = legalLines(room.board, room.turn);
  const [a, b] = lines[randInt(lines.length)];
  return drawLine(room, room.seats[room.turn], a, b);
}

// ---------- view ----------

export function viewFor(room: RoomState): ClientRoom {
  const playing = room.phase !== "lobby";
  return {
    code: room.code,
    isTest: room.isTest,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      isHost: p.isHost,
      isBot: p.isBot,
      score: p.score,
      seat: playing ? seatOf(room, p.id) : null,
    })),
    settings: room.settings,
    game: room.game,
    board: room.board,
    turn: room.phase === "playing" ? room.seats[room.turn] : null,
    moves: room.moves,
    lastLine: room.lastLine,
    events: room.events,
  };
}

// ---------- CPU ----------

export function pendingBot(room: RoomState): Player | undefined {
  if (room.phase !== "playing") return undefined;
  const p = room.players.find((x) => x.id === room.seats[room.turn]);
  return p?.isBot ? p : undefined;
}

/** Points reachable from this seat's terminals along existing lines. */
function network(board: Board, seat: Seat): Set<number> {
  const seen = new Set<number>(TERMINALS[seat]);
  const queue = [...seen];
  while (queue.length) {
    const u = queue.pop()!;
    for (const l of board.lines) {
      const v = l.a === u ? l.b : l.b === u ? l.a : null;
      if (v !== null && !seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }
  return seen;
}

/**
 * One-step greedy CPU: takes points now if it can, avoids lines that close the
 * opponent's circuit, and otherwise grows triangles near its own wiring.
 */
export function chooseBotLine(board: Board, seat: Seat): [number, number] {
  const other: Seat = seat === 0 ? 1 : 0;
  const mine = network(board, seat);
  const lines = legalLines(board, seat);
  let best = lines[0];
  let bestScore = -Infinity;
  for (const [a, b] of lines) {
    const trial = cloneBoard(board);
    const id = trial.nextLineId++;
    trial.lines.push({ id, a, b });
    let score: number;
    const own = runCircuit(trial, seat, id);
    if (own) {
      score = own.triangles.length * 10;
    } else {
      const theirs = runCircuit(trial, other, id);
      score = theirs ? -10 * theirs.triangles.length : 0;
      // Building: new triangles, and growing out from its own terminals.
      const touching = (u: number) => board.lines.filter((l) => l.a === u || l.b === u).map((l) => (l.a === u ? l.b : l.a));
      const na = new Set(touching(a));
      score += touching(b).filter((v) => na.has(v)).length * 1.2;
      if (mine.has(a) || mine.has(b)) score += 1;
    }
    const pa = board.points[a];
    const pb = board.points[b];
    score -= Math.hypot(pa.x - pb.x, pa.y - pb.y) / 500;
    score += Math.random();
    if (score > bestScore) {
      bestScore = score;
      best = [a, b];
    }
  }
  return best;
}

export function botAct(room: RoomState, botId: string): RoomState {
  const [a, b] = chooseBotLine(room.board, room.turn);
  return drawLine(room, botId, a, b);
}
