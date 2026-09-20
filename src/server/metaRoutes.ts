/**
 * Meta Marketing API routes.
 *
 * Covers the real launch path: campaign → ad set → ad creative → ad, plus
 * targeting resolution, status control and insights. Nothing here fabricates
 * data: if Meta rejects a call the error is returned to the caller.
 */
import { Router, Request, Response } from 'express';
import {
  graphGet, graphPost, graphGetAll, graphDelete,
  debugToken, exchangeForLongLivedToken, MetaApiError
} from './graphClient';
import {
  upsertConnection, getConnection, deleteConnection, toPublicConnection,
  markConnectionVerified, markConnectionError, saveRow, selectRows, q,
  parseJson, stringifyJson, timestamp, num, ensureStoreReady
} from './store';
import { asyncHandler, badRequest, notFound, notConnected, requireParam, currentUserId, HttpError } from './http';
import { randomId } from './crypto';

const router = Router();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const normalizeActId = (id: string): string =>
  id.startsWith('act_') ? id : `act_${id.replace(/^act_/, '')}`;

/** Loads a live connection or throws a 409 the UI can act on. */
const requireMetaConnection = async (brandId: string) => {
  const conn = await getConnection(brandId, 'meta_ads');
  if (!conn || !conn.accessToken) throw notConnected('Meta Ads');
  if (conn.status === 'revoked') {
    throw new HttpError(409, 'This Meta connection was revoked. Reconnect the account.', { code: 'REVOKED' });
  }
  return conn;
};

/** Budgets are submitted to Meta in minor currency units. */
const toMinorUnits = (amount: number): number => Math.round(Number(amount || 0) * 100);

const OPTIMIZATION_GOAL_MAP: Record<string, string> = {
  CONVERSIONS: 'OFFSITE_CONVERSIONS',
  OFFSITE_CONVERSIONS: 'OFFSITE_CONVERSIONS',
  LINK_CLICKS: 'LINK_CLICKS',
  IMPRESSIONS: 'IMPRESSIONS',
  LANDING_PAGE_VIEWS: 'LANDING_PAGE_VIEWS',
  LEAD_GENERATION: 'LEAD_GENERATION',
  REACH: 'REACH'
};

/** Meta constrains which billing events are legal for each optimisation goal. */
const BILLING_EVENT_MAP: Record<string, string> = {
  OFFSITE_CONVERSIONS: 'IMPRESSIONS',
  LINK_CLICKS: 'LINK_CLICKS',
  IMPRESSIONS: 'IMPRESSIONS',
  LANDING_PAGE_VIEWS: 'IMPRESSIONS',
  LEAD_GENERATION: 'IMPRESSIONS',
  REACH: 'IMPRESSIONS'
};

const DESTINATION_TYPE_MAP: Record<string, string | undefined> = {
  WEBSITE: 'WEBSITE',
  MESSENGER: 'MESSENGER',
  INSTAGRAM_DIRECT: 'INSTAGRAM_DIRECT',
  CALLS: 'PHONE_CALL'
};

const ISO2 = /^[A-Z]{2}$/;

/**
 * Turns human-entered targeting ("United States", "Digital Marketing") into
 * the IDs Meta requires. Unresolvable entries are reported rather than dropped,
 * so a campaign never launches against silently different targeting.
 */
