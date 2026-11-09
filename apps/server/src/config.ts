import path from 'node:path';
import { z } from 'zod';

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }
  return false;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  HOST: z.string().min(1).default('0.0.0.0'),

  DISCORD_CLIENT_ID: z.string().trim().optional(),
  DISCORD_CLIENT_SECRET: z.string().trim().optional(),
  DISCORD_BOT_TOKEN: z.string().trim().optional(),
  DISCORD_REDIRECT_URI: z.url().optional(),
  DISCORD_API_BASE: z.url().default('https://discord.com/api/v10'),

  SESSION_SECRET: z.string().min(16).optional(),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(604800).default(43200),

  DEV_AUTH: booleanFromEnv.default(true),
  SKIP_INSTANCE_VALIDATION: booleanFromEnv.default(false),

  REDIS_URL: z.string().trim().optional(),
  REDIS_KEY_PREFIX: z.string().trim().default('almost-you:room:'),
  ROOM_TTL_SECONDS: z.coerce.number().int().min(600).max(604800).default(21600),
  LOBBY_TTL_SECONDS: z.coerce.number().int().min(60).max(604800).default(900),
  MAX_ROOMS_PER_USER: z.coerce.number().int().min(1).max(100).default(5),

  CONTENT_DIR: z.string().trim().optional(),
  PUBLIC_DIR: z.string().trim().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  TRUST_PROXY: booleanFromEnv.default(true),
  MAX_ROOMS: z.coerce.number().int().min(1).max(100000).default(2000),
});

export interface AppConfig {
  isProduction: boolean;
  port: number;
  host: string;
  version: string;
  discordClientId: string | null;
  discordClientSecret: string | null;
  discordBotToken: string | null;
  discordRedirectUri: string | null;
  discordApiBase: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  devAuth: boolean;
  skipInstanceValidation: boolean;
  redisUrl: string | null;
  redisKeyPrefix: string;
  roomTtlSeconds: number;
  lobbyTtlSeconds: number;
  maxRoomsPerUser: number;
  contentDir: string;
  publicDir: string;
  logLevel: string;
  trustProxy: boolean;
  maxRooms: number;
  warnings: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid environment configuration: ${details}`);
  }

  const data = parsed.data;
  const isProduction = data.NODE_ENV === 'production';

  let sessionSecret = data.SESSION_SECRET;
  if (!sessionSecret) {
    if (isProduction) {
      throw new Error('SESSION_SECRET is required in production (minimum 16 characters)');
    }
    sessionSecret = 'dev-only-session-secret-change-me';
  }

  const warnings: string[] = [];
  if (isProduction && data.DEV_AUTH) {
    warnings.push('DEV_AUTH is ignored in production');
  }
  if (isProduction && !data.DISCORD_CLIENT_ID) {
    warnings.push('DISCORD_CLIENT_ID is not set; Discord login will be unavailable');
  }
  if (isProduction && !data.DISCORD_CLIENT_SECRET) {
    warnings.push('DISCORD_CLIENT_SECRET is not set; Discord login will be unavailable');
  }

  return {
    isProduction,
    port: data.PORT ?? (isProduction ? 80 : 3001),
    host: data.HOST,
    version: env.npm_package_version ?? '0.1.0',
    discordClientId: data.DISCORD_CLIENT_ID ?? null,
    discordClientSecret: data.DISCORD_CLIENT_SECRET ?? null,
    discordBotToken: data.DISCORD_BOT_TOKEN ?? null,
    discordRedirectUri: data.DISCORD_REDIRECT_URI ?? null,
    discordApiBase: data.DISCORD_API_BASE.replace(/\/+$/, ''),
    sessionSecret,
    sessionTtlSeconds: data.SESSION_TTL_SECONDS,
    devAuth: data.DEV_AUTH && !isProduction,
    skipInstanceValidation: data.SKIP_INSTANCE_VALIDATION,
    redisUrl: data.REDIS_URL || null,
    redisKeyPrefix: data.REDIS_KEY_PREFIX,
    roomTtlSeconds: data.ROOM_TTL_SECONDS,
    lobbyTtlSeconds: data.LOBBY_TTL_SECONDS,
    maxRoomsPerUser: data.MAX_ROOMS_PER_USER,
    contentDir: path.resolve(data.CONTENT_DIR ?? path.join(process.cwd(), 'content')),
    publicDir: path.resolve(data.PUBLIC_DIR ?? path.join(process.cwd(), 'apps/activity/dist')),
    logLevel: data.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
    trustProxy: data.TRUST_PROXY,
    maxRooms: data.MAX_ROOMS,
    warnings,
  };
}
