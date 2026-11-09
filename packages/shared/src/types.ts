export type LocaleCode = string;
export type Phase = 'lobby' | 'reveal' | 'discuss' | 'vote' | 'guess' | 'result' | 'finished';
export type Role = 'insider' | 'almost';
export type TextDirection = 'ltr' | 'rtl';

export interface SceneCard {
  id: string;
  emoji: string;
  labels: Record<string, string>;
  category?: string;
}

export interface ScenePair {
  id: string;
  category?: string;
  majority: SceneCard;
  almost: SceneCard;
}

export interface PlayerProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  color: string;
  isHost: boolean;
  connected: boolean;
  score: number;
  hasVoted: boolean;
  isActive: boolean;
}

export interface RoundSummary {
  round: number;
  pairId: string;
  majorityScene: SceneCard;
  almostScene: SceneCard;
  almostId: string;
  almostName: string;
  caught: boolean;
  correctGuess: boolean;
  almostWon: boolean;
  voteCounts: Record<string, number>;
  votes: Record<string, string>;
  roundScores: Record<string, number>;
  winnerIds: string[];
}

export type ChatSystemEvent = 'JOIN' | 'LEAVE' | 'KICK';

export interface ChatPlayerMessage {
  id: string;
  kind: 'player';
  playerId: string;
  playerName: string;
  playerAvatarUrl: string | null;
  playerColor: string;
  text: string;
  at: number;
}

export interface ChatSystemMessage {
  id: string;
  kind: 'system';
  event: ChatSystemEvent;
  actorName: string;
  at: number;
}

export type ChatMessage = ChatPlayerMessage | ChatSystemMessage;

export interface ChatHistoryPayload {
  messages: ChatMessage[];
}

export interface ChatTypingPayload {
  playerId: string;
  playerName: string;
  at: number;
}

export interface ChatSendPayload {
  text: string;
}

export interface PublicRoomState {
  roomId: string;
  gameId: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  hostId: string;
  contentLocale: string;
  players: PublicPlayer[];
  activePlayerId: string | null;
  discussRound: number;
  discussLoops: number;
  scene: SceneCard | null;
  role: Role | null;
  almostId: string | null;
  guessOptions: SceneCard[] | null;
  myVote: string | null;
  lastSummary: RoundSummary | null;
  deadlineAt: number | null;
  serverTime: number;
  seq: number;
  listed?: boolean;
}

export interface PublicRoomListing {
  /** Shareable join code, never the internal room id or channel id. */
  roomId: string;
  hostName: string;
  hostAvatarUrl: string | null;
  hostColor: string;
  players: number;
  capacity: number;
  contentLocale: string;
}

export interface PublicRoomsResponse {
  rooms: PublicRoomListing[];
}

export interface SessionUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  guest: boolean;
}

export interface ActivityContext {
  instanceId?: string;
  channelId?: string;
  guildId?: string;
  locale?: string;
}

export interface LocaleInfo {
  code: string;
  name: string;
  nativeName: string;
  dir: TextDirection;
}

export interface LocalesResponse {
  locales: LocaleInfo[];
  defaultLocale: string;
  fallbackLocale: string;
  contentLocales: string[];
}

export interface HealthResponse {
  ok: boolean;
  status: 'ok' | 'degraded';
  version: string;
  uptimeSeconds: number;
  redis: boolean;
  store: 'redis' | 'memory';
}

export interface AuthResponse {
  token: string;
  user: SessionUser;
  expiresAt: number;
}
