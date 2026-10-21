import type { Board, Line, Seat } from "./board";

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  /** Server-driven CPU player. */
  isBot: boolean;
  score: number;
}

export type DotCount = 20 | 30 | 40;
export const DOT_COUNTS: DotCount[] = [20, 30, 40];

export interface RoomSettings {
  /** Dots on the board, not counting the 4 terminals. */
  dots: DotCount;
}

/** A circuit closing: shown to everyone as an animation. */
export interface CircuitEvent {
  /** Increases with every event, so clients play each one once. */
  seq: number;
  seat: Seat;
  playerId: string;
  /** "self": the player closed it with their own line. "opponent": the other player's line closed it, run at the start of this player's turn. */
  cause: "self" | "opponent";
  points: number;
  energized: Line[];
  triangles: [number, number, number][];
  removedLines: Line[];
  removedPoints: number[];
  /** The line that closed the circuit (removed with it). */
  lastLine: Line;
}

export type EndReason = "noLines" | "repeat";

export interface RoomState {
  code: string;
  /** CPU room: opened from the home screen or with TEST_ROOM_CODE; the host plays against a bot. */
  isTest: boolean;
  phase: "lobby" | "playing" | "gameover";
  players: Player[];
  settings: RoomSettings;
  /** Counts games played in this room, so clients can drop per-game local state. */
  game: number;
  board: Board;
  /** seats[0] = 青, seats[1] = 黄 (player ids). 青 moves first. */
  seats: string[];
  turn: Seat;
  /** Lines drawn so far this game. */
  moves: number;
  /** The most recently drawn line still on the board (removed if it closes a circuit). */
  lastLine: number | null;
  events: CircuitEvent[];
  eventSeq: number;
  /** Positions seen this game (board + whose turn); a repeat ends the game. */
  seen: Set<string>;
  endReason: EndReason | null;
  createdAt: number;
}

export interface ClientPlayer {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  score: number;
  /** 0 = 青, 1 = 黄, null in the lobby. */
  seat: Seat | null;
}

/** Everything on the board is public, so every player gets the same view. */
export interface ClientRoom {
  code: string;
  isTest: boolean;
  phase: RoomState["phase"];
  players: ClientPlayer[];
  settings: RoomSettings;
  game: number;
  board: Board;
  /** Player id whose turn it is (null outside a game). */
  turn: string | null;
  moves: number;
  lastLine: number | null;
  /** Recent circuits, newest last. */
  events: CircuitEvent[];
  endReason: EndReason | null;
}

/** Entering this room code opens a fresh private room against the CPU. */
export const TEST_ROOM_CODE = "ZZZZZ";

export const PLAYERS = 2;
