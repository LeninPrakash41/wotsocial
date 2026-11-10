/** Shared Express helpers: async error propagation and consistent error shapes. */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { MetaApiError } from './graphClient';
import { GoogleAdsError } from './googleAdsClient';
import { logger } from './logging';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/** Raised deliberately by route code for expected, user-correctable failures. */
export class HttpError extends Error {
  status: number;
  details?: any;
  constructor(status: number, message: string, details?: any) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: any) => new HttpError(400, message, details);
export const notFound = (message: string) => new HttpError(404, message);
export const notConnected = (platform: string) =>
  new HttpError(
    409,
    `No live ${platform} connection for this brand. Connect an account before running this action.`,
    { code: 'NOT_CONNECTED', platform }
  );

/** Single place where every integration error becomes an HTTP response. */
export const integrationErrorHandler = (
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  if (res.headersSent) return next(err);

  if (err instanceof MetaApiError) {
    const payload = err.toJSON();
    const status = err.isAuthError ? 401 : err.isPermissionError ? 403 : err.status >= 400 ? err.status : 502;
    logger.error(`[meta] ${err.endpoint} → ${err.message} (code ${err.code}, trace ${err.fbtraceId})`);
    return res.status(status).json({ error: payload.message, meta: payload });
  }

  if (err instanceof GoogleAdsError) {
    const payload = err.toJSON();
    const status = err.isAuthError ? 401 : err.isPermissionError ? 403 : err.status >= 400 ? err.status : 502;
    logger.error('google ads error', {
      endpoint: err.endpoint, errorCode: err.errorCode, requestId: err.requestId, detail: err.message
    });
    return res.status(status).json({ error: payload.message, google: payload });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  logger.error('[integration] Unhandled error', { detail: err });
  return res.status(500).json({ error: err?.message || 'Internal server error' });
};

export const requireParam = (value: any, name: string): string => {
  const v = typeof value === 'string' ? value.trim() : value;
  if (!v) throw badRequest(`\`${name}\` is required.`);
  return String(v);
};

/**
 * The signed-in user's id, set by requireAuth.
 *
 * This previously fell back to a header, a query parameter and finally the
 * seeded administrator, which meant an unauthenticated request was served with
 * full privileges. There is no fallback now: no session, no identity.
 */
export const currentUserId = (req: Request): string => {
  const id = (req as any).user?.id;
  if (!id) throw new HttpError(401, 'Sign in to continue.', { code: 'UNAUTHENTICATED' });
  return id;
};
