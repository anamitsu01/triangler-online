import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import {
  addBot,
  addPlayer,
  backToLobby,
  botAct,
  createRoom,
  drawLine,
  GameError,
  hostSkip,
  markConnection,
  pendingBot,
  playAgain,
  removeBot,
  removePlayer,
  startGame,
  updateSettings,
  viewFor,
} from "./lib/gameEngine";
import { getRoom, pruneStaleRooms, reserveUniqueCode, saveRoom } from "./lib/rooms";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  SocketResult,
} from "./lib/socketEvents";
import type { RoomState } from "./lib/types";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOST || "0.0.0.0";
const LOBBY_DISCONNECT_GRACE_MS = Number(process.env.LOBBY_DISCONNECT_GRACE_MS) || 20_000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function ok<T>(data: T): SocketResult<T> {
  return { ok: true, data };
}
function fail<T>(error: string): SocketResult<T> {
  return { ok: false, error };
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

function broadcastRoom(io: IO, room: RoomState) {
  saveRoom(room);
  for (const player of room.players) {
    if (player.isBot) continue;
    io.to(playerRoomTag(room.code, player.id)).emit("room:update", viewFor(room));
  }
  scheduleBot(io, room.code);
}

// The CPU moves on its own after a short pause, and only while a human is
// still connected to watch.
const botTimers = new Map<string, NodeJS.Timeout>();
const lastSeen = new Map<string, number>();

function botToAct(room: RoomState | undefined) {
  if (!room || !room.players.some((p) => !p.isBot && p.connected)) return undefined;
  return pendingBot(room);
}

function scheduleBot(io: IO, code: string) {
  if (botTimers.has(code)) return;
  const room = getRoom(code);
  const bot = botToAct(room);
  if (!room || !bot) return;
  // Longer after a circuit, so its animation can play first.
  const delay = lastSeen.get(code) !== room.eventSeq ? 2600 : 900;
  lastSeen.set(code, room.eventSeq);
  botTimers.set(
    code,
    setTimeout(() => {
      botTimers.delete(code);
      const latest = getRoom(code);
      if (botToAct(latest)?.id !== bot.id) return scheduleBot(io, code);
      try {
        broadcastRoom(io, botAct(latest!, bot.id));
      } catch (e) {
        console.error(`bot ${bot.name} in ${code}:`, e);
      }
    }, delay)
  );
}

function roomTag(code: string) {
  return `room:${code}`;
}
function playerRoomTag(code: string, playerId: string) {
  return `room:${code}:player:${playerId}`;
}

app.prepare().then(() => {
  const httpServer = createServer(handle);
  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(httpServer, {
    cors: { origin: "*" },
  });

  setInterval(pruneStaleRooms, 30 * 60 * 1000).unref();

  io.on("connection", (socket) => {
    socket.on("room:create", ({ name }, cb) => {
      try {
        const trimmed = (name ?? "").trim().slice(0, 24) || "プレイヤー";
        const room = reserveUniqueCode(() => createRoom(socket.id, trimmed));
        socket.data.playerId = socket.id;
        socket.data.roomCode = room.code;
        socket.join(roomTag(room.code));
        socket.join(playerRoomTag(room.code, socket.id));
        saveRoom(room);
        cb(ok({ room: viewFor(room), playerId: socket.id }));
      } catch (e) {
        cb(fail(e instanceof Error ? e.message : "不明なエラー"));
      }
    });

    socket.on("room:createTest", ({ name }, cb) => {
      try {
        const trimmed = (name ?? "").trim().slice(0, 24) || "プレイヤー";
        let room = reserveUniqueCode(() => createRoom(socket.id, trimmed, true));
        room = addBot(room, socket.id);
        socket.data.playerId = socket.id;
        socket.data.roomCode = room.code;
        socket.join(roomTag(room.code));
        socket.join(playerRoomTag(room.code, socket.id));
        saveRoom(room);
        cb(ok({ room: viewFor(room), playerId: socket.id }));
      } catch (e) {
        cb(fail(e instanceof Error ? e.message : "不明なエラー"));
      }
    });

    socket.on("room:join", ({ code, name }, cb) => {
      try {
        const trimmed = (name ?? "").trim().slice(0, 24) || "プレイヤー";
        const room = getRoom(code);
        if (!room) throw new GameError("部屋が見つかりません");
        const updated = addPlayer(room, socket.id, trimmed);
        socket.data.playerId = socket.id;
        socket.data.roomCode = updated.code;
        socket.join(roomTag(updated.code));
        socket.join(playerRoomTag(updated.code, socket.id));
        broadcastRoom(io, updated);
        cb(ok({ room: viewFor(updated), playerId: socket.id }));
      } catch (e) {
        cb(fail(e instanceof Error ? e.message : "不明なエラー"));
      }
    });

    socket.on("room:rejoin", ({ code, playerId }, cb) => {
      try {
        const room = getRoom(code);
        if (!room) throw new GameError("部屋が見つかりません");
        if (!room.players.some((p) => p.id === playerId)) {
          throw new GameError("このプレイヤーは部屋にいません");
        }
        const updated = markConnection(room, playerId, true);
        socket.data.playerId = playerId;
        socket.data.roomCode = updated.code;
        socket.join(roomTag(updated.code));
        socket.join(playerRoomTag(updated.code, playerId));
        broadcastRoom(io, updated);
        cb(ok({ room: viewFor(updated) }));
      } catch (e) {
        cb(fail(e instanceof Error ? e.message : "不明なエラー"));
      }
    });

    function withRoom(
      code: string,
      mutate: (room: RoomState) => RoomState,
      cb: (res: SocketResult<null>) => void
    ) {
      try {
        const room = getRoom(code);
        if (!room) throw new GameError("部屋が見つかりません");
        const updated = mutate(room);
        broadcastRoom(io, updated);
        cb(ok(null));
      } catch (e) {
        cb(fail(e instanceof Error ? e.message : "不明なエラー"));
      }
    }

    socket.on("room:start", ({ code }, cb) => {
      withRoom(code, (room) => startGame(room, socket.data.playerId ?? socket.id), cb);
    });

    socket.on("room:settings", ({ code, settings }, cb) => {
      withRoom(code, (room) => updateSettings(room, socket.data.playerId ?? socket.id, settings), cb);
    });

    socket.on("room:addBot", ({ code }, cb) => {
      withRoom(code, (room) => addBot(room, socket.data.playerId ?? socket.id), cb);
    });

    socket.on("room:removeBot", ({ code, botId }, cb) => {
      withRoom(code, (room) => removeBot(room, socket.data.playerId ?? socket.id, botId), cb);
    });

    socket.on("game:line", ({ code, a, b }, cb) => {
      withRoom(code, (room) => drawLine(room, socket.data.playerId ?? socket.id, Number(a), Number(b)), cb);
    });

    socket.on("game:backToLobby", ({ code }, cb) => {
      withRoom(code, (room) => backToLobby(room, socket.data.playerId ?? socket.id), cb);
    });

    socket.on("game:hostSkip", ({ code }, cb) => {
      withRoom(code, (room) => hostSkip(room, socket.data.playerId ?? socket.id), cb);
    });

    socket.on("game:playAgain", ({ code }, cb) => {
      withRoom(code, (room) => playAgain(room, socket.data.playerId ?? socket.id), cb);
    });

    socket.on("disconnect", () => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const room = getRoom(roomCode);
      if (!room) return;

      // A reconnecting browser opens its new socket (and rejoins) before the
      // server notices the old one is gone. Only mark the player offline if
      // no other socket is still attached to them.
      const stillConnected = (io.sockets.adapter.rooms.get(playerRoomTag(roomCode, playerId))?.size ?? 0) > 0;
      if (stillConnected) return;

      const updated = markConnection(room, playerId, false);
      broadcastRoom(io, updated);

      if (room.phase === "lobby") {
        // Mobile browsers routinely drop the socket for a few seconds when a
        // tab is backgrounded (e.g. switching apps to share the room code).
        // Give reconnects a grace period before actually dropping the seat,
        // instead of removing them immediately and possibly losing the host.
        setTimeout(() => {
          const latest = getRoom(roomCode);
          if (!latest || latest.phase !== "lobby") return;
          const player = latest.players.find((p) => p.id === playerId);
          if (!player || player.connected) return;
          broadcastRoom(io, removePlayer(latest, playerId));
        }, LOBBY_DISCONNECT_GRACE_MS);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Triangler ready on http://${hostname}:${port}`);
  });
});
