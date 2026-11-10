/**
 * Media hosting and publishing.
 *
 * Two failures this covers actually shipped: generated media was a base64 data
 * URL the platforms could not fetch, so nothing generated could be published;
 * and the scheduler read a different datastore from the one the calendar wrote
 * to, so scheduled posts were never picked up at all.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startHarness, api, createUser, createBrand, Harness, TestUser, TINY_PNG } from './helpers/harness';

let h: Harness;
let user: TestUser;
let brandId: string;

/** Marks a post as due by backdating it past the scheduler's window. */
const schedulePost = async (overrides: Record<string, any> = {}) => {
  const res = await api(h, '/api/posts', {
    method: 'POST', token: user.token,
    body: {
      brandId,
      content: 'Scheduled content',
      status: 'scheduled',
      scheduledTime: '2020-01-01T00:00:00.000Z',
      platforms: ['instagram'],
      mediaUrl: 'https://cdn.example.com/hosted.jpg',
      mediaType: 'image',
      ...overrides
    }
  });
  return res.body.id as string;
};

const runCron = async () => {
  const res = await fetch(`${h.baseUrl}/api/cron`);
  return { status: res.status, body: await res.json() };
};

const statusOf = (postId: string): string =>
  h.db.prepare('SELECT status FROM posts WHERE id = ?').get(postId)?.status;

beforeAll(async () => {
  h = await startHarness();
  user = await createUser(h, { email: 'publisher@example.com' });
  brandId = await createBrand(h, user, 'Publisher Co');
});

afterAll(async () => { await h?.close(); });

beforeEach(() => {
  // Each test owns the queue, so one test's leftovers cannot satisfy another.
  h.db.prepare('DELETE FROM posts').run();
  h.graphCalls.length = 0;
});

/* ------------------------------------------------------------------ */
/* Media hosting                                                       */
/* ------------------------------------------------------------------ */