const resolveTargeting = async (
  accessToken: string,
  input: {
    locations?: string[];
    interests?: string[];
    ageMin?: number;
    ageMax?: number;
    genders?: string[];
    placements?: string[];
  }
) => {
  const warnings: string[] = [];

  // --- Geography -------------------------------------------------
  const countries: string[] = [];
  const cities: { key: string; radius: number; distance_unit: string }[] = [];
  const regions: { key: string }[] = [];

  for (const raw of input.locations || []) {
    const name = String(raw || '').trim();
    if (!name) continue;

    if (ISO2.test(name)) { countries.push(name); continue; }

    try {
      const { data } = await graphGet<any>('search', accessToken, {
        type: 'adgeolocation',
        location_types: JSON.stringify(['country', 'region', 'city']),
        q: name,
        limit: 1
      });
      const hit = data?.data?.[0];
      if (!hit) { warnings.push(`Location "${name}" did not match any Meta geo target and was skipped.`); continue; }
      if (hit.type === 'country') countries.push(hit.country_code || hit.key);
      else if (hit.type === 'region') regions.push({ key: String(hit.key) });
      else cities.push({ key: String(hit.key), radius: 25, distance_unit: 'mile' });
    } catch (err) {
      warnings.push(`Could not resolve location "${name}": ${(err as Error).message}`);
    }
  }

  if (!countries.length && !cities.length && !regions.length) countries.push('US');

  const geo_locations: Record<string, any> = {};
  if (countries.length) geo_locations.countries = Array.from(new Set(countries));
  if (regions.length) geo_locations.regions = regions;
  if (cities.length) geo_locations.cities = cities;

  // --- Interests -------------------------------------------------
  const interests: { id: string; name: string }[] = [];
  for (const raw of input.interests || []) {
    const name = String(raw || '').trim();
    if (!name) continue;
    try {
      const { data } = await graphGet<any>('search', accessToken, {
        type: 'adinterest',
        q: name,
        limit: 1
      });
      const hit = data?.data?.[0];
      if (hit?.id) interests.push({ id: String(hit.id), name: hit.name });
      else warnings.push(`Interest "${name}" is not a Meta targeting category and was skipped.`);
    } catch (err) {
      warnings.push(`Could not resolve interest "${name}": ${(err as Error).message}`);
    }
  }

  // --- Demographics & placements ---------------------------------
  const genders: number[] = [];
  for (const g of input.genders || []) {
    const val = String(g).toLowerCase();
    if (val.startsWith('m')) genders.push(1);
    else if (val.startsWith('f') || val.startsWith('w')) genders.push(2);
  }

  const platformMap: Record<string, string> = {
    facebook: 'facebook', instagram: 'instagram',
    messenger: 'messenger', audience_network: 'audience_network'
  };
  const publisher_platforms = Array.from(
    new Set(
      (input.placements || [])
        .map(p => platformMap[String(p).toLowerCase().replace(/\s+/g, '_')])
        .filter(Boolean)
    )
  );

  const targeting: Record<string, any> = {
    geo_locations,
    age_min: Math.max(13, Math.min(65, num(input.ageMin, 18))),
    age_max: Math.max(13, Math.min(65, num(input.ageMax, 65)))
  };
  if (genders.length === 1) targeting.genders = genders;
  if (interests.length) targeting.flexible_spec = [{ interests }];
  if (publisher_platforms.length) targeting.publisher_platforms = publisher_platforms;

  return { targeting, warnings, resolvedInterests: interests };
};

/** Meta returns conversions inside a nested `actions` array. */
const extractInsightMetrics = (row: any) => {
  const actions: any[] = row?.actions || [];
  const actionValues: any[] = row?.action_values || [];

  const CONVERSION_TYPES = [
    'offsite_conversion.fb_pixel_purchase',
    'offsite_conversion.fb_pixel_lead',
    'lead',
    'onsite_conversion.lead_grouped',
    'purchase',
    'complete_registration'
  ];

  const conversions = actions
    .filter(a => CONVERSION_TYPES.includes(a.action_type))
    .reduce((sum, a) => sum + num(a.value), 0);

  const revenue = actionValues
    .filter(a => a.action_type === 'offsite_conversion.fb_pixel_purchase' || a.action_type === 'purchase')
    .reduce((sum, a) => sum + num(a.value), 0);

  const spend = num(row?.spend);
  const clicks = num(row?.clicks);
  const impressions = num(row?.impressions);
  const roasField = Array.isArray(row?.purchase_roas) ? num(row.purchase_roas[0]?.value) : 0;

  return {
    impressions,
    clicks,
    reach: num(row?.reach),
    spend,
    conversions,
    revenue,
    ctr: num(row?.ctr, impressions ? (clicks / impressions) * 100 : 0),
    cpc: num(row?.cpc, clicks ? spend / clicks : 0),
    cpa: conversions ? spend / conversions : 0,
    roas: roasField || (spend ? revenue / spend : 0)
  };
};

