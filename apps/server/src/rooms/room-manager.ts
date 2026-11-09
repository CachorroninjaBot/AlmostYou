import { randomInt } from 'node:crypto';
import type { Server } from 'socket.io';
import type { Logger } from 'pino';
import {
  FALLBACK_LOCALE,
  GUESS_SECONDS,
  MAX_PLAYERS,
  REACTION_COOLDOWN_MS,
  RESULT_SECONDS,
  REVEAL_SECONDS,
  TURN_SECONDS,
  VOTE_SECONDS,
  containsLink,
  resolveLocale,
} from '@almost-you/shared';
import type {
  ClientToServerEvents,
  InterServerEvents,
  PublicRoomListing,
  ServerToClientEvents,
  SessionUser,
  SocketData,
} from '@almost-you/shared';
import {
  GameError,
  activePlayerId,
  addPlayer,
  allConnectedVoted,
  beginDiscussion,
  beginVote,
  castGuess,
  castVote,
  createRoom,
  endTurn,
  finalizeGuess,
  finalizeVote,
  markConnected,
  nextRound,
  rematch,
  removePlayer,
  setContentLocale,
  startMatch,
  toPublicState,
} from '@almost-you/game-core';
import type { EngineState, SceneDeck } from '@almost-you/game-core';
import type { AppConfig } from '../config.js';
import type { ContentService } from '../content/content-loader.js';
import type { RoomStore } from './room-store.js';
import type { RoomErrorCode } from '@almost-you/shared';

type ManagerIO = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

interface RoomRuntime {
  state: EngineState;
  sockets: Map<string, Set<string>>;
  timer: NodeJS.Timeout | null;
  timerToken: number;
  reactionTimes: Map<string, number>;
  saveChain: Promise<void>;
  listed: boolean;
  joinCode: string;
  creatorId: string;
  banned: Set<string>;
}

export const PUBLIC_ROOM_LIMIT = 50;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const SNOWFLAKE_PATTERN = /^\d{15,22}$/;

export interface JoinParams {
  roomId: string;
  user: SessionUser;
  socketId: string;
  preferredLocale?: string;
  mustExist?: boolean;
}

export interface JoinResult {
  roomId: string;
  joinCode: string;
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly codes = new Map<string, string>();
  private readonly deck: SceneDeck;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private closing = false;

