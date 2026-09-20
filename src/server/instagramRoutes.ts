/**
 * Instagram Graph API routes.
 *
 * Publishing on Instagram is a two-phase protocol: create a media container,
 * wait for Meta to finish transcoding it, then publish. Video and Reels
 * containers are never ready immediately, so the poll is mandatory — skipping
 * it is the single most common cause of "publish succeeded but nothing posted".
 */
import { Router, Request, Response } from 'express';
import { graphGet, graphPost, graphGetAll, debugToken, MetaApiError } from './graphClient';
import {
  upsertConnection, getConnection, deleteConnection, toPublicConnection,
  markConnectionVerified, markConnectionError, saveRow, selectRows, q,
  stringifyJson, timestamp, num, ensureStoreReady
} from './store';
import { asyncHandler, badRequest, notConnected, requireParam, currentUserId, HttpError } from './http';
import { randomId } from './crypto';

const router = Router();

export const requireIgConnection = async (brandId: string) => {
  const conn = await getConnection(brandId, 'instagram');
  if (!conn || !conn.accessToken) throw notConnected('Instagram');
  return conn;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Waits for a media container to reach FINISHED.
 * Images usually settle in a second or two; Reels can take a minute or more.
 */
export const waitForContainer = async (
  containerId: string,
  accessToken: string,
  { timeoutMs = 180_000, intervalMs = 3_000 } = {}
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'UNKNOWN';

  while (Date.now() < deadline) {
    const { data } = await graphGet<any>(containerId, accessToken, {
      fields: 'status_code,status'
    });
    lastStatus = data?.status_code || 'UNKNOWN';

    if (lastStatus === 'FINISHED') return;
    if (lastStatus === 'ERROR') {
      throw new HttpError(
        502,
        `Instagram could not process this media: ${data?.status || 'container returned ERROR'}`,
        { containerId, status: data?.status }
      );
    }
    if (lastStatus === 'EXPIRED') {
      throw new HttpError(410, 'The Instagram media container expired before it could be published.', { containerId });
    }
    await sleep(intervalMs);
  }

  throw new HttpError(
    504,
    `Instagram media was still "${lastStatus}" after ${Math.round(timeoutMs / 1000)}s. ` +
    'Large videos can exceed this window — the container may still finish, so check the account before retrying.',
    { containerId, lastStatus }
  );
};

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

router.get('/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const conn = await getConnection(brandId, 'instagram');
  if (!conn) return res.json({ connected: false, connection: null, profile: null });

  try {
    const { data: profile } = await graphGet<any>(conn.externalId, conn.accessToken, {
      fields: 'id,username,name,followers_count,follows_count,media_count,profile_picture_url,biography'
    });
    await markConnectionVerified(conn.id);

    // Keep the cached counts fresh for the dashboard.
    await upsertConnection({
      userId: conn.userId, brandId, platform: 'instagram',
      externalId: conn.externalId, name: profile.name || conn.name,
      username: profile.username, accessToken: conn.accessToken,
      tokenExpiresAt: conn.tokenExpiresAt, scopes: conn.scopes,
      metadata: {
        ...conn.metadata,
        followersCount: profile.followers_count,
        mediaCount: profile.media_count,
        profilePictureUrl: profile.profile_picture_url
      }
    });

    res.json({
      connected: true,
      connection: toPublicConnection((await getConnection(brandId, 'instagram'))!),
      profile: {
        id: profile.id,
        username: profile.username,
        name: profile.name,
        followersCount: num(profile.followers_count),
        followsCount: num(profile.follows_count),
        mediaCount: num(profile.media_count),
        profilePictureUrl: profile.profile_picture_url,
        biography: profile.biography
      }
    });
  } catch (err: any) {
    await markConnectionError(conn.id, err.message, err instanceof MetaApiError && err.isAuthError ? 'expired' : 'error');
    res.json({
      connected: false,
      connection: toPublicConnection(conn),
      profile: null,
      error: err instanceof MetaApiError ? err.toClientMessage() : err.message
    });
  }
}));

