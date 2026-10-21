// Board geometry and the circuit rules. Pure functions shared by the server
// (authoritative) and the client (highlighting which points can be joined).

export const BOARD_W = 1000;
export const BOARD_H = 1000;
/** A line may not pass closer than this to any other point (no jumping over points). */
export const BLOCK_RADIUS = 16;

export type Seat = 0 | 1; // 0 = 青, 1 = 黄

export interface Point {
  id: number;
  x: number;
  y: number;
  /** Terminal: which player's pole it is. Terminals never disappear and never count as triangle corners. */
  term: { seat: Seat; pole: "+" | "-" } | null;
  alive: boolean;
}

export interface Line {
  id: number;
  a: number;
  b: number;
}

export interface Board {
  points: Point[];
  lines: Line[];
  nextLineId: number;
}

/** Terminal point ids: TERMINALS[seat] = [plus, minus]. Placed around the edge as 青+ 黄+ 青− 黄−. */
export const TERMINALS: Record<Seat, [number, number]> = { 0: [0, 2], 1: [1, 3] };

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * A fresh random board: 4 terminals on the edges (top 青+, right 黄+, bottom 青−, left 黄−)
 * and `count` dots spread out so that none sit too close together.
 */
export function generateBoard(count: number): Board {
  for (let attempt = 0; ; attempt++) {
    const board = tryGenerate(count, attempt);
    if (board) return board;
  }
}

function tryGenerate(count: number, attempt: number): Board | null {
  const m = 34;
  const along = () => rand(BOARD_W * 0.3, BOARD_W * 0.7);
  const points: Point[] = [
    { id: 0, x: along(), y: m, term: { seat: 0, pole: "+" }, alive: true },
    { id: 1, x: BOARD_W - m, y: along(), term: { seat: 1, pole: "+" }, alive: true },
    { id: 2, x: along(), y: BOARD_H - m, term: { seat: 0, pole: "-" }, alive: true },
    { id: 3, x: m, y: along(), term: { seat: 1, pole: "-" }, alive: true },
  ];
  // Spacing loosens a little on each failed attempt so generation always finishes.
  const minDist = Math.sqrt((BOARD_W * BOARD_H) / count) * Math.max(0.45, 0.72 - attempt * 0.03);
  const pad = 90;
  let tries = 0;
  while (points.length < count + 4) {
    if (++tries > 6000) return null;
    const p = { x: rand(pad, BOARD_W - pad), y: rand(pad, BOARD_H - pad) };
    if (points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < minDist)) continue;
    points.push({ id: points.length, x: Math.round(p.x), y: Math.round(p.y), term: null, alive: true });
  }
  for (const p of points) {
    p.x = Math.round(p.x);
    p.y = Math.round(p.y);
  }
  return { points, lines: [], nextLineId: 1 };
}

export function cloneBoard(board: Board): Board {
  return {
    points: board.points.map((p) => ({ ...p })),
    lines: board.lines.map((l) => ({ ...l })),
    nextLineId: board.nextLineId,
  };
}

// ---------- geometry ----------

type XY = { x: number; y: number };

function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function orient(a: XY, b: XY, c: XY): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Do segments ab and cd cross at a point inside both? (Sharing an endpoint is not a crossing.) */
function segmentsCross(a: XY, b: XY, c: XY, d: XY): boolean {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export type LineCheck = { ok: true } | { ok: false; reason: string };

/** Whether a new line between points a and b is allowed on this board. */
export function checkLine(board: Board, a: number, b: number): LineCheck {
  const pa = board.points[a];
  const pb = board.points[b];
  if (!pa || !pb || !pa.alive || !pb.alive) return { ok: false, reason: "その点はもうありません" };
  if (a === b) return { ok: false, reason: "同じ点どうしは結べません" };
  for (const l of board.lines) {
    if ((l.a === a && l.b === b) || (l.a === b && l.b === a)) return { ok: false, reason: "その2点はもう結ばれています" };
  }
  for (const p of board.points) {
    if (!p.alive || p.id === a || p.id === b) continue;
    if (distToSegment(p, pa, pb) < BLOCK_RADIUS) return { ok: false, reason: "点を飛び越えることはできません" };
  }
  for (const l of board.lines) {
    if (l.a === a || l.a === b || l.b === a || l.b === b) continue;
    if (segmentsCross(pa, pb, board.points[l.a], board.points[l.b])) {
      return { ok: false, reason: "ほかの線と交差します" };
    }
  }
  return { ok: true };
}

/**
 * Whether `seat` may draw a line between a and b now: the line must be geometrically
 * allowed, and it must not close a circuit with no triangle in it. The mover's own
 * circuit is checked first (it takes priority); otherwise the opponent's, which would
 * run at the start of their turn.
 */
export function checkMove(board: Board, seat: Seat, a: number, b: number): LineCheck {
  const check = checkLine(board, a, b);
  if (!check.ok) return check;
  board.lines.push({ id: -2, a, b });
  try {
    for (const s of [seat, seat === 0 ? 1 : 0] as Seat[]) {
      const energized = energizedLines(board, s);
      if (!energized.size) continue;
      if (energizedTriangles(board, energized).length) return { ok: true };
      return { ok: false, reason: "三角形のない回路はつなげません" };
    }
    return { ok: true };
  } finally {
    board.lines.pop();
  }
}

/** Every point `seat` can join to `a` now. */
export function legalPartners(board: Board, seat: Seat, a: number): number[] {
  return board.points.filter((p) => p.alive && p.id !== a && checkMove(board, seat, a, p.id).ok).map((p) => p.id);
}

/** Every line `seat` can draw now, as [a, b] with a < b. */
export function legalLines(board: Board, seat: Seat): [number, number][] {
  const alive = board.points.filter((p) => p.alive);
  const out: [number, number][] = [];
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      if (checkMove(board, seat, alive[i].id, alive[j].id).ok) out.push([alive[i].id, alive[j].id]);
    }
  }
  return out;
}

