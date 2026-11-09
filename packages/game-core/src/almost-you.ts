import {
  ALMOST_WIN_SCORE,
  DISCUSS_LOOPS,
  GAME_ID,
  GUESS_OPTION_COUNT,
  GUESS_SECONDS,
  INSIDER_WIN_SCORE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  RESULT_SECONDS,
  REVEAL_SECONDS,
  TOTAL_ROUNDS,
  TURN_SECONDS,
  VOTE_SECONDS,
} from '@almost-you/shared';
import type {
  Phase,
  PlayerProfile,
  PublicPlayer,
  PublicRoomState,
  RoomErrorCode,
  RoundSummary,
  SceneCard,
  ScenePair,
} from '@almost-you/shared';
import { sanitizeDisplayName } from '@almost-you/shared';

export type Rng = () => number;

export interface SceneDeck {
  pairs: ScenePair[];
}

export interface EnginePlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  color: string;
  score: number;
  connected: boolean;
}

export interface EngineState {
  roomId: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  contentLocale: string;
  hostId: string;
  players: EnginePlayer[];
  order: string[];
  activeIndex: number;
  discussRound: number;
  pair: ScenePair | null;
  almostId: string | null;
  votes: Record<string, string>;
  guessOptions: SceneCard[] | null;
  guessChoiceId: string | null;
  guessCorrect: boolean | null;
  lastSummary: RoundSummary | null;
  usedPairIds: string[];
  deadlineAt: number | null;
  createdAt: number;
  updatedAt: number;
  seq: number;
}

export class GameError extends Error {
  constructor(
    public readonly code: RoomErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'GameError';
  }
}

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(index, Math.max(0, Math.floor(rng() * (index + 1))));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

export function choosePair(deck: SceneDeck, usedPairIds: readonly string[], rng: Rng): ScenePair {
  if (deck.pairs.length === 0) {
    throw new GameError('INVALID_INPUT', 'content deck is empty');
  }
  const unused = deck.pairs.filter((pair) => !usedPairIds.includes(pair.id));
  const pool = unused.length > 0 ? unused : deck.pairs;
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[index]!;
}

export function pickGuessOptions(
  majorityScene: SceneCard,
  deck: SceneDeck,
  count: number = GUESS_OPTION_COUNT,
  rng: Rng = Math.random,
): SceneCard[] {
  const others = deck.pairs
    .filter((pair) => pair.majority.id !== majorityScene.id)
    .map((pair) => pair.majority);
  const sameCategory = majorityScene.category
    ? others.filter((candidate) => candidate.category === majorityScene.category)
    : [];
  const preferred = [
    ...shuffle(sameCategory, rng),
    ...shuffle(
      others.filter((candidate) => !sameCategory.includes(candidate)),
      rng,
    ),
  ];
  const selected = preferred.slice(0, Math.max(0, count - 1));
  return shuffle([majorityScene, ...selected], rng);
}

function nextPlayerColor(players: readonly EnginePlayer[]): string {
  const used = new Set(players.map((player) => player.color));
  return (
    PLAYER_COLORS.find((color) => !used.has(color)) ??
    PLAYER_COLORS[players.length % PLAYER_COLORS.length]!
  );
}

function findPlayer(state: EngineState, playerId: string): EnginePlayer | undefined {
  return state.players.find((player) => player.id === playerId);
}

function makePlayer(profile: PlayerProfile, players: readonly EnginePlayer[]): EnginePlayer {
  return {
    id: profile.id,
    name: sanitizeDisplayName(profile.name),
    avatarUrl: profile.avatarUrl,
    color: nextPlayerColor(players),
    score: 0,
    connected: true,
  };
}

function touch(state: EngineState, now: number, bumpSeq = true): EngineState {
  return {
    ...state,
    updatedAt: now,
    seq: bumpSeq ? state.seq + 1 : state.seq,
  };
}

export function createRoom(params: {
  roomId: string;
  host: PlayerProfile;
  contentLocale: string;
  now?: number;
}): EngineState {
  const now = params.now ?? Date.now();
  const host = makePlayer(params.host, []);
  return {
    roomId: params.roomId,
    phase: 'lobby',
    round: 0,
    totalRounds: TOTAL_ROUNDS,
    contentLocale: params.contentLocale,
    hostId: host.id,
    players: [host],
    order: [],
    activeIndex: 0,
    discussRound: 0,
    pair: null,
    almostId: null,
    votes: {},
    guessOptions: null,
    guessChoiceId: null,
    guessCorrect: null,
    lastSummary: null,
    usedPairIds: [],
    deadlineAt: null,
    createdAt: now,
    updatedAt: now,
    seq: 0,
  };
}

