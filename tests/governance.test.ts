/**
 * Approval workflow and spending guardrails.
 *
 * Neither existed: anyone with access could publish straight to a client's
 * audience with no second pair of eyes, and the only spending control was
 * that campaigns were created paused — which stops nothing once one is live.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startHarness, api, createUser, createBrand, Harness, TestUser } from './helpers/harness';

let h: Harness;
let author: TestUser;
let reviewer: TestUser;
let brandId: string;

const schedulePost = async (content = 'Needs review', scheduledTime = '2020-01-01T00:00:00.000Z') => {
  const res = await api(h, '/api/posts', {
    method: 'POST', token: author.token,
    body: {
      brandId, content, status: 'scheduled', scheduledTime,
      platforms: ['instagram'], mediaUrl: 'https://cdn.example.com/a.jpg', mediaType: 'image'
    }
  });
  return res.body.id as string;
};

const setPolicy = (patch: Record<string, unknown>, token = reviewer.token) =>
  api(h, '/api/governance/policy', { method: 'PUT', token, body: { brandId, ...patch } });

const runCron = async () => {
  const res = await fetch(`${h.baseUrl}/api/cron`);
  return res.json();
};

const statusOf = (postId: string) =>
  h.db.prepare('SELECT status FROM posts WHERE id = ?').get(postId)?.status;

beforeAll(async () => {
  h = await startHarness();
  // The reviewer is the admin, because the default approver role is admin and
  // the brand has to belong to someone who can also review for it.
  reviewer = await createUser(h, { email: 'reviewer@example.com', role: 'admin' });
  author = await createUser(h, { email: 'author@example.com', role: 'admin' });
  brandId = await createBrand(h, author, 'Governed Co');
});

afterAll(async () => { await h?.close(); });

beforeEach(async () => {
  h.db.prepare('DELETE FROM posts').run();
  h.db.prepare('DELETE FROM approvals').run();
  h.db.prepare('DELETE FROM spend_events').run();
  h.db.prepare('DELETE FROM brand_policies').run();
});

/* ------------------------------------------------------------------ */
/* Policy                                                              */
/* ------------------------------------------------------------------ */

