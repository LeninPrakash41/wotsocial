/**
 * Server-side publishing for scheduled posts.
 *
 * The browser-side publisher cannot run on a schedule, and the tokens it uses
 * live in localStorage. This publishes from the server using the encrypted
 * platform connections, so a post scheduled for 3am actually goes out.
 */
import { graphGet, graphPost, MetaApiError } from './graphClient';
import { getConnection, q, ensureStoreReady, timestamp } from './store';

export interface PublishOutcome {
  platform: string;
  ok: boolean;
  remoteId?: string;
  permalink?: string;
  error?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Tunable so the test suite does not spend most of its time waiting. */
const CONTAINER_POLL_MS = Number(process.env.IG_CONTAINER_POLL_MS || 5_000);

/** Media must be fetchable by the platform, not a data URL or a localhost URL. */
const assertFetchable = (url: string | undefined, platform: string): string => {
  if (!url) throw new Error(`${platform} requires media, and this post has none.`);
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    throw new Error(
      `${platform} fetches media from a URL and cannot read an embedded asset. ` +
      'Re-save the media so it is hosted, then reschedule.'
    );
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(url)) {
    throw new Error(
      `${platform} cannot reach ${url}. Configure S3_BUCKET so media is served from a public URL.`
    );
  }
  return url;
};

/**
 * Instagram's two-phase publish, same as the interactive path: create a
 * container, wait for it to finish processing, then publish.
 */
const publishInstagram = async (brandId: string, post: any): Promise<PublishOutcome> => {
  const conn = await getConnection(brandId, 'instagram');
  if (!conn) return { platform: 'instagram', ok: false, error: 'No Instagram account is connected for this brand.' };

  const isVideo = post.media_type === 'video';
  const mediaUrl = assertFetchable(post.media_url, 'Instagram');

  const { data: container } = await graphPost<any>(`${conn.externalId}/media`, conn.accessToken,
    isVideo
      ? { media_type: 'REELS', video_url: mediaUrl, caption: post.content }
      : { image_url: mediaUrl, caption: post.content }
  );

  // Video needs transcoding; publishing before it finishes silently fails.
  const deadline = Date.now() + (isVideo ? 300_000 : 60_000);
  while (Date.now() < deadline) {
    const { data: status } = await graphGet<any>(container.id, conn.accessToken, { fields: 'status_code,status' });
    if (status?.status_code === 'FINISHED') break;
    if (status?.status_code === 'ERROR') {
      throw new Error(`Instagram could not process the media: ${status?.status || 'container returned ERROR'}`);
    }
    await sleep(CONTAINER_POLL_MS);
  }

  const { data: published } = await graphPost<any>(`${conn.externalId}/media_publish`, conn.accessToken, {
    creation_id: container.id
  });

  let permalink = '';
  try {
    const { data } = await graphGet<any>(published.id, conn.accessToken, { fields: 'permalink' });
    permalink = data?.permalink || '';
  } catch { /* a nicety, not a failure */ }

  return { platform: 'instagram', ok: true, remoteId: published.id, permalink };
};

/** Publishes to the Facebook Page behind the brand's Meta connection. */
const publishFacebook = async (brandId: string, post: any): Promise<PublishOutcome> => {
  const conn = (await getConnection(brandId, 'meta_ads')) || (await getConnection(brandId, 'instagram'));
  const pageId = conn?.metadata?.pageId;
  if (!conn || !pageId) {
    return { platform: 'facebook', ok: false, error: 'No Facebook Page is linked to this brand.' };
  }

  const hasMedia = Boolean(post.media_url) && post.media_type !== 'none';
  const data = hasMedia
    ? await graphPost<any>(`${pageId}/photos`, conn.accessToken, {
        url: assertFetchable(post.media_url, 'Facebook'),
        caption: post.content
      })
    : await graphPost<any>(`${pageId}/feed`, conn.accessToken, { message: post.content });

  return { platform: 'facebook', ok: true, remoteId: data.data?.id || data.data?.post_id };
};

/**
 * Twitter and LinkedIn still authenticate from environment credentials.
 *
 * Neither has a per-brand connection in the vault yet, so these are workspace
 * wide and will post as whichever account the token belongs to.
 */
