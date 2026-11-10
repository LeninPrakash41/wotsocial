/**
 * Tenant isolation.
 *
 * Authentication alone was not enough: once signed in, any user could read and
 * write every other tenant's brands by guessing an id, because no endpoint
 * checked ownership. These tests assert that a second, fully authenticated
 * tenant cannot touch the first one's data through any route that takes a
 * brand id.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHarness, api, createUser, createBrand, Harness, TestUser, TINY_PNG } from './helpers/harness';

let h: Harness;
let alice: TestUser;
let bob: TestUser;
let admin: TestUser;
let aliceBrand: string;
let bobBrand: string;

beforeAll(async () => {
  h = await startHarness();
  alice = await createUser(h, { email: 'alice@example.com' });
  bob = await createUser(h, { email: 'bob@example.com' });
  admin = await createUser(h, { email: 'admin@example.com', role: 'admin' });

  aliceBrand = await createBrand(h, alice, 'Alice Co');
  bobBrand = await createBrand(h, bob, 'Bob Co');
});

afterAll(async () => { await h?.close(); });

describe('listing is scoped to the caller', () => {
  it('shows each tenant only their own brands', async () => {
    const forAlice = await api(h, '/api/brands', { token: alice.token });
    const forBob = await api(h, '/api/brands', { token: bob.token });

    expect(forAlice.body.map((b: any) => b.name)).toEqual(['Alice Co']);
    expect(forBob.body.map((b: any) => b.name)).toEqual(['Bob Co']);
  });

  it('does not leak posts across tenants', async () => {
    await api(h, '/api/posts', {
      method: 'POST', token: alice.token,
      body: { brandId: aliceBrand, content: 'Alice private draft', status: 'suggested' }
    });

    const bobsPosts = await api(h, '/api/posts', { token: bob.token });
    expect(bobsPosts.body.some((p: any) => p.content === 'Alice private draft')).toBe(false);
  });
});

describe('reads against another tenant brand', () => {
  // Every one of these accepts a brandId and would have answered for any id.
  it.each([
    ['leads', '/api/crm/leads'],
    ['connections', '/api/crm/connections'],
    ['media library', '/api/media'],
    ['meta connection', '/api/meta/connection'],
    ['meta campaigns', '/api/meta/campaigns'],
    ['instagram connection', '/api/instagram/connection'],
    ['instagram DM rules', '/api/instagram/dm-rules'],
    ['whatsapp connection', '/api/whatsapp/connection'],
    ['whatsapp broadcasts', '/api/whatsapp/broadcasts'],
    ['poster batches', '/api/content/poster-batches'],
    ['posters', '/api/content/posters'],
    ['blog articles', '/api/content/blog-articles'],
    ['content connections', '/api/content/connections']
  ])('refuses %s', async (_label, path) => {
    const res = await api(h, `${path}?brandId=${aliceBrand}`, { token: bob.token });

    expect(res.status).toBe(404);
    // A 403 would confirm the id exists; a 404 does not.
    expect(res.body.error).toMatch(/does not exist/i);
  });
});

describe('writes against another tenant brand', () => {
  it('refuses to launch a campaign on it', async () => {
    const res = await api(h, '/api/meta/campaigns', {
      method: 'POST', token: bob.token,
      body: { brandId: aliceBrand, name: 'Hijacked', dailyBudget: 500 }
    });
    expect(res.status).toBe(404);
  });

  it('refuses to publish to its Instagram', async () => {
    const res = await api(h, '/api/instagram/publish', {
      method: 'POST', token: bob.token,
      body: { brandId: aliceBrand, mediaUrl: 'https://example.com/x.jpg', caption: 'hijack' }
    });
    expect(res.status).toBe(404);
  });

  it('refuses to send a WhatsApp broadcast from it', async () => {
    const res = await api(h, '/api/whatsapp/broadcasts', {
      method: 'POST', token: bob.token,
      body: { brandId: aliceBrand, name: 'Hijack', templateName: 'promo', recipients: ['+14155552671'] }
    });
    expect(res.status).toBe(404);
  });

  it('refuses to connect a platform account to it', async () => {
    const res = await api(h, '/api/instagram/connect', {
      method: 'POST', token: bob.token,
      body: { brandId: aliceBrand, accessToken: 'GOODTOKEN' }
    });
    expect(res.status).toBe(404);
  });

  it('refuses to upload media into it', async () => {
    const res = await api(h, '/api/media', {
      method: 'POST', token: bob.token,
      body: { brandId: aliceBrand, dataUrl: TINY_PNG, title: 'intruder' }
    });
    expect(res.status).toBe(404);
  });

  it('refuses to start a poster batch on it', async () => {
    const res = await api(h, '/api/content/poster-batches', {
      method: 'POST', token: bob.token,
      body: { brandId: aliceBrand, templates: ['bold_statement'], requested: 5 }
    });
    expect(res.status).toBe(404);
  });

  it('refuses to connect WordPress to it', async () => {
    const res = await api(h, '/api/content/connections/wordpress', {
      method: 'POST', token: bob.token,
      body: { brandId: aliceBrand, siteUrl: 'https://example.com', username: 'x', applicationPassword: 'y' }
    });
    expect(res.status).toBe(404);
  });
});

describe('by-id writes', () => {
  it('refuses to delete another tenant brand, and leaves it intact', async () => {
    const res = await api(h, `/api/brands/${aliceBrand}`, { method: 'DELETE', token: bob.token });
    expect(res.status).toBe(404);

    const stillThere = await api(h, '/api/brands', { token: alice.token });
    expect(stillThere.body.some((b: any) => b.id === aliceBrand)).toBe(true);
  });

  it('silently affects nothing when updating another tenant brand', async () => {
    // The statement is scoped to the owner, so the row simply does not match.
    await api(h, `/api/brands/${aliceBrand}`, {
      method: 'PUT', token: bob.token, body: { name: 'Owned By Bob Now' }
    });

    const alicesBrands = await api(h, '/api/brands', { token: alice.token });
    const brand = alicesBrands.body.find((b: any) => b.id === aliceBrand);
    expect(brand.name).toBe('Alice Co');
  });

  it('refuses to delete another tenant post', async () => {
    const created = await api(h, '/api/posts', {
      method: 'POST', token: alice.token,
      body: { brandId: aliceBrand, content: 'Do not delete me', status: 'suggested' }
    });

    await api(h, `/api/posts/${created.body.id}`, { method: 'DELETE', token: bob.token });

    const alicesPosts = await api(h, '/api/posts', { token: alice.token });
    expect(alicesPosts.body.some((p: any) => p.id === created.body.id)).toBe(true);
  });
});

describe('media objects', () => {
  it('does not let another tenant delete an asset', async () => {
    const uploaded = await api(h, '/api/media', {
      method: 'POST', token: alice.token,
      body: { brandId: aliceBrand, dataUrl: TINY_PNG, title: 'Alice asset' }
    });
    expect(uploaded.status).toBe(200);

    const attempt = await api(h, `/api/media/${uploaded.body.asset.id}`, { method: 'DELETE', token: bob.token });
    expect(attempt.status).toBe(404);

    const stillListed = await api(h, `/api/media?brandId=${aliceBrand}`, { token: alice.token });
    expect(stillListed.body.assets.some((a: any) => a.id === uploaded.body.asset.id)).toBe(true);
  });

  it('keys objects per brand so one tenant path cannot be guessed from another', async () => {
    const a = await api(h, '/api/media', {
      method: 'POST', token: alice.token, body: { brandId: aliceBrand, dataUrl: TINY_PNG }
    });
    const b = await api(h, '/api/media', {
      method: 'POST', token: bob.token, body: { brandId: bobBrand, dataUrl: TINY_PNG }
    });

    // Identical bytes, but the stored path is scoped to the brand.
    expect(a.body.asset.storageKey).toContain(aliceBrand);
    expect(b.body.asset.storageKey).toContain(bobBrand);
    expect(a.body.asset.storageKey).not.toBe(b.body.asset.storageKey);
  });
});

describe('agents and MCP', () => {
  it('gives each tenant their own agent registry', async () => {
    const forAlice = await api(h, '/api/agents', { token: alice.token });
    const forBob = await api(h, '/api/agents', { token: bob.token });

    expect(forAlice.body.agents.length).toBeGreaterThan(0);
    const aliceIds = forAlice.body.agents.map((a: any) => a.id);
    const bobIds = forBob.body.agents.map((a: any) => a.id);
    expect(aliceIds.some((id: string) => bobIds.includes(id))).toBe(false);
  });

  it('does not let one tenant edit another tenant agent', async () => {
    const forAlice = await api(h, '/api/agents', { token: alice.token });
    const target = forAlice.body.agents[0];

    const res = await api(h, `/api/agents/${target.id}`, {
      method: 'PUT', token: bob.token, body: { systemPrompt: 'hijacked' }
    });
    expect(res.status).toBe(404);
  });

  it('scopes an MCP key to the user who issued it', async () => {
    const issued = await api(h, '/api/mcp/keys', {
      method: 'POST', token: alice.token, body: { label: 'alice-key' }
    });
    expect(issued.body.key).toBeTruthy();

    // The key authenticates as Alice regardless of who holds it, so Bob's
    // brands must not be visible through it.
    const viaKey = await api(h, '/api/mcp', {
      method: 'POST', token: issued.body.key,
      body: { tool: 'wotsocial_list_brands' }
    });
    expect(viaKey.status).toBe(200);
    expect(viaKey.body.result.brands.map((b: any) => b.name)).toEqual(['Alice Co']);
  });

  it('does not accept an MCP key for session-protected endpoints', async () => {
    const issued = await api(h, '/api/mcp/keys', {
      method: 'POST', token: alice.token, body: { label: 'scope-test' }
    });

    const res = await api(h, '/api/mcp/keys', { token: issued.body.key });
    expect(res.status).toBe(401);
  });
});

describe('administrators', () => {
  it('can reach any brand in the workspace', async () => {
    const res = await api(h, `/api/crm/leads?brandId=${aliceBrand}`, { token: admin.token });
    expect(res.status).toBe(200);
  });

  it('still gets a 404 for a brand that does not exist', async () => {
    const res = await api(h, '/api/crm/leads?brandId=brand-does-not-exist', { token: admin.token });
    expect(res.status).toBe(404);
  });

  it('sees the whole workspace in the audit log', async () => {
    const res = await api(h, '/api/auth/audit', { token: admin.token });
    expect(res.body.scope).toBe('workspace');
  });
});
