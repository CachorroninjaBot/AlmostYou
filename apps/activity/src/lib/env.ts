const params = new URLSearchParams(window.location.search);

export const IS_EMBEDDED = params.has('frame_id') || params.has('instance_id');

export const DISCORD_CLIENT_ID = __DISCORD_CLIENT_ID__;

export const API_BASE = IS_EMBEDDED ? '/.proxy/api' : '/api';
export const SOCKET_PATH = IS_EMBEDDED ? '/.proxy/ws' : '/ws';

export const DEV_ROOM = params.get('room') ?? 'dev-lobby';
export const DEV_NAME = params.get('name');
