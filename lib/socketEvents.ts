import type { ClientRoom, RoomSettings } from "./types";

type Ack = (res: SocketResult<null>) => void;

// Client -> server
export interface ClientToServerEvents {
  "room:create": (payload: { name: string }, cb: (res: SocketResult<{ room: ClientRoom; playerId: string }>) => void) => void;
  "room:createTest": (payload: { name: string }, cb: (res: SocketResult<{ room: ClientRoom; playerId: string }>) => void) => void;
  "room:join": (payload: { code: string; name: string }, cb: (res: SocketResult<{ room: ClientRoom; playerId: string }>) => void) => void;
  "room:rejoin": (payload: { code: string; playerId: string }, cb: (res: SocketResult<{ room: ClientRoom }>) => void) => void;
  "room:start": (payload: { code: string }, cb: Ack) => void;
  "room:settings": (payload: { code: string; settings: Partial<RoomSettings> }, cb: Ack) => void;
  "room:addBot": (payload: { code: string }, cb: Ack) => void;
  "room:removeBot": (payload: { code: string; botId: string }, cb: Ack) => void;
  "game:line": (payload: { code: string; a: number; b: number }, cb: Ack) => void;
  "game:hostSkip": (payload: { code: string }, cb: Ack) => void;
  "game:playAgain": (payload: { code: string }, cb: Ack) => void;
  "game:backToLobby": (payload: { code: string }, cb: Ack) => void;
}

// server -> client
export interface ServerToClientEvents {
  "room:update": (room: ClientRoom) => void;
  "room:error": (message: string) => void;
  "room:closed": () => void;
}

export type SocketResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface SocketData {
  playerId?: string;
  roomCode?: string;
}