/**
 * Connects an IG Business/Creator account. The account must be linked to a
 * Facebook Page — that is a Meta platform requirement, not a choice we make —
 * so the Page token is what actually authorises publishing.
 */
router.post('/connect', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const brandId = requireParam(req.body.brandId, 'brandId');
  const accessToken = requireParam(req.body.accessToken, 'accessToken').trim();
  let igUserId = (req.body.instagramAccountId || '').trim();

  const info = await debugToken(accessToken);
  if (!info.valid) throw badRequest('Meta rejected this access token. Generate a new one and try again.');

  // Discover the IG account from the token's Pages when not supplied.
  if (!igUserId) {
    const pages = await graphGetAll<any>('me/accounts', accessToken, {
      fields: 'id,name,access_token,instagram_business_account{id,username}'
    });
    const withIg = pages.find(p => p.instagram_business_account?.id);
    if (!withIg) {
      throw badRequest(
        'No Instagram Business account was found on this token. Link your Instagram account to a Facebook Page, ' +
        'then reconnect with the pages_show_list and instagram_basic permissions.'
      );
    }
    igUserId = withIg.instagram_business_account.id;
    req.body.pageId = req.body.pageId || withIg.id;
    // A Page-scoped token is the correct credential for publishing.
    if (withIg.access_token) req.body.pageAccessToken = withIg.access_token;
  }

  const effectiveToken = req.body.pageAccessToken || accessToken;

  const { data: profile } = await graphGet<any>(igUserId, effectiveToken, {
    fields: 'id,username,name,followers_count,media_count,profile_picture_url'
  });

  const connection = await upsertConnection({
    userId, brandId, platform: 'instagram',
    externalId: profile.id,
    name: profile.name || profile.username,
    username: profile.username,
    accessToken: effectiveToken,
    tokenExpiresAt: info.expiresAt,
    scopes: info.scopes,
    metadata: {
      pageId: req.body.pageId || null,
      followersCount: profile.followers_count,
      mediaCount: profile.media_count,
      profilePictureUrl: profile.profile_picture_url,
      tokenKind: req.body.pageAccessToken ? 'page' : 'user'
    }
  });

  res.json({
    success: true,
    connection: toPublicConnection(connection),
    profile: {
      id: profile.id,
      username: profile.username,
      followersCount: num(profile.followers_count),
      mediaCount: num(profile.media_count),
      profilePictureUrl: profile.profile_picture_url
    }
  });
}));

router.delete('/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId || req.body?.brandId, 'brandId');
  await deleteConnection(brandId, 'instagram');
  res.json({ success: true });
}));

/* ------------------------------------------------------------------ */
/* Publishing                                                          */
/* ------------------------------------------------------------------ */

/**
 * Publishes a feed image, Reel, Story or carousel.
 * Every stage is recorded, so a failure halfway through is visible rather
 * than reported as a success.
 */