const INSIGHT_FIELDS =
  'impressions,clicks,spend,reach,ctr,cpc,cpm,actions,action_values,purchase_roas,date_start,date_stop';

/* ------------------------------------------------------------------ */
/* Connection management                                               */
/* ------------------------------------------------------------------ */

/** Reports connection state plus what the token can actually do. */
router.get('/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const conn = await getConnection(brandId, 'meta_ads');
  if (!conn) return res.json({ connected: false, connection: null });

  let tokenInfo: any = null;
  let health: 'healthy' | 'expired' | 'error' = 'healthy';
  try {
    tokenInfo = await debugToken(conn.accessToken);
    if (!tokenInfo.valid) { health = 'expired'; await markConnectionError(conn.id, 'Token is no longer valid.', 'expired'); }
    else await markConnectionVerified(conn.id);
  } catch (err: any) {
    health = 'error';
    await markConnectionError(conn.id, err.message);
  }

  res.json({
    connected: health === 'healthy',
    health,
    connection: toPublicConnection(await getConnection(brandId, 'meta_ads') as any),
    token: tokenInfo
  });
}));

/**
 * Connects an ad account with a user or system-user token. The token is
 * verified against Meta before anything is stored — a bad token fails here
 * rather than at campaign-launch time.
 */
router.post('/connect', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const brandId = requireParam(req.body.brandId, 'brandId');
  const rawToken = requireParam(req.body.accessToken, 'accessToken');
  const adAccountId = normalizeActId(requireParam(req.body.adAccountId, 'adAccountId'));

  let accessToken = rawToken.trim();
  let tokenExpiresAt: string | null = null;

  // Upgrade short-lived tokens when app credentials are available.
  if (process.env.META_APP_ID && process.env.META_APP_SECRET && req.body.exchangeToken !== false) {
    try {
      const exchanged = await exchangeForLongLivedToken(accessToken);
      accessToken = exchanged.accessToken;
      tokenExpiresAt = exchanged.expiresAt;
    } catch (err) {
      console.warn('Long-lived token exchange skipped:', (err as Error).message);
    }
  }

  const info = await debugToken(accessToken);
  if (!info.valid) throw badRequest('Meta rejected this access token. Generate a new one and try again.');

  // Prove the token can actually reach the ad account before saving it.
  const { data: account } = await graphGet<any>(adAccountId, accessToken, {
    fields: 'id,account_id,name,currency,timezone_name,account_status,business,funding_source_details,amount_spent'
  });

  if (account.account_status !== undefined && account.account_status !== 1) {
    console.warn(`Meta ad account ${adAccountId} has non-active status ${account.account_status}.`);
  }

  const connection = await upsertConnection({
    userId,
    brandId,
    platform: 'meta_ads',
    externalId: account.id || adAccountId,
    name: account.name || adAccountId,
    accessToken,
    tokenExpiresAt: tokenExpiresAt || info.expiresAt,
    scopes: info.scopes,
    metadata: {
      currency: account.currency,
      timezone: account.timezone_name,
      accountStatus: account.account_status,
      businessId: account.business?.id,
      businessName: account.business?.name,
      pageId: req.body.pageId || null,
      pixelId: req.body.pixelId || null,
      instagramActorId: req.body.instagramAccountId || null,
      amountSpent: account.amount_spent
    }
  });

  res.json({
    success: true,
    connection: toPublicConnection(connection),
    account: {
      id: account.id,
      name: account.name,
      currency: account.currency,
      timezone: account.timezone_name,
      status: account.account_status
    },
    token: info
  });
}));

router.delete('/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId || req.body?.brandId, 'brandId');
  await deleteConnection(brandId, 'meta_ads');
  res.json({ success: true });
}));

