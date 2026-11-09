import { afterEach, describe, expect, it } from 'vitest';
import { MAX_PLAYERS } from '@almost-you/shared';
import type { ScenePair, SessionUser } from '@almost-you/shared';
import type { EngineState } from '@almost-you/game-core';
import type { Logger } from 'pino';
import type { AppConfig } from '../config.js';
import type { ContentService } from '../content/content-loader.js';
import { RoomManager } from './room-manager.js';
import { MemoryRoomStore } from './room-store.js';

const pairs: ScenePair[] = [
  {
    id: 'beach-pool',
    category: 'water',
    majority: {
      id: 'beach',
      emoji: '🏖️',
      labels: { 'en-US': 'Beach', 'pt-BR': 'Praia' },
      category: 'water',
    },
    almost: {
      id: 'pool',
      emoji: '🏊',
      labels: { 'en-US': 'Pool', 'pt-BR': 'Piscina' },
      category: 'water',
    },
  },
  {
    id: 'forest-campsite',
    category: 'outdoors',
    majority: {
      id: 'forest',
      emoji: '🌲',
      labels: { 'en-US': 'Forest', 'pt-BR': 'Floresta' },
      category: 'outdoors',
    },
    almost: {
      id: 'campsite',
      emoji: '🏕️',
      labels: { 'en-US': 'Campsite', 'pt-BR': 'Acampamento' },
      category: 'outdoors',
    },
  },
  {
    id: 'kitchen-restaurant',
    category: 'food',
    majority: {
      id: 'kitchen',
      emoji: '🍳',
      labels: { 'en-US': 'Kitchen', 'pt-BR': 'Cozinha' },
      category: 'food',
    },
    almost: {
      id: 'restaurant',
      emoji: '🍽️',
      labels: { 'en-US': 'Restaurant', 'pt-BR': 'Restaurante' },
      category: 'food',
    },
  },
  {
    id: 'moon-planet',
    category: 'space',
    majority: {
      id: 'moon',
      emoji: '🌙',
      labels: { 'en-US': 'Moon', 'pt-BR': 'Lua' },
      category: 'space',
    },
    almost: {
      id: 'planet',
      emoji: '🪐',
      labels: { 'en-US': 'Planet', 'pt-BR': 'Planeta' },
      category: 'space',
    },
  },
  {
    id: 'cinema-theater',
    category: 'city',
    majority: {
      id: 'cinema',
      emoji: '🎬',
      labels: { 'en-US': 'Cinema', 'pt-BR': 'Cinema' },
      category: 'city',
    },
    almost: {
      id: 'theater',
      emoji: '🎭',
      labels: { 'en-US': 'Theater', 'pt-BR': 'Teatro' },
      category: 'city',
    },
  },
];

const managers: RoomManager[] = [];

function makeManager(options: { store?: MemoryRoomStore; config?: Partial<AppConfig> } = {}): RoomManager {
  const io = {
    to: () => ({ emit: () => true }),
  } as unknown as ConstructorParameters<typeof RoomManager>[0];
  const content = {
    getPairs: () => pairs,
    getContentLocales: () => ['en-US', 'pt-BR'],
  } as unknown as ContentService;
  const config = {
    maxRooms: 100,
    roomTtlSeconds: 600,
    lobbyTtlSeconds: 300,
    maxRoomsPerUser: 5,
    ...options.config,
  } as unknown as AppConfig;
  const logger = {
    info() {},
    warn() {},
    error() {},
  } as unknown as Logger;

  const manager = new RoomManager(
    io,
    content,
    options.store ?? new MemoryRoomStore(),
    config,
    logger,
  );
  managers.push(manager);
  return manager;
}

function user(id: string, name = id): SessionUser {
  return { id, name, avatarUrl: null, guest: true };
}

async function joinAll(manager: RoomManager, roomId: string, players: SessionUser[]) {
  for (const player of players) {
    await manager.join({
      roomId,
      user: player,
      socketId: `${player.id}:socket`,
      preferredLocale: 'en-US',
    });
  }
}

function runtime(manager: RoomManager, roomId: string): { state: EngineState } {
  const rooms = (manager as unknown as { rooms: Map<string, { state: EngineState }> }).rooms;
  const room = rooms.get(roomId);
  if (!room) throw new Error(`room ${roomId} not found`);
  return room;
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.close()));
});

