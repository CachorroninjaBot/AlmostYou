import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { LogController } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Logger } from 'pino';
import type { AppConfig } from '../config.js';
import type { ContentService } from '../content/content-loader.js';
import type { RoomStore } from '../rooms/room-store.js';
import type { AppFastifyInstance } from '../types.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerContentRoutes } from './routes/content.js';

export interface HttpDependencies {
  config: AppConfig;
  content: ContentService;
  store: RoomStore;
  logger: Logger;
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.discordapp.com https://media.discordapp.net",
  "font-src 'self' data:",
  "connect-src 'self' wss: https://discord.com https://*.discordsays.com",
  "frame-ancestors https://discord.com https://*.discord.com https://*.discordsays.com",
  "form-action 'self'",
].join('; ');

export async function buildHttpApp(deps: HttpDependencies): Promise<AppFastifyInstance> {
  const { config, content, store, logger } = deps;

  const app = Fastify({
    loggerInstance: logger,
    trustProxy: config.trustProxy,
    bodyLimit: 256 * 1024,
    requestTimeout: 15_000,
    logController: new LogController({ disableRequestLogging: true }),
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.debug(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      'request completed',
    );
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy-Report-Only', CONTENT_SECURITY_POLICY);
    if (config.isProduction) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    return payload;
  });

  app.get('/api/health', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const ready = store.isReady();
    return {
      ok: ready,
      status: ready ? 'ok' : 'degraded',
      version: config.version,
      uptimeSeconds: Math.floor(process.uptime()),
      redis: ready && store.kind === 'redis',
      store: store.kind,
    };
  });

  registerContentRoutes(app, content);
  registerAuthRoutes(app, config, logger);

  const indexFile = path.join(config.publicDir, 'index.html');
  const hasClient = existsSync(indexFile);

  if (hasClient) {
    await app.register(fastifyStatic, {
      root: config.publicDir,
      prefix: '/',
      cacheControl: false,
      setHeaders: (reply, filePath) => {
        if (filePath.endsWith('index.html')) {
          reply.header('Cache-Control', 'no-store');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          reply.header('Cache-Control', 'public, max-age=3600');
        }
      },
    });
  } else {
    app.get('/', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return {
        ok: true,
        service: 'almost-you',
        message: 'API is running. Start the Vite client for the activity UI.',
      };
    });
  }

  app.setNotFoundHandler((request, reply) => {
    const url = request.url;
    const isSocketUrl = url === '/ws' || url.startsWith('/ws/');
    if (url.startsWith('/api/') || isSocketUrl || url.startsWith('/.proxy')) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (hasClient) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'not_found' });
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    const failure = error as Error & { statusCode?: number };
    const statusCode =
      typeof failure.statusCode === 'number' && failure.statusCode >= 400
        ? failure.statusCode
        : 500;
    if (statusCode >= 500) {
      request.log.error({ err: failure }, 'http request failed');
    }
    if (reply.sent) return;
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'internal_error' : 'request_error',
    });
  });

  return app;
}
