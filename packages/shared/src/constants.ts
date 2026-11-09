export const GAME_ID = 'almost-you';
export const GAME_NAME = 'Almost You';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const TOTAL_ROUNDS = 3;
export const DISCUSS_LOOPS = 2;

export const REVEAL_SECONDS = 6;
export const TURN_SECONDS = 20;
export const VOTE_SECONDS = 30;
export const GUESS_SECONDS = 20;
export const RESULT_SECONDS = 25;

export const MAX_NAME_LENGTH = 24;
export const MAX_ROOM_ID_LENGTH = 64;
export const ROOM_ID_MIN_LENGTH = 3;

export const GUESS_OPTION_COUNT = 3;

export const ALMOST_WIN_SCORE = 150;
export const INSIDER_WIN_SCORE = 100;

export const REACTION_COOLDOWN_MS = 900;

export const DEFAULT_LOCALE = 'en-US';
export const FALLBACK_LOCALE = 'en-US';

export const DISCORD_LOCALES = [
  'id',
  'da',
  'de',
  'en-GB',
  'en-US',
  'es-ES',
  'es-419',
  'fr',
  'hr',
  'it',
  'lt',
  'hu',
  'nl',
  'no',
  'pl',
  'pt-BR',
  'ro',
  'fi',
  'sv-SE',
  'vi',
  'tr',
  'cs',
  'el',
  'bg',
  'ru',
  'uk',
  'hi',
  'th',
  'zh-CN',
  'ja',
  'zh-TW',
  'ko',
] as const;

export const RTL_LOCALES = ['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb'] as const;

export const PLAYER_COLORS = [
  '#f87171',
  '#fb923c',
  '#fbbf24',
  '#a3e635',
  '#34d399',
  '#22d3ee',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#f9a8d4',
] as const;

export const REACTION_EMOJIS = ['😂', '😱', '🔥', '👀', '💀', '👏', '🤔', '🎭'] as const;