router.post('/publish', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.body.brandId, 'brandId');
  const conn = await requireIgConnection(brandId);
  const token = conn.accessToken;
  const ig = conn.externalId;

  const {
    mediaType = 'IMAGE', mediaUrl, videoUrl, caption = '',
    firstComment, coverUrl, shareToFeed = true, children = [], locationId, userTags
  } = req.body;

  const kind = String(mediaType).toUpperCase();
  const publicationId = randomId('igpub');

  const record = async (patch: Record<string, any>) =>
    saveRow('instagram_publications', {
      id: publicationId,
      brand_id: brandId,
      connection_id: conn.id,
      media_type: kind,
      media_url: mediaUrl || videoUrl || '',
      caption,
      first_comment: firstComment || '',
      created_at: timestamp(),
      ...patch
    });

  await record({ status: 'CREATING_CONTAINER' });

  try {
    let containerId: string;

    if (kind === 'CAROUSEL') {
      if (!Array.isArray(children) || children.length < 2) {
        throw badRequest('A carousel needs at least 2 items.');
      }
      // Children are created first, each as its own un-published container.
      const childIds: string[] = [];
      for (const child of children.slice(0, 10)) {
        const childBody: Record<string, any> = { is_carousel_item: true };
        if (String(child.mediaType).toUpperCase() === 'VIDEO') childBody.video_url = child.url;
        else childBody.image_url = child.url;

        const { data } = await graphPost<any>(`${ig}/media`, token, childBody);
        await waitForContainer(data.id, token, { timeoutMs: 120_000 });
        childIds.push(data.id);
      }

      const { data: parent } = await graphPost<any>(`${ig}/media`, token, {
        media_type: 'CAROUSEL',
        caption,
        children: childIds.join(','),
        location_id: locationId
      });
      containerId = parent.id;
    } else {
      const body: Record<string, any> = { caption };

      if (kind === 'REELS') {
        if (!videoUrl && !mediaUrl) throw badRequest('A Reel requires a publicly reachable video URL.');
        body.media_type = 'REELS';
        body.video_url = videoUrl || mediaUrl;
        body.share_to_feed = shareToFeed;
        if (coverUrl) body.cover_url = coverUrl;
      } else if (kind === 'STORIES') {
        body.media_type = 'STORIES';
        if (videoUrl) body.video_url = videoUrl;
        else if (mediaUrl) body.image_url = mediaUrl;
        else throw badRequest('A Story requires an image or video URL.');
        delete body.caption; // Stories do not take captions.
      } else {
        if (!mediaUrl) throw badRequest('A feed post requires a publicly reachable image URL.');
        body.image_url = mediaUrl;
      }

      if (locationId) body.location_id = locationId;
      if (userTags) body.user_tags = JSON.stringify(userTags);

      const { data } = await graphPost<any>(`${ig}/media`, token, body);
      containerId = data.id;
    }

    await record({ status: 'PROCESSING', container_id: containerId });

    // Images finish near-instantly; video/Reels genuinely need the wait.
    await waitForContainer(containerId, token, {
      timeoutMs: kind === 'REELS' || kind === 'CAROUSEL' ? 300_000 : 60_000
    });

    await record({ status: 'PUBLISHING', container_id: containerId });

    const { data: published } = await graphPost<any>(`${ig}/media_publish`, token, {
      creation_id: containerId
    });

    let permalink = '';
    try {
      const { data: media } = await graphGet<any>(published.id, token, { fields: 'permalink,media_type,timestamp' });
      permalink = media.permalink || '';
    } catch { /* permalink is a nicety, not a failure condition */ }

    // The first comment is where hashtags belong; a failure here must not
    // invalidate an otherwise successful post.
    let firstCommentStatus: string | undefined;
    if (firstComment && String(firstComment).trim()) {
      try {
        await graphPost(`${published.id}/comments`, token, { message: String(firstComment).trim() });
        firstCommentStatus = 'posted';
      } catch (err: any) {
        firstCommentStatus = `failed: ${err instanceof MetaApiError ? err.toClientMessage() : err.message}`;
      }
    }

    await record({
      status: 'PUBLISHED',
      container_id: containerId,
      media_id: published.id,
      permalink,
      published_at: timestamp()
    });

    res.json({
      success: true,
      publicationId,
      mediaId: published.id,
      containerId,
      permalink,
      firstComment: firstCommentStatus,
      mediaType: kind
    });
  } catch (err: any) {
    const message = err instanceof MetaApiError ? err.toClientMessage() : err.message;
    await record({ status: 'FAILED', error: String(message).slice(0, 500) });

    if (err instanceof HttpError || err instanceof MetaApiError) throw err;
    throw new HttpError(502, message || 'Instagram publish failed.', { publicationId });
  }
}));

/** Publication history straight from our own audit table. */
router.get('/publications', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const rows = await selectRows<any>(
    'instagram_publications', 'brand_id = $1', [brandId], 'ORDER BY created_at DESC LIMIT 100'
  );
  res.json({
    publications: rows.map(r => ({
      id: r.id,
      mediaId: r.media_id,
      containerId: r.container_id,
      mediaType: r.media_type,
      mediaUrl: r.media_url,
      caption: r.caption,
      permalink: r.permalink,
      status: r.status,
      error: r.error,
      createdAt: r.created_at,
      publishedAt: r.published_at
    }))
  });
}));

