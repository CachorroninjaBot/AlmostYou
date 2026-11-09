import { io, type Socket } from 'socket.io-client';
import type {
  ActivityContext,
  AuthResponse,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@almost-you/shared';
import { SOCKET_PATH } from './env';
import { useGameStore } from './store';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ClientSocket | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let homeRoomKey: string | null = null;
let activeRoomKey: string | null = null;

export function getSocket(): ClientSocket | null {
  return socket;
}

export function connectSocket(
  auth: AuthResponse,
  context: ActivityContext,
  roomId: string,
): ClientSocket {
  disconnectSocket();
  const store = useGameStore.getState();
  store.setConnection('connecting');
  homeRoomKey = roomId;
  activeRoomKey = roomId;

  const client: ClientSocket = io({
    path: SOCKET_PATH,
    transports: ['websocket', 'polling'],
    tryAllTransports: true,
    auth: { token: auth.token, context },
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    timeout: 12_000,
  });
  socket = client;

  const ping = () => {
    if (client.connected) client.emit('latency:ping', { t: Date.now() });
  };

  client.on('connect', () => {
    if (socket !== client) return;
    store.setConnection('connected');
    // A restarted server may have a lower seq for the same room, so drop stale state.
    store.clearRoomState();
    client.emit('room:join', { roomId: activeRoomKey ?? roomId });
    ping();
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(ping, 15_000);
  });

  client.on('disconnect', () => {
    if (socket !== client) return;
    store.setConnection('disconnected');
  });

  client.on('connect_error', (error) => {
    if (socket !== client) return;
    store.setConnection('disconnected');
    if (error.message === 'unauthorized') {
      store.setError('AUTH', error.message);
    } else {
      store.setError('CONNECT', error.message);
    }
  });

  client.on('room:state', (state) => {
    activeRoomKey = state.roomId;
    useGameStore.getState().applyState(state);
  });
  client.on('room:kicked', () => {
    if (socket !== client) return;
    const current = useGameStore.getState();
    current.clearRoomState();
    current.setError('KICKED');
    activeRoomKey = homeRoomKey;
    if (homeRoomKey) client.emit('room:join', { roomId: homeRoomKey });
  });
  client.on('room:error', ({ code, message }) =>
    useGameStore.getState().setError(code, message),
  );
  client.on('game:reaction', (reaction) => useGameStore.getState().pushReaction(reaction));
  client.on('latency:pong', ({ t }) => useGameStore.getState().setLatency(Date.now() - t));

  return client;
}

export function joinRoom(roomId: string): boolean {
  if (!socket?.connected) return false;
  socket.emit('room:join', { roomId, mustExist: true });
  return true;
}

export function disconnectSocket(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
