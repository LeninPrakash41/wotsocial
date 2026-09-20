/** Shared Express helpers: async error propagation and consistent error shapes. */
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { MetaApiError } from './graphClient';

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
    console.error(`[meta] ${err.endpoint} → ${err.message} (code ${err.code}, trace ${err.fbtraceId})`);
    return res.status(status).json({ error: payload.message, meta: payload });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  console.error('[integration] Unhandled error:', err);
  return res.status(500).json({ error: err?.message || 'Internal server error' });
};

export const requireParam = (value: any, name: string): string => {
  const v = typeof value === 'string' ? value.trim() : value;
  if (!v) throw badRequest(`\`${name}\` is required.`);
  return String(v);
};

/** Auth is header/query based today; centralised so real sessions drop in here. */
export const currentUserId = (req: Request): string =>
  (req.header('x-user-id') || (req.query.userId as string) || (req.body && req.body.userId) || 'admin-user-001').trim();
