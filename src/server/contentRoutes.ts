/**
 * Content production: poster templates and batches, plus the WordPress and
 * Shopify connections that feed them.
 *
 * Generation itself runs in the browser, where the customer's Gemini or Claude
 * key lives — the same place every other AI feature in this app runs. What
 * lives here is everything that cannot safely run in a browser: the stored
 * credentials, the cross-origin calls to WordPress and Shopify, and the
 * persistence of what was produced.
 */
import { Router, Request, Response } from 'express';
import {
  q, saveRow, selectRows, ensureStoreReady, parseJson, stringifyJson, timestamp, num
} from './store';
import { asyncHandler, badRequest, notFound, requireParam, currentUserId, HttpError } from './http';
import { randomId, encryptSecret, decryptSecret, maskSecret } from './crypto';
import { POSTER_TEMPLATES, templatesForIndustry, PosterTemplate } from './posterTemplates';

const router = Router();

/** Batches are capped so one run cannot burn an unbounded amount of API credit. */
const MAX_POSTERS_PER_BATCH = 50;

/* ------------------------------------------------------------------ */
/* Poster templates                                                    */
/* ------------------------------------------------------------------ */

const templateRow = (t: PosterTemplate, userId: string, builtin: boolean) => ({
  id: `tmpl_${userId}_${t.key}`,
  user_id: userId,
  template_key: t.key,
  name: t.name,
  category: t.category,
  brief: t.brief,
  ratio: t.ratio,
  layout: t.layout,
  slots: stringifyJson(t.slots),
  constraints: t.constraints,
  art_direction: t.artDirection,
  suited_to: stringifyJson(t.suitedTo),
  is_builtin: builtin ? '1' : '0',
  archived: '0',
  created_at: timestamp()
});

/** Seeds the default library once; a customer's edits are never overwritten. */
const ensureTemplatesSeeded = async (userId: string) => {
  await ensureStoreReady();
  const existing = await q<any>('SELECT template_key FROM poster_templates WHERE user_id = $1', [userId]);
  const have = new Set(existing.map(r => r.template_key));
  for (const t of POSTER_TEMPLATES) {
    if (have.has(t.key)) continue;
    await saveRow('poster_templates', templateRow(t, userId, true));
  }
};

const rowToTemplate = (row: any) => ({
  id: row.id,
  key: row.template_key,
  name: row.name,
  category: row.category,
  brief: row.brief,
  ratio: row.ratio,
  layout: row.layout || 'centered',
  slots: parseJson<any[]>(row.slots, []),
  constraints: row.constraints,
  artDirection: row.art_direction,
  suitedTo: parseJson<string[]>(row.suited_to, []),
  isBuiltin: row.is_builtin === '1',
  archived: row.archived === '1'
});

router.get('/poster-templates', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  await ensureTemplatesSeeded(userId);

  const rows = await selectRows<any>('poster_templates', 'user_id = $1 AND archived = $2', [userId, '0']);
  const templates = rows.map(rowToTemplate);

  // Rank by fit for the brand's industry, but never hide anything.
  const industry = (req.query.industry as string) || '';
  const ordered = industry
    ? templatesForIndustry(industry).flatMap(t => {
        const match = templates.find(x => x.key === t.key);
        return match ? [match] : [];
      }).concat(templates.filter(t => !POSTER_TEMPLATES.some(b => b.key === t.key)))
    : templates;

  res.json({
    templates: ordered,
    categories: [...new Set(templates.map(t => t.category))],
    maxPerBatch: MAX_POSTERS_PER_BATCH
  });
}));

router.post('/poster-templates', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  await ensureTemplatesSeeded(userId);

  const name = requireParam(req.body.name, 'name');
  const key = String(req.body.key || name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  if (!req.body.constraints) throw badRequest('Layout constraints are required — they are what keeps the copy inside the layout.');

  await saveRow('poster_templates', {
    ...templateRow({
      key,
      name,
      category: req.body.category || 'awareness',
      brief: req.body.brief || '',
      ratio: req.body.ratio || 'square',
      layout: req.body.layout || 'centered',
      slots: req.body.slots || [],
      constraints: req.body.constraints,
      artDirection: req.body.artDirection || '',
      suitedTo: req.body.suitedTo || []
    } as PosterTemplate, userId, false),
    is_builtin: '0'
  });

  res.json({ success: true, key });
}));