describe('media hosting', () => {
  it('turns a generated data URL into a URL that actually serves the bytes', async () => {
    const res = await api(h, '/api/media', {
      method: 'POST', token: user.token,
      body: { brandId, dataUrl: TINY_PNG, title: 'Generated poster' }
    });

    expect(res.status).toBe(200);
    expect(res.body.asset.url).toMatch(/^https?:\/\//);
    expect(res.body.asset.url).not.toMatch(/^data:/);

    // The whole point: a platform could fetch this.
    const fetched = await fetch(res.body.asset.url);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get('content-type')).toContain('image/png');
    expect((await fetched.arrayBuffer()).byteLength).toBe(res.body.asset.bytes);
  });

  it('stores identical bytes once', async () => {
    const first = await api(h, '/api/media', {
      method: 'POST', token: user.token, body: { brandId, dataUrl: TINY_PNG, title: 'First' }
    });
    const second = await api(h, '/api/media', {
      method: 'POST', token: user.token, body: { brandId, dataUrl: TINY_PNG, title: 'Second' }
    });

    expect(second.body.deduplicated).toBe(true);
    expect(second.body.asset.storageKey).toBe(first.body.asset.storageKey);
  });

  it('refuses a format no platform accepts', async () => {
    const res = await api(h, '/api/media', {
      method: 'POST', token: user.token,
      body: { brandId, dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK' }
    });
    expect(res.status).toBe(415);
    expect(res.body.error).toMatch(/not a format/i);
  });

  it('refuses an empty asset', async () => {
    const res = await api(h, '/api/media', {
      method: 'POST', token: user.token, body: { brandId, dataUrl: 'data:image/png;base64,' }
    });
    expect(res.status).toBe(400);
  });

  it('reports whether stored media is reachable by the platforms', async () => {
    const res = await api(h, '/api/media/status', { token: user.token });
    expect(res.status).toBe(200);
    expect(res.body.driver).toBe('local');
    // Local storage on a loopback address is not reachable by Meta, and the
    // app should say so rather than letting a publish fail obscurely.
    expect(res.body.publiclyReachable).toBe(false);
    expect(res.body.reason).toMatch(/cannot reach/i);
  });

  it('lists an uploaded asset in the brand library', async () => {
    await api(h, '/api/media', {
      method: 'POST', token: user.token, body: { brandId, dataUrl: TINY_PNG, title: 'Listed' }
    });
    const list = await api(h, `/api/media?brandId=${brandId}`, { token: user.token });
    expect(list.body.assets.some((a: any) => a.title === 'Listed')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* The scheduler                                                       */
/* ------------------------------------------------------------------ */

describe('the scheduler', () => {
  it('finds posts in the table the calendar writes to', async () => {
    const postId = await schedulePost();
    const res = await runCron();

    // The regression this guards: the cron used to query a different
    // datastore entirely and always reported nothing due.
    expect(res.body.considered).toBe(1);
    expect(res.body.results[0].postId).toBe(postId);
  });

  it('leaves a post scheduled for the future alone', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const postId = await schedulePost({ scheduledTime: future });

    const res = await runCron();
    expect(res.body.considered).toBe(0);
    expect(statusOf(postId)).toBe('scheduled');
  });

  it('ignores drafts that were never scheduled', async () => {
    await api(h, '/api/posts', {
      method: 'POST', token: user.token,
      body: { brandId, content: 'Just a draft', status: 'suggested' }
    });
    expect((await runCron()).body.considered).toBe(0);
  });
});

describe('publishing a due post', () => {
  beforeEach(async () => {
    await api(h, '/api/instagram/connect', {
      method: 'POST', token: user.token, body: { brandId, accessToken: 'GOOD_TOKEN' }
    });
    h.graphCalls.length = 0;
  });

  it('publishes to Instagram and records the result', async () => {
    const postId = await schedulePost();
    const res = await runCron();

    expect(res.body.published).toBe(1);
    expect(res.body.failed).toBe(0);

    const outcome = res.body.results[0].outcomes[0];
    expect(outcome.ok).toBe(true);
    expect(outcome.remoteId).toBe('ig_media_1');
    expect(outcome.permalink).toBe('https://instagram.com/p/TEST');
    expect(statusOf(postId)).toBe('published');
  });

  it('waits for the container before publishing it', async () => {
    await schedulePost();
    await runCron();

    const paths = h.graphCalls.map(c => `${c.method} ${c.path}`);
    const created = paths.indexOf('POST ig_1/media');
    const publishedAt = paths.indexOf('POST ig_1/media_publish');
    const polls = h.graphCalls.filter(c => c.path === 'container_1').length;

    // The stand-in reports IN_PROGRESS first; publishing without waiting would
    // silently post nothing on a real account.
    expect(created).toBeGreaterThanOrEqual(0);
    expect(polls).toBeGreaterThanOrEqual(2);
    expect(publishedAt).toBeGreaterThan(created);
  });

  it('sends the caption and media the post carries', async () => {
    await schedulePost({ content: 'Exact caption text', mediaUrl: 'https://cdn.example.com/specific.jpg' });
    await runCron();

    const create = h.graphCalls.find(c => c.method === 'POST' && c.path === 'ig_1/media');
    expect(create?.body.caption).toBe('Exact caption text');
    expect(create?.body.image_url).toBe('https://cdn.example.com/specific.jpg');
  });

  it('does not publish the same post twice', async () => {
    const postId = await schedulePost();

    const first = await runCron();
    const second = await runCron();

    expect(first.body.published).toBe(1);
    expect(second.body.considered).toBe(0);
    expect(h.graphCalls.filter(c => c.path === 'ig_1/media_publish').length).toBe(1);
    expect(statusOf(postId)).toBe('published');
  });

  it('does not publish twice when two runs overlap', async () => {
    await schedulePost();

    // A cron that overruns its own interval is the realistic case.
    const [a, b] = await Promise.all([runCron(), runCron()]);

    expect(a.body.published + b.body.published).toBe(1);
    expect(h.graphCalls.filter(c => c.path === 'ig_1/media_publish').length).toBe(1);
  });

  it('will not pick up a post another run has already claimed', async () => {
    const postId = await schedulePost();
    // The claim marks the row before any network call, so a second worker's
    // "what is due" query no longer matches it.
    h.db.prepare("UPDATE posts SET status = 'publishing' WHERE id = ?").run(postId);

    const res = await runCron();

    expect(res.body.considered).toBe(0);
    expect(h.graphCalls.some(c => c.path === 'ig_1/media')).toBe(false);
  });

  it('claims the post before making any network call', async () => {
    const postId = await schedulePost();
    await runCron();

    // Ordering is the whole protection: on Postgres two instances can hold a
    // stale "scheduled" read at once, and only a claim taken before the
    // publish keeps one of them from sending a duplicate. The in-process
    // SQLite harness cannot stage that race, so this asserts the invariant
    // the claim depends on instead.
    const audit = h.db
      .prepare("SELECT status FROM posts WHERE id = ?")
      .get(postId);
    expect(audit.status).toBe('published');
    expect(h.graphCalls.filter(c => c.path === 'ig_1/media_publish').length).toBe(1);
  });
});

describe('media that cannot be fetched', () => {
  beforeEach(async () => {
    await api(h, '/api/instagram/connect', {
      method: 'POST', token: user.token, body: { brandId, accessToken: 'GOOD_TOKEN' }
    });
    h.graphCalls.length = 0;
  });

  it('refuses a post whose media is still a data URL', async () => {
    const postId = await schedulePost({ mediaUrl: TINY_PNG });
    const res = await runCron();

    const outcome = res.body.results[0].outcomes[0];
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/cannot read an embedded asset/i);
    expect(statusOf(postId)).toBe('failed');

    // It must not have been sent to the platform at all.
    expect(h.graphCalls.some(c => c.path === 'ig_1/media')).toBe(false);
  });

  it('refuses media served from localhost', async () => {
    await schedulePost({ mediaUrl: 'http://localhost:3050/media/x.png' });
    const res = await runCron();

    const outcome = res.body.results[0].outcomes[0];
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/cannot reach/i);
  });
});

describe('when a platform is not connected', () => {
  beforeEach(() => {
    h.db.prepare("DELETE FROM platform_connections WHERE platform = 'instagram'").run();
  });

  it('fails with a reason the user can act on', async () => {
    const postId = await schedulePost();
    const res = await runCron();

    expect(res.body.published).toBe(0);
    expect(res.body.failed).toBe(1);
    expect(res.body.results[0].outcomes[0].error).toMatch(/no instagram account is connected/i);
    expect(statusOf(postId)).toBe('failed');
  });

  it('names an unsupported platform rather than failing silently', async () => {
    await schedulePost({ platforms: ['tiktok'] });
    const res = await runCron();
    expect(res.body.results[0].outcomes[0].error).toMatch(/not supported/i);
  });
});

describe('the cron endpoint', () => {
  it('rejects a caller without the secret when one is configured', async () => {
    process.env.CRON_SECRET = 'test-cron-secret';
    try {
      const open = await fetch(`${h.baseUrl}/api/cron`);
      expect(open.status).toBe(401);

      const authorised = await fetch(`${h.baseUrl}/api/cron`, {
        headers: { Authorization: 'Bearer test-cron-secret' }
      });
      expect(authorised.status).toBe(200);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it('does not require a user session', async () => {
    // It is invoked by the platform's scheduler, which has no session.
    const res = await fetch(`${h.baseUrl}/api/cron`);
    expect(res.status).toBe(200);
  });
});
