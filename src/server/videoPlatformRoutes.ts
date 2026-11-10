/**
 * TikTok and YouTube.
 *
 * Both are video-first and both pull the file from a URL we supply, which is
 * why this only became possible once generated media had a real hosted URL.
 *
 * Neither publishes silently: TikTok posts go to the creator's inbox as a
 * draft unless the app has been approved for direct posting, and YouTube
 * uploads default to private. Pushing video to someone's audience is not
 * something to do by default.
 */
import { Router, Request, Response } from 'express';
import {
  upsertConnection, getConnection, deleteConnection, toPublicConnection,
  saveRow, selectRows, q, stringifyJson, timestamp, num, ensureStoreReady
} from './store';
import { asyncHandler, badRequest, requireParam, currentUserId, HttpError, notConnected } from './http';
import { requireOwnedBrand, audit } from './authMiddleware';
import { randomId } from './crypto';
import { logger } from './logging';

const router = Router();

const TIKTOK_BASE = () => (process.env.TIKTOK_BASE_URL || 'https://open.tiktokapis.com').replace(/\/$/, '');
const YOUTUBE_BASE = () => (process.env.YOUTUBE_BASE_URL || 'https://www.googleapis.com').replace(/\/$/, '');
const GOOGLE_OAUTH = () => (process.env.GOOGLE_OAUTH_BASE_URL || 'https://oauth2.googleapis.com').replace(/\/$/, '');

/**
 * Loopback media is unreachable by the platforms, so it is refused.
 *
 * The test harness serves its fixtures from loopback and needs the happy path,
 * hence the escape — gated so it can never apply in production.
 */
const loopbackAllowed = (): boolean =>
  process.env.ALLOW_LOOPBACK_MEDIA === 'true' && process.env.NODE_ENV !== 'production';

/** The platforms fetch the file themselves, so the URL has to be reachable. */
const assertFetchable = (url: string, platform: string): string => {
  if (!/^https?:\/\//i.test(url)) {
    throw badRequest(`${platform} needs a public video URL. Upload the file to the media library first.`);
  }
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    throw badRequest(`${platform} cannot read an embedded asset. Save the video so it is hosted, then publish.`);
  }
  if (!loopbackAllowed() && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url)) {
    throw badRequest(
      `${platform} cannot reach ${url}. Configure S3_BUCKET so media is served from a public URL.`
    );
  }
  return url;
};

const jsonFetch = async (url: string, init: RequestInit, timeoutMs = 30_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body: any = {};
    if (text) { try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 400) }; } }
    return { ok: res.ok, status: res.status, body, headers: res.headers };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new HttpError(504, `${url} did not respond in time.`);
    throw new HttpError(502, `Could not reach ${url}: ${err?.message || 'network error'}`);
  } finally {
    clearTimeout(timer);
  }
};

const recordPublication = (fields: Record<string, any>) =>
  saveRow('video_publications', { created_at: timestamp(), ...fields });

/* ================================================================== */
/* TikTok                                                              */
/* ================================================================== */

const requireTikTok = async (brandId: string) => {
  const conn = await getConnection(brandId, 'tiktok');
  if (!conn?.accessToken) throw notConnected('TikTok');
  return conn;
};

router.get('/tiktok/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const conn = await getConnection(brandId, 'tiktok');
  if (!conn) return res.json({ connected: false, connection: null, profile: null });

  const result = await jsonFetch(
    `${TIKTOK_BASE()}/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count`,
    { headers: { Authorization: `Bearer ${conn.accessToken}` } }
  );

  if (!result.ok) {
    return res.json({
      connected: false,
      connection: toPublicConnection(conn),
      profile: null,
      error: result.body?.error?.message || `TikTok returned HTTP ${result.status}`
    });
  }

  const user = result.body?.data?.user || {};
  res.json({
    connected: true,
    connection: toPublicConnection(conn),
    profile: {
      openId: user.open_id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      followerCount: num(user.follower_count)
    }
  });
}));