router.delete('/poster-templates/:key', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  await q(
    `UPDATE poster_templates SET archived = '1' WHERE user_id = $1 AND template_key = $2`,
    [userId, req.params.key]
  );
  res.json({ success: true });
}));

/* ------------------------------------------------------------------ */
/* Poster batches                                                      */
/* ------------------------------------------------------------------ */

/** Opens a batch. The client generates into it and closes it when done. */
router.post('/poster-batches', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const brandId = requireParam(req.body.brandId, 'brandId');
  const requested = num(req.body.requested, 0);

  if (requested < 1) throw badRequest('Ask for at least one poster.');
  if (requested > MAX_POSTERS_PER_BATCH) {
    throw badRequest(
      `A batch is capped at ${MAX_POSTERS_PER_BATCH} posters so a single run cannot use an unbounded amount of API credit. Split larger jobs into several batches.`
    );
  }
  const templates: string[] = Array.isArray(req.body.templates) ? req.body.templates : [];
  if (!templates.length) throw badRequest('Choose at least one template.');

  const id = randomId('batch');
  await saveRow('poster_batches', {
    id,
    brand_id: brandId,
    user_id: userId,
    name: req.body.name || `Poster batch ${new Date().toLocaleDateString()}`,
    templates: stringifyJson(templates),
    requested: String(requested),
    generated: '0',
    failed: '0',
    status: 'RUNNING',
    source: req.body.source || 'brand',
    created_at: timestamp()
  });

  res.json({ success: true, batchId: id, requested, maxPerBatch: MAX_POSTERS_PER_BATCH });
}));

/** Saves generated posters into an open batch. */
router.post('/poster-batches/:id/posters', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.body.brandId, 'brandId');
  const items: any[] = Array.isArray(req.body.posters) ? req.body.posters : [];
  if (!items.length) throw badRequest('No posters were supplied.');

  const batchId = req.params.id;
  const existing = await selectRows<any>('poster_batches', 'id = $1', [batchId]);
  if (!existing.length) throw notFound('That poster batch does not exist.');

  for (const item of items) {
    await saveRow('posters', {
      id: randomId('poster'),
      batch_id: batchId,
      brand_id: brandId,
      template_key: item.templateKey || '',
      headline: item.headline || '',
      subhead: item.subhead || '',
      body: item.body || '',
      call_to_action: item.callToAction || '',
      caption: item.caption || '',
      hashtags: stringifyJson(item.hashtags || []),
      image_prompt: item.imagePrompt || '',
      image_url: item.imageUrl || '',
      content_pillar: item.contentPillar || '',
      product_ref: stringifyJson(item.product || null),
      status: 'draft',
      created_at: timestamp()
    });
  }

  const generated = num(existing[0].generated) + items.length;
  await q('UPDATE poster_batches SET generated = $1 WHERE id = $2', [String(generated), batchId]);

  res.json({ success: true, saved: items.length, generated });
}));

router.post('/poster-batches/:id/complete', asyncHandler(async (req: Request, res: Response) => {
  const failed = num(req.body.failed, 0);
  await q(
    `UPDATE poster_batches SET status = $1, failed = $2, error = $3, completed_at = $4 WHERE id = $5`,
    [req.body.status || 'COMPLETED', String(failed), req.body.error || '', timestamp(), req.params.id]
  );
  res.json({ success: true });
}));

router.get('/poster-batches', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const rows = await selectRows<any>('poster_batches', 'brand_id = $1', [brandId], 'ORDER BY created_at DESC LIMIT 50');
  res.json({
    batches: rows.map(b => ({
      id: b.id, name: b.name, templates: parseJson<string[]>(b.templates, []),
      requested: num(b.requested), generated: num(b.generated), failed: num(b.failed),
      status: b.status, source: b.source, error: b.error,
      createdAt: b.created_at, completedAt: b.completed_at
    }))
  });
}));

