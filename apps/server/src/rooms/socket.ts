import { Server } from 'socket.io';
import type { Logger } from 'pino';
import type { ZodType } from 'zod';
import {
  activityContextSchema,
  chatSendSchema,
  guessSchema,
  joinRoomSchema,
  kickPlayerSchema,
  latencyPingSchema,
  reactionSchema,
  setContentLocaleSchema,
  setListedSchema,
  voteSchema,
} from '@almost-you/shared';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@almost-you/shared';
import { verifySession } from '../auth/jwt.js';
import type { AppConfig } from '../config.js';
import type { AppFastifyInstance } from '../types.js';
import { GameError } from '@almost-you/game-core';
import {
  normalizeRoomId,
  roomName,
  toRoomErrorPayload,
  type RoomManager,
} from './room-manager.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

class EventGate {
  private timestamps: number[] = [];

  allow(limit = 240, windowMs = 1_000): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((timestamp) => now - timestamp < windowMs);
    if (this.timestamps.length >= limit) return false;
    this.timestamps.push(now);
    return true;
  }
}

function parseOrThrow<T>(schema: ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new GameError('INVALID_INPUT', 'invalid payload');
  }
  return result.data;
}

export function createSocketServer(app: AppFastifyInstance, config: AppConfig): IO {
  const io: IO = new Server(app.server, {
    path: '/ws',
    serveClient: false,
    maxHttpBufferSize: 128 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    void (async () => {
      try {
        const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;
        const token = typeof auth.token === 'string' ? auth.token : null;
        if (!token) throw new Error('missing token');

        const user = await verifySession(token, config.sessionSecret);
        const context = activityContextSchema.safeParse(auth.context ?? {});
        if (!context.success) throw new Error('invalid context');

        socket.data.user = user;
        socket.data.context = context.data;
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    })();
  });

  return io;
}

export function registerSocketHandlers(io: IO, rooms: RoomManager, logger: Logger): void {
  io.on('connection', (socket) => {
    const user = socket.data.user;
    const gate = new EventGate();

    const run = (label: string, action: () => void | Promise<void>): void => {
      if (!gate.allow()) {
        socket.emit('room:error', { code: 'RATE_LIMITED', message: 'slow down a little' });
        return;
      }
      void Promise.resolve()
        .then(action)
        .catch((error: unknown) => {
          if (!(error instanceof GameError)) {
            logger.warn({ err: error, event: label, userId: user.id }, 'socket action failed');
          }
          socket.emit('room:error', toRoomErrorPayload(error));
        });
    };

    const joinedRoom = (): string => {
      if (!socket.data.roomId) throw new GameError('ROOM_NOT_FOUND', 'join a room first');
      return socket.data.roomId;
    };

    socket.on('room:join', (payload) => {
      run('room:join', async () => {
        const { roomId, mustExist } = parseOrThrow(joinRoomSchema, payload);
        const targetId = rooms.resolveRoomId(roomId) ?? normalizeRoomId(roomId);

        if (socket.data.roomId && socket.data.roomId !== targetId) {
          // Validate before detaching so a wrong code keeps the player in the current room.
          rooms.assertJoinable(targetId, user.id, mustExist ?? false);
          const previous = socket.data.roomId;
          await rooms.detach(previous, user.id, socket.id, true);
          socket.leave(roomName(previous));
          socket.data.roomId = undefined;
        }

        const result = await rooms.join({
          roomId: targetId,
          user,
          socketId: socket.id,
          preferredLocale: socket.data.context.locale,
          mustExist: mustExist ?? false,
        });
        socket.join(roomName(result.roomId));
        socket.data.roomId = result.roomId;
        socket.emit('chat:history', { messages: rooms.getChatHistory(result.roomId) });
      });
    });

    socket.on('room:leave', () => {
      run('room:leave', async () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        await rooms.detach(roomId, user.id, socket.id, true);
        socket.leave(roomName(roomId));
        socket.data.roomId = undefined;
      });
    });

    socket.on('lobby:set-content-locale', (payload) => {
      run('lobby:set-content-locale', async () => {
        const roomId = joinedRoom();
        const { locale } = parseOrThrow(setContentLocaleSchema, payload);
        await rooms.setContentLocale(roomId, user.id, locale);
      });
    });

    socket.on('lobby:set-listed', (payload) => {
      run('lobby:set-listed', async () => {
        const roomId = joinedRoom();
        const { listed } = parseOrThrow(setListedSchema, payload);
        await rooms.setListed(roomId, user.id, listed);
      });
    });

    socket.on('lobby:kick', (payload) => {
      run('lobby:kick', async () => {
        const roomId = joinedRoom();
        const { playerId } = parseOrThrow(kickPlayerSchema, payload);
        const { socketIds } = await rooms.kick(roomId, user.id, playerId);
        for (const targetSocketId of socketIds) {
          const target = io.sockets.sockets.get(targetSocketId);
          if (!target) continue;
          target.emit('room:kicked');
          target.leave(roomName(roomId));
          target.data.roomId = undefined;
        }
      });
    });

    socket.on('lobby:start', () => {
      run('lobby:start', async () => {
        await rooms.start(joinedRoom(), user.id);
      });
    });

    socket.on('game:end-turn', () => {
      run('game:end-turn', async () => {
        await rooms.endTurn(joinedRoom(), user.id);
      });
    });

    socket.on('game:vote', (payload) => {
      run('game:vote', async () => {
        const roomId = joinedRoom();
        const { targetId } = parseOrThrow(voteSchema, payload);
        await rooms.vote(roomId, user.id, targetId);
      });
    });

    socket.on('game:guess', (payload) => {
      run('game:guess', async () => {
        const roomId = joinedRoom();
        const { optionId } = parseOrThrow(guessSchema, payload);
        await rooms.guess(roomId, user.id, optionId);
      });
    });

    socket.on('game:next-round', () => {
      run('game:next-round', async () => {
        await rooms.advanceRound(joinedRoom(), user.id);
      });
    });

    socket.on('game:rematch', () => {
      run('game:rematch', async () => {
        await rooms.rematch(joinedRoom(), user.id);
      });
    });

    socket.on('chat:send', (payload) => {
      run('chat:send', () => {
        const roomId = joinedRoom();
        const { text } = parseOrThrow(chatSendSchema, payload);
        rooms.chat(roomId, user.id, text);
      });
    });

    socket.on('chat:typing', () => {
      run('chat:typing', () => {
        rooms.typing(joinedRoom(), user.id);
      });
    });

    socket.on('game:reaction', (payload) => {
      run('game:reaction', () => {
        const roomId = joinedRoom();
        const { emoji } = parseOrThrow(reactionSchema, payload);
        rooms.reaction(roomId, user.id, emoji);
      });
    });

    socket.on('latency:ping', (payload) => {
      run('latency:ping', () => {
        const { t } = parseOrThrow(latencyPingSchema, payload);
        socket.emit('latency:pong', { t, serverTime: Date.now() });
      });
    });

    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      void rooms
        .detach(roomId, user.id, socket.id, false)
        .catch((error: unknown) => {
          logger.warn({ err: error, roomId, userId: user.id }, 'socket detach failed');
        });
    });
  });
}