export function addPlayer(state: EngineState, profile: PlayerProfile, now = Date.now()): EngineState {
  const existing = findPlayer(state, profile.id);
  if (existing) {
    const players = state.players.map((player) =>
      player.id === profile.id
        ? {
            ...player,
            name: sanitizeDisplayName(profile.name, player.name),
            avatarUrl: profile.avatarUrl ?? player.avatarUrl,
            connected: true,
          }
        : player,
    );
    return touch({ ...state, players }, now);
  }

  if (state.phase !== 'lobby' && state.phase !== 'finished') {
    throw new GameError('ROOM_IN_PROGRESS', 'the match already started');
  }
  if (state.players.length >= MAX_PLAYERS) {
    throw new GameError('ROOM_FULL', 'this room is full');
  }

  const player = makePlayer(profile, state.players);
  return touch(
    {
      ...state,
      players: [...state.players, player],
      hostId: state.hostId || player.id,
    },
    now,
  );
}

export function transferHost(state: EngineState, now = Date.now()): EngineState {
  const current = findPlayer(state, state.hostId);
  if (current?.connected) return state;

  const nextHost = state.players.find((player) => player.connected);
  if (!nextHost) return state;
  if (nextHost.id === state.hostId) return state;

  return touch({ ...state, hostId: nextHost.id }, now);
}

export function markConnected(
  state: EngineState,
  playerId: string,
  connected: boolean,
  now = Date.now(),
): EngineState {
  const player = findPlayer(state, playerId);
  if (!player) return state;
  if (player.connected === connected) return state;

  let next = touch(
    {
      ...state,
      players: state.players.map((candidate) =>
        candidate.id === playerId ? { ...candidate, connected } : candidate,
      ),
    },
    now,
  );

  next = transferHost(next, now);

  if (!connected && next.phase === 'discuss' && activePlayerId(next) === playerId) {
    next = advanceTurn(next, now);
  }

  return next;
}

export function removePlayer(state: EngineState, playerId: string, now = Date.now()): EngineState {
  if (state.phase !== 'lobby') {
    return markConnected(state, playerId, false, now);
  }
  const players = state.players.filter((player) => player.id !== playerId);
  if (players.length === state.players.length) return state;

  let next: EngineState = touch({ ...state, players }, now);
  if (next.hostId === playerId) {
    next = { ...next, hostId: players.find((player) => player.connected)?.id ?? players[0]?.id ?? '' };
  }
  return next;
}

export function setContentLocale(
  state: EngineState,
  hostId: string,
  locale: string,
  availableLocales: readonly string[],
  now = Date.now(),
): EngineState {
  if (state.hostId !== hostId) throw new GameError('NOT_HOST', 'only the host can change the language');
  if (state.phase !== 'lobby') throw new GameError('INVALID_PHASE', 'language is locked after start');

  const match = availableLocales.find(
    (candidate) => candidate.toLowerCase() === locale.trim().toLowerCase(),
  );
  if (!match) throw new GameError('INVALID_LOCALE', 'unsupported content language');
  if (match === state.contentLocale) return state;

  return touch({ ...state, contentLocale: match }, now);
}

export function startMatch(
  state: EngineState,
  hostId: string,
  deck: SceneDeck,
  now = Date.now(),
  rng: Rng = Math.random,
): EngineState {
  if (state.hostId !== hostId) throw new GameError('NOT_HOST', 'only the host can start');
  if (state.phase !== 'lobby') throw new GameError('INVALID_PHASE', 'match already started');

  const connected = state.players.filter((player) => player.connected);
  if (connected.length < MIN_PLAYERS) {
    throw new GameError('NOT_ENOUGH_PLAYERS', `at least ${MIN_PLAYERS} players are needed`);
  }
  if (deck.pairs.length < GUESS_OPTION_COUNT - 1) {
    throw new GameError('INVALID_INPUT', 'not enough scenes in the content deck');
  }

  const players = connected.map((player) => ({ ...player, score: 0 }));
  const host = players.find((player) => player.id === state.hostId) ?? players[0]!;

  const prepared: EngineState = touch(
    {
      ...state,
      players,
      hostId,
      phase: 'lobby',
      round: 0,
      order: [],
      activeIndex: 0,
      usedPairIds: [],
      lastSummary: null,
      pair: null,
      almostId: null,
      votes: {},
      guessOptions: null,
      guessChoiceId: null,
      guessCorrect: null,
      discussRound: 0,
      deadlineAt: null,
    },
    now,
  );

  return startRound(prepared, 1, deck, now, rng);
}

