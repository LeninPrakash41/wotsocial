/**
 * Request authentication and authorisation.
 *
 * Two separate jobs, deliberately kept apart:
 *   • `requireAuth` establishes *who* is calling. Without it every request was
 *     served as the seeded administrator.
 *   • `assertOwnsBrand` establishes *what they may touch*. Authentication alone
 *     would still let any signed-in user read and write every other tenant's
 *     brands by guessing an id.
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { resolveSession, SessionUser } from './sessions';
import { q, ensureStoreReady, timestamp, stringifyJson } from './store';
import { randomId } from './crypto';
import { HttpError } from './http';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionId?: string;
    }
  }
}

/**
 * Endpoints that must stay reachable without a session, each because a third
 * party or an unauthenticated user has to call it. Every one of these carries
 * its own verification — a signature, a single-use state, or credentials in
 * the body — so "public" does not mean "unprotected".
 */
const PUBLIC_PATHS: { method: string; pattern: RegExp; why: string }[] = [
  { method: 'POST', pattern: /^\/auth\/login$/, why: 'credentials are the verification' },
  { method: 'POST', pattern: /^\/auth\/logout$/, why: 'must succeed even with a dead token' },
  { method: 'GET', pattern: /^\/health$/, why: 'load balancer probe' },
  // Meta calls these; both verify an HMAC signature or a single-use state.
  { method: 'GET', pattern: /^\/webhooks\//, why: 'Meta subscription handshake' },
  { method: 'POST', pattern: /^\/webhooks\//, why: 'signature-verified by the receiver' },
  { method: 'GET', pattern: /^\/oauth\/meta\/callback$/, why: 'Meta redirect, state-verified' },
  // The MCP bridge authenticates with its own hashed API key.
  { method: 'POST', pattern: /^\/mcp\/?$/, why: 'MCP API key' },
  { method: 'GET', pattern: /^\/mcp\/tools$/, why: 'MCP API key' },
  // The scheduler is invoked by the platform's cron, which presents
  // CRON_SECRET rather than a user session; the handler checks it.
  { method: 'GET', pattern: /^\/cron$/, why: 'CRON_SECRET' }
];

const isPublic = (req: Request): boolean => {
  const path = req.path.replace(/\/+$/, '') || '/';
  return PUBLIC_PATHS.some(rule => rule.method === req.method && rule.pattern.test(path));
};

export const bearerToken = (req: Request): string => {
  const header = req.header('authorization') || '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
};

export const clientIp = (req: Request): string =>
  (req.header('x-forwarded-for') || '').split(',')[0].trim() || req.socket.remoteAddress || '';

/**
 * Rejects any request without a valid session, except the small allowlist
 * above. Mounted once on /api so a new route is protected by default —
 * forgetting to add a guard fails closed rather than open.
 */
export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  if (isPublic(req)) return next();

  try {
    const token = bearerToken(req);
    if (!token) {
      return res.status(401).json({
        error: 'Sign in to continue.',
        details: { code: 'UNAUTHENTICATED' }
      });
    }

    const session = await resolveSession(token);
    if (!session) {
      return res.status(401).json({
        error: 'Your session has expired or was signed out. Sign in again.',
        details: { code: 'SESSION_INVALID' }
      });
    }

    req.user = session.user;
    req.sessionId = session.id;
    next();
  } catch (err) {
    next(err);
  }
};

/** The authenticated user. Throws rather than falling back to a default. */
export const requireUser = (req: Request): SessionUser => {
  if (!req.user) {
    throw new HttpError(401, 'Sign in to continue.', { code: 'UNAUTHENTICATED' });
  }
  return req.user;
};

export const requireRole = (...roles: string[]): RequestHandler => (req, res, next) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Sign in to continue.' });
  if (!roles.includes(user.role)) {
    return res.status(403).json({
      error: `This action needs the ${roles.join(' or ')} role.`,
      details: { code: 'FORBIDDEN' }
    });
  }
  next();
};

/* ------------------------------------------------------------------ */
/* Tenant isolation                                                    */
/* ------------------------------------------------------------------ */

const brandOwnerCache = new Map<string, { userId: string; at: number }>();
const OWNER_CACHE_MS = 30_000;

/**
 * Confirms the signed-in user owns this brand.
 *
 * A 404 rather than a 403 for someone else's brand: telling an attacker that
 * an id exists but belongs to another tenant is itself a disclosure.
 */
export const assertOwnsBrand = async (req: Request, brandId: string): Promise<string> => {
  const user = requireUser(req);
  if (!brandId) throw new HttpError(400, '`brandId` is required.');

  // Admins operate across the workspace; everyone else is scoped to their own.
  if (user.role === 'admin') {
    await ensureStoreReady();
    const rows = await q<any>('SELECT user_id FROM brands WHERE id = $1 LIMIT 1', [brandId]);
    if (!rows.length) throw new HttpError(404, 'That brand does not exist.');
    return brandId;
  }

  const cached = brandOwnerCache.get(brandId);
  if (cached && Date.now() - cached.at < OWNER_CACHE_MS) {
    if (cached.userId !== user.id) throw new HttpError(404, 'That brand does not exist.');
    return brandId;
  }

  await ensureStoreReady();
  const rows = await q<any>('SELECT user_id FROM brands WHERE id = $1 LIMIT 1', [brandId]);
  if (!rows.length) throw new HttpError(404, 'That brand does not exist.');

  brandOwnerCache.set(brandId, { userId: rows[0].user_id, at: Date.now() });
  if (rows[0].user_id !== user.id) throw new HttpError(404, 'That brand does not exist.');

  return brandId;
};

/** Called after a brand is created or deleted so the cache cannot go stale. */
export const forgetBrandOwner = (brandId: string) => brandOwnerCache.delete(brandId);

/**
 * Reads the brand id from wherever the route carries it and checks ownership
 * in one step, so a route cannot accidentally validate one and use the other.
 */
export const requireOwnedBrand = async (req: Request): Promise<string> => {
  const brandId =
    (req.query.brandId as string) ||
    (req.body && req.body.brandId) ||
    req.params.brandId;
  return assertOwnsBrand(req, String(brandId || ''));
};

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

/**
 * Records who did what. Deliberately fire-and-forget: an audit write must
 * never be the reason a user's action fails, and a dropped line is recoverable
 * where a failed publish is not.
 */
export const audit = (req: Request, entry: {
  action: string;
  targetType?: string;
  targetId?: string;
  brandId?: string;
  detail?: any;
}): void => {
  const user = req.user;
  void (async () => {
    try {
      await ensureStoreReady();
      await q(
        `INSERT INTO audit_log (id, user_id, actor, action, target_type, target_id, brand_id, detail, ip, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          randomId('audit'),
          user?.id || '',
          user?.email || 'system',
          entry.action,
          entry.targetType || '',
          entry.targetId || '',
          entry.brandId || '',
          stringifyJson(entry.detail ?? null).slice(0, 2000),
          clientIp(req),
          timestamp()
        ]
      );
    } catch (err) {
      console.error('Audit write failed:', (err as Error).message);
    }
  })();
};