router.get('/posters', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const batchId = req.query.batchId as string | undefined;

  const where = batchId ? 'brand_id = $1 AND batch_id = $2' : 'brand_id = $1';
  const params = batchId ? [brandId, batchId] : [brandId];
  const rows = await selectRows<any>('posters', where, params, 'ORDER BY created_at DESC LIMIT 500');

  res.json({
    posters: rows.map(p => ({
      id: p.id, batchId: p.batch_id, templateKey: p.template_key,
      headline: p.headline, subhead: p.subhead, body: p.body,
      callToAction: p.call_to_action, caption: p.caption,
      hashtags: parseJson<string[]>(p.hashtags, []),
      imagePrompt: p.image_prompt, imageUrl: p.image_url,
      contentPillar: p.content_pillar, product: parseJson<any>(p.product_ref, null),
      status: p.status, createdAt: p.created_at
    }))
  });
}));

router.patch('/posters/:id', asyncHandler(async (req: Request, res: Response) => {
  await ensureStoreReady();
  const fields: Record<string, string> = {};
  if (req.body.imageUrl !== undefined) fields.image_url = req.body.imageUrl;
  if (req.body.status !== undefined) fields.status = req.body.status;
  if (req.body.caption !== undefined) fields.caption = req.body.caption;
  if (req.body.headline !== undefined) fields.headline = req.body.headline;

  const keys = Object.keys(fields);
  if (!keys.length) throw badRequest('Nothing to update.');

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  await q(`UPDATE posters SET ${sets} WHERE id = $${keys.length + 1}`, [...keys.map(k => fields[k]), req.params.id]);
  res.json({ success: true });
}));

/* ------------------------------------------------------------------ */
/* WordPress and Shopify connections                                   */
/* ------------------------------------------------------------------ */

type ContentKind = 'wordpress' | 'shopify';

const loadContentConnection = async (brandId: string, kind: ContentKind) => {
  await ensureStoreReady();
  const rows = await selectRows<any>('content_connections', 'brand_id = $1 AND kind = $2', [brandId, kind]);
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id,
    brandId: row.brand_id,
    kind: row.kind as ContentKind,
    siteUrl: row.site_url,
    identifier: row.identifier,
    secret: row.secret_enc ? decryptSecret(row.secret_enc) : '',
    metadata: parseJson<Record<string, any>>(row.metadata, {}),
    status: row.status,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error
  };
};

const publicContentConnection = (c: NonNullable<Awaited<ReturnType<typeof loadContentConnection>>>) => ({
  id: c.id, kind: c.kind, siteUrl: c.siteUrl, identifier: c.identifier,
  secretPreview: maskSecret(c.secret), metadata: c.metadata,
  status: c.status, lastVerifiedAt: c.lastVerifiedAt, lastError: c.lastError
});

const normalizeSite = (url: string) => url.trim().replace(/\/+$/, '');

const fetchJson = async (url: string, init: RequestInit, timeoutMs = 20_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body: any = {};
    if (text) {
      try { body = JSON.parse(text); }
      catch { body = { raw: text.slice(0, 400) }; }
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new HttpError(504, `${url} did not respond within ${timeoutMs / 1000}s.`);
    throw new HttpError(502, `Could not reach ${url}: ${err?.message || 'network error'}`);
  } finally {
    clearTimeout(timer);
  }
};

router.get('/connections', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const [wordpress, shopify] = await Promise.all([
    loadContentConnection(brandId, 'wordpress'),
    loadContentConnection(brandId, 'shopify')
  ]);
  res.json({
    wordpress: wordpress ? publicContentConnection(wordpress) : null,
    shopify: shopify ? publicContentConnection(shopify) : null
  });
}));

/**
 * WordPress uses an application password, not the account password — WordPress
 * issues these per-application under Users → Profile, and they can be revoked
 * without touching the login.
 */