function startRound(
  state: EngineState,
  round: number,
  deck: SceneDeck,
  now: number,
  rng: Rng,
): EngineState {
  const players = state.players.filter((player) => player.connected);

  if (players.length < MIN_PLAYERS) {
    throw new GameError('NOT_ENOUGH_PLAYERS', `at least ${MIN_PLAYERS} players are needed`);
  }

  const pair = choosePair(deck, state.usedPairIds, rng);
  const almost = players[Math.min(players.length - 1, Math.floor(rng() * players.length))]!;
  const order = shuffle(
    players.map((player) => player.id),
    rng,
  );
  const hostId = players.some((player) => player.id === state.hostId)
    ? state.hostId
    : players[0]!.id;

  return touch(
    {
      ...state,
      players,
      hostId,
      phase: 'reveal',
      round,
      order,
      activeIndex: 0,
      discussRound: 0,
      pair,
      almostId: almost.id,
      votes: {},
      guessOptions: null,
      guessChoiceId: null,
      guessCorrect: null,
      lastSummary: null,
      usedPairIds: [...state.usedPairIds, pair.id],
      deadlineAt: now + REVEAL_SECONDS * 1000,
    },
    now,
  );
}

export function beginDiscussion(state: EngineState, now = Date.now()): EngineState {
  if (state.phase !== 'reveal') throw new GameError('INVALID_PHASE', 'round is not revealing');

  const firstIndex = state.order.findIndex((playerId) => findPlayer(state, playerId)?.connected);
  if (firstIndex === -1) {
    return beginVote(state, now);
  }

  return touch(
    {
      ...state,
      phase: 'discuss',
      activeIndex: firstIndex,
      discussRound: 1,
      deadlineAt: now + TURN_SECONDS * 1000,
    },
    now,
  );
}

export function activePlayerId(state: EngineState): string | null {
  if (state.phase !== 'discuss') return null;
  return state.order[state.activeIndex] ?? null;
}

export function endTurn(state: EngineState, playerId: string, now = Date.now()): EngineState {
  if (state.phase !== 'discuss') throw new GameError('INVALID_PHASE', 'not discussing');
  if (activePlayerId(state) !== playerId) {
    throw new GameError('NOT_ACTIVE_PLAYER', 'it is not your turn');
  }

  return advanceTurn(touch(state, now), now);
}

function firstConnectedIndex(state: EngineState): number {
  return state.order.findIndex((playerId) => findPlayer(state, playerId)?.connected);
}

function advanceTurn(state: EngineState, now: number): EngineState {
  let nextIndex = state.activeIndex + 1;
  while (nextIndex < state.order.length) {
    const candidate = state.order[nextIndex];
    const player = candidate ? findPlayer(state, candidate) : undefined;
    if (player?.connected) break;
    nextIndex += 1;
  }

  if (nextIndex < state.order.length) {
    return touch(
      {
        ...state,
        activeIndex: nextIndex,
        deadlineAt: now + TURN_SECONDS * 1000,
      },
      now,
    );
  }

  if (state.discussRound < DISCUSS_LOOPS) {
    const firstIndex = firstConnectedIndex(state);
    if (firstIndex === -1) return beginVote(state, now);
    return touch(
      {
        ...state,
        activeIndex: firstIndex,
        discussRound: state.discussRound + 1,
        deadlineAt: now + TURN_SECONDS * 1000,
      },
      now,
    );
  }

  return beginVote(state, now);
}

export function beginVote(state: EngineState, now = Date.now()): EngineState {
  return touch(
    {
      ...state,
      phase: 'vote',
      votes: {},
      deadlineAt: now + VOTE_SECONDS * 1000,
    },
    now,
  );
}