router.post('/tiktok/connect', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const userId = currentUserId(req);
  const accessToken = requireParam(req.body.accessToken, 'accessToken').trim();

  const result = await jsonFetch(
    `${TIKTOK_BASE()}/v2/user/info/?fields=open_id,display_name,follower_count`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!result.ok) {
    throw new HttpError(401, `TikTok rejected this token: ${result.body?.error?.message || result.status}`);
  }

  const user = result.body?.data?.user || {};
  const connection = await upsertConnection({
    userId, brandId, platform: 'tiktok',
    externalId: user.open_id || 'tiktok-user',
    name: user.display_name || 'TikTok account',
    username: user.display_name,
    accessToken,
    metadata: { followerCount: user.follower_count, refreshToken: req.body.refreshToken || null }
  });

  audit(req, { action: 'tiktok.connect', targetType: 'brand', targetId: brandId, brandId });
  res.json({ success: true, connection: toPublicConnection(connection), profile: { displayName: user.display_name } });
}));

router.delete('/tiktok/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  await deleteConnection(brandId, 'tiktok');
  res.json({ success: true });
}));

/**
 * Sends a video to TikTok.
 *
 * `PULL_FROM_URL` has TikTok fetch the file, which avoids streaming it through
 * this server. It requires the domain to be verified in the TikTok developer
 * console — unverified domains are rejected, which is the most common reason
 * a correct-looking call fails.
 */
router.post('/tiktok/publish', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const conn = await requireTikTok(brandId);

  const videoUrl = assertFetchable(requireParam(req.body.videoUrl, 'videoUrl'), 'TikTok');
  const caption = String(req.body.caption || '').slice(0, 2200);
  // Direct posting needs app approval; an inbox draft is what an unapproved
  // app can do, and it still lets the creator publish in one tap.
  const asDraft = req.body.directPost !== true;

  const publicationId = randomId('vidpub');
  await recordPublication({
    id: publicationId, brand_id: brandId, platform: 'tiktok', connection_id: conn.id,
    caption, video_url: videoUrl, status: 'INITIATING', privacy: req.body.privacyLevel || 'SELF_ONLY'
  });

  const endpoint = asDraft
    ? `${TIKTOK_BASE()}/v2/post/publish/inbox/video/init/`
    : `${TIKTOK_BASE()}/v2/post/publish/video/init/`;

  const body: Record<string, any> = { source_info: { source: 'PULL_FROM_URL', video_url: videoUrl } };
  if (!asDraft) {
    body.post_info = {
      title: caption,
      // Defaults to the most private option; a caller must opt into public.
      privacy_level: req.body.privacyLevel || 'SELF_ONLY',
      disable_comment: req.body.disableComment === true,
      disable_duet: req.body.disableDuet === true,
      disable_stitch: req.body.disableStitch === true
    };
  }

  const result = await jsonFetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conn.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body)
  });

  if (!result.ok || result.body?.error?.code !== 'ok') {
    const detail = result.body?.error?.message || `HTTP ${result.status}`;
    await recordPublication({
      id: publicationId, brand_id: brandId, platform: 'tiktok',
      status: 'FAILED', error: String(detail).slice(0, 500)
    });
    throw new HttpError(result.status >= 400 ? result.status : 502, `TikTok rejected the upload: ${detail}`);
  }

  const publishId = result.body?.data?.publish_id;
  await recordPublication({
    id: publicationId, brand_id: brandId, platform: 'tiktok', connection_id: conn.id,
    caption, video_url: videoUrl, publish_id: publishId,
    status: asDraft ? 'SENT_TO_INBOX' : 'PROCESSING', published_at: timestamp()
  });

  audit(req, { action: 'tiktok.publish', targetType: 'video', targetId: publicationId, brandId });

  res.json({
    success: true,
    publicationId,
    publishId,
    mode: asDraft ? 'inbox_draft' : 'direct_post',
    note: asDraft
      ? 'Sent to the creator’s TikTok inbox. They finish and publish it from the app.'
      : 'Uploaded to TikTok. It appears once TikTok finishes processing it.'
  });
}));