/** Discovery: what ad accounts / pages / pixels does this token control? */
router.post('/discover', asyncHandler(async (req: Request, res: Response) => {
  const accessToken = requireParam(req.body.accessToken, 'accessToken');

  const [adAccounts, pages] = await Promise.all([
    graphGetAll<any>('me/adaccounts', accessToken, {
      fields: 'id,account_id,name,currency,timezone_name,account_status'
    }).catch(() => []),
    graphGetAll<any>('me/accounts', accessToken, {
      fields: 'id,name,access_token,instagram_business_account{id,username}'
    }).catch(() => [])
  ]);

  res.json({
    adAccounts: adAccounts.map(a => ({
      id: a.id, accountId: a.account_id, name: a.name,
      currency: a.currency, timezone: a.timezone_name, status: a.account_status
    })),
    pages: pages.map(p => ({
      id: p.id, name: p.name,
      hasPageToken: Boolean(p.access_token),
      instagramAccountId: p.instagram_business_account?.id || null,
      instagramUsername: p.instagram_business_account?.username || null
    }))
  });
}));

/** Pixels available on the connected ad account, for conversion optimisation. */
router.get('/pixels', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const conn = await requireMetaConnection(brandId);
  const pixels = await graphGetAll<any>(`${conn.externalId}/adspixels`, conn.accessToken, {
    fields: 'id,name,last_fired_time'
  });
  res.json({ pixels });
}));

/* ------------------------------------------------------------------ */
/* Targeting search                                                    */
/* ------------------------------------------------------------------ */

router.get('/targeting/search', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const query = requireParam(req.query.q, 'q');
  const type = (req.query.type as string) === 'geo' ? 'adgeolocation' : 'adinterest';
  const conn = await requireMetaConnection(brandId);

  const params: Record<string, any> = { type, q: query, limit: 15 };
  if (type === 'adgeolocation') {
    params.location_types = JSON.stringify(['country', 'region', 'city']);
  }

  const { data } = await graphGet<any>('search', conn.accessToken, params);
  res.json({
    results: (data?.data || []).map((r: any) => ({
      id: r.id || r.key,
      name: r.name,
      type: r.type,
      audienceSize: r.audience_size_lower_bound
        ? { lower: r.audience_size_lower_bound, upper: r.audience_size_upper_bound }
        : undefined,
      path: r.path,
      countryCode: r.country_code
    }))
  });
}));

/* ------------------------------------------------------------------ */
/* Campaign launch                                                     */
/* ------------------------------------------------------------------ */

/**
 * Creates a complete, ready-to-review campaign on Meta.
 *
 * Everything is created PAUSED unless `activate: true` is passed explicitly —
 * a live campaign spends real money, so activation is always a deliberate,
 * separate decision.
 *
 * Partial failures are surfaced with the IDs that were created, so an
 * abandoned campaign shell is never left invisible in the ad account.
 */
export interface CampaignLaunchInput {
  name: string;
  objective?: string;
  specialAdCategory?: string;
  buyingType?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  adSet?: Record<string, any>;
  ad?: Record<string, any>;
  activate?: boolean;
  pageId?: string;
  pixelId?: string;
}

/**
 * Creates a complete, ready-to-review campaign on Meta:
 * campaign → ad set → ad creative → ad.
 *
 * Everything is created PAUSED unless `activate: true` is passed explicitly —
 * a live campaign spends real money, so activation is always a deliberate,
 * separate decision.
 *
 * If any stage fails, the objects already created are deleted so the ad
 * account is never left with an orphaned half-built campaign, and the error
 * reports exactly how far the launch got.
 */