/** Recent posts with their live engagement counts. */
router.get('/media', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const conn = await requireIgConnection(brandId);

  const media = await graphGetAll<any>(`${conn.externalId}/media`, conn.accessToken, {
    fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count',
    limit: 25
  }, 2);

  res.json({
    media: media.map(m => ({
      id: m.id, caption: m.caption, mediaType: m.media_type,
      mediaUrl: m.media_url, thumbnailUrl: m.thumbnail_url,
      permalink: m.permalink, timestamp: m.timestamp,
      likeCount: num(m.like_count), commentsCount: num(m.comments_count)
    }))
  });
}));

/** Account-level insights. Instagram caps most metrics at a 30-day window. */
router.get('/insights', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const conn = await requireIgConnection(brandId);
  const period = (req.query.period as string) || 'day';
  const days = Math.min(30, Math.max(1, num(req.query.days, 30)));

  const since = Math.floor((Date.now() - days * 86_400_000) / 1000);
  const until = Math.floor(Date.now() / 1000);

  const { data } = await graphGet<any>(`${conn.externalId}/insights`, conn.accessToken, {
    metric: 'reach,impressions,profile_views,website_clicks,accounts_engaged',
    period,
    metric_type: 'total_value',
    since,
    until
  }).catch(async () => {
    // Newer accounts reject some legacy metrics; fall back to the core set.
    return graphGet<any>(`${conn.externalId}/insights`, conn.accessToken, {
      metric: 'reach,impressions', period, since, until
    });
  });

  const metrics: Record<string, any> = {};
  for (const entry of data?.data || []) {
    metrics[entry.name] = {
      title: entry.title,
      description: entry.description,
      total: entry.total_value?.value ?? (entry.values || []).reduce((s: number, v: any) => s + num(v.value), 0),
      series: (entry.values || []).map((v: any) => ({ value: num(v.value), endTime: v.end_time }))
    };
  }

  res.json({ period, days, metrics });
}));

/* ------------------------------------------------------------------ */
/* DM automation rules                                                 */
/* ------------------------------------------------------------------ */

router.get('/dm-rules', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const rows = await selectRows<any>('instagram_dm_rules', 'brand_id = $1', [brandId], 'ORDER BY created_at DESC');
  res.json({
    rules: rows.map(r => ({
      id: r.id, brandId: r.brand_id, keyword: r.keyword, replyMessage: r.reply_message,
      captureEmail: r.capture_email === '1', status: r.status,
      triggeredCount: num(r.triggered_count), leadsCaptured: num(r.leads_captured),
      createdAt: r.created_at
    }))
  });
}));

router.post('/dm-rules', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.body.brandId, 'brandId');
  const keyword = requireParam(req.body.keyword, 'keyword').toUpperCase();
  const replyMessage = requireParam(req.body.replyMessage, 'replyMessage');

  // A rule is useless without a webhook to fire it — say so at creation time.
  const conn = await getConnection(brandId, 'instagram');
  const webhookReady = Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN);

  const id = req.body.id || randomId('igdm');
  await saveRow('instagram_dm_rules', {
    id, brand_id: brandId, keyword, reply_message: replyMessage,
    capture_email: req.body.captureEmail ? '1' : '0',
    status: req.body.status || 'ACTIVE',
    triggered_count: String(num(req.body.triggeredCount)),
    leads_captured: String(num(req.body.leadsCaptured)),
    created_at: req.body.createdAt || timestamp()
  });

  res.json({
    success: true,
    id,
    webhookReady,
    warning: webhookReady
      ? undefined
      : 'This rule is saved but will not fire until the Meta webhook is configured (set META_WEBHOOK_VERIFY_TOKEN and subscribe the app to the `messages` field).',
    connected: Boolean(conn)
  });
}));

router.delete('/dm-rules/:id', asyncHandler(async (req: Request, res: Response) => {
  await ensureStoreReady();
  await q('DELETE FROM instagram_dm_rules WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

export default router;