/** TikTok processes asynchronously, so the result arrives by polling. */
router.get('/tiktok/status/:publishId', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const conn = await requireTikTok(brandId);

  const result = await jsonFetch(`${TIKTOK_BASE()}/v2/post/publish/status/fetch/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conn.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ publish_id: req.params.publishId })
  });

  if (!result.ok) throw new HttpError(502, `TikTok status check failed: ${result.body?.error?.message || result.status}`);

  const data = result.body?.data || {};
  res.json({
    status: data.status,
    failReason: data.fail_reason,
    publiclyAvailablePostIds: data.publicaly_available_post_id || data.publicly_available_post_id || []
  });
}));

/* ================================================================== */
/* YouTube                                                             */
/* ================================================================== */

const requireYouTube = async (brandId: string) => {
  const conn = await getConnection(brandId, 'youtube');
  if (!conn?.accessToken) throw notConnected('YouTube');
  return conn;
};

/** Stored credential is the refresh token; an access token is minted per call. */
const youTubeAccessToken = async (refreshToken: string): Promise<string> => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(501, 'YouTube needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to be configured.');
  }

  const result = await jsonFetch(`${GOOGLE_OAUTH()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });

  if (!result.ok) {
    throw new HttpError(401, `Google rejected the YouTube credential: ${result.body?.error_description || result.status}`);
  }
  return result.body.access_token;
};

router.get('/youtube/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const conn = await getConnection(brandId, 'youtube');
  if (!conn) return res.json({ connected: false, connection: null, channel: null });

  try {
    const token = await youTubeAccessToken(conn.accessToken);
    const result = await jsonFetch(
      `${YOUTUBE_BASE()}/youtube/v3/channels?part=snippet,statistics&mine=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!result.ok) throw new Error(result.body?.error?.message || `HTTP ${result.status}`);

    const channel = result.body?.items?.[0];
    res.json({
      connected: true,
      connection: toPublicConnection(conn),
      channel: channel ? {
        id: channel.id,
        title: channel.snippet?.title,
        subscribers: num(channel.statistics?.subscriberCount),
        videoCount: num(channel.statistics?.videoCount)
      } : null
    });
  } catch (err: any) {
    res.json({ connected: false, connection: toPublicConnection(conn), channel: null, error: err.message });
  }
}));

router.post('/youtube/connect', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const userId = currentUserId(req);
  const refreshToken = requireParam(req.body.refreshToken, 'refreshToken').trim();

  const token = await youTubeAccessToken(refreshToken);
  const result = await jsonFetch(
    `${YOUTUBE_BASE()}/youtube/v3/channels?part=snippet,statistics&mine=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!result.ok) throw new HttpError(401, `YouTube rejected this credential: ${result.body?.error?.message || result.status}`);

  const channel = result.body?.items?.[0];
  if (!channel) throw badRequest('That Google account has no YouTube channel.');

  const connection = await upsertConnection({
    userId, brandId, platform: 'youtube',
    externalId: channel.id,
    name: channel.snippet?.title || 'YouTube channel',
    username: channel.snippet?.customUrl,
    accessToken: refreshToken,
    scopes: ['https://www.googleapis.com/auth/youtube.upload'],
    metadata: { subscribers: channel.statistics?.subscriberCount }
  });

  audit(req, { action: 'youtube.connect', targetType: 'brand', targetId: brandId, brandId });
  res.json({ success: true, connection: toPublicConnection(connection), channel: { id: channel.id, title: channel.snippet?.title } });
}));

router.delete('/youtube/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  await deleteConnection(brandId, 'youtube');
  res.json({ success: true });
}));

/**
 * Uploads a video to YouTube.
 *
 * YouTube does not fetch from a URL, so the file is streamed through this
 * server: start a resumable session, then send the bytes. Defaults to private
 * — publishing to a channel's subscribers is a decision, not a default.
 */