export function hasLegalLine(board: Board, seat: Seat): boolean {
  const alive = board.points.filter((p) => p.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      if (checkMove(board, seat, alive[i].id, alive[j].id).ok) return true;
    }
  }
  return false;
}

// ---------- circuits ----------

/**
 * Lines that lie on at least one simple path from + to − (no point visited twice).
 * Those are exactly the lines in the same biconnected component as an extra
 * virtual edge joining + and −. Empty when the poles are not connected.
 */
export function energizedLines(board: Board, seat: Seat): Set<number> {
  const [plus, minus] = TERMINALS[seat];
  const VIRTUAL = -1;
  const edges = [...board.lines.map((l) => ({ id: l.id, a: l.a, b: l.b })), { id: VIRTUAL, a: plus, b: minus }];
  const adj = new Map<number, { to: number; edge: number }[]>();
  const link = (u: number, v: number, edge: number) => {
    if (!adj.has(u)) adj.set(u, []);
    adj.get(u)!.push({ to: v, edge });
  };
  for (const e of edges) {
    link(e.a, e.b, e.id);
    link(e.b, e.a, e.id);
  }

  // Tarjan's biconnected components with an edge stack.
  const disc = new Map<number, number>();
  const low = new Map<number, number>();
  const stack: number[] = [];
  let time = 0;
  let found: Set<number> | null = null;

  const visit = (u: number, parentEdge: number | null) => {
    disc.set(u, time);
    low.set(u, time);
    time++;
    for (const { to, edge } of adj.get(u) ?? []) {
      if (edge === parentEdge) continue;
      if (!disc.has(to)) {
        stack.push(edge);
        visit(to, edge);
        low.set(u, Math.min(low.get(u)!, low.get(to)!));
        if (low.get(to)! >= disc.get(u)!) {
          const comp = new Set<number>();
          for (;;) {
            const e = stack.pop()!;
            comp.add(e);
            if (e === edge) break;
          }
          if (comp.has(VIRTUAL)) found = comp;
        }
      } else if (disc.get(to)! < disc.get(u)!) {
        stack.push(edge);
        low.set(u, Math.min(low.get(u)!, disc.get(to)!));
      }
    }
  };
  visit(plus, null);

  const result = new Set<number>(found ?? []);
  result.delete(VIRTUAL);
  // The virtual edge alone means + and − are not joined by any real path.
  return result;
}

/** Triangles (three points pairwise joined) whose three sides are all energized. Terminals don't count as corners. */
export function energizedTriangles(board: Board, energized: Set<number>): [number, number, number][] {
  const key = (u: number, v: number) => (u < v ? `${u}-${v}` : `${v}-${u}`);
  const on = new Set<string>();
  const nbrs = new Map<number, number[]>();
  for (const l of board.lines) {
    if (!energized.has(l.id)) continue;
    if (board.points[l.a].term || board.points[l.b].term) continue;
    on.add(key(l.a, l.b));
    for (const [u, v] of [
      [l.a, l.b],
      [l.b, l.a],
    ]) {
      if (!nbrs.has(u)) nbrs.set(u, []);
      nbrs.get(u)!.push(v);
    }
  }
  const out: [number, number, number][] = [];
  for (const [u, list] of nbrs) {
    for (const v of list) {
      if (v <= u) continue;
      for (const w of list) {
        if (w <= v) continue;
        if (on.has(key(v, w))) out.push([u, v, w]);
      }
    }
  }
  return out;
}

export interface CircuitResult {
  seat: Seat;
  /** Lines that carried current, for the glow. */
  energized: Line[];
  triangles: [number, number, number][];
  /** Removed: triangle sides, every line touching a removed corner, and the last line. */
  removedLines: Line[];
  removedPoints: number[];
}

/**
 * Runs the circuit for `seat` if its poles are connected: scores the energized triangles,
 * removes their sides and corners (and lines touching those corners) plus `lastLine`.
 * Returns null (and changes nothing) when the poles are not connected.
 */
export function runCircuit(board: Board, seat: Seat, lastLine: number | null): CircuitResult | null {
  const energized = energizedLines(board, seat);
  if (!energized.size) return null;
  const triangles = energizedTriangles(board, energized);
  const corners = new Set(triangles.flat());
  const sides = new Set<string>();
  for (const [a, b, c] of triangles) {
    for (const [u, v] of [
      [a, b],
      [b, c],
      [a, c],
    ]) {
      sides.add(`${u}-${v}`);
      sides.add(`${v}-${u}`);
    }
  }
  const removedLines = board.lines.filter(
    (l) => l.id === lastLine || sides.has(`${l.a}-${l.b}`) || corners.has(l.a) || corners.has(l.b)
  );
  const result: CircuitResult = {
    seat,
    energized: board.lines.filter((l) => energized.has(l.id)),
    triangles,
    removedLines,
    removedPoints: [...corners],
  };
  const gone = new Set(removedLines.map((l) => l.id));
  board.lines = board.lines.filter((l) => !gone.has(l.id));
  for (const id of corners) board.points[id].alive = false;
  return result;
}
