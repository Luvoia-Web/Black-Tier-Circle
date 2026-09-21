/**
 * @file lib/logger.ts
 *
 * Structured logger: pretty console in development, JSON in production.
 *
 * Always include: timestamp, level, service, message, context.
 * Never include: secrets, tokens, raw payment data, PII.
 *
 * @module Logger
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFields = Readonly<Record<string, string | number | boolean | null>>;

const SERVICE = 'black-tier-circle';

const SENSITIVE_KEY = /token|secret|password|authorization|apikey|api_key|binance|cookie|private/i;

function sanitizeFields(fields?: LogFields): LogFields | undefined {
  if (fields === undefined) {
    return undefined;
  }
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key)) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

function writeLog(level: LogLevel, message: string, fields?: LogFields): void {
  const timestamp = new Date().toISOString();
  const context = sanitizeFields(fields);
  if (process.env.NODE_ENV === 'production') {
    process.stdout.write(
      `${JSON.stringify({ timestamp, level, service: SERVICE, message, ...(context ?? {}) })}\n`,
    );
    return;
  }
  const extra = context === undefined ? '' : ` ${JSON.stringify(context)}`;
  const line = `[${timestamp}] ${level.toUpperCase()} ${SERVICE} ${message}${extra}`;
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