describe('brand policy', () => {
  it('defaults to no approval and no caps, so existing brands are unaffected', async () => {
    const res = await api(h, `/api/governance/policy?brandId=${brandId}`, { token: author.token });
    expect(res.body.policy.requireApproval).toBe(false);
    expect(res.body.policy.dailySpendCap).toBeNull();
  });

  it('stores what was set', async () => {
    await setPolicy({ requireApproval: true, dailySpendCap: 100, monthlySpendCap: 2000 });
    const res = await api(h, `/api/governance/policy?brandId=${brandId}`, { token: author.token });

    expect(res.body.policy.requireApproval).toBe(true);
    expect(res.body.policy.dailySpendCap).toBe(100);
    expect(res.body.policy.monthlySpendCap).toBe(2000);
  });

  it('refuses a daily cap above the monthly one', async () => {
    const res = await setPolicy({ dailySpendCap: 5000, monthlySpendCap: 1000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot be higher/i);
  });

  it('refuses a nonsensical alert threshold', async () => {
    expect((await setPolicy({ spendAlertThreshold: 0 })).status).toBe(400);
    expect((await setPolicy({ spendAlertThreshold: 1.5 })).status).toBe(400);
  });

  it('refuses a negative cap', async () => {
    expect((await setPolicy({ dailySpendCap: -10 })).status).toBe(400);
  });

  it('does not reset unmentioned settings when only one is changed', async () => {
    await setPolicy({ requireApproval: true, blockOnCap: true, dailySpendCap: 500 });
    // Changing one field must leave the rest standing; the opposite would
    // silently turn off approval and cap blocking.
    await setPolicy({ dailySpendCap: 250 });

    const res = await api(h, `/api/governance/policy?brandId=${brandId}`, { token: author.token });
    expect(res.body.policy.dailySpendCap).toBe(250);
    expect(res.body.policy.requireApproval).toBe(true);
    expect(res.body.policy.blockOnCap).toBe(true);
  });

  it('is not readable by another tenant', async () => {
    const outsider = await createUser(h, { email: `outsider-${Date.now()}@example.com` });
    const res = await api(h, `/api/governance/policy?brandId=${brandId}`, { token: outsider.token });
    expect(res.status).toBe(404);
  });
});

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

describe('the approval queue', () => {
  beforeEach(async () => { await setPolicy({ requireApproval: true }); });

  it('moves a post into review', async () => {
    const postId = await schedulePost();
    const res = await api(h, '/api/governance/approvals', {
      method: 'POST', token: author.token, body: { brandId, postId }
    });

    expect(res.status).toBe(200);
    expect(res.body.approval.decision).toBe('pending');
    expect(statusOf(postId)).toBe('pending_review');
  });

  it('does not open a second review for the same post', async () => {
    const postId = await schedulePost();
    const first = await api(h, '/api/governance/approvals', {
      method: 'POST', token: author.token, body: { brandId, postId }
    });
    const second = await api(h, '/api/governance/approvals', {
      method: 'POST', token: author.token, body: { brandId, postId }
    });

    expect(second.body.approval.id).toBe(first.body.approval.id);
  });

  it('will not accept a post that has already gone out', async () => {
    const postId = await schedulePost();
    h.db.prepare("UPDATE posts SET status = 'published' WHERE id = ?").run(postId);

    const res = await api(h, '/api/governance/approvals', {
      method: 'POST', token: author.token, body: { brandId, postId }
    });
    expect(res.status).toBe(400);
  });

  it('returns a post to scheduled when it is approved', async () => {
    const postId = await schedulePost();
    await api(h, '/api/governance/approvals', { method: 'POST', token: author.token, body: { brandId, postId } });

    const res = await api(h, `/api/governance/approvals/${postId}/decide`, {
      method: 'POST', token: reviewer.token, body: { approve: true }
    });

    expect(res.status).toBe(200);
    expect(res.body.postStatus).toBe('scheduled');
    expect(statusOf(postId)).toBe('scheduled');
  });

  it('holds an approved post without a time as approved rather than scheduled', async () => {
    const res = await api(h, '/api/posts', {
      method: 'POST', token: author.token,
      body: { brandId, content: 'No time yet', status: 'suggested' }
    });
    const postId = res.body.id;
    h.db.prepare('UPDATE posts SET scheduled_time = NULL WHERE id = ?').run(postId);

    await api(h, '/api/governance/approvals', { method: 'POST', token: author.token, body: { brandId, postId } });
    const decided = await api(h, `/api/governance/approvals/${postId}/decide`, {
      method: 'POST', token: reviewer.token, body: { approve: true }
    });

    expect(decided.body.postStatus).toBe('approved');
  });

  it('records a rejection with its reason', async () => {
    const postId = await schedulePost();
    await api(h, '/api/governance/approvals', { method: 'POST', token: author.token, body: { brandId, postId } });

    const res = await api(h, `/api/governance/approvals/${postId}/decide`, {
      method: 'POST', token: reviewer.token,
      body: { approve: false, comment: 'The claim about response times is not supportable.' }
    });

    expect(res.body.approval.decision).toBe('rejected');
    expect(res.body.approval.comment).toMatch(/response times/);
    expect(statusOf(postId)).toBe('rejected');
  });

  it('insists on a reason when rejecting', async () => {
    const postId = await schedulePost();
    await api(h, '/api/governance/approvals', { method: 'POST', token: author.token, body: { brandId, postId } });

    const res = await api(h, `/api/governance/approvals/${postId}/decide`, {
      method: 'POST', token: reviewer.token, body: { approve: false }
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/why/i);
  });

  it('does not let the author approve their own post', async () => {
    const postId = await schedulePost();
    await api(h, '/api/governance/approvals', { method: 'POST', token: author.token, body: { brandId, postId } });

    const res = await api(h, `/api/governance/approvals/${postId}/decide`, {
      method: 'POST', token: author.token, body: { approve: true }
    });

    // Self-approval would make the whole workflow decorative.
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/cannot approve a post you submitted/i);
    expect(statusOf(postId)).toBe('pending_review');
  });

  it('refuses a decision on a post with no open review', async () => {
    const postId = await schedulePost();
    const res = await api(h, `/api/governance/approvals/${postId}/decide`, {
      method: 'POST', token: reviewer.token, body: { approve: true }
    });
    expect(res.status).toBe(404);
  });

  it('lists what is waiting, with the content to review', async () => {
    const postId = await schedulePost('Review this exact copy');
    await api(h, '/api/governance/approvals', { method: 'POST', token: author.token, body: { brandId, postId } });

    const res = await api(h, `/api/governance/approvals?brandId=${brandId}`, { token: reviewer.token });
    expect(res.body.pending).toBe(1);
    expect(res.body.approvals[0].post.content).toBe('Review this exact copy');
  });
});

describe('approval is enforced at publish time', () => {
  it('blocks an unapproved post even though it is due', async () => {
    await setPolicy({ requireApproval: true });
    const postId = await schedulePost();

    const summary = await runCron();

    // The scheduler is the last gate, and a post can reach it through the API
    // or an agent without ever passing through the interface.
    expect(summary.published).toBe(0);
    expect(summary.results[0].outcomes[0].error).toMatch(/requires approval/i);
    expect(statusOf(postId)).toBe('failed');
  });

  it('blocks a post that was rejected', async () => {
    await setPolicy({ requireApproval: true });
    const postId = await schedulePost();
    await api(h, '/api/governance/approvals', { method: 'POST', token: author.token, body: { brandId, postId } });
    await api(h, `/api/governance/approvals/${postId}/decide`, {
      method: 'POST', token: reviewer.token, body: { approve: false, comment: 'No.' }
    });

    h.db.prepare("UPDATE posts SET status = 'scheduled' WHERE id = ?").run(postId);
    const summary = await runCron();

    expect(summary.published).toBe(0);
    expect(summary.results[0].outcomes[0].error).toMatch(/rejected in review/i);
  });

  it('lets an approved post through', async () => {
    await setPolicy({ requireApproval: true });
    await api(h, '/api/instagram/connect', {
      method: 'POST', token: author.token, body: { brandId, accessToken: 'GOOD_TOKEN' }
    });

    const postId = await schedulePost();
    await api(h, '/api/governance/approvals', { method: 'POST', token: author.token, body: { brandId, postId } });
    await api(h, `/api/governance/approvals/${postId}/decide`, {
      method: 'POST', token: reviewer.token, body: { approve: true }
    });

    const summary = await runCron();
    expect(summary.published).toBe(1);
    expect(statusOf(postId)).toBe('published');
  });

  it('does not require approval when the brand has not asked for it', async () => {
    await api(h, '/api/instagram/connect', {
      method: 'POST', token: author.token, body: { brandId, accessToken: 'GOOD_TOKEN' }
    });
    const postId = await schedulePost();

    const summary = await runCron();
    expect(summary.published).toBe(1);
    expect(statusOf(postId)).toBe('published');
  });
});

/* ------------------------------------------------------------------ */
/* Spend                                                               */
/* ------------------------------------------------------------------ */

const recordSpend = (amount: number, date = new Date().toISOString().slice(0, 10), campaign = 'camp_1') => {
  h.db.prepare(
    `INSERT OR REPLACE INTO spend_events (id, brand_id, campaign_id, amount, currency, recorded_for, source, created_at)
     VALUES (?, ?, ?, ?, 'USD', ?, 'test', ?)`
  ).run(`spend_${brandId}_${campaign}_${date}`, brandId, campaign, String(amount), date, new Date().toISOString());
};

describe('spend tracking', () => {
  it('reports nothing spent and no caps by default', async () => {
    const res = await api(h, `/api/governance/spend?brandId=${brandId}`, { token: author.token });
    expect(res.body.status.today).toBe(0);
    expect(res.body.status.state).toBe('ok');
  });

  it('totals today and the month separately', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const earlier = `${today.slice(0, 8)}01`;

    recordSpend(40, today, 'camp_a');
    recordSpend(60, earlier, 'camp_b');

    const res = await api(h, `/api/governance/spend?brandId=${brandId}`, { token: author.token });
    expect(res.body.status.today).toBe(40);
    expect(res.body.status.month).toBeGreaterThanOrEqual(100);
  });

  it('warns as spend approaches the cap', async () => {
    await setPolicy({ dailySpendCap: 100, spendAlertThreshold: 0.8 });
    recordSpend(85);

    const res = await api(h, `/api/governance/spend?brandId=${brandId}`, { token: author.token });
    expect(res.body.status.state).toBe('approaching');
    expect(res.body.status.messages[0]).toMatch(/85%/);
  });

  it('reports the cap as exceeded once it is reached', async () => {
    await setPolicy({ dailySpendCap: 100 });
    recordSpend(120);

    const res = await api(h, `/api/governance/spend?brandId=${brandId}`, { token: author.token });
    expect(res.body.status.state).toBe('exceeded');
    expect(res.body.status.dailyRemaining).toBe(0);
  });
});

