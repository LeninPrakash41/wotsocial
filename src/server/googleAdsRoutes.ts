/**
 * Google Ads: connect an account, launch a search campaign, read performance.
 *
 * The launch mirrors the Meta one — budget, campaign, ad group, responsive
 * search ad — and is created paused for the same reason: a live campaign
 * spends real money, so activation stays a separate, deliberate decision.
 */
import { Router, Request, Response } from 'express';
import {
  googleAdsRequest, googleAdsSearch, listAccessibleCustomers, refreshAccessToken,
  normalizeCustomerId, toMicros, fromMicros, GoogleAdsError, googleAdsConfigured, assertConfigured
} from './googleAdsClient';
import {
  upsertConnection, getConnection, deleteConnection, toPublicConnection,
  saveRow, selectRows, q, stringifyJson, timestamp, num, ensureStoreReady
} from './store';
import { asyncHandler, badRequest, requireParam, currentUserId, HttpError, notConnected } from './http';
import { requireOwnedBrand, audit } from './authMiddleware';
import { assertSpendAllowed } from './governance';
import { logger } from './logging';

const router = Router();

/** Google Ads reuses the platform_connections table under its own platform. */
const PLATFORM = 'google_ads' as any;

const requireGoogleConnection = async (brandId: string) => {
  const conn = await getConnection(brandId, PLATFORM);
  if (!conn || !conn.accessToken) throw notConnected('Google Ads');
  return conn;
};

/**
 * Google access tokens expire hourly, so what is stored is the refresh token
 * and a live one is minted per request.
 */
const liveToken = async (conn: any): Promise<string> => {
  const { accessToken } = await refreshAccessToken(conn.accessToken);
  return accessToken;
};

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    configured: googleAdsConfigured(),
    apiVersion: process.env.GOOGLE_ADS_API_VERSION || 'v18',
    note: googleAdsConfigured()
      ? undefined
      : 'Set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Google must approve the ' +
        'developer token before it works against live accounts.'
  });
}));

router.get('/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const conn = await getConnection(brandId, PLATFORM);
  if (!conn) return res.json({ connected: false, connection: null });

  try {
    const token = await liveToken(conn);
    const rows = await googleAdsSearch<any>({
      customerId: conn.externalId,
      accessToken: token,
      loginCustomerId: conn.metadata?.loginCustomerId,
      query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1'
    });

    const customer = rows[0]?.customer || {};
    res.json({
      connected: true,
      connection: toPublicConnection(conn),
      account: {
        id: customer.id || conn.externalId,
        name: customer.descriptiveName || conn.name,
        currency: customer.currencyCode,
        timeZone: customer.timeZone
      }
    });
  } catch (err: any) {
    res.json({
      connected: false,
      connection: toPublicConnection(conn),
      error: err instanceof GoogleAdsError ? err.toClientMessage() : err.message
    });
  }
}));

/**
 * Connects with a refresh token obtained through Google's OAuth consent flow
 * with the adwords scope.
 */
router.post('/connect', asyncHandler(async (req: Request, res: Response) => {
  assertConfigured();
  const brandId = await requireOwnedBrand(req);
  const userId = currentUserId(req);

  const refreshToken = requireParam(req.body.refreshToken, 'refreshToken');
  const customerId = normalizeCustomerId(requireParam(req.body.customerId, 'customerId'));
  const loginCustomerId = req.body.loginCustomerId ? normalizeCustomerId(req.body.loginCustomerId) : undefined;

  // Prove the credential works and reaches this account before storing it.
  const { accessToken } = await refreshAccessToken(refreshToken);

  const rows = await googleAdsSearch<any>({
    customerId, accessToken, loginCustomerId,
    query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager FROM customer LIMIT 1'
  });
  if (!rows.length) {
    throw badRequest(`This credential cannot reach Google Ads account ${customerId}. Check the id and that the user has access.`);
  }

  const customer = rows[0].customer;
  if (customer.manager) {
    throw badRequest(
      'That is a manager account, which cannot run campaigns itself. Connect the client account it manages, ' +
      'and give the manager id as the login customer id.'
    );
  }

  const connection = await upsertConnection({
    userId, brandId, platform: PLATFORM,
    externalId: customerId,
    name: customer.descriptiveName || `Google Ads ${customerId}`,
    accessToken: refreshToken,
    scopes: ['https://www.googleapis.com/auth/adwords'],
    metadata: {
      currency: customer.currencyCode,
      timeZone: customer.timeZone,
      loginCustomerId: loginCustomerId || null
    }
  });

  audit(req, { action: 'googleads.connect', targetType: 'brand', targetId: brandId, brandId });
  res.json({
    success: true,
    connection: toPublicConnection(connection),
    account: { id: customerId, name: customer.descriptiveName, currency: customer.currencyCode }
  });
}));

