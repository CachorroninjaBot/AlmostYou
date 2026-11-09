import type {
  ActivityContext,
  ChatHistoryPayload,
  ChatMessage,
  ChatSendPayload,
  ChatTypingPayload,
  PublicRoomState,
  SessionUser,
} from './types.js';

export type RoomErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_IN_PROGRESS'
  | 'ROOM_LIMIT'
  | 'ROOM_FORBIDDEN'
  | 'NOT_HOST'
  | 'INVALID_PHASE'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_ACTIVE_PLAYER'
  | 'INVALID_INPUT'
  | 'ALREADY_VOTED'
  | 'INVALID_VOTE'
  | 'INVALID_LOCALE'
  | 'PLAYER_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'INTERNAL';

export interface JoinRoomPayload {
  roomId: string;
  mustExist?: boolean;
}

export interface SetContentLocalePayload {
  locale: string;
}

export interface SetListedPayload {
  listed: boolean;
}

export interface KickPlayerPayload {
  playerId: string;
}

export interface VotePayload {
  targetId: string;
}

export interface GuessPayload {
  optionId: string;
}

export interface ReactionPayload {
  emoji: string;
}

export interface ReactionEvent {
  playerId: string;
  playerName: string;
  emoji: string;
  at: number;
}

export interface LatencyPingPayload {
  t: number;
}

export interface LatencyPongPayload {
  t: number;
  serverTime: number;
}

export interface RoomErrorPayload {
  code: RoomErrorCode;
  message?: string;
}

export interface ClientToServerEvents {
  'chat:send': (payload: ChatSendPayload) => void;
  'chat:typing': () => void;
  'room:join': (payload: JoinRoomPayload) => void;
  'room:leave': () => void;
  'lobby:set-content-locale': (payload: SetContentLocalePayload) => void;
  'lobby:set-listed': (payload: SetListedPayload) => void;
  'lobby:kick': (payload: KickPlayerPayload) => void;
  'lobby:start': () => void;
  'game:end-turn': () => void;
  'game:vote': (payload: VotePayload) => void;
  'game:guess': (payload: GuessPayload) => void;
  'game:next-round': () => void;
  'game:rematch': () => void;
  'game:reaction': (payload: ReactionPayload) => void;
  'latency:ping': (payload: LatencyPingPayload) => void;
}

export interface ServerToClientEvents {
  'chat:message': (message: ChatMessage) => void;
  'chat:history': (payload: ChatHistoryPayload) => void;
  'chat:typing': (payload: ChatTypingPayload) => void;
  'room:state': (state: PublicRoomState) => void;
  'room:error': (payload: RoomErrorPayload) => void;
  'room:kicked': () => void;
  'game:reaction': (payload: ReactionEvent) => void;
  'latency:pong': (payload: LatencyPongPayload) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  user: SessionUser;
  context: ActivityContext;
  roomId?: string;
}
