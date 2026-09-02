/**
 * Meta OAuth — the real authorization-code flow.
 *
 * Replaces the previous stub that acknowledged the redirect without ever
 * exchanging the code. The callback now exchanges for a user token, upgrades
 * it to a long-lived token, discovers the Pages / ad accounts / IG accounts it
 * controls, and persists an encrypted connection.
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { graphGet, graphGetAll, graphRequest, exchangeForLongLivedToken, debugToken } from './graphClient';
import { upsertConnection, q, ensureStoreReady, timestamp } from './store';
import { asyncHandler, badRequest, requireParam, currentUserId, HttpError } from './http';

const router = Router();

const SCOPES: Record<string, string[]> = {
  meta_ads: ['ads_management', 'ads_read', 'business_management', 'pages_show_list', 'pages_read_engagement'],
  instagram: [
    'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments',
    'instagram_manage_messages', 'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata'
  ],
  whatsapp: ['whatsapp_business_management', 'whatsapp_business_messaging', 'business_management']
};

const appUrl = () => (process.env.APP_URL || 'http://localhost:3050').replace(/\/$/, '');
const redirectUri = () => `${appUrl()}/api/oauth/meta/callback`;

const requireAppCredentials = () => {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new HttpError(
      501,
      'Meta OAuth is not configured on this server. Set META_APP_ID and META_APP_SECRET, or connect with a ' +
      'manually generated access token instead.',
      { code: 'OAUTH_NOT_CONFIGURED' }
    );
  }
  return { appId, appSecret };
};

/** Returns the consent URL. CSRF is prevented with a single-use `state`. */
router.get('/meta/start', asyncHandler(async (req: Request, res: Response) => {
  const { appId } = requireAppCredentials();
  const userId = currentUserId(req);
  const brandId = requireParam(req.query.brandId, 'brandId');
  const platform = (req.query.platform as string) || 'meta_ads';

  if (!SCOPES[platform]) throw badRequest(`Unknown platform "${platform}".`);

  await ensureStoreReady();
  const state = crypto.randomBytes(24).toString('hex');
  await q(
    `INSERT INTO oauth_states (state, user_id, brand_id, platform, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [state, userId, brandId, platform, timestamp()]
  );

  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', SCOPES[platform].join(','));

  if (req.query.redirect === 'true') return res.redirect(url.toString());
  res.json({ url: url.toString(), state, scopes: SCOPES[platform], redirectUri: redirectUri() });
}));

const closingPage = (payload: Record<string, any>) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${payload.success ? 'Connected' : 'Connection failed'}</title></head>
<body style="font-family:system-ui;padding:40px;text-align:center">
  <p>${payload.success ? '✅ Account connected. You can close this window.' : `⚠️ ${payload.error}`}</p>
  <script>
    if (window.opener) {
      window.opener.postMessage(${JSON.stringify(payload)}, window.location.origin);
      setTimeout(function(){ window.close(); }, 800);
    }
  </script>
</body></html>`;

/** Exchanges the code, discovers assets, and stores the connection. */
router.get('/meta/callback', asyncHandler(async (req: Request, res: Response) => {
  const { appId, appSecret } = requireAppCredentials();
  const { code, state, error_description } = req.query as Record<string, string>;

  if (!code) {
    return res
      .status(400)
      .send(closingPage({ type: 'OAUTH_RESULT', success: false, error: error_description || 'Authorization was cancelled.' }));
  }

  await ensureStoreReady();
  const rows = await q<any>(`SELECT * FROM oauth_states WHERE state = $1`, [state]);
  if (!rows.length) {
    return res
      .status(400)
      .send(closingPage({ type: 'OAUTH_RESULT', success: false, error: 'Invalid or expired OAuth state. Start the connection again.' }));
  }
  // Single use.
  await q(`DELETE FROM oauth_states WHERE state = $1`, [state]);
  const { user_id: userId, brand_id: brandId, platform } = rows[0];

  try {
    const { data: tokenRes } = await graphRequest<any>('oauth/access_token', {
      method: 'GET',
      accessToken: `${appId}|${appSecret}`,
      params: {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri(),
        code
      }
    });

    let accessToken: string = tokenRes.access_token;
    let expiresAt: string | null = null;
    try {
      const longLived = await exchangeForLongLivedToken(accessToken);
      accessToken = longLived.accessToken;
      expiresAt = longLived.expiresAt;
    } catch (err) {
      console.warn('Long-lived exchange failed, using short-lived token:', (err as Error).message);
    }

    const info = await debugToken(accessToken);
    const pages = await graphGetAll<any>('me/accounts', accessToken, {
      fields: 'id,name,access_token,instagram_business_account{id,username,name}'
    }).catch(() => []);

    const summary: Record<string, any> = { platform, brandId, pages: pages.length };

    if (platform === 'meta_ads') {
      const adAccounts = await graphGetAll<any>('me/adaccounts', accessToken, {
        fields: 'id,account_id,name,currency,timezone_name,account_status'
      });
      if (!adAccounts.length) throw new Error('This Meta account does not have access to any ad accounts.');

      const primary = adAccounts[0];
      const page = pages[0];
      await upsertConnection({
        userId, brandId, platform: 'meta_ads',
        externalId: primary.id, name: primary.name,
        accessToken, tokenExpiresAt: expiresAt, scopes: info.scopes,
        metadata: {
          currency: primary.currency,
          timezone: primary.timezone_name,
          accountStatus: primary.account_status,
          pageId: page?.id || null,
          instagramActorId: page?.instagram_business_account?.id || null,
          availableAdAccounts: adAccounts.map(a => ({ id: a.id, name: a.name, currency: a.currency })),
          availablePages: pages.map(p => ({ id: p.id, name: p.name }))
        }
      });
      summary.adAccount = { id: primary.id, name: primary.name };
      summary.adAccounts = adAccounts.length;
    }

    if (platform === 'instagram') {
      const withIg = pages.find(p => p.instagram_business_account?.id);
      if (!withIg) throw new Error('No Instagram Business account is linked to any Page on this login.');

      const ig = withIg.instagram_business_account;
      await upsertConnection({
        userId, brandId, platform: 'instagram',
        externalId: ig.id, name: ig.name || ig.username, username: ig.username,
        // The Page token is the credential that authorises IG publishing.
        accessToken: withIg.access_token || accessToken,
        tokenExpiresAt: withIg.access_token ? null : expiresAt,
        scopes: info.scopes,
        metadata: { pageId: withIg.id, pageName: withIg.name, tokenKind: withIg.access_token ? 'page' : 'user' }
      });
      summary.instagram = { id: ig.id, username: ig.username };
    }

    if (platform === 'whatsapp') {
      const businesses = await graphGetAll<any>('me/businesses', accessToken, { fields: 'id,name' }).catch(() => []);
      let connected = false;

      for (const business of businesses) {
        const wabas = await graphGetAll<any>(`${business.id}/owned_whatsapp_business_accounts`, accessToken, {
          fields: 'id,name'
        }).catch(() => []);
        for (const waba of wabas) {
          const numbers = await graphGetAll<any>(`${waba.id}/phone_numbers`, accessToken, {
            fields: 'id,display_phone_number,verified_name,quality_rating'
          }).catch(() => []);
          if (!numbers.length) continue;

          const phone = numbers[0];
          await upsertConnection({
            userId, brandId, platform: 'whatsapp',
            externalId: phone.id,
            name: phone.verified_name || phone.display_phone_number,
            username: phone.display_phone_number,
            accessToken, tokenExpiresAt: expiresAt, scopes: info.scopes,
            metadata: {
              wabaId: waba.id, wabaName: waba.name,
              displayPhoneNumber: phone.display_phone_number,
              qualityRating: phone.quality_rating
            }
          });
          summary.whatsapp = { phoneNumberId: phone.id, number: phone.display_phone_number, wabaId: waba.id };
          connected = true;
          break;
        }
        if (connected) break;
      }

      if (!connected) throw new Error('No WhatsApp Business phone number was found on this account.');
    }

    res.send(closingPage({ type: 'OAUTH_RESULT', success: true, platform, summary }));
  } catch (err: any) {
    console.error('OAuth callback failed:', err);
    res.status(500).send(
      closingPage({ type: 'OAUTH_RESULT', success: false, platform, error: err.message || 'Token exchange failed.' })
    );
  }
}));

/** Tells the UI whether to offer the OAuth button or the manual-token form. */
router.get('/meta/status', (_req: Request, res: Response) => {
  res.json({
    configured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    appId: process.env.META_APP_ID ? `${String(process.env.META_APP_ID).slice(0, 6)}…` : null,
    redirectUri: redirectUri(),
    webhookCallbackUrl: `${appUrl()}/api/webhooks/meta`,
    webhookConfigured: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
    scopes: SCOPES
  });
});

export default router;
