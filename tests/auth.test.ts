/**
 * Authentication.
 *
 * The API once identified callers from an `x-user-id` header that fell back to
 * the seeded administrator, so an unauthenticated request was served with full
 * privileges. These tests pin that boundary shut: each one corresponds to a
 * way in that actually worked.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHarness, api, createUser, Harness, TestUser } from './helpers/harness';

let h: Harness;
let user: TestUser;

beforeAll(async () => {
  h = await startHarness();
  user = await createUser(h, { email: 'auth-user@example.com' });
});

afterAll(async () => { await h?.close(); });

describe('the unauthenticated boundary', () => {
  // Each of these returned real data before authentication existed.
  it.each([
    ['GET', '/api/brands'],
    ['GET', '/api/agents'],
    ['GET', '/api/posts'],
    ['GET', '/api/media?brandId=anything'],
    ['GET', '/api/crm/leads?brandId=anything'],
    ['GET', '/api/meta/connection?brandId=anything'],
    ['POST', '/api/mcp/keys'],
    ['POST', '/api/meta/campaigns'],
    ['POST', '/api/instagram/publish'],
    ['POST', '/api/whatsapp/broadcasts']
  ])('rejects %s %s', async (method, path) => {
    const res = await api(h, path, { method, body: method === 'POST' ? {} : undefined });
    expect(res.status).toBe(401);
    expect(res.body.details?.code).toBe('UNAUTHENTICATED');
  });

  it('ignores a spoofed x-user-id header', async () => {
    const res = await api(h, '/api/brands', { headers: { 'x-user-id': 'admin-user-001' } });
    expect(res.status).toBe(401);
  });

  it('ignores a userId query parameter', async () => {
    const res = await api(h, '/api/brands?userId=admin-user-001');
    expect(res.status).toBe(401);
  });

  it('ignores a userId in the body', async () => {
    const res = await api(h, '/api/posts', {
      method: 'POST',
      body: { userId: 'admin-user-001', content: 'should not be created' }
    });
    expect(res.status).toBe(401);
  });

  it('rejects a token that was never issued', async () => {
    const res = await api(h, '/api/brands', { token: 'wss_not-a-real-token' });
    expect(res.status).toBe(401);
    expect(res.body.details?.code).toBe('SESSION_INVALID');
  });

  it('rejects a bearer value that is not a session token at all', async () => {
    const res = await api(h, '/api/brands', { token: 'Basic abc123' });
    expect(res.status).toBe(401);
  });
});

describe('endpoints that must stay public', () => {
  it('serves health without a session', async () => {
    const res = await api(h, '/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });

  it('accepts a sign-in attempt without a session', async () => {
    const res = await api(h, '/api/auth/login', {
      method: 'POST', body: { email: 'nobody@example.com', password: 'wrong' }
    });
    // Reached the handler and was refused on credentials, not on the gate.
    expect(res.status).toBe(401);
    expect(res.body.details?.code).toBe('BAD_CREDENTIALS');
  });

  it('accepts sign-out without a valid session', async () => {
    const res = await api(h, '/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});

describe('sign-in', () => {
  it('issues a usable token', async () => {
    const res = await api(h, '/api/auth/login', {
      method: 'POST', body: { email: user.email, password: user.password }
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^wss_/);

    const whoami = await api(h, '/api/auth/session', { token: res.body.token });
    expect(whoami.status).toBe(200);
    expect(whoami.body.user.email).toBe(user.email);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const unknown = await api(h, '/api/auth/login', {
      method: 'POST', body: { email: 'ghost@example.com', password: 'whatever' }
    });
    const wrong = await api(h, '/api/auth/login', {
      method: 'POST', body: { email: user.email, password: 'definitely-wrong' }
    });

    // Distinguishing them would confirm which accounts exist.
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.error).toBe(wrong.body.error);
  });

  it('is case-insensitive on the email', async () => {
    const res = await api(h, '/api/auth/login', {
      method: 'POST', body: { email: user.email.toUpperCase(), password: user.password }
    });
    expect(res.status).toBe(200);
  });
});

describe('session lifecycle', () => {
  it('stops accepting a token after sign-out', async () => {
    const fresh = await createUser(h, { email: `logout-${Date.now()}@example.com` });

    expect((await api(h, '/api/brands', { token: fresh.token })).status).toBe(200);
    await api(h, '/api/auth/logout', { method: 'POST', token: fresh.token });
    expect((await api(h, '/api/brands', { token: fresh.token })).status).toBe(401);
  });

  it('stops accepting a token once its session has expired', async () => {
    const fresh = await createUser(h, { email: `expiry-${Date.now()}@example.com` });
    const { sha256 } = await import('../src/server/crypto');

    h.db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
      .run(new Date(Date.now() - 1000).toISOString(), sha256(fresh.token));

    expect((await api(h, '/api/brands', { token: fresh.token })).status).toBe(401);
  });

  it('revokes every other session when the password changes', async () => {
    const fresh = await createUser(h, { email: `pwchange-${Date.now()}@example.com` });

    // A second sign-in, as if from another device.
    const second = await api(h, '/api/auth/login', {
      method: 'POST', body: { email: fresh.email, password: fresh.password }
    });
    const otherToken = second.body.token;

    const changed = await api(h, '/api/auth/change-password', {
      method: 'POST', token: fresh.token,
      body: { currentPassword: fresh.password, newPassword: 'A-Brand-New-Passw0rd!' }
    });
    expect(changed.status).toBe(200);

    // The other device is signed out; the caller gets a working replacement.
    expect((await api(h, '/api/brands', { token: otherToken })).status).toBe(401);
    expect((await api(h, '/api/brands', { token: changed.body.token })).status).toBe(200);
  });
});

describe('password policy', () => {
  it.each([
    ['too short', 'Short1!'],
    ['too few character classes', 'alllowercaseletters'],
    ['a single repeated character', 'aaaaaaaaaaaaaaaa']
  ])('refuses a password that is %s', async (_label, password) => {
    const fresh = await createUser(h, { email: `policy-${Math.random().toString(36).slice(2)}@example.com` });
    const res = await api(h, '/api/auth/change-password', {
      method: 'POST', token: fresh.token,
      body: { currentPassword: fresh.password, newPassword: password }
    });
    expect(res.status).toBe(400);
  });

  it('refuses the current password as the new one', async () => {
    const fresh = await createUser(h, { email: `same-${Date.now()}@example.com` });
    const res = await api(h, '/api/auth/change-password', {
      method: 'POST', token: fresh.token,
      body: { currentPassword: fresh.password, newPassword: fresh.password }
    });
    expect(res.status).toBe(400);
  });

  it('refuses a change when the current password is wrong', async () => {
    const fresh = await createUser(h, { email: `wrongcur-${Date.now()}@example.com` });
    const res = await api(h, '/api/auth/change-password', {
      method: 'POST', token: fresh.token,
      body: { currentPassword: 'not-the-password', newPassword: 'A-Perfectly-Fine-Passw0rd!' }
    });
    expect(res.status).toBe(401);
  });
});

describe('brute-force protection', () => {
  it('locks the account after repeated failures and keeps the real password out', async () => {
    const victim = await createUser(h, { email: `locked-${Date.now()}@example.com` });

    for (let i = 0; i < 9; i++) {
      await api(h, '/api/auth/login', {
        method: 'POST', body: { email: victim.email, password: `guess-${i}` }
      });
    }

    const locked = await api(h, '/api/auth/login', {
      method: 'POST', body: { email: victim.email, password: 'another-guess' }
    });
    expect(locked.status).toBe(429);
    expect(locked.body.details?.code).toBe('LOCKED_OUT');

    // The lockout must hold even for the correct password, or it is no defence.
    const correct = await api(h, '/api/auth/login', {
      method: 'POST', body: { email: victim.email, password: victim.password }
    });
    expect(correct.status).toBe(429);
  });

  it('does not lock an unrelated account', async () => {
    const bystander = await createUser(h, { email: `bystander-${Date.now()}@example.com` });
    const res = await api(h, '/api/auth/login', {
      method: 'POST', body: { email: bystander.email, password: bystander.password }
    });
    expect(res.status).toBe(200);
  });
});

describe('audit trail', () => {
  it('records a sign-in against the right actor', async () => {
    const fresh = await createUser(h, { email: `audited-${Date.now()}@example.com` });
    const res = await api(h, '/api/auth/audit', { token: fresh.token });

    expect(res.status).toBe(200);
    expect(res.body.scope).toBe('self');
    expect(res.body.entries.some((e: any) => e.action === 'auth.login' && e.actor === fresh.email)).toBe(true);
  });

  it('scopes a non-admin to their own entries', async () => {
    const a = await createUser(h, { email: `audit-a-${Date.now()}@example.com` });
    const b = await createUser(h, { email: `audit-b-${Date.now()}@example.com` });

    const res = await api(h, '/api/auth/audit', { token: b.token });
    expect(res.body.entries.every((e: any) => e.actor === b.email)).toBe(true);
    expect(res.body.entries.some((e: any) => e.actor === a.email)).toBe(false);
  });
});

describe('sensitive files', () => {
  it.each([
    '/.env',
    '/@fs/anywhere/.env',
    '/@fs/anywhere/.wotsocial-encryption-key',
    '/wotsocial.db'
  ])('refuses to serve %s', async (path) => {
    const res = await fetch(`${h.baseUrl}${path}`);
    expect(res.status).toBe(403);
  });
});
