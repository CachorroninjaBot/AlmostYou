import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { EngineState } from '@almost-you/game-core';
import type { AppConfig } from '../config.js';

export interface RoomSnapshotMeta {
  listed: boolean;
  joinCode: string;
}

export interface LoadedRoom {
  state: EngineState;
  listed: boolean;
  joinCode: string | null;
}

export interface RoomStore {
  readonly kind: 'redis' | 'memory';
  save(state: EngineState, meta: RoomSnapshotMeta): Promise<void>;
  delete(roomId: string): Promise<void>;
  loadAll(): Promise<LoadedRoom[]>;
  close(): Promise<void>;
  isReady(): boolean;
}

interface SerializedRoom {
  version: 2;
  savedAt: number;
  listed: boolean;
  joinCode: string;
  state: EngineState;
}

export class MemoryRoomStore implements RoomStore {
  readonly kind = 'memory' as const;
  private readonly rooms = new Map<string, SerializedRoom>();

  async save(state: EngineState, meta: RoomSnapshotMeta): Promise<void> {
    this.rooms.set(state.roomId, {
      version: 2,
      savedAt: Date.now(),
      listed: meta.listed,
      joinCode: meta.joinCode,
      state: structuredClone(state),
    });
  }

  async delete(roomId: string): Promise<void> {
    this.rooms.delete(roomId);
  }

  async loadAll(): Promise<LoadedRoom[]> {
    return [...this.rooms.values()].map((entry) => ({
      state: structuredClone(entry.state),
      listed: entry.listed,
      joinCode: entry.joinCode,
    }));
  }

  async close(): Promise<void> {
    this.rooms.clear();
  }

  isReady(): boolean {
    return true;
  }
}

export class RedisRoomStore implements RoomStore {
  readonly kind = 'redis' as const;

  constructor(
    private readonly client: Redis,
    private readonly prefix: string,
    private readonly ttlSeconds: number,
    private readonly logger: Logger,
  ) {}

  private key(roomId: string): string {
    return `${this.prefix}${roomId}`;
  }

  async save(state: EngineState, meta: RoomSnapshotMeta): Promise<void> {
    const payload: SerializedRoom = {
      version: 2,
      savedAt: Date.now(),
      listed: meta.listed,
      joinCode: meta.joinCode,
      state,
    };
    await this.client.set(this.key(state.roomId), JSON.stringify(payload), 'EX', this.ttlSeconds);
  }

  async delete(roomId: string): Promise<void> {
    await this.client.del(this.key(roomId));
  }

  async loadAll(): Promise<LoadedRoom[]> {
    const rooms: LoadedRoom[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        `${this.prefix}*`,
        'COUNT',
        200,
      );
      cursor = nextCursor;
      if (keys.length === 0) continue;

      const values = await this.client.mget(...keys);
      for (const raw of values) {
        if (!raw) continue;
        const room = parseSerializedRoom(raw, this.logger);
        if (room) rooms.push(room);
      }
    } while (cursor !== '0');

    return rooms;
  }

  async close(): Promise<void> {
    await this.client.quit().catch(() => {
      this.client.disconnect();
    });
  }

  isReady(): boolean {
    return this.client.status === 'ready';
  }
}

function parseSerializedRoom(raw: string, logger: Logger): LoadedRoom | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SerializedRoom>;
    const state = parsed.state;
    if (
      !state ||
      typeof state.roomId !== 'string' ||
      typeof state.seq !== 'number' ||
      !Array.isArray(state.players) ||
      typeof state.phase !== 'string'
    ) {
      logger.warn('ignoring invalid room snapshot');
      return null;
    }
    return {
      state,
      listed: parsed.listed === true,
      joinCode: typeof parsed.joinCode === 'string' && parsed.joinCode.length > 0
        ? parsed.joinCode
        : null,
    };
  } catch {
    logger.warn('ignoring unreadable room snapshot');
    return null;
  }
}

export async function createRoomStore(
  config: AppConfig,
  logger: Logger,
): Promise<RoomStore> {
  if (!config.redisUrl) {
    logger.warn('REDIS_URL is not set; room snapshots will live in memory only');
    return new MemoryRoomStore();
  }

  const client = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 8_000,
  });

  try {
    await client.connect();
    logger.info('connected to Redis for room snapshots');
    return new RedisRoomStore(
      client,
      config.redisKeyPrefix,
      config.roomTtlSeconds,
      logger,
    );
  } catch (error) {
    logger.warn({ err: error }, 'could not connect to Redis; falling back to memory snapshots');
    client.disconnect();
    return new MemoryRoomStore();
  }
}
