/**
 * Structured logging.
 *
 * The server logged with bare console calls, which is fine to read over a
 * shoulder and useless to a log aggregator: no severity to filter on, no
 * request to correlate against, and — more seriously — tokens and secrets
 * printed verbatim whenever an object was dumped.
 *
 * Output is one JSON object per line in production and a readable line in
 * development, which is the format every aggregator expects and no human
 * wants to read locally.
 */
import crypto from 'crypto';
import { Request, Response, NextFunction, RequestHandler } from 'express';

export type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const configuredLevel = (): Level => {
  const raw = (process.env.LOG_LEVEL || '').toLowerCase();
  if (raw in LEVELS) return raw as Level;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
};

const pretty = () => process.env.LOG_FORMAT === 'pretty'
  || (process.env.NODE_ENV !== 'production' && process.env.LOG_FORMAT !== 'json');

/**
 * Keys whose values must never be logged.
 *
 * Matched loosely because the same secret travels under many names —
 * access_token, accessToken, applicationPassword, appsecret_proof.
 */
const SECRET_KEY = /(token|secret|password|authorization|cookie|api[-_]?key|credential|signature|proof)/i;

/** Long opaque strings are secrets more often than not. */
const looksLikeSecret = (value: string): boolean =>
  /^(EAA|wss_|wot_mcp_|shpat_|sk-|AIza|ya29\.)/.test(value) || value.length > 120;

export const redact = (input: unknown, depth = 0): unknown => {
  if (depth > 6) return '[deep]';
  if (input == null) return input;

  if (typeof input === 'string') {
    return looksLikeSecret(input) ? `[redacted:${input.length}]` : input;
  }
  if (typeof input !== 'object') return input;
  if (input instanceof Error) {
    return { name: input.name, message: input.message, stack: input.stack };
  }
  if (Array.isArray(input)) return input.slice(0, 50).map(v => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(value, depth + 1);
  }
  return out;
};

export interface LogFields {
  [key: string]: unknown;
}

const emit = (level: Level, message: string, fields: LogFields) => {
  if (LEVELS[level] < LEVELS[configuredLevel()]) return;

  const payload = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(redact(fields) as LogFields)
  };

  const stream = level === 'error' || level === 'warn' ? console.error : console.log;

  if (pretty()) {
    const extras = Object.entries(payload)
      .filter(([k]) => !['level', 'time', 'msg'].includes(k))
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' ');
    const tag = { debug: 'DEBUG', info: 'INFO ', warn: 'WARN ', error: 'ERROR' }[level];
    stream(`${tag} ${message}${extras ? ` ${extras}` : ''}`);
    return;
  }

  stream(JSON.stringify(payload));
};

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** Returns a logger that stamps every line with the given fields. */
  child(fields: LogFields): Logger;
}

const make = (base: LogFields): Logger => ({
  debug: (m, f) => emit('debug', m, { ...base, ...f }),
  info: (m, f) => emit('info', m, { ...base, ...f }),
  warn: (m, f) => emit('warn', m, { ...base, ...f }),
  error: (m, f) => emit('error', m, { ...base, ...f }),
  child: (fields) => make({ ...base, ...fields })
});

export const logger = make({});

/* ------------------------------------------------------------------ */
/* Request correlation                                                 */
/* ------------------------------------------------------------------ */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      log?: Logger;
      requestId?: string;
    }
  }
}

/**
 * Gives every request an id and logs its completion.
 *
 * The id is echoed in the response header so a user reporting a problem can
 * quote something that finds the exact request in the logs.
 */
export const requestLogging: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.header('x-request-id') || crypto.randomUUID();
  const start = process.hrtime.bigint();

  req.requestId = requestId;
  req.log = logger.child({ requestId });
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;

    // Health checks and static media would otherwise drown everything else.
    const routine = req.path === '/api/health' || req.path.startsWith('/media/');
    if (routine && res.statusCode < 400) return;

    const level: Level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    emit(level, 'request', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(ms * 10) / 10,
      userId: (req as any).user?.id,
      ip: (req.header('x-forwarded-for') || '').split(',')[0].trim() || req.socket.remoteAddress
    });
  });

  next();
};

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

interface Counter { [key: string]: number }

const counters: Counter = {};
const durations: Record<string, number[]> = {};

export const countEvent = (name: string, by = 1) => {
  counters[name] = (counters[name] || 0) + by;
};

export const observeDuration = (name: string, ms: number) => {
  const series = durations[name] || (durations[name] = []);
  series.push(ms);
  // Bounded, so a long-running process cannot grow this without limit.
  if (series.length > 1000) series.shift();
};

const percentile = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]);
};

/**
 * A snapshot for the metrics endpoint.
 *
 * Deliberately in-process and approximate: it answers "is this instance
 * healthy" without pulling in a metrics backend. Anything that needs
 * aggregation across instances should scrape the structured logs instead.
 */
export const metricsSnapshot = () => ({
  uptimeSeconds: Math.round(process.uptime()),
  memory: {
    rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
  },
  counters: { ...counters },
  durations: Object.fromEntries(
    Object.entries(durations).map(([name, values]) => [
      name,
      { count: values.length, p50: percentile(values, 50), p95: percentile(values, 95) }
    ])
  )
});

export const resetMetrics = () => {
  for (const key of Object.keys(counters)) delete counters[key];
  for (const key of Object.keys(durations)) delete durations[key];
};