export function castVote(
  state: EngineState,
  voterId: string,
  targetId: string,
  now = Date.now(),
): EngineState {
  if (state.phase !== 'vote') throw new GameError('INVALID_PHASE', 'voting is not open');
  const voter = findPlayer(state, voterId);
  if (!voter || !voter.connected) throw new GameError('PLAYER_NOT_FOUND', 'player not found');
  if (targetId === voterId) throw new GameError('INVALID_VOTE', 'you cannot vote for yourself');
  if (!findPlayer(state, targetId)) throw new GameError('INVALID_VOTE', 'invalid vote target');
  if (state.votes[voterId]) throw new GameError('ALREADY_VOTED', 'you already voted');

  return touch({ ...state, votes: { ...state.votes, [voterId]: targetId } }, now);
}

export function allConnectedVoted(state: EngineState): boolean {
  const connected = state.players.filter((player) => player.connected);
  if (connected.length === 0) return false;
  return connected.every((player) => Boolean(state.votes[player.id]));
}

export function finalizeVote(
  state: EngineState,
  deck: SceneDeck,
  now = Date.now(),
  rng: Rng = Math.random,
): EngineState {
  if (state.phase !== 'vote') throw new GameError('INVALID_PHASE', 'voting is not open');
  if (!state.almostId || !state.pair) throw new GameError('INVALID_PHASE', 'round is incomplete');

  const voteCounts = countVotes(state.votes);

  const maxVotes = Math.max(0, ...Object.values(voteCounts));
  const topIds = Object.entries(voteCounts)
    .filter(([, count]) => count === maxVotes)
    .map(([playerId]) => playerId);
  const tie = topIds.length !== 1;
  const caught = !tie && topIds[0] === state.almostId;

  if (caught) {
    const guessOptions = pickGuessOptions(state.pair.majority, deck, GUESS_OPTION_COUNT, rng);
    return touch(
      {
        ...state,
        phase: 'guess',
        guessOptions,
        guessChoiceId: null,
        guessCorrect: null,
        deadlineAt: now + GUESS_SECONDS * 1000,
      },
      now,
    );
  }

  return resolveRound(state, {
    caught: false,
    correctGuess: false,
    voteCounts,
    now,
  });
}

export function castGuess(
  state: EngineState,
  almostId: string,
  optionId: string,
  now = Date.now(),
): EngineState {
  if (state.phase !== 'guess') throw new GameError('INVALID_PHASE', 'guessing is not open');
  if (state.almostId !== almostId) throw new GameError('NOT_ACTIVE_PLAYER', 'only the almost can guess');
  if (!state.guessOptions?.some((option) => option.id === optionId)) {
    throw new GameError('INVALID_INPUT', 'invalid guess option');
  }
  if (!state.pair) throw new GameError('INVALID_PHASE', 'round is incomplete');

  const correctGuess = optionId === state.pair.majority.id;
  return resolveRound(state, {
    caught: true,
    correctGuess,
    voteCounts: countVotes(state.votes),
    now,
    guessChoiceId: optionId,
  });
}

export function finalizeGuess(
  state: EngineState,
  correctGuess: boolean,
  now = Date.now(),
  choiceId: string | null = null,
): EngineState {
  if (state.phase !== 'guess') throw new GameError('INVALID_PHASE', 'guessing is not open');
  return resolveRound(state, {
    caught: true,
    correctGuess,
    voteCounts: countVotes(state.votes),
    now,
    guessChoiceId: choiceId,
  });
}

function countVotes(votes: Record<string, string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const targetId of Object.values(votes)) {
    counts[targetId] = (counts[targetId] ?? 0) + 1;
  }
  return counts;
}

function resolveRound(
  state: EngineState,
  params: {
    caught: boolean;
    correctGuess: boolean;
    voteCounts: Record<string, number>;
    now: number;
    guessChoiceId?: string | null;
  },
): EngineState {
  if (!state.almostId || !state.pair) throw new GameError('INVALID_PHASE', 'round is incomplete');

  const { caught, correctGuess, voteCounts, now } = params;
  const almostWon = !caught || correctGuess;
  const roundScores: Record<string, number> = {};
  const winnerIds: string[] = [];

  const players = state.players.map((player) => {
    const isAlmost = player.id === state.almostId;
    const gain = isAlmost
      ? almostWon
        ? ALMOST_WIN_SCORE
        : 0
      : almostWon
        ? 0
        : INSIDER_WIN_SCORE;
    roundScores[player.id] = gain;
    if (gain > 0) winnerIds.push(player.id);
    return gain > 0 ? { ...player, score: player.score + gain } : player;
  });

  const almostName = state.players.find((player) => player.id === state.almostId)?.name ?? '???';
  const summary: RoundSummary = {
    round: state.round,
    pairId: state.pair.id,
    majorityScene: state.pair.majority,
    almostScene: state.pair.almost,
    almostId: state.almostId,
    almostName,
    caught,
    correctGuess,
    almostWon,
    voteCounts,
    votes: { ...state.votes },
    roundScores,
    winnerIds,
  };

  return touch(
    {
      ...state,
      players,
      phase: 'result',
      guessChoiceId: params.guessChoiceId ?? null,
      guessCorrect: caught ? correctGuess : false,
      lastSummary: summary,
      deadlineAt: now + RESULT_SECONDS * 1000,
    },
    now,
  );
}

