import pino from 'pino';
import pretty from 'pino-pretty';
import type { AppConfig } from './config.js';

export function createLogger(config: AppConfig): pino.Logger {
  const options: pino.LoggerOptions = {
    level: config.logLevel,
    base: { app: 'almost-you', version: config.version },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (process.env.LOG_JSON === '1') {
    return pino(options);
  }

  const stream = pretty({
    colorize: process.stdout.isTTY === true,
    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
    ignore: 'pid,hostname,app,version',
    singleLine: true,
    messageFormat: '{msg}',
  });

  return pino(options, stream);
}
