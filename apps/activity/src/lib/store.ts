import { create } from 'zustand';
import { CHAT_HISTORY_LIMIT } from '@almost-you/shared';
import type {
  ActivityContext,
  AuthResponse,
  ChatMessage,
  ChatTypingPayload,
  LocaleInfo,
  PublicRoomState,
  ReactionEvent,
  RoomErrorCode,
  TextDirection,
} from '@almost-you/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
export type AppStatus = 'boot' | 'loading' | 'ready' | 'error';
export type UiErrorCode = RoomErrorCode | 'CONNECT' | 'AUTH' | 'GENERIC' | 'KICKED';
export type UiNoticeCode = 'HOST_CHANGED';

export interface UiError {
  code: UiErrorCode;
  message?: string;
  at: number;
}

interface GameStore {
  status: AppStatus;
  bootError: string | null;
  auth: AuthResponse | null;
  context: ActivityContext | null;
  roomId: string | null;
  state: PublicRoomState | null;
  connection: ConnectionStatus;
  error: UiError | null;
  notice: UiNoticeCode | null;
  reactions: ReactionEvent[];
  chat: ChatMessage[];
  chatOpen: boolean;
  chatUnread: number;
  typing: ChatTypingPayload | null;
  latency: number | null;
  serverOffset: number;

  locales: LocaleInfo[];
  contentLocales: string[];
  uiLocale: string;
  dir: TextDirection;

  setStatus: (status: AppStatus) => void;
  setBootError: (message: string | null) => void;
  setSession: (auth: AuthResponse, context: ActivityContext, roomId: string) => void;
  setLocales: (locales: LocaleInfo[], contentLocales: string[]) => void;
  setLocaleMeta: (locale: string, dir: TextDirection) => void;
  setConnection: (connection: ConnectionStatus) => void;
  clearRoomState: () => void;
  setError: (code: UiErrorCode, message?: string) => void;
  clearError: () => void;
  setNotice: (code: UiNoticeCode) => void;
  clearNotice: () => void;
  applyState: (state: PublicRoomState) => void;
  pushReaction: (reaction: ReactionEvent) => void;
  setChatHistory: (messages: ChatMessage[]) => void;
  pushChat: (message: ChatMessage) => void;
  setTyping: (typing: ChatTypingPayload) => void;
  setChatOpen: (open: boolean) => void;
  markChatRead: () => void;
  setLatency: (latency: number) => void;
  reset: () => void;
}

const chatStartsOpen =
  typeof window === 'undefined' || !window.matchMedia('(max-width: 1080px)').matches;

const initialState = {
  status: 'boot' as AppStatus,
  bootError: null,
  auth: null,
  context: null,
  roomId: null,
  state: null,
  connection: 'connecting' as ConnectionStatus,
  error: null,
  notice: null,
  reactions: [],
  chat: [] as ChatMessage[],
  chatOpen: chatStartsOpen,
  chatUnread: 0,
  typing: null,
  latency: null,
  serverOffset: 0,
  locales: [] as LocaleInfo[],
  contentLocales: [] as string[],
  uiLocale: 'en-US',
  dir: 'ltr' as TextDirection,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setStatus: (status) => set({ status }),
  setBootError: (bootError) => set({ bootError }),
  setSession: (auth, context, roomId) => set({ auth, context, roomId }),
  setLocales: (locales, contentLocales) => set({ locales, contentLocales }),
  setLocaleMeta: (uiLocale, dir) => set({ uiLocale, dir }),
  setConnection: (connection) => set({ connection }),
  clearRoomState: () =>
    set({ state: null, reactions: [], chat: [], chatUnread: 0, typing: null }),
  setError: (code, message) => set({ error: { code, message, at: Date.now() } }),
  clearError: () => set({ error: null }),
  setNotice: (notice) => set({ notice }),
  clearNotice: () => set({ notice: null }),

  applyState: (state) => {
    const previous = get().state;
    if (previous && previous.roomId === state.roomId && state.seq < previous.seq) return;

    const roomChanged = !previous || previous.roomId !== state.roomId;
    const becameHost =
      previous !== null &&
      previous.roomId === state.roomId &&
      previous.hostId !== state.hostId &&
      state.hostId === get().auth?.user.id;

    set({
      state,
      roomId: state.roomId,
      reactions: roomChanged ? [] : get().reactions,
      chat: roomChanged ? [] : get().chat,
      chatUnread: roomChanged ? 0 : get().chatUnread,
      typing: roomChanged ? null : get().typing,
      notice: becameHost ? 'HOST_CHANGED' : roomChanged ? null : get().notice,
      connection: 'connected',
      serverOffset: state.serverTime - Date.now(),
    });
  },

  pushReaction: (reaction) => {
    const reactions = [...get().reactions, reaction].slice(-8);
    set({ reactions });
  },

  setChatHistory: (messages) =>
    set({ chat: messages.slice(-CHAT_HISTORY_LIMIT), chatUnread: 0, typing: null }),

  pushChat: (message) => {
    const { chat, chatOpen, chatUnread, auth } = get();
    const mine = message.kind === 'player' && message.playerId === auth?.user.id;
    const shouldCount = !chatOpen && !mine && message.kind === 'player';
    set({
      chat: [...chat, message].slice(-CHAT_HISTORY_LIMIT),
      chatUnread: shouldCount ? chatUnread + 1 : chatUnread,
    });
  },

  setTyping: (typing) => {
    if (typing.playerId === get().auth?.user.id) return;
    set({ typing });
  },

  setChatOpen: (open) => set({ chatOpen: open, chatUnread: open ? 0 : get().chatUnread }),

  markChatRead: () => {
    if (get().chatUnread === 0) return;
    set({ chatUnread: 0 });
  },

  setLatency: (latency) => set({ latency }),

  reset: () => set({ ...initialState }),
}));