describe('spend guardrails on campaigns', () => {
  beforeEach(async () => {
    await api(h, '/api/meta/connect', {
      method: 'POST', token: author.token,
      body: { brandId, accessToken: 'GOOD_TOKEN', adAccountId: 'act_555', pageId: 'page_1' }
    });
  });

  it('refuses a daily budget above the per-campaign limit', async () => {
    await setPolicy({ maxCampaignDailyBudget: 50 });

    const res = await api(h, '/api/meta/campaigns', {
      method: 'POST', token: author.token,
      body: { brandId, name: 'Too expensive', dailyBudget: 500 }
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/exceeds this brand/i);
  });

  it('blocks activating new delivery once the cap is reached', async () => {
    await setPolicy({ dailySpendCap: 100, blockOnCap: true });
    recordSpend(150);

    const res = await api(h, '/api/meta/campaigns', {
      method: 'POST', token: author.token,
      body: { brandId, name: 'Over cap', dailyBudget: 10, activate: true }
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/blocked until the cap/i);
  });

  it('still allows creating a paused campaign when the cap is reached', async () => {
    await setPolicy({ dailySpendCap: 100, blockOnCap: true });
    recordSpend(150);

    // Being over the cap should not stop preparation, only delivery.
    const res = await api(h, '/api/meta/campaigns', {
      method: 'POST', token: author.token,
      body: { brandId, name: 'Prepared while over cap', dailyBudget: 10 }
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PAUSED');
  });

  it('warns instead of blocking when the policy says so', async () => {
    await setPolicy({ dailySpendCap: 100, blockOnCap: false });
    recordSpend(150);

    const res = await api(h, '/api/meta/campaigns', {
      method: 'POST', token: author.token,
      body: { brandId, name: 'Warned', dailyBudget: 10, activate: true }
    });

    expect(res.status).toBe(200);
    expect(res.body.spendWarnings.length).toBeGreaterThan(0);
  });

  it('blocks resuming a paused campaign once the cap is reached', async () => {
    const created = await api(h, '/api/meta/campaigns', {
      method: 'POST', token: author.token,
      body: { brandId, name: 'Resumable', dailyBudget: 10 }
    });
    expect(created.status).toBe(200);

    await setPolicy({ dailySpendCap: 100 });
    recordSpend(150);

    // Resuming restarts spend, so the cap has to apply here too.
    const res = await api(h, `/api/meta/campaigns/${created.body.campaignId}/status`, {
      method: 'POST', token: author.token, body: { brandId, status: 'ACTIVE' }
    });

    expect(res.status).toBe(403);
  });

  it('allows pausing a campaign whatever the spend position', async () => {
    const created = await api(h, '/api/meta/campaigns', {
      method: 'POST', token: author.token,
      body: { brandId, name: 'Pausable', dailyBudget: 10 }
    });

    await setPolicy({ dailySpendCap: 100 });
    recordSpend(150);

    // Stopping spend must never be blocked by a spend guard.
    const res = await api(h, `/api/meta/campaigns/${created.body.campaignId}/status`, {
      method: 'POST', token: author.token, body: { brandId, status: 'PAUSED' }
    });
    expect(res.status).toBe(200);
  });

  it('warns when a budget is more than the remaining allowance', async () => {
    await setPolicy({ dailySpendCap: 100, blockOnCap: true });
    recordSpend(70);

    const res = await api(h, '/api/meta/campaigns', {
      method: 'POST', token: author.token,
      body: { brandId, name: 'Nearly over', dailyBudget: 60, activate: true }
    });

    expect(res.status).toBe(200);
    expect(res.body.spendWarnings.join(' ')).toMatch(/left under today/i);
  });
});