router.delete('/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  await deleteConnection(brandId, PLATFORM);
  audit(req, { action: 'googleads.disconnect', targetType: 'brand', targetId: brandId, brandId });
  res.json({ success: true });
}));

router.post('/discover', asyncHandler(async (req: Request, res: Response) => {
  assertConfigured();
  await requireOwnedBrand(req);
  const refreshToken = requireParam(req.body.refreshToken, 'refreshToken');

  const { accessToken } = await refreshAccessToken(refreshToken);
  res.json({ customerIds: await listAccessibleCustomers(accessToken) });
}));

/* ------------------------------------------------------------------ */
/* Campaign launch                                                     */
/* ------------------------------------------------------------------ */

const resourceId = (resourceName: string): string => resourceName.split('/').pop() || resourceName;

/**
 * Creates a complete search campaign: budget, campaign, ad group and a
 * responsive search ad.
 *
 * Always paused. Google enforces its own character limits, so headlines and
 * descriptions are trimmed rather than letting the whole mutate fail on one
 * string being three characters long.
 */
router.post('/campaigns', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const conn = await requireGoogleConnection(brandId);
  const customerId = conn.externalId;
  const loginCustomerId = conn.metadata?.loginCustomerId;

  const {
    name, dailyBudget, headlines = [], descriptions = [], finalUrl,
    keywords = [], negativeKeywords = [], path1, path2, activate = false
  } = req.body;

  if (!name?.trim()) throw badRequest('A campaign name is required.');
  if (!dailyBudget) throw badRequest('A daily budget is required.');
  if (!finalUrl) throw badRequest('A final URL is required — it is where the ad sends people.');
  if (headlines.length < 3) throw badRequest('Google requires at least 3 headlines for a responsive search ad.');
  if (descriptions.length < 2) throw badRequest('Google requires at least 2 descriptions.');

  const guard = await assertSpendAllowed({
    brandId, dailyBudget: Number(dailyBudget), activating: activate === true
  });

  const token = await liveToken(conn);
  const created: Record<string, string> = {};
  const status = activate === true ? 'ENABLED' : 'PAUSED';

  const mutate = <T = any>(resource: string, operations: unknown[]) =>
    googleAdsRequest<T>(`customers/${customerId}/${resource}:mutate`, {
      customerId, accessToken: token, loginCustomerId, body: { operations }, retry: false
    });

  try {
    /* 1. Budget — shared by the campaign, so it is created first. */
    const budgetRes = await mutate<{ results: { resourceName: string }[] }>('campaignBudgets', [{
      create: {
        name: `${name.trim()} budget ${Date.now()}`,
        amountMicros: toMicros(Number(dailyBudget)),
        deliveryMethod: 'STANDARD',
        // Not shared, so changing it cannot affect another campaign.
        explicitlyShared: false
      }
    }]);
    const budgetResource = budgetRes.results[0].resourceName;
    created.budget = budgetResource;

    /* 2. Campaign */
    const campaignRes = await mutate<{ results: { resourceName: string }[] }>('campaigns', [{
      create: {
        name: name.trim(),
        status,
        advertisingChannelType: 'SEARCH',
        campaignBudget: budgetResource,
        // Maximise clicks needs no conversion history, which a new account
        // will not have.
        maximizeConversions: undefined,
        manualCpc: { enhancedCpcEnabled: false },
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: true,
          targetContentNetwork: false,
          targetPartnerSearchNetwork: false
        }
      }
    }]);
    const campaignResource = campaignRes.results[0].resourceName;
    created.campaign = campaignResource;

    /* 3. Ad group */
    const adGroupRes = await mutate<{ results: { resourceName: string }[] }>('adGroups', [{
      create: {
        name: `${name.trim()} — ad group`,
        campaign: campaignResource,
        status,
        type: 'SEARCH_STANDARD',
        cpcBidMicros: toMicros(Number(req.body.cpcBid || 1))
      }
    }]);
    const adGroupResource = adGroupRes.results[0].resourceName;
    created.adGroup = adGroupResource;

    /* 4. The responsive search ad */
    const trim = (text: string, max: number) =>
      text.length > max ? `${text.slice(0, max - 1)}…` : text;

    const adRes = await mutate<{ results: { resourceName: string }[] }>('adGroupAds', [{
      create: {
        adGroup: adGroupResource,
        status,
        ad: {
          finalUrls: [finalUrl],
          responsiveSearchAd: {
            headlines: headlines.slice(0, 15).map((text: string) => ({ text: trim(text, 30) })),
            descriptions: descriptions.slice(0, 4).map((text: string) => ({ text: trim(text, 90) })),
            ...(path1 ? { path1: trim(path1, 15) } : {}),
            ...(path2 ? { path2: trim(path2, 15) } : {})
          }
        }
      }
    }]);
    created.ad = adRes.results[0].resourceName;

    /* 5. Keywords, which are criteria on the ad group */
    const criteria = [
      ...keywords.slice(0, 100).map((text: string) => ({
        create: {
          adGroup: adGroupResource,
          status: 'ENABLED',
          keyword: { text: text.replace(/^[+"[\]]/, ''), matchType: text.startsWith('[') ? 'EXACT' : text.startsWith('"') ? 'PHRASE' : 'BROAD' }
        }
      })),
      ...negativeKeywords.slice(0, 100).map((text: string) => ({
        create: {
          adGroup: adGroupResource,
          negative: true,
          keyword: { text: text.replace(/^-/, ''), matchType: 'BROAD' }
        }
      }))
    ];
    if (criteria.length) await mutate('adGroupCriteria', criteria);

    await saveRow('google_campaigns', {
      id: resourceId(campaignResource),
      brand_id: brandId,
      connection_id: conn.id,
      customer_id: customerId,
      name: name.trim(),
      status,
      daily_budget: String(dailyBudget),
      budget_resource: budgetResource,
      campaign_resource: campaignResource,
      ad_group_resource: adGroupResource,
      ad_resource: created.ad,
      config: stringifyJson({ headlines, descriptions, finalUrl, keywords, negativeKeywords }),
      created_at: timestamp()
    });

    audit(req, {
      action: 'googleads.campaign.create', targetType: 'campaign',
      targetId: resourceId(campaignResource), brandId, detail: { status, dailyBudget }
    });

    res.json({
      success: true,
      campaignId: resourceId(campaignResource),
      campaignResource,
      adGroupResource,
      adResource: created.ad,
      status,
      activated: status === 'ENABLED',
      spendWarnings: guard.warnings,
      reviewUrl: `https://ads.google.com/aw/campaigns?campaignId=${resourceId(campaignResource)}&__e=${customerId}`
    });
  } catch (err: any) {
    // Roll back in reverse order so the account is not left with orphans.
    const rolledBack: string[] = [];
    for (const [label, resource] of [['ad', created.ad], ['adGroup', created.adGroup],
                                     ['campaign', created.campaign], ['budget', created.budget]] as const) {
      if (!resource) continue;
      const collection = { ad: 'adGroupAds', adGroup: 'adGroups', campaign: 'campaigns', budget: 'campaignBudgets' }[label];
      try {
        await mutate(collection, [{ remove: resource }]);
        rolledBack.push(resource);
      } catch (cleanupErr: any) {
        logger.warn('google ads rollback failed', { resource, detail: cleanupErr.message });
      }
    }

    if (err instanceof HttpError) throw err;
    throw new HttpError(
      err instanceof GoogleAdsError && err.status >= 400 ? err.status : 502,
      err instanceof GoogleAdsError ? err.toClientMessage() : (err.message || 'Campaign creation failed.'),
      { created, rolledBack, google: err instanceof GoogleAdsError ? err.toJSON() : undefined }
    );
  }
}));

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

