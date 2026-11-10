/**
 * Media library.
 *
 * Assets were held in the browser's IndexedDB, so they were invisible to the
 * server, unreachable by the social platforms, lost with the browser cache and
 * never shared with a colleague. They are now stored as objects with a public
 * URL and recorded against the brand.
 */
import { Router, Request, Response } from 'express';
import {
  putMedia, deleteMedia, decodeDataUrl, MediaError, storageDriver,
  publicReachability, checkStorage, mediaLimits
} from './mediaStore';
import { saveRow, selectRows, q, ensureStoreReady, timestamp, num } from './store';
import { asyncHandler, badRequest, notFound, requireParam, currentUserId, HttpError } from './http';
import { requireOwnedBrand, audit } from './authMiddleware';
import { randomId } from './crypto';
import { logger } from './logging';

const router = Router();

const rowToAsset = (row: any) => ({
  id: row.id,
  brandId: row.brand_id,
  title: row.title,
  url: row.url,
  type: row.type,
  source: row.source,
  mimeType: row.mime_type,
  bytes: num(row.bytes),
  storageKey: row.storage_key,
  createdAt: row.created_at
});

/** Tells the UI whether publishing generated media will actually work. */
router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  const health = await checkStorage();
  const reach = publicReachability();
  res.json({
    driver: storageDriver(),
    ok: health.ok,
    detail: health.detail,
    publiclyReachable: reach.reachable,
    reason: reach.reason,
    limits: mediaLimits
  });
}));

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const rows = await selectRows<any>(
    'media_assets', 'brand_id = $1', [brandId], 'ORDER BY created_at DESC LIMIT 500'
  );
  res.json({ assets: rows.map(rowToAsset), driver: storageDriver() });
}));

/**
 * Stores an asset and returns its public URL.
 *
 * Accepts either a data URL (what the image and video generators produce) or
 * raw base64 with an explicit content type. This is the step that turns
 * generated media into something a platform can fetch.
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const userId = currentUserId(req);
  const title = String(req.body?.title || 'Untitled asset').slice(0, 200);

  let buffer: Buffer;
  let contentType: string;

  if (typeof req.body?.dataUrl === 'string' && req.body.dataUrl.startsWith('data:')) {
    ({ buffer, contentType } = decodeDataUrl(req.body.dataUrl));
  } else if (typeof req.body?.base64 === 'string') {
    contentType = String(req.body.contentType || '').toLowerCase();
    if (!contentType) throw badRequest('`contentType` is required alongside `base64`.');
    buffer = Buffer.from(req.body.base64, 'base64');
  } else {
    throw badRequest('Provide the asset as `dataUrl`, or as `base64` with a `contentType`.');
  }

  if (!buffer.length) throw badRequest('That asset is empty.');

  const stored = await putMedia({ buffer, contentType, brandId, filename: title });

  // The storage key is derived from the content hash, so re-uploading the same
  // bytes should update the existing row rather than create a duplicate.
  const existing = await selectRows<any>(
    'media_assets', 'brand_id = $1 AND storage_key = $2', [brandId, stored.key]
  );
  const id = existing[0]?.id || randomId('media');

  await saveRow('media_assets', {
    id,
    brand_id: brandId,
    user_id: userId,
    title,
    url: stored.url,
    type: stored.kind,
    source: req.body?.source || 'ai-generated',
    mime_type: stored.contentType,
    bytes: String(stored.bytes),
    storage_key: stored.key,
    created_at: existing[0]?.created_at || timestamp()
  });

  audit(req, {
    action: 'media.upload', targetType: 'media', targetId: id, brandId,
    detail: { bytes: stored.bytes, type: stored.kind }
  });

  const reach = publicReachability();
  res.json({
    success: true,
    asset: { id, brandId, title, url: stored.url, type: stored.kind, mimeType: stored.contentType, bytes: stored.bytes, storageKey: stored.key },
    deduplicated: Boolean(existing.length),
    // Surfaced so the caller can warn before a publish that is bound to fail.
    publiclyReachable: reach.reachable,
    reason: reach.reason
  });
}));

router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  await ensureStoreReady();
  const rows = await selectRows<any>('media_assets', 'id = $1', [req.params.id]);
  if (!rows.length) throw notFound('That asset does not exist.');

  // Ownership is checked against the asset's own brand, not a client-supplied one.
  const asset = rows[0];
  req.body = { ...(req.body || {}), brandId: asset.brand_id };
  await requireOwnedBrand(req);

  if (asset.storage_key) {
    await deleteMedia(asset.storage_key).catch(err =>
      logger.error('Object delete failed, removing the record anyway', err.message));
  }
  await q('DELETE FROM media_assets WHERE id = $1', [req.params.id]);

  audit(req, { action: 'media.delete', targetType: 'media', targetId: req.params.id, brandId: asset.brand_id });
  res.json({ success: true });
}));

/**
 * Fetches a remote image into the library.
 *
 * Used when a creative comes from somewhere else — a stock URL, a Shopify
 * product image — and needs to live under our own URL so it survives the
 * source changing.
 */
router.post('/import', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const userId = currentUserId(req);
  const sourceUrl = requireParam(req.body?.url, 'url');

  if (!/^https?:\/\//i.test(sourceUrl)) throw badRequest('Only http and https URLs can be imported.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  // Express's Response type shadows the fetch one in this file.
  let response: globalThis.Response;
  try {
    response = await fetch(sourceUrl, { signal: controller.signal, redirect: 'follow' });
  } catch (err: any) {
    throw new HttpError(502, `Could not fetch that URL: ${err?.message || 'network error'}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) throw new HttpError(502, `That URL returned HTTP ${response.status}.`);

  const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());
  const stored = await putMedia({ buffer, contentType, brandId });

  const id = randomId('media');
  await saveRow('media_assets', {
    id, brand_id: brandId, user_id: userId,
    title: String(req.body?.title || sourceUrl.split('/').pop() || 'Imported asset').slice(0, 200),
    url: stored.url, type: stored.kind, source: 'imported',
    mime_type: stored.contentType, bytes: String(stored.bytes),
    storage_key: stored.key, created_at: timestamp()
  });

  audit(req, { action: 'media.import', targetType: 'media', targetId: id, brandId, detail: { sourceUrl } });
  res.json({ success: true, asset: { id, url: stored.url, type: stored.kind, bytes: stored.bytes } });
}));

export default router;
