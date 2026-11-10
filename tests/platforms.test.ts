/**
 * Google Ads, TikTok and YouTube.
 *
 * Google Ads was export-only — the agent wrote the copy and a human pasted it
 * into Ads Editor — and TikTok and YouTube did not exist at all.
 *
 * These run against a stand-in, which verifies how the requests are built and
 * how failures are handled, but not the real services. The shapes come from
 * each vendor's documentation; a live account is still needed to confirm them
 * end to end.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startHarness, api, createUser, createBrand, Harness, TestUser } from './helpers/harness';

let h: Harness;
let user: TestUser;
let brandId: string;

const connectGoogleAds = () => api(h, '/api/google-ads/connect', {
  method: 'POST', token: user.token,
  body: { brandId, refreshToken: 'GOOD_REFRESH', customerId: '123-456-7890' }
});

const failNextMutate = (resource: string | null) =>
  fetch(`${h.graphUrl}/__stub/google-ads-fail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resource })
  });

const hostedVideo = () => `${h.graphUrl}/__stub/video.mp4`;

beforeAll(async () => {
  h = await startHarness();
  user = await createUser(h, { email: 'platforms@example.com', role: 'admin' });
  brandId = await createBrand(h, user, 'Multi Platform Co');
});

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  await failNextMutate(null);
  h.db.prepare("DELETE FROM platform_connections WHERE platform IN ('google_ads','tiktok','youtube')").run();
  h.db.prepare('DELETE FROM google_campaigns').run();
  h.db.prepare('DELETE FROM video_publications').run();
  h.db.prepare('DELETE FROM brand_policies').run();
  h.graphCalls.length = 0;
});

/* ================================================================== */
/* Google Ads                                                          */
/* ================================================================== */

describe('Google Ads connection', () => {
  it('reports whether the server is configured for it', async () => {
    const res = await api(h, '/api/google-ads/status', { token: user.token });
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
  });

  it('verifies the credential against the account before storing it', async () => {
    const res = await connectGoogleAds();
    expect(res.status).toBe(200);
    expect(res.body.account.id).toBe('1234567890');

    // The dashes customers copy from the Google UI must not be sent on.
    const searched = h.graphCalls.find(c => c.path.includes('googleAds:search'));
    expect(searched?.path).toContain('1234567890');
    expect(searched?.path).not.toContain('123-456');
  });

  it('refuses a revoked refresh token', async () => {
    const res = await api(h, '/api/google-ads/connect', {
      method: 'POST', token: user.token,
      body: { brandId, refreshToken: 'BAD_REFRESH', customerId: '1234567890' }
    });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/revoked|rejected/i);
  });

  it('lists the accounts a credential can reach', async () => {
    const res = await api(h, '/api/google-ads/discover', {
      method: 'POST', token: user.token, body: { brandId, refreshToken: 'GOOD_REFRESH' }
    });
    expect(res.body.customerIds).toContain('1234567890');
  });

  it('refuses to launch without a connection', async () => {
    const res = await api(h, '/api/google-ads/campaigns', {
      method: 'POST', token: user.token, body: { brandId, name: 'X', dailyBudget: 10 }
    });
    expect(res.status).toBe(409);
  });
});

