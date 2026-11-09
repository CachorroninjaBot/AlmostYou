import dotenv from 'dotenv';
import { ContentService } from './content/content-loader.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { buildHttpApp } from './http/app.js';
import { registerRoomRoutes } from './http/routes/rooms.js';
import { createRoomStore } from './rooms/room-store.js';
import { RoomManager } from './rooms/room-manager.js';
import {
  createSocketServer,
  registerSocketHandlers,
} from './rooms/socket.js';

dotenv.config({ quiet: true });

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  for (const warning of config.warnings) logger.warn(warning);

  const content = await ContentService.load(config);
  logger.info(
    {
      pairs: content.getPairs().length,
      contentLocales: content.getContentLocales().length,
      uiLocales: content.getAvailableLocaleCodes().length,
    },
    'content loaded',
  );

  const store = await createRoomStore(config, logger);
  const app = await buildHttpApp({ config, content, store, logger });
  const io = createSocketServer(app, config);
  const rooms = new RoomManager(io, content, store, config, logger);
  registerRoomRoutes(app, rooms);
  registerSocketHandlers(io, rooms, logger);
  await rooms.init();

  app.addHook('onClose', async () => {
    await io.close();
    await rooms.close();
  });

  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'shutting down');
    void app.close().catch((error: unknown) => {
      logger.error({ err: error }, 'shutdown failed');
      process.exitCode = 1;
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });

  await app.listen({ port: config.port, host: config.host });
  logger.info(
    {
      port: config.port,
      host: config.host,
      production: config.isProduction,
      devAuth: config.devAuth,
      redis: store.kind,
    },
    'almost you server listening',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