router.post('/connections/wordpress', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const brandId = requireParam(req.body.brandId, 'brandId');
  const siteUrl = normalizeSite(requireParam(req.body.siteUrl, 'siteUrl'));
  const username = requireParam(req.body.username, 'username');
  const appPassword = requireParam(req.body.applicationPassword, 'applicationPassword').replace(/\s+/g, '');

  if (!/^https?:\/\//i.test(siteUrl)) throw badRequest('The site URL must start with http:// or https://');

  const auth = Buffer.from(`${username}:${appPassword}`).toString('base64');
  const probe = await fetchJson(`${siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' }
  });

  if (!probe.ok) {
    const detail = probe.body?.message || `HTTP ${probe.status}`;
    throw new HttpError(
      probe.status === 401 ? 401 : 400,
      probe.status === 401
        ? `WordPress rejected these credentials: ${detail}. Check the username and that the application password has not been revoked.`
        : `WordPress returned an error: ${detail}. Confirm the REST API is reachable at ${siteUrl}/wp-json.`
    );
  }

  const capabilities = probe.body?.capabilities || {};
  if (!capabilities.publish_posts && !capabilities.edit_posts) {
    throw badRequest(
      `The WordPress user "${username}" cannot publish posts. Use an account with the Author role or above.`
    );
  }

  const id = (await loadContentConnection(brandId, 'wordpress'))?.id || randomId('wpconn');
  const ts = timestamp();
  await saveRow('content_connections', {
    id, user_id: userId, brand_id: brandId, kind: 'wordpress',
    site_url: siteUrl, identifier: username,
    secret_enc: encryptSecret(appPassword),
    metadata: stringifyJson({
      displayName: probe.body?.name,
      roles: probe.body?.roles || [],
      canPublish: Boolean(capabilities.publish_posts)
    }),
    status: 'connected', last_verified_at: ts, last_error: '',
    created_at: ts, updated_at: ts
  });

  res.json({
    success: true,
    connection: publicContentConnection((await loadContentConnection(brandId, 'wordpress'))!),
    site: { name: probe.body?.name, roles: probe.body?.roles }
  });
}));

/** Publishes an article. Defaults to a draft so nothing goes live unreviewed. */
router.post('/wordpress/publish', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.body.brandId, 'brandId');
  const conn = await loadContentConnection(brandId, 'wordpress');
  if (!conn) throw new HttpError(409, 'No WordPress site is connected for this brand.', { code: 'NOT_CONNECTED' });

  const title = requireParam(req.body.title, 'title');
  const bodyHtml = requireParam(req.body.bodyHtml, 'bodyHtml');
  const publishLive = req.body.publish === true;

  const auth = Buffer.from(`${conn.identifier}:${conn.secret}`).toString('base64');
  const payload: Record<string, any> = {
    title,
    content: bodyHtml,
    status: publishLive ? 'publish' : 'draft',
    excerpt: req.body.excerpt || '',
    slug: req.body.slug || undefined
  };

  const result = await fetchJson(`${conn.siteUrl}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  }, 30_000);

  const articleId = randomId('article');
  if (!result.ok) {
    const detail = result.body?.message || `HTTP ${result.status}`;
    await saveRow('blog_articles', {
      id: articleId, brand_id: brandId, connection_id: conn.id,
      title, slug: req.body.slug || '', excerpt: req.body.excerpt || '',
      meta_description: req.body.metaDescription || '', body_html: bodyHtml,
      tags: stringifyJson(req.body.tags || []), categories: stringifyJson(req.body.categories || []),
      featured_image_prompt: req.body.featuredImagePrompt || '',
      status: 'failed', error: String(detail).slice(0, 500), created_at: timestamp()
    });
    throw new HttpError(result.status >= 400 ? result.status : 502, `WordPress rejected the post: ${detail}`);
  }

  await saveRow('blog_articles', {
    id: articleId, brand_id: brandId, connection_id: conn.id,
    title, slug: result.body?.slug || '', excerpt: req.body.excerpt || '',
    meta_description: req.body.metaDescription || '', body_html: bodyHtml,
    tags: stringifyJson(req.body.tags || []), categories: stringifyJson(req.body.categories || []),
    featured_image_prompt: req.body.featuredImagePrompt || '',
    remote_id: String(result.body?.id || ''), remote_url: result.body?.link || '',
    status: publishLive ? 'published' : 'draft',
    created_at: timestamp(), published_at: publishLive ? timestamp() : ''
  });

  res.json({
    success: true,
    articleId,
    remoteId: result.body?.id,
    url: result.body?.link,
    status: publishLive ? 'published' : 'draft',
    note: publishLive
      ? 'The article is live on your site.'
      : 'Saved to WordPress as a draft — review it there, then publish.'
  });
}));

router.get('/blog-articles', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const rows = await selectRows<any>('blog_articles', 'brand_id = $1', [brandId], 'ORDER BY created_at DESC LIMIT 100');
  res.json({
    articles: rows.map(a => ({
      id: a.id, title: a.title, slug: a.slug, excerpt: a.excerpt,
      status: a.status, url: a.remote_url, error: a.error,
      createdAt: a.created_at, publishedAt: a.published_at
    }))
  });
}));