describe('RoomManager.listPublic', () => {
  it('only lists rooms that opted in', async () => {
    const manager = makeManager();
    await joinAll(manager, 'ROOM-A', [user('host', 'Host'), user('guest', 'Guest')]);

    expect(manager.listPublic()).toEqual([]);

    await manager.setListed('ROOM-A', 'host', true);

    expect(manager.listPublic()).toEqual([
      {
        roomId: 'ROOM-A',
        hostName: 'Host',
        hostAvatarUrl: null,
        hostColor: expect.any(String),
        players: 2,
        capacity: MAX_PLAYERS,
        contentLocale: 'en-US',
      },
    ]);
  });

  it('hides a listed room once nobody is connected', async () => {
    const manager = makeManager();
    await joinAll(manager, 'ROOM-A', [user('host'), user('guest')]);
    await manager.setListed('ROOM-A', 'host', true);

    await manager.detach('ROOM-A', 'host', 'host:socket');
    await manager.detach('ROOM-A', 'guest', 'guest:socket');

    expect(manager.listPublic()).toEqual([]);
  });

  it('hands the listing to a connected player when the host leaves', async () => {
    const manager = makeManager();
    await joinAll(manager, 'ROOM-A', [user('host', 'Host'), user('guest', 'Guest')]);
    await manager.setListed('ROOM-A', 'host', true);

    await manager.detach('ROOM-A', 'host', 'host:socket');

    expect(manager.listPublic()).toEqual([
      expect.objectContaining({ hostName: 'Guest', players: 1 }),
    ]);
  });

  it('skips a listed room whose host is marked as disconnected', async () => {
    const manager = makeManager();
    await joinAll(manager, 'ROOM-A', [user('host'), user('guest')]);
    await manager.setListed('ROOM-A', 'host', true);

    // markConnected transfers the host role, so force the inconsistent state directly.
    const room = runtime(manager, 'ROOM-A');
    room.state = {
      ...room.state,
      players: room.state.players.map((player) =>
        player.id === room.state.hostId ? { ...player, connected: false } : player,
      ),
    };

    expect(manager.listPublic()).toEqual([]);
  });

  it('hides a listed room once the match starts', async () => {
    const manager = makeManager();
    await joinAll(manager, 'ROOM-A', [user('host'), user('p2'), user('p3')]);
    await manager.setListed('ROOM-A', 'host', true);
    expect(manager.listPublic()).toHaveLength(1);

    await manager.start('ROOM-A', 'host');

    expect(manager.listPublic()).toEqual([]);
  });

  it('hides a listed room that is already full', async () => {
    const manager = makeManager();
    const players = Array.from({ length: MAX_PLAYERS }, (_, index) => user(`p${index}`));
    await joinAll(manager, 'ROOM-FULL', players);
    await manager.setListed('ROOM-FULL', 'p0', true);

    expect(manager.listPublic()).toEqual([]);
  });

  it('sorts by connected players and honours the limit', async () => {
    const manager = makeManager();
    await joinAll(manager, 'ROOM-SMALL', [user('a1'), user('a2')]);
    await joinAll(manager, 'ROOM-BIG', [user('b1'), user('b2'), user('b3')]);
    await joinAll(manager, 'ROOM-TINY', [user('c1')]);
    await manager.setListed('ROOM-SMALL', 'a1', true);
    await manager.setListed('ROOM-BIG', 'b1', true);
    await manager.setListed('ROOM-TINY', 'c1', true);

    expect(manager.listPublic().map((room) => room.roomId)).toEqual([
      'ROOM-BIG',
      'ROOM-SMALL',
      'ROOM-TINY',
    ]);
    expect(manager.listPublic(2).map((room) => room.roomId)).toEqual([
      'ROOM-BIG',
      'ROOM-SMALL',
    ]);
  });
});

describe('RoomManager room codes', () => {
  it('gives Discord channel rooms a short code and keeps the channel id private', async () => {
    const manager = makeManager();
    const channelId = '123456789012345678';
    await joinAll(manager, channelId, [user('host', 'Host')]);
    await manager.setListed(channelId, 'host', true);

    const [listing] = manager.listPublic();
    expect(listing?.roomId).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(listing?.roomId).not.toBe(channelId);

    await manager.join({
      roomId: listing!.roomId,
      user: user('guest'),
      socketId: 'guest:socket',
    });
    expect(runtime(manager, channelId).state.players).toHaveLength(2);
  });

  it('keeps custom development codes as the join code', async () => {
    const manager = makeManager();
    await joinAll(manager, 'TESTE', [user('host')]);
    await manager.setListed('TESTE', 'host', true);

    expect(manager.listPublic()[0]?.roomId).toBe('TESTE');
  });
});

describe('RoomManager.kick', () => {
  it('removes the player and blocks them from rejoining', async () => {
    const manager = makeManager();
    await joinAll(manager, 'ROOM-A', [user('host'), user('guest')]);

    const result = await manager.kick('ROOM-A', 'host', 'guest');

    expect(result.socketIds).toEqual(['guest:socket']);
    expect(runtime(manager, 'ROOM-A').state.players.map((player) => player.id)).toEqual([
      'host',
    ]);
    await expect(
      manager.join({ roomId: 'ROOM-A', user: user('guest'), socketId: 'guest:2' }),
    ).rejects.toMatchObject({ code: 'ROOM_FORBIDDEN' });
  });

  it('only lets the host remove players during the lobby', async () => {
    const manager = makeManager();
    await joinAll(manager, 'ROOM-A', [user('host'), user('guest'), user('p3')]);

    await expect(manager.kick('ROOM-A', 'guest', 'host')).rejects.toMatchObject({
      code: 'NOT_HOST',
    });

    await manager.start('ROOM-A', 'host');
    await expect(manager.kick('ROOM-A', 'host', 'guest')).rejects.toMatchObject({
      code: 'INVALID_PHASE',
    });
  });
});

describe('RoomManager limits', () => {
  it('rejects a new room once the user reaches the per-user limit', async () => {
    const manager = makeManager({ config: { maxRoomsPerUser: 1 } });
    await joinAll(manager, 'ROOM-A', [user('host')]);

    await expect(joinAll(manager, 'ROOM-B', [user('host')])).rejects.toMatchObject({
      code: 'ROOM_LIMIT',
    });

    await joinAll(manager, 'ROOM-A', [user('host')]);
  });

  it('rejects an extra player when the room is full', async () => {
    const manager = makeManager();
    const players = Array.from({ length: MAX_PLAYERS }, (_, index) => user(`p${index}`));
    await joinAll(manager, 'ROOM-FULL', players);

    await expect(joinAll(manager, 'ROOM-FULL', [user('extra')])).rejects.toMatchObject({
      code: 'ROOM_FULL',
    });
  });

  it('persists visibility and the join code in the store', async () => {
    const store = new MemoryRoomStore();
    const manager = makeManager({ store });
    await joinAll(manager, 'ROOM-A', [user('host')]);
    await manager.setListed('ROOM-A', 'host', true);

    const [snapshot] = await store.loadAll();
    expect(snapshot).toMatchObject({ listed: true, joinCode: 'ROOM-A' });
  });
});