describe('Google Ads campaign creation', () => {
  beforeEach(async () => { await connectGoogleAds(); h.graphCalls.length = 0; });

  const validCampaign = {
    name: 'Search — Q1',
    dailyBudget: 50,
    finalUrl: 'https://example.com/landing',
    headlines: ['Scale your ops', 'Cut MTTR fast', 'Try it free', 'Trusted by teams'],
    descriptions: ['Resolve incidents in seconds, not hours.', 'Start a free trial today.'],
    keywords: ['+incident response', '"kubernetes monitoring"'],
    negativeKeywords: ['-free', '-jobs']
  };

  it('creates the full chain and returns paused', async () => {
    const res = await api(h, '/api/google-ads/campaigns', {
      method: 'POST', token: user.token, body: { brandId, ...validCampaign }
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAUSED');
    expect(res.body.activated).toBe(false);

    const mutated = h.graphCalls.filter(c => c.path.includes(':mutate')).map(c => c.path);
    // Budget first, because the campaign references it.
    expect(mutated[0]).toContain('campaignBudgets:mutate');
    expect(mutated.some(p => p.includes('campaigns:mutate'))).toBe(true);
    expect(mutated.some(p => p.includes('adGroups:mutate'))).toBe(true);
    expect(mutated.some(p => p.includes('adGroupAds:mutate'))).toBe(true);
    expect(mutated.some(p => p.includes('adGroupCriteria:mutate'))).toBe(true);
  });

  it('sends the budget in micros', async () => {
    await api(h, '/api/google-ads/campaigns', {
      method: 'POST', token: user.token, body: { brandId, ...validCampaign, dailyBudget: 50 }
    });

    const budget = h.graphCalls.find(c => c.path.includes('campaignBudgets:mutate'));
    expect(budget?.body.operations[0].create.amountMicros).toBe(50_000_000);
  });

  it('trims copy to the limits Google enforces', async () => {
    await api(h, '/api/google-ads/campaigns', {
      method: 'POST', token: user.token,
      body: {
        brandId, ...validCampaign,
        headlines: ['x'.repeat(60), 'Fine headline', 'Another one'],
        descriptions: ['y'.repeat(200), 'Short enough description.']
      }
    });

    const ad = h.graphCalls.find(c => c.path.includes('adGroupAds:mutate'));
    const rsa = ad?.body.operations[0].create.ad.responsiveSearchAd;
    // Google rejects the whole mutate over one long string, so trimming beats
    // failing the launch.
    expect(rsa.headlines[0].text.length).toBeLessThanOrEqual(30);
    expect(rsa.descriptions[0].text.length).toBeLessThanOrEqual(90);
  });

  it('reads the match type from the keyword syntax', async () => {
    await api(h, '/api/google-ads/campaigns', {
      method: 'POST', token: user.token,
      body: { brandId, ...validCampaign, keywords: ['[exact term]', '"phrase term"', 'broad term'] }
    });

    const criteria = h.graphCalls.find(c => c.path.includes('adGroupCriteria:mutate'));
    const types = criteria?.body.operations.map((o: any) => o.create.keyword?.matchType);
    expect(types).toContain('EXACT');
    expect(types).toContain('PHRASE');
    expect(types).toContain('BROAD');
  });

  it('marks negative keywords as negative', async () => {
    await api(h, '/api/google-ads/campaigns', {
      method: 'POST', token: user.token, body: { brandId, ...validCampaign }
    });

    const criteria = h.graphCalls.find(c => c.path.includes('adGroupCriteria:mutate'));
    const negatives = criteria?.body.operations.filter((o: any) => o.create.negative === true);
    expect(negatives.length).toBe(2);
    expect(negatives[0].create.keyword.text).not.toMatch(/^-/);
  });

  it.each([
    ['too few headlines', { headlines: ['Only one', 'Two'] }],
    ['too few descriptions', { descriptions: ['Only one.'] }],
    ['no final URL', { finalUrl: undefined }],
    ['no budget', { dailyBudget: undefined }]
  ])('refuses a campaign with %s', async (_label, override) => {
    const res = await api(h, '/api/google-ads/campaigns', {
      method: 'POST', token: user.token, body: { brandId, ...validCampaign, ...override }
    });
    expect(res.status).toBe(400);
  });

  it('rolls back what it created when a later step fails', async () => {
    await failNextMutate('adGroupAds');

    const res = await api(h, '/api/google-ads/campaigns', {
      method: 'POST', token: user.token, body: { brandId, ...validCampaign }
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/budget amount is too low/i);

    // The budget, campaign and ad group were created before the failure and
    // must not be left behind in the account.
    const removals = h.graphCalls.filter(c =>
      c.path.includes(':mutate') && JSON.stringify(c.body).includes('"remove"'));
    expect(removals.length).toBeGreaterThanOrEqual(3);
    expect(res.body.details.rolledBack.length).toBeGreaterThanOrEqual(3);
  });

  it('honours the brand spending policy', async () => {
    await api(h, '/api/governance/policy', {
      method: 'PUT', token: user.token, body: { brandId, maxCampaignDailyBudget: 20 }
    });

    const res = await api(h, '/api/google-ads/campaigns', {
      method: 'POST', token: user.token, body: { brandId, ...validCampaign, dailyBudget: 500 }
    });

    // The same guard as Meta: one policy covers every ad platform.
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/exceeds this brand/i);
  });

  it('reads performance back with cost converted from micros', async () => {
    const res = await api(h, `/api/google-ads/campaigns?brandId=${brandId}`, { token: user.token });
    expect(res.status).toBe(200);
    expect(res.body.campaigns[0].spent).toBe(24);
    expect(res.body.campaigns[0].cpc).toBe(0.3);
  });

  it('blocks resuming a campaign once the spend cap is reached', async () => {
    const created = await api(h, '/api/google-ads/campaigns', {
      method: 'POST', token: user.token, body: { brandId, ...validCampaign }
    });

    await api(h, '/api/governance/policy', {
      method: 'PUT', token: user.token, body: { brandId, dailySpendCap: 100 }
    });
    const today = new Date().toISOString().slice(0, 10);
    h.db.prepare(
      `INSERT OR REPLACE INTO spend_events (id,brand_id,campaign_id,amount,currency,recorded_for,source,created_at)
       VALUES (?,?,?,?,'USD',?,'test',?)`
    ).run(`s_${brandId}_g_${today}`, brandId, 'g', '150', today, new Date().toISOString());

    const res = await api(h, `/api/google-ads/campaigns/${created.body.campaignId}/status`, {
      method: 'POST', token: user.token, body: { brandId, status: 'ENABLED' }
    });
    expect(res.status).toBe(403);
  });
});

/* ================================================================== */
/* TikTok                                                              */
/* ================================================================== */

const connectTikTok = () => api(h, '/api/video/tiktok/connect', {
  method: 'POST', token: user.token, body: { brandId, accessToken: 'GOOD_TT_TOKEN' }
});

describe('TikTok', () => {
  it('verifies the token and stores the creator', async () => {
    const res = await connectTikTok();
    expect(res.status).toBe(200);
    expect(res.body.profile.displayName).toBe('Stub Creator');
  });

  it('refuses an invalid token', async () => {
    const res = await api(h, '/api/video/tiktok/connect', {
      method: 'POST', token: user.token, body: { brandId, accessToken: 'BAD_TOKEN' }
    });
    expect(res.status).toBe(401);
  });

  it('sends to the creator inbox by default rather than posting publicly', async () => {
    await connectTikTok();
    const res = await api(h, '/api/video/tiktok/publish', {
      method: 'POST', token: user.token,
      body: { brandId, videoUrl: hostedVideo(), caption: 'Hello TikTok' }
    });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('inbox_draft');
    expect(h.graphCalls.some(c => c.path.includes('inbox/video/init'))).toBe(true);
  });

  it('posts directly only when explicitly asked, and defaults to private', async () => {
    await connectTikTok();
    const res = await api(h, '/api/video/tiktok/publish', {
      method: 'POST', token: user.token,
      body: { brandId, videoUrl: hostedVideo(), caption: 'Direct', directPost: true }
    });

    expect(res.body.mode).toBe('direct_post');
    const init = h.graphCalls.find(c => c.path.includes('post/publish/video/init'));
    // Pushing to someone's followers is a decision, not a default.
    expect(init?.body.post_info.privacy_level).toBe('SELF_ONLY');
  });

  it('surfaces the unverified-domain error plainly', async () => {
    await connectTikTok();
    const res = await api(h, '/api/video/tiktok/publish', {
      method: 'POST', token: user.token,
      body: { brandId, videoUrl: `${h.graphUrl}/unverified/video.mp4`, directPost: true }
    });

    // The commonest reason a correct-looking TikTok call fails.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toMatch(/not verified/i);
  });

  it('refuses a data URL', async () => {
    await connectTikTok();
    const res = await api(h, '/api/video/tiktok/publish', {
      method: 'POST', token: user.token,
      body: { brandId, videoUrl: 'data:video/mp4;base64,AAAA' }
    });
    expect(res.status).toBe(400);
  });

  it('refuses a localhost URL when the production guard is in force', async () => {
    await connectTikTok();
    // The harness relaxes this so stand-in fixtures can be fetched; the guard
    // itself is what is under test here.
    delete process.env.ALLOW_LOOPBACK_MEDIA;
    try {
      const res = await api(h, '/api/video/tiktok/publish', {
        method: 'POST', token: user.token,
        body: { brandId, videoUrl: 'http://localhost:3050/media/x.mp4' }
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot reach/i);
    } finally {
      process.env.ALLOW_LOOPBACK_MEDIA = 'true';
    }
  });

  it('reports processing status', async () => {
    await connectTikTok();
    const res = await api(h, `/api/video/tiktok/status/tt_publish_inbox_1?brandId=${brandId}`, { token: user.token });
    expect(res.body.status).toBe('PUBLISH_COMPLETE');
  });
});

/* ================================================================== */
/* YouTube                                                             */
/* ================================================================== */

const connectYouTube = () => api(h, '/api/video/youtube/connect', {
  method: 'POST', token: user.token, body: { brandId, refreshToken: 'GOOD_REFRESH' }
});

describe('YouTube', () => {
  it('connects to the channel behind the credential', async () => {
    const res = await connectYouTube();
    expect(res.status).toBe(200);
    expect(res.body.channel.title).toBe('Stub Channel');
  });

  it('refuses a revoked credential', async () => {
    const res = await api(h, '/api/video/youtube/connect', {
      method: 'POST', token: user.token, body: { brandId, refreshToken: 'BAD_REFRESH' }
    });
    expect(res.status).toBe(401);
  });

  it('uploads as private unless told otherwise', async () => {
    await connectYouTube();
    const res = await api(h, '/api/video/youtube/publish', {
      method: 'POST', token: user.token,
      body: { brandId, videoUrl: hostedVideo(), title: 'Stub upload', description: 'Body' }
    });

    expect(res.status).toBe(200);
    expect(res.body.privacyStatus).toBe('private');
    expect(res.body.videoId).toBe('yt_video_1');
    expect(res.body.permalink).toBe('https://youtu.be/yt_video_1');
  });

  it('accepts an explicit visibility', async () => {
    await connectYouTube();
    const res = await api(h, '/api/video/youtube/publish', {
      method: 'POST', token: user.token,
      body: { brandId, videoUrl: hostedVideo(), title: 'Public one', privacyStatus: 'unlisted' }
    });
    expect(res.body.privacyStatus).toBe('unlisted');
  });

  it('ignores a visibility it does not recognise rather than guessing', async () => {
    await connectYouTube();
    const res = await api(h, '/api/video/youtube/publish', {
      method: 'POST', token: user.token,
      body: { brandId, videoUrl: hostedVideo(), title: 'Odd', privacyStatus: 'everyone-forever' }
    });
    expect(res.body.privacyStatus).toBe('private');
  });

  it('trims a title to the limit YouTube enforces', async () => {
    await connectYouTube();
    await api(h, '/api/video/youtube/publish', {
      method: 'POST', token: user.token,
      body: { brandId, videoUrl: hostedVideo(), title: 'T'.repeat(250) }
    });

    const init = h.graphCalls.find(c => c.path.includes('upload/youtube/v3/videos'));
    expect(init?.body.snippet.title.length).toBeLessThanOrEqual(100);
  });

  it('fails before opening an upload session when the video cannot be fetched', async () => {
    await connectYouTube();
    const res = await api(h, '/api/video/youtube/publish', {
      method: 'POST', token: user.token,
      body: { brandId, videoUrl: `${h.graphUrl}/__stub/missing.mp4`, title: 'Missing' }
    });

    expect(res.status).toBe(502);
    // Failing first costs nothing; failing after would leave a dangling session.
    expect(h.graphCalls.some(c => c.path.includes('upload/youtube/v3/videos'))).toBe(false);
  });

  it('requires a title', async () => {
    await connectYouTube();
    const res = await api(h, '/api/video/youtube/publish', {
      method: 'POST', token: user.token, body: { brandId, videoUrl: hostedVideo() }
    });
    expect(res.status).toBe(400);
  });
});

describe('video publication history', () => {
  it('records what was sent, to which platform', async () => {
    await connectTikTok();
    await connectYouTube();

    await api(h, '/api/video/tiktok/publish', {
      method: 'POST', token: user.token, body: { brandId, videoUrl: hostedVideo(), caption: 'TT' }
    });
    await api(h, '/api/video/youtube/publish', {
      method: 'POST', token: user.token, body: { brandId, videoUrl: hostedVideo(), title: 'YT' }
    });

    const res = await api(h, `/api/video/publications?brandId=${brandId}`, { token: user.token });
    const platforms = res.body.publications.map((p: any) => p.platform);
    expect(platforms).toContain('tiktok');
    expect(platforms).toContain('youtube');
  });

  it('is scoped to the brand', async () => {
    const outsider = await createUser(h, { email: `outsider-${Date.now()}@example.com` });
    const res = await api(h, `/api/video/publications?brandId=${brandId}`, { token: outsider.token });
    expect(res.status).toBe(404);
  });
});
