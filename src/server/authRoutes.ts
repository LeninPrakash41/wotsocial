/**
 * Sign-in, sign-out and account security.
 *
 * Login previously returned a bare user object that the browser kept in
 * localStorage and the server never checked again. It now issues a real
 * session token, and every other endpoint requires one.
 */
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { q, ensureStoreReady, timestamp } from './store';
import {
  createSession, resolveSession, revokeSession, revokeAllSessionsForUser,
  listSessionsForUser, recordLoginAttempt, isLockedOut, sessionConfig
} from './sessions';
import { bearerToken, requireUser, clientIp, audit } from './authMiddleware';
import { asyncHandler, badRequest, HttpError, requireParam } from './http';

const router = Router();

/** Long enough to resist guessing without being unusable. */
const MIN_PASSWORD_LENGTH = 12;

const assessPassword = (password: string): string | null => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(password)).length;
  if (classes < 3) {
    return 'Mix at least three of: lowercase, uppercase, numbers, symbols.';
  }
  if (/^(.)\1+$/.test(password)) return 'That password is a single repeated character.';
  return null;
};

/* ------------------------------------------------------------------ */
/* Sign in                                                             */
/* ------------------------------------------------------------------ */

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  await ensureStoreReady();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const ip = clientIp(req);

  if (!email || !password) throw badRequest('Enter your email and password.');

  const lock = await isLockedOut(email);
  if (lock.locked) {
    throw new HttpError(
      429,
      `Too many failed sign-in attempts. Try again in ${lock.retryAfterMinutes} minute${lock.retryAfterMinutes === 1 ? '' : 's'}.`,
      { code: 'LOCKED_OUT', retryAfterMinutes: lock.retryAfterMinutes }
    );
  }

  const rows = await q<any>('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
  const user = rows[0];

  // Hash even when the user is unknown, so a missing account and a wrong
  // password take the same time and cannot be told apart by timing.
  const hash = user?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(password, hash);

  if (!user || !ok) {
    await recordLoginAttempt(email, ip, false);
    throw new HttpError(401, 'That email and password do not match.', { code: 'BAD_CREDENTIALS' });
  }

  await recordLoginAttempt(email, ip, true);

  const { token, expiresAt } = await createSession(
    { id: user.id, email: user.email, name: user.name, role: user.role || 'user' },
    { userAgent: req.header('user-agent') || '', ip }
  );

  req.user = { id: user.id, email: user.email, name: user.name, role: user.role || 'user' };
  audit(req, { action: 'auth.login', targetType: 'user', targetId: user.id });

  res.json({
    success: true,
    token,
    expiresAt,
    // `mustChangePassword` is set on accounts still using a generated
    // first-boot credential; the UI keeps nagging until it is cleared.
    mustChangePassword: user.must_change_password === '1',
    user: {
      uid: user.id,
      email: user.email,
      displayName: user.name,
      role: user.role || 'user'
    }
  });
}));

/* ------------------------------------------------------------------ */
/* Session lifecycle                                                   */
/* ------------------------------------------------------------------ */

/** Lets the client confirm a stored token is still good on page load. */
router.get('/session', asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await ensureStoreReady();
  const rows = await q<any>('SELECT must_change_password FROM users WHERE id = $1', [user.id]);
  res.json({
    user: { uid: user.id, email: user.email, displayName: user.name, role: user.role },
    mustChangePassword: rows[0]?.must_change_password === '1'
  });
}));

/** Succeeds even for a token that is already invalid — signing out should
 *  never fail and leave a client believing it is still signed in. */
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const token = bearerToken(req);
  if (token) {
    const session = await resolveSession(token);
    if (session) {
      await revokeSession(session.id);
      req.user = session.user;
      audit(req, { action: 'auth.logout', targetType: 'session', targetId: session.id });
    }
  }
  res.json({ success: true });
}));

router.get('/sessions', asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const sessions = await listSessionsForUser(user.id);
  res.json({
    sessions: sessions.map(s => ({
      id: s.id,
      current: s.id === req.sessionId,
      userAgent: s.user_agent,
      ip: s.ip,
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      expiresAt: s.expires_at,
      revoked: s.revoked === '1'
    })),
    policy: sessionConfig
  });
}));

router.post('/sessions/revoke-all', asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const count = await revokeAllSessionsForUser(user.id);
  audit(req, { action: 'auth.revoke_all_sessions', targetType: 'user', targetId: user.id, detail: { count } });
  res.json({
    success: true,
    revoked: count,
    message: `Signed out of ${count} session${count === 1 ? '' : 's'}. You will need to sign in again.`
  });
}));

/* ------------------------------------------------------------------ */
/* Password                                                            */
/* ------------------------------------------------------------------ */

router.post('/change-password', asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await ensureStoreReady();

  const currentPassword = requireParam(req.body?.currentPassword, 'currentPassword');
  const newPassword = String(req.body?.newPassword || '');

  const complaint = assessPassword(newPassword);
  if (complaint) throw badRequest(complaint);
  if (currentPassword === newPassword) throw badRequest('The new password must differ from the current one.');

  const rows = await q<any>('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  if (!rows.length) throw new HttpError(404, 'Account not found.');

  const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!ok) throw new HttpError(401, 'Your current password is not correct.');

  await q(
    `UPDATE users SET password_hash = $1, must_change_password = '0' WHERE id = $2`,
    [await bcrypt.hash(newPassword, 12), user.id]
  );

  // A password change invalidates every other session, which is the point of
  // changing it after a suspected compromise.
  await revokeAllSessionsForUser(user.id);
  const { token, expiresAt } = await createSession(user, {
    userAgent: req.header('user-agent') || '',
    ip: clientIp(req)
  });

  audit(req, { action: 'auth.change_password', targetType: 'user', targetId: user.id });

  res.json({
    success: true,
    token,
    expiresAt,
    message: 'Password changed. All other sessions have been signed out.'
  });
}));

router.get('/password-policy', (_req: Request, res: Response) => {
  res.json({
    minLength: MIN_PASSWORD_LENGTH,
    requirement: 'At least three of: lowercase, uppercase, numbers, symbols.',
    lockout: {
      maxAttempts: sessionConfig.maxFailedAttempts,
      windowMinutes: sessionConfig.lockoutWindowMinutes
    }
  });
});

/* ------------------------------------------------------------------ */
/* Audit trail                                                         */
/* ------------------------------------------------------------------ */

router.get('/audit', asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  await ensureStoreReady();

  // Admins see the workspace; everyone else sees only their own activity.
  const rows = user.role === 'admin'
    ? await q<any>('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200')
    : await q<any>('SELECT * FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200', [user.id]);

  res.json({
    entries: rows.map(r => ({
      id: r.id, actor: r.actor, action: r.action,
      targetType: r.target_type, targetId: r.target_id,
      brandId: r.brand_id, ip: r.ip, createdAt: r.created_at
    })),
    scope: user.role === 'admin' ? 'workspace' : 'self'
  });
}));

export default router;
