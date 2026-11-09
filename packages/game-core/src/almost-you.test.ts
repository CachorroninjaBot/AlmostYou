import { describe, expect, it } from 'vitest';
import type { ScenePair } from '@almost-you/shared';
import {
  ALMOST_WIN_SCORE,
  DISCUSS_LOOPS,
  GUESS_OPTION_COUNT,
  INSIDER_WIN_SCORE,
} from '@almost-you/shared';
import {
  GameError,
  addPlayer,
  allConnectedVoted,
  beginDiscussion,
  castGuess,
  castVote,
  createRoom,
  endTurn,
  finalizeVote,
  markConnected,
  nextRound,
  pickGuessOptions,
  rematch,
  setContentLocale,
  startMatch,
  toPublicState,
  type EngineState,
  type Rng,
  type SceneDeck,
} from './almost-you.js';

const NOW = 1_700_000_000_000;

function mulberry32(seed: number): Rng {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pair(
  id: string,
  majorityEmoji: string,
  majorityLabel: string,
  almostEmoji: string,
  almostLabel: string,
  category: string,
): ScenePair {
  const labels = (label: string) => ({ 'en-US': label, 'pt-BR': label });
  return {
    id,
    category,
    majority: { id: `${id}-majority`, emoji: majorityEmoji, labels: labels(majorityLabel) },
    almost: { id: `${id}-almost`, emoji: almostEmoji, labels: labels(almostLabel) },
  };
}

const pairs: ScenePair[] = [
  pair('beach', '🏖️', 'Beach', '🏊', 'Swimming pool', 'places'),
  pair('forest', '🌲', 'Forest', '🏕️', 'Campsite', 'places'),
  pair('kitchen', '🍳', 'Kitchen', '🍽️', 'Restaurant', 'places'),
  pair('stadium', '🏟️', 'Stadium', '🎪', 'Circus', 'places'),
  pair('moon', '🌙', 'Moon', '🪐', 'Planet', 'space'),
  pair('ocean', '🐠', 'Coral reef', '🎣', 'Fishing spot', 'nature'),
  pair('bakery', '🥐', 'Bakery', '🍫', 'Candy shop', 'food'),
  pair('airport', '✈️', 'Airport', '🚉', 'Train station', 'transport'),
];

const deck: SceneDeck = { pairs };

function makeRoom(playerCount = 3, seed = 42): EngineState {
  let state = createRoom({
    roomId: 'TEST-ROOM',
    host: { id: 'p1', name: 'Ana', avatarUrl: null },
    contentLocale: 'en-US',
    now: NOW,
  });
  for (let index = 2; index <= playerCount; index += 1) {
    state = addPlayer(
      state,
      { id: `p${index}`, name: `Player ${index}`, avatarUrl: null },
      NOW,
    );
  }
  return startMatch(state, state.hostId, deck, NOW, mulberry32(seed));
}

function discussEverything(state: EngineState): EngineState {
  let next = beginDiscussion(state, NOW);
  let guard = 0;
  while (next.phase === 'discuss' && guard < 100) {
    const active = next.order[next.activeIndex];
    if (!active) break;
    next = endTurn(next, active, NOW);
    guard += 1;
  }
  return next;
}

function voteFor(state: EngineState, targets: Record<string, string>): EngineState {
  let next = state;
  for (const [voterId, targetId] of Object.entries(targets)) {
    next = castVote(next, voterId, targetId, NOW);
  }
  return next;
}

describe('almost you room lifecycle', () => {
  it('creates a lobby with a host and adds players', () => {
    let state = createRoom({
      roomId: 'ROOM-1',
      host: { id: 'p1', name: '  Ana  ', avatarUrl: null },
      contentLocale: 'en-US',
      now: NOW,
    });
    state = addPlayer(state, { id: 'p2', name: 'Bia', avatarUrl: null }, NOW);

    expect(state.phase).toBe('lobby');
    expect(state.hostId).toBe('p1');
    expect(state.players.map((player) => player.name)).toEqual(['Ana', 'Bia']);
  });

  it('migrates the host when the host disconnects', () => {
    let state = createRoom({
      roomId: 'ROOM-1',
      host: { id: 'p1', name: 'Ana', avatarUrl: null },
      contentLocale: 'en-US',
      now: NOW,
    });
    state = addPlayer(state, { id: 'p2', name: 'Bia', avatarUrl: null }, NOW);
    state = markConnected(state, 'p1', false, NOW);

    expect(state.hostId).toBe('p2');
    expect(state.players.find((player) => player.id === 'p1')?.connected).toBe(false);
  });

  it('only lets the host change the content locale in the lobby', () => {
    let state = createRoom({
      roomId: 'ROOM-1',
      host: { id: 'p1', name: 'Ana', avatarUrl: null },
      contentLocale: 'en-US',
      now: NOW,
    });
    state = addPlayer(state, { id: 'p2', name: 'Bia', avatarUrl: null }, NOW);

    state = setContentLocale(state, 'p1', 'pt-br', ['en-US', 'pt-BR'], NOW);
    expect(state.contentLocale).toBe('pt-BR');

    expect(() => setContentLocale(state, 'p2', 'en-US', ['en-US', 'pt-BR'], NOW)).toThrowError(
      GameError,
    );
  });

  it('requires three players to start', () => {
    let state = createRoom({
      roomId: 'ROOM-1',
      host: { id: 'p1', name: 'Ana', avatarUrl: null },
      contentLocale: 'en-US',
      now: NOW,
    });
    state = addPlayer(state, { id: 'p2', name: 'Bia', avatarUrl: null }, NOW);

    expect(() => startMatch(state, 'p1', deck, NOW, mulberry32(1))).toThrowError(GameError);
  });
});

describe('almost you roles and secrecy', () => {
  it('assigns exactly one almost and gives them the similar scene', () => {
    const state = makeRoom(5);
    const almostId = state.almostId;
    expect(almostId).toBeTruthy();

    const almostView = toPublicState(state, almostId!, NOW);
    const insider = state.players.find((player) => player.id !== almostId)!;
    const insiderView = toPublicState(state, insider.id, NOW);

    expect(almostView.role).toBe('almost');
    expect(almostView.scene?.id).toBe(state.pair?.almost.id);
    expect(almostView.almostId).toBeNull();
    expect(insiderView.role).toBe('insider');
    expect(insiderView.scene?.id).toBe(state.pair?.majority.id);
  });

  it('keeps the almost secret during discussion and voting', () => {
    const state = makeRoom(3, 7);
    const discussed = discussEverything(state);

    expect(discussed.phase).toBe('vote');
    const almostView = toPublicState(discussed, state.almostId!, NOW);
    expect(almostView.almostId).toBeNull();
    expect(almostView.scene?.id).toBe(state.pair?.almost.id);

    const insiderView = toPublicState(discussed, state.order[0]!, NOW);
    expect(insiderView.almostId).toBeNull();
  });
});

describe('almost you discussion turns', () => {
  it('runs two loops of turns and opens voting at the end', () => {
    const state = makeRoom(3, 11);
    let current = beginDiscussion(state, NOW);

    expect(current.phase).toBe('discuss');
    expect(current.discussRound).toBe(1);

    current = discussEverything(state);

    expect(current.phase).toBe('vote');
    expect(allConnectedVoted(current)).toBe(false);
  });

  it('rejects ending a turn for a player who is not active', () => {
    const state = beginDiscussion(makeRoom(3, 3), NOW);
    const inactive = state.order[1]!;

    expect(() => endTurn(state, inactive, NOW)).toThrowError(GameError);
  });

  it('skips disconnected players and starts a new loop after one full round', () => {
    let state = makeRoom(4, 13);
    const skipped = state.order[1]!;
    state = markConnected(state, skipped, false, NOW);

    let current = beginDiscussion(state, NOW);
    let guard = 0;
    const seenRounds = new Set<number>();
    while (current.phase === 'discuss' && guard < 100) {
      seenRounds.add(current.discussRound);
      const active = current.order[current.activeIndex]!;
      expect(active).not.toBe(skipped);
      current = endTurn(current, active, NOW);
      guard += 1;
    }

    expect(current.phase).toBe('vote');
    expect(seenRounds).toEqual(new Set([1, DISCUSS_LOOPS]));
  });
});

describe('almost you voting and scoring', () => {
  it('gives the almost the win on a tied vote', () => {
    const state = makeRoom(3, 21);
    const voted = voteFor(
      discussEverything(state),
      Object.fromEntries([
        [state.order[0]!, state.order[1]!],
        [state.order[1]!, state.order[2]!],
        [state.order[2]!, state.order[0]!],
      ]),
    );
    const finished = finalizeVote(voted, deck, NOW, mulberry32(2));

    expect(finished.phase).toBe('result');
    expect(finished.lastSummary?.caught).toBe(false);
    expect(finished.lastSummary?.almostWon).toBe(true);
    expect(finished.players.find((player) => player.id === state.almostId)?.score).toBe(
      ALMOST_WIN_SCORE,
    );
    expect(
      finished.players
        .filter((player) => player.id !== state.almostId)
        .every((player) => player.score === 0),
    ).toBe(true);
  });

  it('lets the caught almost steal the win with a correct guess', () => {
    const state = makeRoom(4, 31);
    const almostId = state.almostId!;
    const insider = state.players.find((player) => player.id !== almostId)!;
    const votes: Record<string, string> = {};
    for (const player of state.players) {
      votes[player.id] = player.id === almostId ? insider.id : almostId;
    }

    const voted = voteFor(discussEverything(state), votes);
    const guessing = finalizeVote(voted, deck, NOW, mulberry32(5));
    expect(guessing.phase).toBe('guess');
    expect(guessing.guessOptions).toHaveLength(GUESS_OPTION_COUNT);
    expect(new Set(guessing.guessOptions?.map((option) => option.id)).size).toBe(GUESS_OPTION_COUNT);
    expect(
      guessing.guessOptions?.some((option) => option.id === state.pair?.majority.id),
    ).toBe(true);

    const almostView = toPublicState(guessing, almostId, NOW);
    expect(almostView.guessOptions).toHaveLength(GUESS_OPTION_COUNT);
    const insiderView = toPublicState(guessing, insider.id, NOW);
    expect(insiderView.guessOptions).toBeNull();

    const resolved = castGuess(guessing, almostId, state.pair!.majority.id, NOW);
    expect(resolved.phase).toBe('result');
    expect(resolved.lastSummary?.caught).toBe(true);
    expect(resolved.lastSummary?.correctGuess).toBe(true);
    expect(resolved.lastSummary?.almostWon).toBe(true);
    expect(resolved.players.find((player) => player.id === almostId)?.score).toBe(ALMOST_WIN_SCORE);
  });

  it('awards every insider when the caught almost guesses wrong', () => {
    const state = makeRoom(4, 33);
    const almostId = state.almostId!;
    const insider = state.players.find((player) => player.id !== almostId)!;
    const votes: Record<string, string> = {};
    for (const player of state.players) {
      votes[player.id] = player.id === almostId ? insider.id : almostId;
    }

    const voting = finalizeVote(voteFor(discussEverything(state), votes), deck, NOW, mulberry32(9));
    const wrongOption = voting.guessOptions!.find(
      (option) => option.id !== state.pair?.majority.id,
    )!;
    const resolved = castGuess(voting, almostId, wrongOption.id, NOW);

    expect(resolved.lastSummary?.caught).toBe(true);
    expect(resolved.lastSummary?.correctGuess).toBe(false);
    expect(resolved.lastSummary?.almostWon).toBe(false);
    expect(resolved.players.find((player) => player.id === almostId)?.score).toBe(0);
    for (const player of resolved.players.filter((candidate) => candidate.id !== almostId)) {
      expect(player.score).toBe(INSIDER_WIN_SCORE);
    }
  });

  it('starts the next round and resets per-round state', () => {
    const state = makeRoom(3, 41);
    const voting = finalizeVote(
      voteFor(
        discussEverything(state),
        Object.fromEntries(
          state.order.map((playerId, index) => [
            playerId,
            state.order[(index + 1) % state.order.length]!,
          ]),
        ),
      ),
      deck,
      NOW,
      mulberry32(4),
    );
    const advanced = nextRound(voting, deck, NOW, mulberry32(6));

    expect(advanced.phase).toBe('reveal');
    expect(advanced.round).toBe(2);
    expect(advanced.votes).toEqual({});
    expect(advanced.pair?.id).not.toBe(state.pair?.id);
  });

  it('rematches from the finished phase and resets scores', () => {
    const state = makeRoom(3, 51);
    const finished: EngineState = {
      ...state,
      phase: 'finished',
      round: state.totalRounds,
      players: state.players.map((player) => ({ ...player, score: 300 })),
    };
    const restarted = rematch(finished, finished.hostId, deck, NOW, mulberry32(8));

    expect(restarted.phase).toBe('reveal');
    expect(restarted.round).toBe(1);
    expect(restarted.players.every((player) => player.score === 0)).toBe(true);
    expect(restarted.usedPairIds).toHaveLength(1);
  });
});

describe('guess options', () => {
  it('builds unique options including the correct majority scene', () => {
    const options = pickGuessOptions(pairs[2]!.majority, deck, GUESS_OPTION_COUNT, mulberry32(15));
    expect(options).toHaveLength(GUESS_OPTION_COUNT);
    expect(new Set(options.map((option) => option.id)).size).toBe(GUESS_OPTION_COUNT);
    expect(options.map((option) => option.id)).toContain('kitchen-majority');
  });
});
