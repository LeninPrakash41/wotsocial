/**
 * Rate limiting.
 *
 * Nothing stopped a caller hammering the API: sign-in could be attempted as
 * fast as the network allowed, and the generation endpoints spend real money
 * per call on someone else's API key.
 *
 * Counters are in-process, which is the honest limit of this implementation —
 * behind several instances each enforces its own share. That is still worth
 * having (it bounds any single instance) but it is not a substitute for a
 * limiter at the edge, and the header says which is in play.
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { countEvent, logger } from './logging';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Keeps the map from growing without bound on a long-running process.
const sweep = () => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};
setInterval(sweep, 60_000).unref();

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests permitted per window. */
  max: number;
  /** Distinguishes one limiter's counters from another's. */
  name: string;
  /** What to count against; defaults to the user, falling back to the IP. */
  keyBy?: (req: Request) => string;
  /** Lets a request skip the limit entirely. */
  skip?: (req: Request) => boolean;
  message?: string;
}

const clientKey = (req: Request): string => {
  const user = (req as any).user?.id;
  if (user) return `u:${user}`;
  const forwarded = (req.header('x-forwarded-for') || '').split(',')[0].trim();
  return `ip:${forwarded || req.socket.remoteAddress || 'unknown'}`;
};

/**
 * A fixed-window limiter.
 *
 * Fixed rather than sliding because the failure mode — up to 2x the limit
 * across a window boundary — is acceptable here, and a sliding window costs
 * memory proportional to request volume for a guarantee nothing depends on.
 */
export const rateLimit = (options: RateLimitOptions): RequestHandler => {
  const { windowMs, max, name, keyBy = clientKey, skip, message } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.RATE_LIMIT_DISABLED === 'true') return next();
    if (skip?.(req)) return next();

    const key = `${name}:${keyBy(req)}`;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    const resetSeconds = Math.ceil((bucket.resetAt - now) / 1000);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetSeconds));
    // Says plainly that this is per-instance, so an operator behind a load
    // balancer does not mistake it for a global guarantee.
    res.setHeader('RateLimit-Policy', `${max};w=${Math.round(windowMs / 1000)};scope=instance`);

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(resetSeconds));
      countEvent(`ratelimit.blocked.${name}`);
      logger.warn('rate limit exceeded', { limiter: name, key, count: bucket.count, max });

      return res.status(429).json({
        error: message || `Too many requests. Try again in ${resetSeconds} second${resetSeconds === 1 ? '' : 's'}.`,
        details: { code: 'RATE_LIMITED', retryAfterSeconds: resetSeconds }
      });
    }

    next();
  };
};

/* ------------------------------------------------------------------ */
/* The limits themselves                                               */
/* ------------------------------------------------------------------ */

/**
 * Sign-in, keyed on IP.
 *
 * The per-account lockout already blunts credential stuffing against one
 * account; this bounds an attacker spraying one password across many.
 */
export const loginLimiter = rateLimit({
  name: 'login',
  windowMs: 15 * 60_000,
  max: Number(process.env.RATE_LIMIT_LOGIN || 30),
  keyBy: req => `ip:${(req.header('x-forwarded-for') || '').split(',')[0].trim() || req.socket.remoteAddress}`,
  message: 'Too many sign-in attempts from this address. Try again shortly.'
});

/** The broad ceiling for authenticated API use. */
export const apiLimiter = rateLimit({
  name: 'api',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_API || 300),
  // Webhooks are called by Meta at a rate we do not control, and the cron is
  // called by the platform scheduler; throttling either breaks delivery.
  skip: req => req.path.startsWith('/webhooks') || req.path === '/cron'
});

/**
 * Anything that spends money or API credit per call.
 *
 * Lower than the general limit because the cost of a runaway loop here is a
 * bill rather than a slow response.
 */
export const costlyLimiter = rateLimit({
  name: 'costly',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_COSTLY || 30),
  message: 'That is a lot of requests for an operation that costs money. Slow down and try again shortly.'
});

/** Media uploads, which are large rather than expensive. */
export const uploadLimiter = rateLimit({
  name: 'upload',
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_UPLOAD || 60)
});

/** Clears all counters. Used between tests. */
export const resetRateLimits = () => buckets.clear();