router.post('/youtube/publish', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const conn = await requireYouTube(brandId);

  const videoUrl = assertFetchable(requireParam(req.body.videoUrl, 'videoUrl'), 'YouTube');
  const title = String(requireParam(req.body.title, 'title')).slice(0, 100);
  const description = String(req.body.description || '').slice(0, 5000);
  const privacyStatus = ['private', 'unlisted', 'public'].includes(req.body.privacyStatus)
    ? req.body.privacyStatus
    : 'private';

  const publicationId = randomId('vidpub');
  await recordPublication({
    id: publicationId, brand_id: brandId, platform: 'youtube', connection_id: conn.id,
    title, caption: description, video_url: videoUrl, privacy: privacyStatus, status: 'FETCHING'
  });

  const token = await youTubeAccessToken(conn.accessToken);

  // Fetch the file first: failing here costs nothing, whereas failing after
  // opening an upload session leaves a dangling one.
  const source = await fetch(videoUrl);
  if (!source.ok) {
    await recordPublication({ id: publicationId, brand_id: brandId, platform: 'youtube', status: 'FAILED', error: `Could not fetch ${videoUrl}` });
    throw new HttpError(502, `Could not fetch the video from ${videoUrl} (HTTP ${source.status}).`);
  }
  const bytes = Buffer.from(await source.arrayBuffer());

  const metadata = {
    snippet: {
      title,
      description,
      tags: Array.isArray(req.body.tags) ? req.body.tags.slice(0, 20) : undefined,
      categoryId: req.body.categoryId || '22'
    },
    status: { privacyStatus, selfDeclaredMadeForKids: req.body.madeForKids === true }
  };

  const init = await fetch(
    `${YOUTUBE_BASE()}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': String(bytes.length),
        'X-Upload-Content-Type': source.headers.get('content-type') || 'video/mp4'
      },
      body: JSON.stringify(metadata)
    }
  );

  if (!init.ok) {
    const detail = await init.text();
    await recordPublication({ id: publicationId, brand_id: brandId, platform: 'youtube', status: 'FAILED', error: detail.slice(0, 500) });
    throw new HttpError(init.status, `YouTube refused the upload: ${detail.slice(0, 300)}`);
  }

  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new HttpError(502, 'YouTube did not return an upload location.');

  await recordPublication({
    id: publicationId, brand_id: brandId, platform: 'youtube', connection_id: conn.id,
    title, caption: description, video_url: videoUrl, privacy: privacyStatus, status: 'UPLOADING'
  });

  const upload = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Length': String(bytes.length), 'Content-Type': source.headers.get('content-type') || 'video/mp4' },
    body: bytes
  });

  const uploaded = await upload.json().catch(() => ({}));
  if (!upload.ok) {
    await recordPublication({
      id: publicationId, brand_id: brandId, platform: 'youtube',
      status: 'FAILED', error: JSON.stringify(uploaded).slice(0, 500)
    });
    throw new HttpError(upload.status, `YouTube upload failed: ${uploaded?.error?.message || upload.status}`);
  }

  const permalink = `https://youtu.be/${uploaded.id}`;
  await recordPublication({
    id: publicationId, brand_id: brandId, platform: 'youtube', connection_id: conn.id,
    title, caption: description, video_url: videoUrl, privacy: privacyStatus,
    remote_id: uploaded.id, permalink, status: 'PUBLISHED', published_at: timestamp()
  });

  audit(req, { action: 'youtube.publish', targetType: 'video', targetId: publicationId, brandId, detail: { privacyStatus } });
  logger.info('youtube upload complete', { brandId, videoId: uploaded.id, privacyStatus });

  res.json({
    success: true,
    publicationId,
    videoId: uploaded.id,
    permalink,
    privacyStatus,
    note: privacyStatus === 'private'
      ? 'Uploaded as private. Change its visibility in YouTube Studio when you are ready.'
      : `Uploaded as ${privacyStatus}.`
  });
}));

/* ------------------------------------------------------------------ */
/* Shared history                                                      */
/* ------------------------------------------------------------------ */

router.get('/publications', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  await ensureStoreReady();

  const rows = await selectRows<any>(
    'video_publications', 'brand_id = $1', [brandId], 'ORDER BY created_at DESC LIMIT 100'
  );

  res.json({
    publications: rows.map(r => ({
      id: r.id, platform: r.platform, title: r.title, caption: r.caption,
      videoUrl: r.video_url, remoteId: r.remote_id, publishId: r.publish_id,
      permalink: r.permalink, privacy: r.privacy, status: r.status, error: r.error,
      createdAt: r.created_at, publishedAt: r.published_at
    }))
  });
}));

export default router;
