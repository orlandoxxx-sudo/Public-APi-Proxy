import pino from 'pino';

export const createLogger = (correlationId: string | undefined) =>
  pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: correlationId ? { correlationId } : {}
  });