const DATE_RANGE: Record<string, string> = {
  last_7d: 'LAST_7_DAYS',
  last_14d: 'LAST_14_DAYS',
  last_30d: 'LAST_30_DAYS',
  last_90d: 'LAST_30_DAYS'
};

router.get('/campaigns', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const conn = await requireGoogleConnection(brandId);
  const range = DATE_RANGE[(req.query.datePreset as string) || 'last_30d'] || 'LAST_30_DAYS';

  const rows = await googleAdsSearch<any>({
    customerId: conn.externalId,
    accessToken: await liveToken(conn),
    loginCustomerId: conn.metadata?.loginCustomerId,
    query: `
      SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros,
             metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
             metrics.ctr, metrics.average_cpc
        FROM campaign
       WHERE segments.date DURING ${range}
         AND campaign.status != 'REMOVED'`
  });

  res.json({
    campaigns: rows.map(row => ({
      id: String(row.campaign.id),
      name: row.campaign.name,
      status: row.campaign.status,
      dailyBudget: fromMicros(row.campaignBudget?.amountMicros || 0),
      impressions: num(row.metrics?.impressions),
      clicks: num(row.metrics?.clicks),
      spent: fromMicros(row.metrics?.costMicros || 0),
      conversions: num(row.metrics?.conversions),
      ctr: Number(((row.metrics?.ctr || 0) * 100).toFixed(2)),
      cpc: fromMicros(row.metrics?.averageCpc || 0)
    })),
    currency: conn.metadata?.currency || 'USD'
  });
}));