/**
 * Shopify uses an Admin API access token from a custom app in the store admin.
 * Only read_products is needed; the token never leaves the server.
 */
router.post('/connections/shopify', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const brandId = requireParam(req.body.brandId, 'brandId');
  const accessToken = requireParam(req.body.accessToken, 'accessToken').trim();

  let domain = requireParam(req.body.storeDomain, 'storeDomain').trim()
    .replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (!domain.includes('.')) domain = `${domain}.myshopify.com`;

  const version = process.env.SHOPIFY_API_VERSION || '2024-10';
  const probe = await fetchJson(`https://${domain}/admin/api/${version}/shop.json`, {
    headers: { 'X-Shopify-Access-Token': accessToken, Accept: 'application/json' }
  });

  if (!probe.ok) {
    const detail = probe.body?.errors || probe.body?.raw || `HTTP ${probe.status}`;
    throw new HttpError(
      probe.status === 401 || probe.status === 403 ? 401 : 400,
      `Shopify rejected these credentials: ${detail}. Check the store domain and that the custom app token has the read_products scope.`
    );
  }

  const shop = probe.body?.shop || {};
  const id = (await loadContentConnection(brandId, 'shopify'))?.id || randomId('shopconn');
  const ts = timestamp();
  await saveRow('content_connections', {
    id, user_id: userId, brand_id: brandId, kind: 'shopify',
    site_url: `https://${domain}`, identifier: domain,
    secret_enc: encryptSecret(accessToken),
    metadata: stringifyJson({
      shopName: shop.name,
      currency: shop.currency,
      primaryDomain: shop.domain,
      planName: shop.plan_name,
      apiVersion: version
    }),
    status: 'connected', last_verified_at: ts, last_error: '',
    created_at: ts, updated_at: ts
  });

  res.json({
    success: true,
    connection: publicContentConnection((await loadContentConnection(brandId, 'shopify'))!),
    shop: { name: shop.name, currency: shop.currency, domain: shop.domain }
  });
}));

/** Products for the promo generator, normalised to what the agent needs. */
router.get('/shopify/products', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const conn = await loadContentConnection(brandId, 'shopify');
  if (!conn) throw new HttpError(409, 'No Shopify store is connected for this brand.', { code: 'NOT_CONNECTED' });

  const version = conn.metadata?.apiVersion || process.env.SHOPIFY_API_VERSION || '2024-10';
  const limit = Math.min(250, num(req.query.limit, 50));

  const result = await fetchJson(
    `https://${conn.identifier}/admin/api/${version}/products.json?limit=${limit}&status=active`,
    { headers: { 'X-Shopify-Access-Token': conn.secret, Accept: 'application/json' } },
    30_000
  );

  if (!result.ok) {
    const detail = result.body?.errors || `HTTP ${result.status}`;
    throw new HttpError(result.status >= 400 ? result.status : 502, `Shopify returned an error: ${detail}`);
  }

  const currency = conn.metadata?.currency || 'USD';
  const storeDomain = conn.metadata?.primaryDomain || conn.identifier;

  const products = (result.body?.products || []).map((p: any) => {
    const variant = (p.variants || [])[0] || {};
    return {
      id: String(p.id),
      title: p.title,
      handle: p.handle,
      // Strip the description to text; the agent should not be fed raw markup.
      description: String(p.body_html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
      productType: p.product_type,
      vendor: p.vendor,
      tags: typeof p.tags === 'string' ? p.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      price: variant.price ? `${currency} ${variant.price}` : '',
      compareAtPrice: variant.compare_at_price ? `${currency} ${variant.compare_at_price}` : '',
      available: variant.inventory_quantity == null ? true : variant.inventory_quantity > 0,
      imageUrl: p.image?.src || (p.images || [])[0]?.src || '',
      url: `https://${storeDomain}/products/${p.handle}`
    };
  });

  res.json({ products, currency, shop: conn.metadata?.shopName, count: products.length });
}));

router.delete('/connections/:kind', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId || req.body?.brandId, 'brandId');
  const kind = req.params.kind;
  if (kind !== 'wordpress' && kind !== 'shopify') throw badRequest('Unknown connection type.');
  await ensureStoreReady();
  await q('DELETE FROM content_connections WHERE brand_id = $1 AND kind = $2', [brandId, kind]);
  res.json({ success: true });
}));

export default router;
