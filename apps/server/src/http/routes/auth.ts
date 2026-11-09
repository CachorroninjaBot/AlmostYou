import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import {
  devAuthSchema,
  sanitizeDisplayName,
  tokenExchangeSchema,
} from '@almost-you/shared';
import type { AppConfig } from '../../config.js';
import type { AppFastifyInstance } from '../../types.js';
import { signSession } from '../../auth/jwt.js';
import {
  DiscordAuthError,
  assertUserInInstance,
  discordOAuthConfigured,
  exchangeDiscordCode,
} from '../../auth/discord.js';

const authAttempts = new Map<string, number[]>();
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 30;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (authAttempts.get(ip) ?? []).filter((timestamp) => now - timestamp < AUTH_WINDOW_MS);
  recent.push(now);
  authAttempts.set(ip, recent);
  if (authAttempts.size > 5_000) authAttempts.clear();
  return recent.length > AUTH_MAX_ATTEMPTS;
}

function sendError(reply: FastifyReply, status: number, error: string, message?: string) {
  return reply.code(status).send({ error, message });
}

export function registerAuthRoutes(
  app: AppFastifyInstance,
  config: AppConfig,
  logger: Logger,
): void {
  app.post('/api/auth/dev', async (request: FastifyRequest, reply) => {
    if (!config.devAuth) {
      return sendError(reply, 404, 'not_found');
    }
    if (isRateLimited(request.ip)) {
      return sendError(reply, 429, 'rate_limited');
    }

    const parsed = devAuthSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, 400, 'invalid_input');
    }

    const user = {
      id: parsed.data.id ?? randomUUID(),
      name: sanitizeDisplayName(parsed.data.name, 'Player'),
      avatarUrl: parsed.data.avatarUrl ?? null,
      guest: true,
    };

    return signSession(user, config.sessionSecret, config.sessionTtlSeconds);
  });

  app.post('/api/auth/token', async (request: FastifyRequest, reply) => {
    if (isRateLimited(request.ip)) {
      return sendError(reply, 429, 'rate_limited');
    }

    const parsed = tokenExchangeSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return sendError(reply, 400, 'invalid_input');
    }
    if (!discordOAuthConfigured(config)) {
      return sendError(reply, 503, 'auth_not_configured');
    }

    try {
      const user = await exchangeDiscordCode(config, parsed.data.code);
      await assertUserInInstance(config, parsed.data.instanceId, user.id);
      logger.info({ userId: user.id }, 'discord user authenticated');
      return signSession(user, config.sessionSecret, config.sessionTtlSeconds);
    } catch (error) {
      if (error instanceof DiscordAuthError) {
        logger.warn(
          { statusCode: error.statusCode, reason: error.message },
          'discord authentication failed',
        );
        return sendError(reply, error.statusCode, 'auth_failed', error.message);
      }
      throw error;
    }
  });
}