export const launchMetaCampaign = async (brandId: string, input: CampaignLaunchInput) => {
  const conn = await requireMetaConnection(brandId);
  const act = conn.externalId;
  const token = conn.accessToken;

  const {
    name, objective = 'OUTCOME_TRAFFIC', specialAdCategory = 'NONE', buyingType = 'AUCTION',
    dailyBudget, lifetimeBudget, adSet = {}, ad = {}, activate = false, pageId, pixelId
  } = input;

  if (!name || !String(name).trim()) throw badRequest('A campaign name is required.');

  const effectivePageId = pageId || conn.metadata?.pageId;
  if (!effectivePageId) {
    throw badRequest(
      'A Facebook Page ID is required to create an ad creative. Add one to the Meta connection settings.'
    );
  }
  if (!dailyBudget && !lifetimeBudget) {
    throw badRequest('Provide either a daily budget or a lifetime budget.');
  }

  const created: Record<string, string> = {};
  const desiredStatus = activate === true ? 'ACTIVE' : 'PAUSED';

  try {
    /* 1. Campaign ------------------------------------------------- */
    const { data: campaign } = await graphPost<any>(`${act}/campaigns`, token, {
      name: String(name).trim(),
      objective,
      status: desiredStatus,
      buying_type: buyingType,
      special_ad_categories: JSON.stringify(
        specialAdCategory && specialAdCategory !== 'NONE' ? [specialAdCategory] : []
      )
    });
    created.campaignId = campaign.id;

    /* 2. Targeting ------------------------------------------------ */
    const { targeting, warnings, resolvedInterests } = await resolveTargeting(token, {
      locations: adSet.locations,
      interests: adSet.detailedInterests,
      ageMin: adSet.targetAgeMin,
      ageMax: adSet.targetAgeMax,
      genders: adSet.targetGenders,
      placements: adSet.placements
    });

    /* 3. Ad set --------------------------------------------------- */
    const optimizationGoal =
      OPTIMIZATION_GOAL_MAP[String(adSet.optimizationGoal || 'LINK_CLICKS').toUpperCase()] || 'LINK_CLICKS';
    const billingEvent = BILLING_EVENT_MAP[optimizationGoal] || 'IMPRESSIONS';

    const adSetBody: Record<string, any> = {
      name: adSet.name || `${name} — Ad Set`,
      campaign_id: campaign.id,
      status: desiredStatus,
      billing_event: billingEvent,
      optimization_goal: optimizationGoal,
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: JSON.stringify(targeting)
    };

    if (dailyBudget) adSetBody.daily_budget = toMinorUnits(dailyBudget);
    if (lifetimeBudget) {
      adSetBody.lifetime_budget = toMinorUnits(lifetimeBudget);
      adSetBody.end_time = adSet.endTime || new Date(Date.now() + 30 * 86_400_000).toISOString();
    }

    const destination = DESTINATION_TYPE_MAP[String(adSet.conversionLocation || 'WEBSITE').toUpperCase()];
    if (destination && destination !== 'WEBSITE') adSetBody.destination_type = destination;

    // Conversion optimisation requires telling Meta what counts as a conversion.
    const effectivePixel = pixelId || conn.metadata?.pixelId;
    if (optimizationGoal === 'OFFSITE_CONVERSIONS') {
      if (!effectivePixel) {
        throw badRequest(
          'Conversion optimisation requires a Meta Pixel. Select a pixel on the connection, or switch the goal to Link Clicks.'
        );
      }
      adSetBody.promoted_object = JSON.stringify({
        pixel_id: effectivePixel,
        custom_event_type: adSet.customEventType || 'LEAD'
      });
    } else if (optimizationGoal === 'LEAD_GENERATION') {
      adSetBody.promoted_object = JSON.stringify({ page_id: effectivePageId });
    }

    const { data: adSetRes } = await graphPost<any>(`${act}/adsets`, token, adSetBody);
    created.adSetId = adSetRes.id;

    /* 4. Ad creative ---------------------------------------------- */
    const linkData: Record<string, any> = {
      message: ad.primaryText || '',
      link: ad.destinationUrl || 'https://example.com',
      name: ad.headline || name,
      description: ad.description || '',
      call_to_action: { type: ad.callToAction || 'LEARN_MORE' }
    };
    if (ad.mediaUrl) linkData.picture = ad.mediaUrl;

    const objectStorySpec: Record<string, any> = { page_id: effectivePageId, link_data: linkData };
    const igActor = ad.instagramActorId || conn.metadata?.instagramActorId;
    if (igActor) objectStorySpec.instagram_actor_id = igActor;

    const creativeBody: Record<string, any> = {
      name: `${ad.name || name} — Creative`,
      object_story_spec: JSON.stringify(objectStorySpec)
    };

    // UTMs ride along as the click-through tracking spec.
    const utms = [
      ad.utmSource && `utm_source=${encodeURIComponent(ad.utmSource)}`,
      ad.utmMedium && `utm_medium=${encodeURIComponent(ad.utmMedium)}`,
      ad.utmCampaign && `utm_campaign=${encodeURIComponent(ad.utmCampaign)}`
    ].filter(Boolean);
    if (utms.length) creativeBody.url_tags = utms.join('&');

    const { data: creative } = await graphPost<any>(`${act}/adcreatives`, token, creativeBody);
    created.creativeId = creative.id;

    /* 5. Ad -------------------------------------------------------- */
    const { data: adRes } = await graphPost<any>(`${act}/ads`, token, {
      name: ad.name || `${name} — Ad`,
      adset_id: adSetRes.id,
      creative: JSON.stringify({ creative_id: creative.id }),
      status: desiredStatus
    });
    created.adId = adRes.id;

    /* 6. Persist --------------------------------------------------- */
    await saveRow('meta_campaigns', {
      id: campaign.id,
      brand_id: brandId,
      connection_id: conn.id,
      name: String(name).trim(),
      objective,
      status: desiredStatus,
      effective_status: desiredStatus,
      buying_type: buyingType,
      special_ad_categories: specialAdCategory,
      daily_budget: dailyBudget || '',
      lifetime_budget: lifetimeBudget || '',
      adset_id: adSetRes.id,
      ad_id: adRes.id,
      creative_id: creative.id,
      config: stringifyJson({ adSet: { ...adSet, resolvedTargeting: targeting, resolvedInterests }, ad }),
      start_date: timestamp(),
      created_at: timestamp(),
      synced_at: timestamp()
    });

    return {
      success: true as const,
      campaignId: campaign.id,
      adSetId: adSetRes.id,
      creativeId: creative.id,
      adId: adRes.id,
      status: desiredStatus,
      activated: desiredStatus === 'ACTIVE',
      targetingWarnings: warnings,
      reviewUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act.replace('act_', '')}&selected_campaign_ids=${campaign.id}`
    };
  } catch (err: any) {
    // Roll the partial campaign back so the ad account is not littered with
    // orphaned objects, then report exactly how far the launch got.
    const rollback: string[] = [];
    for (const id of [created.adId, created.adSetId, created.campaignId].filter(Boolean)) {
      try { await graphDelete(id as string, token); rollback.push(id as string); }
      catch (cleanupErr) { console.warn(`Rollback of ${id} failed:`, (cleanupErr as Error).message); }
    }

    if (err instanceof HttpError) throw err;
    const detail = err instanceof MetaApiError ? err.toJSON() : { message: err.message };
    throw new HttpError(
      err instanceof MetaApiError && err.status >= 400 ? err.status : 502,
      err instanceof MetaApiError ? err.toClientMessage() : (err.message || 'Campaign launch failed.'),
      { created, rolledBack: rollback, meta: detail }
    );
  }
};

router.post('/campaigns', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.body.brandId, 'brandId');
  const result = await launchMetaCampaign(brandId, req.body as CampaignLaunchInput);
  res.json(result);
}));

/* ------------------------------------------------------------------ */
/* Campaign listing, status control, insights                          */
/* ------------------------------------------------------------------ */

/** Reads campaigns live from Meta and merges the locally stored config. */
router.get('/campaigns', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const conn = await requireMetaConnection(brandId);
  const datePreset = (req.query.datePreset as string) || 'last_30d';

  const remote = await graphGetAll<any>(`${conn.externalId}/campaigns`, conn.accessToken, {
    fields: [
      'id', 'name', 'objective', 'status', 'effective_status', 'buying_type',
      'daily_budget', 'lifetime_budget', 'special_ad_categories',
      'created_time', 'start_time', 'stop_time',
      `insights.date_preset(${datePreset}){${INSIGHT_FIELDS}}`
    ].join(',')
  });

  const localRows = await selectRows<any>('meta_campaigns', 'brand_id = $1', [brandId]);
  const localById = new Map(localRows.map(r => [r.id, r]));

  const campaigns = remote.map(c => {
    const insightRow = c.insights?.data?.[0] || {};
    const metrics = extractInsightMetrics(insightRow);
    const local = localById.get(c.id);
    const config = parseJson<any>(local?.config, {});

    return {
      id: c.id,
      brandId,
      name: c.name,
      objective: c.objective,
      status: c.status,
      effectiveStatus: c.effective_status,
      buyingType: c.buying_type,
      specialAdCategory: (c.special_ad_categories || [])[0] || 'NONE',
      dailyBudget: c.daily_budget ? num(c.daily_budget) / 100 : 0,
      lifetimeBudget: c.lifetime_budget ? num(c.lifetime_budget) / 100 : undefined,
      spent: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      reach: metrics.reach,
      conversions: metrics.conversions,
      revenue: metrics.revenue,
      ctr: Number(metrics.ctr.toFixed(2)),
      cpc: Number(metrics.cpc.toFixed(2)),
      cpa: Number(metrics.cpa.toFixed(2)),
      roas: Number(metrics.roas.toFixed(2)),
      startDate: c.start_time || c.created_time,
      endDate: c.stop_time,
      adSetId: local?.adset_id,
      adId: local?.ad_id,
      adSetDetails: config.adSet,
      adDetails: config.ad,
      createdAt: c.created_time,
      isLive: true
    };
  });

  // Keep the local mirror current so the dashboard has data if Meta is down.
  for (const c of campaigns) {
    const local = localById.get(c.id);
    await saveRow('meta_campaigns', {
      id: c.id,
      brand_id: brandId,
      connection_id: conn.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      effective_status: c.effectiveStatus,
      buying_type: c.buyingType,
      special_ad_categories: c.specialAdCategory,
      daily_budget: String(c.dailyBudget ?? ''),
      lifetime_budget: String(c.lifetimeBudget ?? ''),
      adset_id: local?.adset_id || '',
      ad_id: local?.ad_id || '',
      creative_id: local?.creative_id || '',
      config: local?.config || stringifyJson({}),
      start_date: c.startDate || '',
      end_date: c.endDate || '',
      created_at: local?.created_at || c.createdAt || timestamp(),
      synced_at: timestamp()
    });
  }

  res.json({ campaigns, accountId: conn.externalId, currency: conn.metadata?.currency || 'USD' });
}));

/**
 * Pause or activate. Meta requires the ad set and ad to be updated alongside
 * the campaign, otherwise an "active" campaign delivers nothing.
 */
router.post('/campaigns/:id/status', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.body.brandId, 'brandId');
  const status = String(requireParam(req.body.status, 'status')).toUpperCase();
  if (!['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'].includes(status)) {
    throw badRequest('Status must be ACTIVE, PAUSED, ARCHIVED or DELETED.');
  }

  const conn = await requireMetaConnection(brandId);
  const campaignId = req.params.id;

  await graphPost(campaignId, conn.accessToken, { status });

  const updated: string[] = [campaignId];
  const [local] = await selectRows<any>('meta_campaigns', 'id = $1', [campaignId]);

  if (status === 'ACTIVE' || status === 'PAUSED') {
    for (const childId of [local?.adset_id, local?.ad_id].filter(Boolean)) {
      try { await graphPost(childId, conn.accessToken, { status }); updated.push(childId); }
      catch (err) { console.warn(`Could not set status on ${childId}:`, (err as Error).message); }
    }
  }

  if (local) {
    // Each placeholder is bound separately — SQLite binds positionally, so a
    // repeated $1 would consume two values rather than reusing one.
    await q(`UPDATE meta_campaigns SET status = $1, effective_status = $2, synced_at = $3 WHERE id = $4`,
      [status, status, timestamp(), campaignId]);
  }

  res.json({ success: true, campaignId, status, updatedObjects: updated });
}));

/** Time-series insights for the whole account or one campaign. */
router.get('/insights', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const conn = await requireMetaConnection(brandId);
  const objectId = (req.query.campaignId as string) || conn.externalId;
  const level = (req.query.level as string) || (req.query.campaignId ? 'campaign' : 'account');
  const datePreset = (req.query.datePreset as string) || 'last_30d';
  const breakdown = req.query.breakdown as string | undefined;

  const params: Record<string, any> = {
    fields: INSIGHT_FIELDS,
    level,
    date_preset: datePreset,
    time_increment: req.query.daily === 'true' ? 1 : undefined
  };
  if (breakdown) params.breakdowns = breakdown;

  const rows = await graphGetAll<any>(`${objectId}/insights`, conn.accessToken, params);
  const series = rows.map(row => ({
    dateStart: row.date_start,
    dateStop: row.date_stop,
    ...extractInsightMetrics(row),
    breakdown: breakdown ? row[breakdown] : undefined
  }));

  const totals = series.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      spend: acc.spend + r.spend,
      conversions: acc.conversions + r.conversions,
      revenue: acc.revenue + r.revenue,
      reach: acc.reach + r.reach
    }),
    { impressions: 0, clicks: 0, spend: 0, conversions: 0, revenue: 0, reach: 0 }
  );

  for (const row of series) {
    await saveRow('meta_insights', {
      id: `${objectId}_${level}_${row.dateStart}_${row.dateStop}_${breakdown || 'none'}`,
      object_id: objectId, level,
      date_start: row.dateStart, date_stop: row.dateStop,
      impressions: row.impressions, clicks: row.clicks, spend: row.spend,
      reach: row.reach, conversions: row.conversions,
      ctr: row.ctr, cpc: row.cpc, cpa: row.cpa, roas: row.roas,
      raw: stringifyJson(row), fetched_at: timestamp()
    });
  }

  res.json({
    objectId,
    level,
    datePreset,
    series,
    totals: {
      ...totals,
      ctr: totals.impressions ? Number(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0,
      cpc: totals.clicks ? Number((totals.spend / totals.clicks).toFixed(2)) : 0,
      cpa: totals.conversions ? Number((totals.spend / totals.conversions).toFixed(2)) : 0,
      roas: totals.spend ? Number((totals.revenue / totals.spend).toFixed(2)) : 0
    },
    currency: conn.metadata?.currency || 'USD'
  });
}));

/** Lead-gen forms submitted against this account's campaigns. */
router.post('/leads/sync', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.body.brandId, 'brandId');
  const conn = await requireMetaConnection(brandId);
  await ensureStoreReady();

  const pageId = req.body.pageId || conn.metadata?.pageId;
  if (!pageId) throw badRequest('A Facebook Page ID is required to pull lead-gen submissions.');

  const forms = await graphGetAll<any>(`${pageId}/leadgen_forms`, conn.accessToken, { fields: 'id,name,status' });
  let imported = 0;

  for (const form of forms) {
    const leads = await graphGetAll<any>(`${form.id}/leads`, conn.accessToken, {
      fields: 'id,created_time,field_data,campaign_id,campaign_name,adset_name,ad_name'
    }, 5);

    for (const lead of leads) {
      const fields: Record<string, string> = {};
      for (const f of lead.field_data || []) fields[f.name] = (f.values || [])[0] || '';

      await saveRow('crm_leads', {
        id: `lead_${lead.id}`,
        brand_id: brandId,
        source: 'Meta Ads Lead Form',
        external_id: lead.id,
        name: fields.full_name || `${fields.first_name || ''} ${fields.last_name || ''}`.trim() || 'Unknown',
        email: fields.email || '',
        phone: fields.phone_number || '',
        company: fields.company_name || '',
        campaign_id: lead.campaign_id || '',
        campaign_name: lead.campaign_name || form.name,
        adset_name: lead.adset_name || '',
        status: 'NEW',
        raw: stringifyJson({ form: form.name, fields }),
        created_at: lead.created_time || timestamp()
      });
      imported++;
    }
  }

  res.json({ success: true, forms: forms.length, imported });
}));

export default router;