  constructor(
    private readonly io: ManagerIO,
    private readonly content: ContentService,
    private readonly store: RoomStore,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {
    this.deck = { pairs: content.getPairs() };
  }

  async init(): Promise<void> {
    const saved = await this.store.loadAll();
    const now = Date.now();
    for (const entry of saved) {
      const state: EngineState = {
        ...entry.state,
        players: entry.state.players.map((player) => ({ ...player, connected: false })),
        deadlineAt: null,
        updatedAt: now,
        seq: entry.state.seq + 1,
      };
      const joinCode = this.claimCode(state.roomId, entry.joinCode);
      const room = this.makeRuntime(state, {
        joinCode,
        creatorId: state.hostId,
        listed: entry.listed,
      });
      this.rooms.set(state.roomId, room);
    }
    if (saved.length > 0) {
      this.logger.info({ rooms: saved.length }, 'restored room snapshots');
    }

    this.cleanupTimer = setInterval(() => {
      void this.cleanup();
    }, 60_000);
    this.cleanupTimer.unref();
  }

  resolveRoomId(input: string): string | null {
    const normalized = normalizeRoomId(input);
    const byCode = this.codes.get(normalized);
    if (byCode) return byCode;
    if (this.rooms.has(normalized)) return normalized;
    return null;
  }

  assertJoinable(roomId: string, playerId: string, mustExist: boolean): void {
    const internalId = this.resolveRoomId(roomId);
    if (!internalId) {
      if (mustExist) throw new GameError('ROOM_NOT_FOUND', 'room not found');
      return;
    }
    const room = this.rooms.get(internalId);
    if (room) this.assertRoomJoinable(room, playerId);
  }

  listPublic(limit = PUBLIC_ROOM_LIMIT): PublicRoomListing[] {
    const listings: PublicRoomListing[] = [];
    for (const room of this.rooms.values()) {
      if (!room.listed) continue;
      if (room.state.phase !== 'lobby') continue;
      if (room.sockets.size === 0) continue;
      if (room.state.players.length >= MAX_PLAYERS) continue;

      const host = room.state.players.find((player) => player.id === room.state.hostId);
      if (!host || !host.connected) continue;
      if (containsLink(host.name)) continue;

      listings.push({
        roomId: room.joinCode,
        hostName: host.name,
        hostAvatarUrl: host.avatarUrl,
        hostColor: host.color,
        players: room.state.players.filter((player) => player.connected).length,
        capacity: MAX_PLAYERS,
        contentLocale: room.state.contentLocale,
      });
    }

    listings.sort(
      (a, b) => b.players - a.players || a.roomId.localeCompare(b.roomId),
    );
    return listings.slice(0, limit);
  }

  async join(params: JoinParams): Promise<JoinResult> {
    const resolvedId = this.resolveRoomId(params.roomId);
    const roomId = resolvedId ?? normalizeRoomId(params.roomId);
    const now = Date.now();
    let room = this.rooms.get(roomId);

    if (room) {
      this.assertRoomJoinable(room, params.user.id);
      room.state = addPlayer(
        room.state,
        {
          id: params.user.id,
          name: params.user.name,
          avatarUrl: params.user.avatarUrl,
        },
        now,
      );
    } else {
      if (params.mustExist) {
        throw new GameError('ROOM_NOT_FOUND', 'room not found');
      }
      if (this.rooms.size >= this.config.maxRooms) {
        throw new GameError('ROOM_FULL', 'server room capacity reached');
      }
      if (this.countRoomsCreatedBy(params.user.id) >= this.config.maxRoomsPerUser) {
        throw new GameError('ROOM_LIMIT', 'you already have too many open rooms');
      }
      const contentLocale = resolveLocale(
        params.preferredLocale,
        this.content.getContentLocales(),
        FALLBACK_LOCALE,
      );
      const state = createRoom({
        roomId,
        host: {
          id: params.user.id,
          name: params.user.name,
          avatarUrl: params.user.avatarUrl,
        },
        contentLocale,
        now,
      });
      const joinCode = this.claimCode(roomId, null);
      room = this.makeRuntime(state, { joinCode, creatorId: params.user.id });
      this.rooms.set(roomId, room);
    }

    let socketIds = room.sockets.get(params.user.id);
    if (!socketIds) {
      socketIds = new Set();
      room.sockets.set(params.user.id, socketIds);
    }
    socketIds.add(params.socketId);

    this.resumeIfNeeded(room, now);
    await this.persist(room);
    this.broadcastState(room);
    this.schedule(room);
    return { roomId: room.state.roomId, joinCode: room.joinCode };
  }

  async detach(
    roomId: string,
    playerId: string,
    socketId: string,
    explicit = false,
  ): Promise<void> {
    const room = this.rooms.get(normalizeRoomId(roomId));
    if (!room) return;

    const socketIds = room.sockets.get(playerId);
    if (!socketIds) return;
    socketIds.delete(socketId);
    if (socketIds.size > 0) return;
    room.sockets.delete(playerId);

    const now = Date.now();
    room.state = explicit
      ? removePlayer(room.state, playerId, now)
      : markConnected(room.state, playerId, false, now);

    if (room.state.phase === 'vote' && allConnectedVoted(room.state)) {
      room.state = finalizeVote(room.state, this.deck, now);
    }
    if (room.state.phase === 'guess' && room.state.almostId === playerId) {
      room.state = finalizeGuess(room.state, false, now);
    }

    if (room.sockets.size === 0) {
      this.pauseRoom(room);
    } else {
      await this.persist(room);
      this.broadcastState(room);
      this.schedule(room);
    }

    if (room.state.players.length === 0) {
      await this.deleteRoom(room.state.roomId);
    }
  }

  async kick(
    roomId: string,
    playerId: string,
    targetId: string,
  ): Promise<{ socketIds: string[] }> {
    const room = this.requireRoom(roomId);
    this.requirePlayer(room, playerId);
    if (room.state.hostId !== playerId) {
      throw new GameError('NOT_HOST', 'only the host can remove players');
    }
    if (room.state.phase !== 'lobby') {
      throw new GameError('INVALID_PHASE', 'players can only be removed in the lobby');
    }
    if (targetId === playerId) {
      throw new GameError('INVALID_INPUT', 'the host cannot remove themselves');
    }
    if (!room.state.players.some((player) => player.id === targetId)) {
      throw new GameError('PLAYER_NOT_FOUND', 'player not found');
    }

    room.banned.add(targetId);
    const socketIds = [...(room.sockets.get(targetId) ?? [])];
    room.sockets.delete(targetId);
    room.state = removePlayer(room.state, targetId, Date.now());
    this.logger.info({ roomId: room.state.roomId, targetId }, 'player removed from lobby');
    await this.afterChange(room);
    return { socketIds };
  }

  async setContentLocale(roomId: string, playerId: string, locale: string): Promise<void> {
    const room = this.requireRoom(roomId);
    this.requirePlayer(room, playerId);
    room.state = setContentLocale(
      room.state,
      playerId,
      locale,
      this.content.getContentLocales(),
    );
    await this.afterChange(room);
  }

  async setListed(roomId: string, playerId: string, listed: boolean): Promise<void> {
    const room = this.requireRoom(roomId);
    this.requirePlayer(room, playerId);
    if (room.state.hostId !== playerId) {
      throw new GameError('NOT_HOST', 'only the host can change room visibility');
    }
    if (room.state.phase !== 'lobby') {
      throw new GameError('INVALID_PHASE', 'rooms can only be listed in the lobby');
    }
    if (room.listed === listed) return;
    room.listed = listed;
    this.logger.info({ roomId: room.state.roomId, listed }, 'room visibility changed');
    await this.persist(room);
    this.broadcastState(room);
  }

  async start(roomId: string, playerId: string): Promise<void> {
    const room = this.requireRoom(roomId);
    this.requirePlayer(room, playerId);
    room.state = startMatch(room.state, playerId, this.deck);
    await this.afterChange(room);
  }

  async endTurn(roomId: string, playerId: string): Promise<void> {
    const room = this.requireRoom(roomId);
    this.requirePlayer(room, playerId);
    room.state = endTurn(room.state, playerId);
    await this.afterChange(room);
  }

  async vote(roomId: string, playerId: string, targetId: string): Promise<void> {
    const room = this.requireRoom(roomId);
    this.requirePlayer(room, playerId);
    room.state = castVote(room.state, playerId, targetId);
    if (allConnectedVoted(room.state)) {
      room.state = finalizeVote(room.state, this.deck);
    }
    await this.afterChange(room);
  }

  async guess(roomId: string, playerId: string, optionId: string): Promise<void> {
    const room = this.requireRoom(roomId);
    this.requirePlayer(room, playerId);
    room.state = castGuess(room.state, playerId, optionId);
    await this.afterChange(room);
  }

  async advanceRound(roomId: string, playerId: string): Promise<void> {
    const room = this.requireRoom(roomId);
    this.requirePlayer(room, playerId);
    if (room.state.hostId !== playerId) {
      throw new GameError('NOT_HOST', 'only the host can continue');
    }
    room.state = nextRound(room.state, this.deck);
    await this.afterChange(room);
  }

  async rematch(roomId: string, playerId: string): Promise<void> {
    const room = this.requireRoom(roomId);
    this.requirePlayer(room, playerId);
    room.state = rematch(room.state, playerId, this.deck);
    await this.afterChange(room);
  }

  reaction(roomId: string, playerId: string, emoji: string): void {
    const room = this.requireRoom(roomId);
    this.requirePlayer(room, playerId);
    const now = Date.now();
    const last = room.reactionTimes.get(playerId) ?? 0;
    if (now - last < REACTION_COOLDOWN_MS) {
      throw new GameError('RATE_LIMITED', 'slow down a little');
    }
    room.reactionTimes.set(playerId, now);
    const player = room.state.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    this.emitToRoom(room, 'game:reaction', {
      playerId,
      playerName: player.name,
      emoji,
      at: now,
    });
  }

  private makeRuntime(
    state: EngineState,
    options: { joinCode: string; creatorId?: string; listed?: boolean },
  ): RoomRuntime {
    return {
      state,
      sockets: new Map(),
      timer: null,
      timerToken: 0,
      reactionTimes: new Map(),
      saveChain: Promise.resolve(),
      listed: options.listed ?? false,
      joinCode: options.joinCode,
      creatorId: options.creatorId ?? state.hostId,
      banned: new Set(),
    };
  }

  private assertRoomJoinable(room: RoomRuntime, playerId: string): void {
    if (room.banned.has(playerId)) {
      throw new GameError('ROOM_FORBIDDEN', 'you were removed from this room');
    }
    if (room.state.players.some((player) => player.id === playerId)) return;
    if (room.state.phase !== 'lobby' && room.state.phase !== 'finished') {
      throw new GameError('ROOM_IN_PROGRESS', 'this match is already running');
    }
    if (room.state.players.length >= MAX_PLAYERS) {
      throw new GameError('ROOM_FULL', 'this room is full');
    }
  }

  private countRoomsCreatedBy(playerId: string): number {
    let count = 0;
    for (const room of this.rooms.values()) {
      if (room.creatorId === playerId) count += 1;
    }
    return count;
  }

  private claimCode(internalId: string, preferred: string | null): string {
    if (preferred && !this.codes.has(preferred)) {
      this.codes.set(preferred, internalId);
      return preferred;
    }
    if (!SNOWFLAKE_PATTERN.test(internalId) && !this.codes.has(internalId)) {
      this.codes.set(internalId, internalId);
      return internalId;
    }
    const code = this.allocateCode();
    this.codes.set(code, internalId);
    return code;
  }

  private allocateCode(): string {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      let code = '';
      for (let index = 0; index < CODE_LENGTH; index += 1) {
        code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      }
      if (!this.codes.has(code) && !this.rooms.has(code)) return code;
    }
    throw new GameError('INTERNAL', 'could not allocate a room code');
  }