const publishTwitter = async (post: any): Promise<PublishOutcome> => {
  const token = process.env.TWITTER_API_KEY;
  if (!token) return { platform: 'twitter', ok: false, error: 'TWITTER_API_KEY is not configured on the server.' };

  const res = await fetch('https://api.twitter.com/2/tweets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text: post.content })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.detail || body?.title || `Twitter returned HTTP ${res.status}`);
  return { platform: 'twitter', ok: true, remoteId: body?.data?.id };
};

const publishLinkedIn = async (post: any): Promise<PublishOutcome> => {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const urn = process.env.LINKEDIN_PERSON_URN;
  if (!token || !urn) {
    return { platform: 'linkedin', ok: false, error: 'LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN are not configured.' };
  }

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Restli-Protocol-Version': '2.0.0'
    },
    body: JSON.stringify({
      author: `urn:li:person:${urn}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: post.content },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `LinkedIn returned HTTP ${res.status}`);
  return { platform: 'linkedin', ok: true, remoteId: body?.id };
};

const publishOne = async (brandId: string, platform: string, post: any): Promise<PublishOutcome> => {
  const name = platform.toLowerCase();
  try {
    if (name.includes('instagram')) return await publishInstagram(brandId, post);
    if (name.includes('facebook')) return await publishFacebook(brandId, post);
    if (name.includes('twitter') || name === 'x') return await publishTwitter(post);
    if (name.includes('linkedin')) return await publishLinkedIn(post);
    return { platform: name, ok: false, error: `${platform} is not supported for scheduled publishing.` };
  } catch (err: any) {
    return {
      platform: name,
      ok: false,
      error: err instanceof MetaApiError ? err.toClientMessage() : (err?.message || String(err))
    };
  }
};

/**
 * Publishes everything that is due.
 *
 * A post is claimed before it is sent, so two overlapping cron runs cannot
 * publish the same thing twice — the window between "due" and "sent" is the
 * whole risk here, and double-posting is the failure users notice.
 */
export const publishDuePosts = async (options: { limit?: number } = {}): Promise<{
  considered: number;
  published: number;
  failed: number;
  results: { postId: string; brandId: string; outcomes: PublishOutcome[] }[];
}> => {
  await ensureStoreReady();
  const now = timestamp();
  const limit = options.limit ?? 25;

  const due = await q<any>(
    `SELECT * FROM posts
      WHERE status = 'scheduled' AND scheduled_time IS NOT NULL AND scheduled_time <= $1
      ORDER BY scheduled_time ASC`,
    [now]
  );
  const batch = due.slice(0, limit);

  const results: { postId: string; brandId: string; outcomes: PublishOutcome[] }[] = [];
  let published = 0;
  let failed = 0;

  for (const post of batch) {
    // Claim it first. If another run already moved it on, skip.
    const claim = await q<any>(
      `UPDATE posts SET status = 'publishing', updated_at = $1 WHERE id = $2 AND status = 'scheduled'`,
      [timestamp(), post.id]
    );
    const stillScheduled = await q<any>(`SELECT status FROM posts WHERE id = $1`, [post.id]);
    if (stillScheduled[0]?.status !== 'publishing') continue;

    let platforms: string[] = [];
    try {
      platforms = typeof post.platforms === 'string' ? JSON.parse(post.platforms || '[]') : (post.platforms || []);
    } catch { platforms = []; }
    if (!platforms.length) platforms = ['instagram'];

    const outcomes: PublishOutcome[] = [];
    for (const platform of platforms) {
      outcomes.push(await publishOne(post.brand_id, platform, post));
    }

    const anySucceeded = outcomes.some(o => o.ok);
    const errors = outcomes.filter(o => !o.ok).map(o => `${o.platform}: ${o.error}`).join(' | ');

    await q(
      `UPDATE posts SET status = $1, updated_at = $2 WHERE id = $3`,
      [anySucceeded ? 'published' : 'failed', timestamp(), post.id]
    );

    if (anySucceeded) published++; else failed++;
    results.push({ postId: post.id, brandId: post.brand_id, outcomes });

    if (errors) console.error(`Scheduled post ${post.id}: ${errors}`);
  }

  return { considered: due.length, published, failed, results };
};
