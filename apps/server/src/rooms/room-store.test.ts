import { describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { EngineState } from '@almost-you/game-core';
import { MemoryRoomStore, RedisRoomStore } from './room-store.js';

const logger = {
  warn() {},
  info() {},
} as unknown as Logger;

function state(roomId = 'ROOM-A'): EngineState {
  return {
    roomId,
    seq: 3,
    phase: 'lobby',
    players: [],
    hostId: 'host',
    contentLocale: 'en-US',
    round: 0,
    totalRounds: 3,
    deadlineAt: null,
    createdAt: 1,
    updatedAt: 2,
  } as unknown as EngineState;
}

class FakeRedis {
  status = 'ready';
  readonly entries = new Map<string, string>();

  async set(key: string, value: string): Promise<'OK'> {
    this.entries.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.entries.delete(key) ? 1 : 0;
  }

  async scan(..._args: unknown[]): Promise<[string, string[]]> {
    return ['0', [...this.entries.keys()]];
  }

  async mget(...keys: string[]): Promise<Array<string | null>> {
    return keys.map((key) => this.entries.get(key) ?? null);
  }

  async quit(): Promise<'OK'> {
    return 'OK';
  }

  disconnect(): void {}
}

function makeRedisStore() {
  const redis = new FakeRedis();
  const store = new RedisRoomStore(
    redis as unknown as Redis,
    'test:room:',
    60,
    logger,
  );
  return { redis, store };
}

describe('MemoryRoomStore', () => {
  it('round-trips the state and its listing metadata', async () => {
    const store = new MemoryRoomStore();
    await store.save(state(), { listed: true, joinCode: 'ABC234' });

    const [loaded] = await store.loadAll();
    expect(loaded).toMatchObject({ listed: true, joinCode: 'ABC234' });
    expect(loaded?.state.roomId).toBe('ROOM-A');
  });

  it('deletes rooms by internal id', async () => {
    const store = new MemoryRoomStore();
    await store.save(state(), { listed: false, joinCode: 'ABC234' });
    await store.delete('ROOM-A');

    expect(await store.loadAll()).toEqual([]);
  });
});

describe('RedisRoomStore', () => {
  it('persists the current snapshot format', async () => {
    const { redis, store } = makeRedisStore();
    await store.save(state(), { listed: true, joinCode: 'ABC234' });

    const raw = redis.entries.get('test:room:ROOM-A');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toMatchObject({ version: 2, listed: true, joinCode: 'ABC234' });

    const [loaded] = await store.loadAll();
    expect(loaded).toMatchObject({ listed: true, joinCode: 'ABC234' });
    expect(loaded?.state.roomId).toBe('ROOM-A');
  });

  it('reads version 1 snapshots without listing metadata', async () => {
    const { redis, store } = makeRedisStore();
    redis.entries.set(
      'test:room:ROOM-OLD',
      JSON.stringify({ version: 1, savedAt: 1, state: state('ROOM-OLD') }),
    );

    const [loaded] = await store.loadAll();
    expect(loaded).toMatchObject({ listed: false, joinCode: null });
    expect(loaded?.state.roomId).toBe('ROOM-OLD');
  });

  it('skips unreadable or invalid snapshots', async () => {
    const { redis, store } = makeRedisStore();
    redis.entries.set('test:room:BROKEN', 'not json');
    redis.entries.set('test:room:EMPTY', JSON.stringify({ version: 2, state: {} }));
    await store.save(state('ROOM-OK'), { listed: false, joinCode: 'ROOM-OK' });

    const loaded = await store.loadAll();
    expect(loaded.map((entry) => entry.state.roomId)).toEqual(['ROOM-OK']);
  });
});