  private requireRoom(roomId: string): RoomRuntime {
    const room = this.rooms.get(normalizeRoomId(roomId));
    if (!room) throw new GameError('ROOM_NOT_FOUND', 'room not found');
    return room;
  }

  private requirePlayer(room: RoomRuntime, playerId: string): void {
    if (!room.state.players.some((player) => player.id === playerId)) {
      throw new GameError('PLAYER_NOT_FOUND', 'you are not in this room');
    }
  }

  private async afterChange(room: RoomRuntime): Promise<void> {
    await this.persist(room);
    this.broadcastState(room);
    this.schedule(room);
  }

  private persist(room: RoomRuntime): Promise<void> {
    const snapshot = room.state;
    const meta = { listed: room.listed, joinCode: room.joinCode };
    room.saveChain = room.saveChain
      .then(() => this.store.save(snapshot, meta))
      .catch((error) => {
        this.logger.warn({ err: error, roomId: room.state.roomId }, 'could not save room snapshot');
      });
    return room.saveChain;
  }

  private broadcastState(room: RoomRuntime): void {
    const now = Date.now();
    for (const [playerId, socketIds] of room.sockets) {
      if (socketIds.size === 0) continue;
      if (!room.state.players.some((player) => player.id === playerId)) continue;
      const state = toPublicState(room.state, playerId, now);
      for (const socketId of socketIds) {
        this.io.to(socketId).emit('room:state', {
          ...state,
          roomId: room.joinCode,
          listed: room.listed,
        });
      }
    }
  }

