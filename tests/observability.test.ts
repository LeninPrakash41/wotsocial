/**
 * Logging and rate limiting.
 *
 * The server logged with bare console calls — no severity, no request
 * correlation, and secrets printed verbatim whenever an object was dumped —
 * and nothing bounded how fast a caller could hit the API.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startHarness, api, createUser, createBrand, Harness, TestUser, TINY_PNG } from './helpers/harness';
import { redact, metricsSnapshot, resetMetrics, countEvent, observeDuration } from '../src/server/logging';
import { resetRateLimits } from '../src/server/rateLimit';

let h: Harness;
let user: TestUser;
let brandId: string;

beforeAll(async () => {
  h = await startHarness();
  user = await createUser(h, { email: 'observer@example.com' });
  brandId = await createBrand(h, user, 'Observed Co');
});

afterAll(async () => { await h?.close(); });

describe('secret redaction', () => {
  it.each([
    ['access_token', { access_token: 'EAAGabc123' }],
    ['accessToken', { accessToken: 'anything' }],
    ['applicationPassword', { applicationPassword: 'xxxx yyyy' }],
    ['authorization', { authorization: 'Bearer abc' }],
    ['appsecret_proof', { appsecret_proof: 'deadbeef' }],
    ['apiKey', { apiKey: 'sk-live-1' }],
    ['client_secret', { client_secret: 'shh' }]
  ])('redacts a field named %s', (_label, input) => {
    expect(JSON.stringify(redact(input))).not.toContain('EAAGabc123');
    expect(JSON.stringify(redact(input))).toContain('[redacted]');
  });

  it('redacts tokens by their shape even under an innocent key', () => {
    const out = JSON.stringify(redact({ note: 'wss_abcdefghijklmnop', other: 'EAAGsomethinglong' }));
    expect(out).not.toContain('wss_abcdefghijklmnop');
    expect(out).not.toContain('EAAGsomethinglong');
  });

  it('redacts secrets nested inside objects and arrays', () => {
    const out = JSON.stringify(redact({
      connection: { metadata: { nested: { access_token: 'EAAGdeep' } } },
      list: [{ password: 'hunter2' }]
    }));
    expect(out).not.toContain('EAAGdeep');
    expect(out).not.toContain('hunter2');
  });

  it('leaves ordinary values alone', () => {
    const out = redact({ brandName: 'Acme', count: 7, ok: true }) as any;
    expect(out.brandName).toBe('Acme');
    expect(out.count).toBe(7);
    expect(out.ok).toBe(true);
  });

  it('keeps an error readable', () => {
    const out = redact(new Error('something broke')) as any;
    expect(out.message).toBe('something broke');
    expect(out.name).toBe('Error');
  });

  it('does not recurse forever on a cycle', () => {
    const cyclic: any = { name: 'root' };
    cyclic.self = cyclic;
    expect(() => JSON.stringify(redact(cyclic))).not.toThrow();
  });
});

describe('request correlation', () => {
  it('returns a request id on every response', async () => {
    const res = await fetch(`${h.baseUrl}/api/health`);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('echoes a caller-supplied request id so a trace can be followed end to end', async () => {
    const res = await fetch(`${h.baseUrl}/api/health`, {
      headers: { 'x-request-id': 'trace-me-12345' }
    });
    expect(res.headers.get('x-request-id')).toBe('trace-me-12345');
  });

  it('gives different requests different ids', async () => {
    const [a, b] = await Promise.all([
      fetch(`${h.baseUrl}/api/health`),
      fetch(`${h.baseUrl}/api/health`)
    ]);
    expect(a.headers.get('x-request-id')).not.toBe(b.headers.get('x-request-id'));
  });
});

describe('metrics', () => {
  beforeEach(() => resetMetrics());

  it('counts events and summarises durations', () => {
    countEvent('test.thing');
    countEvent('test.thing', 2);
    observeDuration('test.op', 10);
    observeDuration('test.op', 30);

    const snap = metricsSnapshot();
    expect(snap.counters['test.thing']).toBe(3);
    expect(snap.durations['test.op'].count).toBe(2);
    expect(snap.durations['test.op'].p50).toBeGreaterThan(0);
  });

  it('is served to a signed-in caller', async () => {
    const res = await api(h, '/api/metrics', { token: user.token });
    expect(res.status).toBe(200);
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(res.body.memory.rssMb).toBeGreaterThan(0);
  });

  it('is not public', async () => {
    const res = await api(h, '/api/metrics');
    expect(res.status).toBe(401);
  });
});

describe('rate limiting', () => {
  // The limiter is off for the rest of the suite, since every helper that
  // signs a user in would otherwise count against it.
  beforeEach(() => {
    resetRateLimits();
    delete process.env.RATE_LIMIT_DISABLED;
  });
  afterAll(() => { process.env.RATE_LIMIT_DISABLED = 'true'; });

  it('advertises the limit on a normal response', async () => {
    const res = await fetch(`${h.baseUrl}/api/brands`, {
      headers: { Authorization: `Bearer ${user.token}` }
    });
    expect(res.headers.get('RateLimit-Limit')).toBeTruthy();
    expect(Number(res.headers.get('RateLimit-Remaining'))).toBeGreaterThanOrEqual(0);
    // Says plainly that the limit is per instance, not fleet-wide.
    expect(res.headers.get('RateLimit-Policy')).toContain('scope=instance');
  });

  it('blocks sign-in flooding from one address', async () => {
    let blocked = 0;
    for (let i = 0; i < 40; i++) {
      const res = await api(h, '/api/auth/login', {
        method: 'POST', body: { email: `spray-${i}@example.com`, password: 'guess' }
      });
      if (res.status === 429) blocked++;
    }

    // Spraying one password across many accounts sidesteps the per-account
    // lockout, so the address-level limit is what stops it.
    expect(blocked).toBeGreaterThan(0);
  });

  it('tells a blocked caller when to come back', async () => {
    for (let i = 0; i < 40; i++) {
      await api(h, '/api/auth/login', { method: 'POST', body: { email: 'x@y.z', password: 'n' } });
    }
    const res = await fetch(`${h.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'x@y.z', password: 'n' })
    });

    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await res.json()).details.code).toBe('RATE_LIMITED');
  });

  it('counts the broad limit per user rather than per address', async () => {
    const other = await createUser(h, { email: `separate-${Date.now()}@example.com` });
    resetRateLimits();

    // Burning one user's allowance must not affect another on the same IP.
    for (let i = 0; i < 20; i++) {
      await api(h, '/api/brands', { token: user.token });
    }
    const theirs = await fetch(`${h.baseUrl}/api/brands`, {
      headers: { Authorization: `Bearer ${other.token}` }
    });

    expect(theirs.status).toBe(200);
    expect(Number(theirs.headers.get('RateLimit-Remaining')))
      .toBeGreaterThan(Number(theirs.headers.get('RateLimit-Limit')) - 20);
  });

  it('does not throttle webhooks or the scheduler', async () => {
    // Meta calls webhooks at a rate we do not control, and throttling the
    // cron would silently stop scheduled posts going out.
    for (let i = 0; i < 40; i++) await fetch(`${h.baseUrl}/api/cron`);
    const res = await fetch(`${h.baseUrl}/api/cron`);
    expect(res.status).toBe(200);
  });

  it('applies a tighter limit where a call costs money', async () => {
    resetRateLimits();
    let blocked = 0;
    let firstRejection = 0;

    // Publishing is rejected for other reasons here — there is no connected
    // account — but the limiter runs first, which is what is under test.
    for (let i = 0; i < 45; i++) {
      const res = await api(h, '/api/instagram/publish', {
        method: 'POST', token: user.token,
        body: { brandId, mediaUrl: 'https://cdn.example.com/x.jpg', caption: `burst-${i}` }
      });
      if (res.status === 429) {
        blocked++;
        if (!firstRejection) firstRejection = i;
      }
    }

    expect(blocked).toBeGreaterThan(0);
    // Noticeably tighter than the broad API ceiling, because the cost of a
    // runaway loop here is a bill rather than a slow response.
    expect(firstRejection).toBeLessThan(40);
  });

  it('allows a normal burst of uploads before throttling', async () => {
    resetRateLimits();
    const results: number[] = [];

    for (let i = 0; i < 10; i++) {
      const res = await api(h, '/api/media', {
        method: 'POST', token: user.token,
        body: { brandId, dataUrl: TINY_PNG, title: `upload-${i}` }
      });
      results.push(res.status);
    }

    // Uploading a batch of generated posters must not trip the limiter.
    expect(results.every(s => s === 200)).toBe(true);
  });
});
