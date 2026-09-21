/**
 * @file lib/logger.ts
 *
 * Structured logger: console in development, JSON in production.
 *
 * Never log secrets, tokens, API keys, full payment payloads,
 * signed URLs, or product file contents.
 *
 * @module Logger
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFields = Readonly<Record<string, string | number | boolean | null>>;

function writeLog(level: LogLevel, message: string, fields?: LogFields): void {
  const timestamp = new Date().toISOString();
  if (process.env.NODE_ENV === 'production') {
    process.stdout.write(
      `${JSON.stringify({ level, message, timestamp, ...fields })}\n`,
    );
    return;
  }
  const extra = fields === undefined ? '' : ` ${JSON.stringify(fields)}`;
  const line = `[${timestamp}] ${level.toUpperCase()} ${message}${extra}`;
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.info(line);
}

export const logger = {
  debug(message: string, fields?: LogFields): void {
    writeLog('debug', message, fields);
  },
  info(message: string, fields?: LogFields): void {
    writeLog('info', message, fields);
  },
  warn(message: string, fields?: LogFields): void {
    writeLog('warn', message, fields);
  },
  error(message: string, fields?: LogFields): void {
    writeLog('error', message, fields);
  },
};