  private emitToRoom<E extends keyof ServerToClientEvents>(
    room: RoomRuntime,
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): void {
    const emitter = this.io.to(roomName(room.state.roomId)) as unknown as {
      emit: (eventName: string, eventPayload: unknown) => boolean;
    };
    emitter.emit(event, payload);
  }

  private schedule(room: RoomRuntime): void {
    this.clearTimer(room);
    if (this.closing) return;
    if (room.sockets.size === 0) return;
    if (room.state.deadlineAt === null) return;

    const delay = Math.max(0, room.state.deadlineAt - Date.now());
    const token = room.timerToken;
    room.timer = setTimeout(() => {
      void this.handleTimeout(room.state.roomId, token);
    }, delay);
    room.timer.unref();
  }

  private clearTimer(room: RoomRuntime): void {
    room.timerToken += 1;
    if (room.timer) {
      clearTimeout(room.timer);
      room.timer = null;
    }
  }

  private async handleTimeout(roomId: string, token: number): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room || room.timerToken !== token) return;
    room.timer = null;
    if (room.sockets.size === 0) {
      this.pauseRoom(room);
      return;
    }

    const now = Date.now();
    try {
      switch (room.state.phase) {
        case 'reveal':
          room.state = beginDiscussion(room.state, now);
          break;
        case 'discuss': {
          const active = activePlayerId(room.state);
          if (!active) {
            room.state = beginVote(room.state, now);
          } else {
            room.state = endTurn(room.state, active, now);
          }
          break;
        }
        case 'vote':
          room.state = finalizeVote(room.state, this.deck, now);
          break;
        case 'guess':
          room.state = finalizeGuess(room.state, false, now);
          break;
        case 'result':
          room.state = nextRound(room.state, this.deck, now);
          break;
        default:
          return;
      }
      await this.afterChange(room);
    } catch (error) {
      this.logger.error(
        { err: error, roomId, phase: room.state.phase },
        'room timer transition failed',
      );
      room.state = {
        ...room.state,
        deadlineAt: null,
        updatedAt: now,
        seq: room.state.seq + 1,
      };
      await this.persist(room);
      this.broadcastState(room);
    }
  }

  private pauseRoom(room: RoomRuntime): void {
    this.clearTimer(room);
    if (room.state.deadlineAt === null) return;
    room.state = {
      ...room.state,
      deadlineAt: null,
      updatedAt: Date.now(),
      seq: room.state.seq + 1,
    };
    void this.persist(room);
  }

  private resumeIfNeeded(room: RoomRuntime, now: number): void {
    if (room.state.deadlineAt !== null) return;
    const seconds = resumeSeconds(room.state.phase);
    if (seconds === null) return;
    room.state = {
      ...room.state,
      deadlineAt: now + seconds * 1000,
      updatedAt: now,
      seq: room.state.seq + 1,
    };
  }

  private async deleteRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) this.clearTimer(room);
    this.rooms.delete(roomId);
    if (room) {
      if (this.codes.get(room.joinCode) === roomId) this.codes.delete(room.joinCode);
      await room.saveChain;
    }
    await this.store.delete(roomId).catch((error) => {
      this.logger.warn({ err: error, roomId }, 'could not delete room snapshot');
    });
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const matchMaxAge = this.config.roomTtlSeconds * 1000;
    const lobbyMaxAge = this.config.lobbyTtlSeconds * 1000;
    for (const [roomId, room] of this.rooms) {
      if (room.sockets.size > 0) continue;
      const maxAge = room.state.phase === 'lobby' ? lobbyMaxAge : matchMaxAge;
      if (room.state.players.length === 0 || now - room.state.updatedAt > maxAge) {
        await this.deleteRoom(roomId);
      }
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;

    for (const room of this.rooms.values()) {
      this.clearTimer(room);
      if (room.state.deadlineAt !== null) {
        room.state = {
          ...room.state,
          deadlineAt: null,
          updatedAt: Date.now(),
          seq: room.state.seq + 1,
        };
      }
      await this.persist(room);
    }

    await Promise.all([...this.rooms.values()].map((room) => room.saveChain));
    await this.store.close();
  }

}

export function toRoomErrorPayload(error: unknown): { code: RoomErrorCode; message?: string } {
  if (error instanceof GameError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'INTERNAL' };
}

export function normalizeRoomId(roomId: string): string {
  return roomId.trim().toUpperCase();
}

export function roomName(roomId: string): string {
  return `room:${roomId}`;
}

function resumeSeconds(phase: EngineState['phase']): number | null {
  switch (phase) {
    case 'reveal':
      return REVEAL_SECONDS;
    case 'discuss':
      return TURN_SECONDS;
    case 'vote':
      return VOTE_SECONDS;
    case 'guess':
      return GUESS_SECONDS;
    case 'result':
      return RESULT_SECONDS;
    default:
      return null;
  }
}