router.post('/campaigns/:id/status', asyncHandler(async (req: Request, res: Response) => {
  const brandId = await requireOwnedBrand(req);
  const conn = await requireGoogleConnection(brandId);

  const status = String(requireParam(req.body.status, 'status')).toUpperCase();
  if (!['ENABLED', 'PAUSED', 'REMOVED'].includes(status)) {
    throw badRequest('Status must be ENABLED, PAUSED or REMOVED.');
  }

  // Enabling restarts spend, so the cap applies here as it does at launch.
  let spendWarnings: string[] = [];
  if (status === 'ENABLED') {
    const [local] = await selectRows<any>('google_campaigns', 'id = $1', [req.params.id]);
    const guard = await assertSpendAllowed({
      brandId,
      dailyBudget: local?.daily_budget ? Number(local.daily_budget) : undefined,
      activating: true
    });
    spendWarnings = guard.warnings;
  }

  await googleAdsRequest(`customers/${conn.externalId}/campaigns:mutate`, {
    customerId: conn.externalId,
    accessToken: await liveToken(conn),
    loginCustomerId: conn.metadata?.loginCustomerId,
    body: {
      operations: [{
        update: { resourceName: `customers/${conn.externalId}/campaigns/${req.params.id}`, status },
        updateMask: 'status'
      }]
    },
    retry: false
  });

  await ensureStoreReady();
  await q('UPDATE google_campaigns SET status = $1 WHERE id = $2', [status, req.params.id]);
  audit(req, { action: 'googleads.campaign.status', targetType: 'campaign', targetId: req.params.id, brandId, detail: { status } });

  res.json({ success: true, campaignId: req.params.id, status, spendWarnings });
}));

export default router;