export function nextRound(
  state: EngineState,
  deck: SceneDeck,
  now = Date.now(),
  rng: Rng = Math.random,
): EngineState {
  if (state.phase !== 'result') throw new GameError('INVALID_PHASE', 'round is not over');

  if (state.round >= state.totalRounds) {
    return touch({ ...state, phase: 'finished', deadlineAt: null }, now);
  }

  const connected = state.players.filter((player) => player.connected);
  if (connected.length < MIN_PLAYERS) {
    return touch({ ...state, phase: 'finished', deadlineAt: null }, now);
  }

  const next = transferHost(
    {
      ...state,
      players: connected,
    },
    now,
  );

  return startRound(next, next.round + 1, deck, now, rng);
}

export function rematch(
  state: EngineState,
  hostId: string,
  deck: SceneDeck,
  now = Date.now(),
  rng: Rng = Math.random,
): EngineState {
  if (state.hostId !== hostId) throw new GameError('NOT_HOST', 'only the host can restart');
  if (state.phase !== 'finished') throw new GameError('INVALID_PHASE', 'match is not over');

  const reset: EngineState = {
    ...state,
    phase: 'lobby',
    round: 0,
    players: state.players.map((player) => ({ ...player, score: 0 })),
    order: [],
    activeIndex: 0,
    discussRound: 0,
    pair: null,
    almostId: null,
    votes: {},
    guessOptions: null,
    guessChoiceId: null,
    guessCorrect: null,
    lastSummary: null,
    usedPairIds: [],
    deadlineAt: null,
  };

  return startMatch(reset, hostId, deck, now, rng);
}

export function connectedPlayers(state: EngineState): EnginePlayer[] {
  return state.players.filter((player) => player.connected);
}

export function toPublicState(
  state: EngineState,
  viewerId: string,
  now = Date.now(),
): PublicRoomState {
  const isAlmost = Boolean(state.almostId && state.almostId === viewerId);
  const revealAll = state.phase === 'result' || state.phase === 'finished';
  const sceneVisible = Boolean(
    state.pair && state.phase !== 'lobby' && state.phase !== 'finished',
  );
  const scene = sceneVisible
    ? isAlmost
      ? state.pair!.almost
      : state.pair!.majority
    : null;
  const activeId = activePlayerId(state);

  const players: PublicPlayer[] = state.players.map((player) => ({
    id: player.id,
    name: player.name,
    avatarUrl: player.avatarUrl,
    color: player.color,
    isHost: player.id === state.hostId,
    connected: player.connected,
    score: player.score,
    hasVoted: Boolean(state.votes[player.id]),
    isActive: player.id === activeId,
  }));

  return {
    roomId: state.roomId,
    gameId: GAME_ID,
    phase: state.phase,
    round: state.round,
    totalRounds: state.totalRounds,
    hostId: state.hostId,
    contentLocale: state.contentLocale,
    players,
    activePlayerId: activeId,
    discussRound: state.discussRound,
    discussLoops: DISCUSS_LOOPS,
    scene,
    role: state.almostId ? (isAlmost ? 'almost' : 'insider') : null,
    almostId: revealAll ? state.almostId : null,
    guessOptions: state.phase === 'guess' && isAlmost ? state.guessOptions : null,
    myVote: state.votes[viewerId] ?? null,
    lastSummary: revealAll ? state.lastSummary : null,
    deadlineAt: state.deadlineAt,
    serverTime: now,
    seq: state.seq,
  };
}

export function findEnginePlayer(state: EngineState, playerId: string): EnginePlayer | undefined {
  return findPlayer(state, playerId);
}
