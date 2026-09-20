/**
 * Server-side sessions.
 *
 * The API previously identified callers from an `x-user-id` header that
 * defaulted to the admin account, which meant any unauthenticated request was
 * served as an administrator. Callers now present an opaque bearer token that
 * this module issued.
 *
 * Opaque and database-backed rather than a self-contained JWT, for two
 * reasons: a session can be revoked the moment it is compromised, and there is
 * no signing secret to distribute or rotate. Only the token's hash is stored,
 * so a database leak does not hand over live sessions.
 */
import crypto from 'crypto';
import { q, ensureStoreReady, timestamp, num } from './store';
import { randomId, sha256 } from './crypto';

/** Long enough to be comfortable, short enough that a stolen token expires. */
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 24 * 14);

/** Failed sign-ins tolerated per email before the account is briefly locked. */
const MAX_FAILED_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS || 8);
const LOCKOUT_WINDOW_MINUTES = Number(process.env.LOGIN_LOCKOUT_MINUTES || 15);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface ActiveSession {
  id: string;
  user: SessionUser;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

/* ------------------------------------------------------------------ */
/* Issuing and verifying                                               */
/* ------------------------------------------------------------------ */

export const createSession = async (
  user: SessionUser,
  context: { userAgent?: string; ip?: string } = {}
): Promise<{ token: string; expiresAt: string; sessionId: string }> => {
  await ensureStoreReady();

  // 256 bits of entropy; the raw value is returned once and never stored.
  const token = `wss_${crypto.randomBytes(32).toString('base64url')}`;
  const sessionId = randomId('sess');
  const now = timestamp();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3_600_000).toISOString();

  await q(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, created_at, last_seen_at, expires_at, revoked)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'0')`,
    [
      sessionId, user.id, sha256(token),
      (context.userAgent || '').slice(0, 250), context.ip || '',
      now, now, expiresAt
    ]
  );

  return { token, expiresAt, sessionId };
};

/**
 * Resolves a bearer token to its user, or null.
 *
 * Returns null for every failure mode — unknown, revoked, expired — rather
 * than distinguishing them, so the endpoint cannot be used to probe which
 * tokens once existed.
 */
export const resolveSession = async (token: string): Promise<ActiveSession | null> => {
  if (!token || !token.startsWith('wss_')) return null;
  await ensureStoreReady();

  const rows = await q<any>(
    `SELECT s.id AS session_id, s.expires_at, s.revoked,
            u.id AS user_id, u.email, u.name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
      LIMIT 1`,
    [sha256(token)]
  );
  if (!rows.length) return null;

  const row = rows[0];
  if (row.revoked === '1') return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;

  // Best-effort activity stamp; never fail a request over it.
  q(`UPDATE sessions SET last_seen_at = $1 WHERE id = $2`, [timestamp(), row.session_id])
    .catch(() => undefined);

  return {
    id: row.session_id,
    user: { id: row.user_id, email: row.email, name: row.name, role: row.role || 'user' }
  };
};

export const revokeSession = async (sessionId: string): Promise<void> => {
  await ensureStoreReady();
  await q(`UPDATE sessions SET revoked = '1' WHERE id = $1`, [sessionId]);
};

/** Used when a password changes, or when a user signs out everywhere. */
export const revokeAllSessionsForUser = async (userId: string): Promise<number> => {
  await ensureStoreReady();
  const before = await q<any>(`SELECT id FROM sessions WHERE user_id = $1 AND revoked = '0'`, [userId]);
  await q(`UPDATE sessions SET revoked = '1' WHERE user_id = $1`, [userId]);
  return before.length;
};

export const listSessionsForUser = async (userId: string) => {
  await ensureStoreReady();
  return q<any>(
    `SELECT id, user_agent, ip, created_at, last_seen_at, expires_at, revoked
       FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
};

/* ------------------------------------------------------------------ */
/* Brute-force protection                                              */
/* ------------------------------------------------------------------ */

export const recordLoginAttempt = async (email: string, ip: string, succeeded: boolean) => {
  await ensureStoreReady();
  await q(
    `INSERT INTO login_attempts (id, email, ip, succeeded, attempted_at) VALUES ($1,$2,$3,$4,$5)`,
    [randomId('att'), email.toLowerCase(), ip || '', succeeded ? '1' : '0', timestamp()]
  );
};

/**
 * Locks an account after repeated failures inside a short window.
 *
 * Keyed on the email rather than the IP: an attacker rotating addresses is the
 * case worth stopping, and a legitimate user who mistypes a few times is only
 * held for minutes.
 */
export const isLockedOut = async (email: string): Promise<{ locked: boolean; retryAfterMinutes: number }> => {
  await ensureStoreReady();
  const since = minutesAgo(LOCKOUT_WINDOW_MINUTES);

  const rows = await q<any>(
    `SELECT succeeded, attempted_at FROM login_attempts
      WHERE email = $1 AND attempted_at > $2
      ORDER BY attempted_at DESC LIMIT 50`,
    [email.toLowerCase(), since]
  );

  // A success inside the window clears the streak.
  const failuresSinceSuccess: any[] = [];
  for (const row of rows) {
    if (row.succeeded === '1') break;
    failuresSinceSuccess.push(row);
  }

  if (failuresSinceSuccess.length < MAX_FAILED_ATTEMPTS) {
    return { locked: false, retryAfterMinutes: 0 };
  }

  const oldest = failuresSinceSuccess[failuresSinceSuccess.length - 1];
  const unlocksAt = new Date(oldest.attempted_at).getTime() + LOCKOUT_WINDOW_MINUTES * 60_000;
  const remaining = Math.ceil((unlocksAt - Date.now()) / 60_000);

  return remaining > 0
    ? { locked: true, retryAfterMinutes: remaining }
    : { locked: false, retryAfterMinutes: 0 };
};

/* ------------------------------------------------------------------ */
/* Housekeeping                                                        */
/* ------------------------------------------------------------------ */

/** Clears expired sessions and stale attempt records. */
export const pruneExpired = async (): Promise<void> => {
  await ensureStoreReady();
  try {
    await q(`DELETE FROM sessions WHERE expires_at < $1`, [timestamp()]);
    await q(`DELETE FROM login_attempts WHERE attempted_at < $1`, [minutesAgo(60 * 24)]);
  } catch (err) {
    console.error('Session prune failed:', (err as Error).message);
  }
};

export const sessionConfig = {
  ttlHours: SESSION_TTL_HOURS,
  maxFailedAttempts: MAX_FAILED_ATTEMPTS,
  lockoutWindowMinutes: LOCKOUT_WINDOW_MINUTES
};

export { num };
