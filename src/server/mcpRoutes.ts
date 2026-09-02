/**
 * MCP bridge.
 *
 * The standalone stdio server in mcp-server/ is a thin transport; this module
 * is where its tools actually execute. Every tool reads or writes the real
 * database, or drives a real platform API — nothing here returns canned data.
 *
 * Requests authenticate with a hashed API key issued from the MCP Connector
 * Studio, so a leaked config file can be revoked without rotating anything else.
 */
import { Router, Request, Response } from 'express';
import { graphGet, graphPost, graphGetAll, MetaApiError } from './graphClient';
import {
  verifyMcpKey, issueMcpKey, listMcpKeys, revokeAllMcpKeys, getConnection,
  saveRow, selectRows, q, listConnections, toPublicConnection,
  stringifyJson, parseJson, timestamp, num, ensureStoreReady
} from './store';
import { asyncHandler, badRequest, requireParam, currentUserId, HttpError } from './http';
import { randomId } from './crypto';
import { launchMetaCampaign } from './metaRoutes';
import { requireIgConnection, waitForContainer } from './instagramRoutes';
import { requireWaConnection, buildTemplatePayload } from './whatsappRoutes';

const router = Router();

/* ------------------------------------------------------------------ */
/* Tool catalogue — the single source of truth for the stdio server     */
/* ------------------------------------------------------------------ */

export const MCP_TOOLS = [
  {
    name: 'wotsocial_list_brands',
    description: 'Lists every brand in the WotSocial workspace with its industry, voice and website.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'wotsocial_get_brand_strategy',
    description: 'Returns the stored strategy blueprint for a brand: value proposition, audience ICP, brand voice and content pillars.',
    inputSchema: {
      type: 'object',
      properties: { brand_name: { type: 'string', description: 'Brand name or ID' } },
      required: ['brand_name']
    }
  },
  {
    name: 'wotsocial_list_connections',
    description: 'Reports which platforms (Meta Ads, Instagram, WhatsApp) are live-connected for a brand, and the health of each token.',
    inputSchema: {
      type: 'object',
      properties: { brand_name: { type: 'string' } },
      required: ['brand_name']
    }
  },
  {
    name: 'wotsocial_create_post',
    description: 'Creates a post in the WotSocial content calendar. Saves as a draft or a scheduled post; it does not publish immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        content: { type: 'string', description: 'Post caption text' },
        platforms: { type: 'array', items: { type: 'string' } },
        media_url: { type: 'string' },
        scheduled_time: { type: 'string', description: 'ISO-8601 timestamp' },
        status: { type: 'string', enum: ['suggested', 'scheduled'], default: 'scheduled' }
      },
      required: ['content']
    }
  },
  {
    name: 'wotsocial_list_posts',
    description: 'Lists posts in the WotSocial calendar for a brand, newest first.',
    inputSchema: {
      type: 'object',
      properties: { brand_name: { type: 'string' }, limit: { type: 'number', default: 20 } }
    }
  },
  {
    name: 'wotsocial_save_media',
    description: 'Saves an image or video URL into the WotSocial media library so it can be attached to posts and ads.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        media_url: { type: 'string', description: 'Publicly reachable https URL' },
        brand_name: { type: 'string' },
        media_type: { type: 'string', enum: ['image', 'video'], default: 'image' }
      },
      required: ['title', 'media_url']
    }
  },
  {
    name: 'wotsocial_publish_instagram',
    description: 'Publishes a real post, Reel or Story to the brand\'s connected Instagram Business account. This is live and immediately visible to followers.',
    inputSchema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        media_type: { type: 'string', enum: ['IMAGE', 'REELS', 'STORIES'], default: 'IMAGE' },
        media_url: { type: 'string', description: 'Public image URL, or video URL for Reels' },
        caption: { type: 'string' },
        first_comment: { type: 'string', description: 'Hashtags to post as the first comment' }
      },
      required: ['brand_name', 'media_url']
    }
  },
  {
    name: 'wotsocial_launch_meta_campaign',
    description: 'Creates a real Meta Ads campaign, ad set, creative and ad. Always created PAUSED — activating it and spending budget stays a human decision in Ads Manager.',
    inputSchema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        name: { type: 'string' },
        objective: { type: 'string', enum: ['OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT', 'OUTCOME_AWARENESS'] },
        daily_budget: { type: 'number', description: 'Daily budget in account currency, e.g. 50' },
        primary_text: { type: 'string' },
        headline: { type: 'string' },
        description: { type: 'string' },
        destination_url: { type: 'string' },
        locations: { type: 'array', items: { type: 'string' } },
        interests: { type: 'array', items: { type: 'string' } },
        age_min: { type: 'number' },
        age_max: { type: 'number' }
      },
      required: ['brand_name', 'name', 'daily_budget']
    }
  },
  {
    name: 'wotsocial_get_campaign_insights',
    description: 'Reads live Meta Ads performance for a brand: spend, impressions, clicks, CTR, CPC, conversions and ROAS.',
    inputSchema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        date_preset: { type: 'string', default: 'last_30d' }
      },
      required: ['brand_name']
    }
  },
  {
    name: 'wotsocial_send_whatsapp',
    description: 'Sends a real approved WhatsApp template message to one recipient via the connected Business number.',
    inputSchema: {
      type: 'object',
      properties: {
        brand_name: { type: 'string' },
        to: { type: 'string', description: 'Recipient phone number in E.164 format' },
        template_name: { type: 'string' },
        language: { type: 'string', default: 'en_US' },
        variables: { type: 'array', items: { type: 'string' } }
      },
      required: ['brand_name', 'to', 'template_name']
    }
  },
  {
    name: 'wotsocial_list_leads',
    description: 'Lists CRM leads captured from Meta lead forms, Instagram DM automation and WhatsApp replies.',
    inputSchema: {
      type: 'object',
      properties: { brand_name: { type: 'string' }, limit: { type: 'number', default: 50 } }
    }
  }
];

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

const authenticate = async (req: Request): Promise<string> => {
  const header = req.header('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const key = bearer || req.header('x-api-key') || '';

  const result = await verifyMcpKey(key);
  if (!result) {
    throw new HttpError(401, 'Invalid or revoked MCP API key. Re-export your Claude Desktop config from the MCP Connector Studio.');
  }
  return result.userId;
};

/** Resolves a brand by name or ID; MCP callers speak in names. */
const resolveBrand = async (userId: string, nameOrId?: string) => {
  await ensureStoreReady();
  const brands = await q<any>('SELECT * FROM brands WHERE user_id = $1', [userId]);
  if (!brands.length) throw new HttpError(404, 'This workspace has no brands yet. Create one in WotSocial first.');
  if (!nameOrId) return brands[0];

  const needle = String(nameOrId).trim().toLowerCase();
  const match =
    brands.find(b => b.id.toLowerCase() === needle) ||
    brands.find(b => (b.name || '').toLowerCase() === needle) ||
    brands.find(b => (b.name || '').toLowerCase().includes(needle));

  if (!match) {
    throw new HttpError(
      404,
      `No brand matching "${nameOrId}". Available brands: ${brands.map(b => b.name).join(', ')}.`
    );
  }
  return match;
};

/* ------------------------------------------------------------------ */
/* Tool execution                                                      */
/* ------------------------------------------------------------------ */

const TOOL_HANDLERS: Record<string, (userId: string, args: any) => Promise<any>> = {
  async wotsocial_list_brands(userId) {
    const brands = await q<any>('SELECT * FROM brands WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return {
      count: brands.length,
      brands: brands.map(b => ({
        id: b.id, name: b.name, industry: b.industry, category: b.category,
        websiteUrl: b.website_url, brandTone: b.brand_tone
      }))
    };
  },

  async wotsocial_get_brand_strategy(userId, args) {
    const brand = await resolveBrand(userId, args.brand_name);
    const research = parseJson<any>(brand.agent_research_data, {});
    return {
      brand: brand.name,
      industry: brand.industry,
      websiteUrl: brand.website_url,
      brandVoice: research?.siteAnalysis?.brandVoice || brand.brand_tone,
      valueProposition: research?.siteAnalysis?.valueProposition || null,
      keyOfferings: research?.siteAnalysis?.keyOfferings || [],
      audience: research?.audienceProfile || null,
      contentPillars: research?.marketingStrategy?.contentPillars || [],
      hasStrategy: Boolean(research?.siteAnalysis),
      note: research?.siteAnalysis
        ? undefined
        : 'No agent research has been run for this brand yet — run the Agent Studio pipeline to populate the strategy.'
    };
  },

  async wotsocial_list_connections(userId, args) {
    const brand = await resolveBrand(userId, args.brand_name);
    const connections = await listConnections(brand.id);
    return {
      brand: brand.name,
      connections: connections.map(c => {
        const pub = toPublicConnection(c);
        return {
          platform: pub.platform, name: pub.name, username: pub.username,
          externalId: pub.externalId, status: pub.status,
          lastVerifiedAt: pub.lastVerifiedAt, lastError: pub.lastError
        };
      }),
      livePlatforms: connections.filter(c => c.status === 'connected').map(c => c.platform)
    };
  },

  async wotsocial_create_post(userId, args) {
    const brand = await resolveBrand(userId, args.brand_name);
    const id = `post-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const scheduled = args.scheduled_time || new Date(Date.now() + 3_600_000).toISOString();

    await q(
      `INSERT INTO posts (id, user_id, brand_id, content, media_url, media_type, scheduled_time,
                          status, platforms, is_agent_generated, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id, userId, brand.id, args.content, args.media_url || null,
        args.media_url ? 'image' : 'none', scheduled,
        args.status === 'suggested' ? 'suggested' : 'scheduled',
        JSON.stringify(args.platforms || ['instagram']), 1, timestamp(), timestamp()
      ]
    );

    return {
      postId: id, brand: brand.name, status: args.status || 'scheduled',
      scheduledTime: scheduled, platforms: args.platforms || ['instagram'],
      note: 'Saved to the WotSocial calendar. It will not go out until its scheduled time is reached.'
    };
  },

  async wotsocial_list_posts(userId, args) {
    const brand = await resolveBrand(userId, args.brand_name);
    const limit = Math.min(100, num(args.limit, 20));
    const rows = await q<any>(
      'SELECT * FROM posts WHERE user_id = $1 AND brand_id = $2 ORDER BY created_at DESC',
      [userId, brand.id]
    );
    return {
      brand: brand.name,
      count: rows.length,
      posts: rows.slice(0, limit).map(p => ({
        id: p.id, content: p.content, status: p.status,
        scheduledTime: p.scheduled_time, mediaUrl: p.media_url,
        platforms: parseJson<string[]>(p.platforms, [])
      }))
    };
  },

  async wotsocial_save_media(userId, args) {
    const brand = args.brand_name ? await resolveBrand(userId, args.brand_name) : null;
    const url = String(args.media_url || '');
    if (!/^https?:\/\//i.test(url)) {
      throw badRequest('media_url must be a publicly reachable http(s) URL. Data URLs cannot be used by the platform APIs.');
    }

    const id = randomId('media');
    await saveRow('media_assets', {
      id, brand_id: brand?.id || '', user_id: userId,
      title: args.title, url, type: args.media_type === 'video' ? 'video' : 'image',
      source: 'mcp', created_at: timestamp()
    });
    return { mediaId: id, title: args.title, url, brand: brand?.name || null };
  },

  async wotsocial_publish_instagram(userId, args) {
    const brand = await resolveBrand(userId, args.brand_name);
    const conn = await requireIgConnection(brand.id);
    const kind = String(args.media_type || 'IMAGE').toUpperCase();

    const body: Record<string, any> = {};
    if (kind === 'REELS') { body.media_type = 'REELS'; body.video_url = args.media_url; body.caption = args.caption || ''; }
    else if (kind === 'STORIES') { body.media_type = 'STORIES'; body.image_url = args.media_url; }
    else { body.image_url = args.media_url; body.caption = args.caption || ''; }

    const { data: container } = await graphPost<any>(`${conn.externalId}/media`, conn.accessToken, body);
    await waitForContainer(container.id, conn.accessToken, { timeoutMs: kind === 'REELS' ? 300_000 : 60_000 });

    const { data: published } = await graphPost<any>(`${conn.externalId}/media_publish`, conn.accessToken, {
      creation_id: container.id
    });

    let permalink = '';
    try {
      const { data } = await graphGet<any>(published.id, conn.accessToken, { fields: 'permalink' });
      permalink = data.permalink || '';
    } catch { /* non-fatal */ }

    if (args.first_comment) {
      try { await graphPost(`${published.id}/comments`, conn.accessToken, { message: args.first_comment }); }
      catch (err: any) { console.warn('MCP first comment failed:', err.message); }
    }

    await saveRow('instagram_publications', {
      id: randomId('igpub'), brand_id: brand.id, connection_id: conn.id,
      container_id: container.id, media_id: published.id, media_type: kind,
      media_url: args.media_url, caption: args.caption || '',
      permalink, status: 'PUBLISHED', created_at: timestamp(), published_at: timestamp()
    });

    return {
      published: true, mediaId: published.id, permalink,
      account: `@${conn.username || conn.externalId}`,
      note: 'This post is now live on Instagram.'
    };
  },

  async wotsocial_launch_meta_campaign(userId, args) {
    const brand = await resolveBrand(userId, args.brand_name);
    const result = await launchMetaCampaign(brand.id, {
      name: args.name,
      objective: args.objective || 'OUTCOME_TRAFFIC',
      dailyBudget: num(args.daily_budget),
      // An agent must never be able to start spend on its own.
      activate: false,
      adSet: {
        name: `${args.name} — Ad Set`,
        locations: args.locations || ['US'],
        detailedInterests: args.interests || [],
        targetAgeMin: num(args.age_min, 18),
        targetAgeMax: num(args.age_max, 65),
        optimizationGoal: 'LINK_CLICKS',
        conversionLocation: 'WEBSITE',
        placements: ['facebook', 'instagram']
      },
      ad: {
        name: `${args.name} — Ad`,
        primaryText: args.primary_text || '',
        headline: args.headline || args.name,
        description: args.description || '',
        callToAction: 'LEARN_MORE',
        destinationUrl: args.destination_url || brand.website_url || 'https://example.com'
      }
    });

    return {
      ...result,
      note: 'Created PAUSED. Review it in Ads Manager and activate there — no budget is being spent yet.'
    };
  },

  async wotsocial_get_campaign_insights(userId, args) {
    const brand = await resolveBrand(userId, args.brand_name);
    const conn = await getConnection(brand.id, 'meta_ads');
    if (!conn) throw new HttpError(409, `No Meta Ads connection for "${brand.name}". Connect the ad account in WotSocial first.`);

    const rows = await graphGetAll<any>(`${conn.externalId}/insights`, conn.accessToken, {
      fields: 'impressions,clicks,spend,reach,ctr,cpc,actions,action_values,purchase_roas',
      level: 'campaign',
      date_preset: args.date_preset || 'last_30d'
    });

    const campaigns = rows.map(r => {
      const spend = num(r.spend);
      const conversions = (r.actions || [])
        .filter((a: any) => /lead|purchase|complete_registration/.test(a.action_type))
        .reduce((s: number, a: any) => s + num(a.value), 0);
      return {
        campaignName: r.campaign_name,
        impressions: num(r.impressions),
        clicks: num(r.clicks),
        spend,
        ctr: num(r.ctr),
        cpc: num(r.cpc),
        conversions,
        cpa: conversions ? Number((spend / conversions).toFixed(2)) : 0
      };
    });

    return {
      brand: brand.name,
      datePreset: args.date_preset || 'last_30d',
      currency: conn.metadata?.currency || 'USD',
      campaigns,
      totalSpend: campaigns.reduce((s, c) => s + c.spend, 0)
    };
  },

  async wotsocial_send_whatsapp(userId, args) {
    const brand = await resolveBrand(userId, args.brand_name);
    const conn = await requireWaConnection(brand.id);
    const to = String(args.to).replace(/[^\d]/g, '');

    const payload = buildTemplatePayload(to, args.template_name, args.language || 'en_US', args.variables || []);
    const { data } = await graphPost<any>(`${conn.externalId}/messages`, conn.accessToken, payload);
    const wamid = data?.messages?.[0]?.id;

    await saveRow('whatsapp_messages', {
      id: randomId('wamsg'), broadcast_id: '', brand_id: brand.id,
      wamid: wamid || '', to_number: to, status: 'sent', sent_at: timestamp()
    });

    return { sent: true, wamid, to, template: args.template_name, note: 'Message accepted by the WhatsApp Cloud API.' };
  },

  async wotsocial_list_leads(userId, args) {
    const brand = await resolveBrand(userId, args.brand_name);
    const rows = await selectRows<any>('crm_leads', 'brand_id = $1', [brand.id], 'ORDER BY created_at DESC LIMIT 200');
    const limit = Math.min(200, num(args.limit, 50));
    return {
      brand: brand.name,
      count: rows.length,
      leads: rows.slice(0, limit).map(l => ({
        id: l.id, name: l.name, email: l.email, phone: l.phone,
        source: l.source, campaignName: l.campaign_name, status: l.status, createdAt: l.created_at
      }))
    };
  }
};

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

/** Tool discovery for the stdio server. */
router.get('/tools', asyncHandler(async (req: Request, res: Response) => {
  await authenticate(req);
  res.json({ tools: MCP_TOOLS });
}));

/** Executes one tool. Every call is recorded, success or failure. */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = await authenticate(req);
  const toolName = requireParam(req.body.tool || req.body.name, 'tool');
  const args = req.body.arguments || req.body.args || {};

  const handler = TOOL_HANDLERS[toolName];
  const callId = randomId('mcpcall');
  const startedAt = Date.now();

  if (!handler) {
    await saveRow('mcp_tool_calls', {
      id: callId, user_id: userId, tool_name: toolName, arguments: stringifyJson(args),
      status: 'ERROR', error: 'Unknown tool', duration_ms: '0', created_at: timestamp()
    });
    throw badRequest(`Unknown tool "${toolName}". Available: ${Object.keys(TOOL_HANDLERS).join(', ')}`);
  }

  try {
    const result = await handler(userId, args);
    await saveRow('mcp_tool_calls', {
      id: callId, user_id: userId, brand_id: args.brand_name || '',
      tool_name: toolName, arguments: stringifyJson(args),
      status: 'SUCCESS', result: stringifyJson(result).slice(0, 4000),
      duration_ms: String(Date.now() - startedAt), created_at: timestamp()
    });
    res.json({ success: true, tool: toolName, result });
  } catch (err: any) {
    const message = err instanceof MetaApiError ? err.toClientMessage() : err.message;
    await saveRow('mcp_tool_calls', {
      id: callId, user_id: userId, brand_id: args.brand_name || '',
      tool_name: toolName, arguments: stringifyJson(args),
      status: 'ERROR', error: String(message).slice(0, 1000),
      duration_ms: String(Date.now() - startedAt), created_at: timestamp()
    });
    throw err;
  }
}));

/** Call history — powers the live activity log in the Connector Studio. */
router.get('/logs', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  await ensureStoreReady();
  const rows = await q<any>(
    `SELECT * FROM mcp_tool_calls WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId]
  );
  res.json({
    logs: rows.map(r => ({
      id: r.id, toolName: r.tool_name, brandName: r.brand_id,
      arguments: parseJson(r.arguments, {}), status: r.status,
      result: parseJson(r.result, null), error: r.error,
      durationMs: num(r.duration_ms), timestamp: r.created_at
    }))
  });
}));

/* ---- Key management (called from the browser, not from MCP) -------- */

router.get('/keys', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const keys = await listMcpKeys(userId);
  res.json({
    keys: keys.map((k: any) => ({
      id: k.id, prefix: k.key_prefix, label: k.label,
      lastUsedAt: k.last_used_at, revoked: k.revoked === '1', createdAt: k.created_at
    }))
  });
}));

/** Issues a key. The raw value is shown exactly once — only its hash is stored. */
router.post('/keys', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (req.body.revokeExisting) await revokeAllMcpKeys(userId);
  const key = await issueMcpKey(userId, req.body.label || 'Claude Desktop');
  res.json({
    key,
    warning: 'Copy this key now — it is stored only as a hash and cannot be shown again.'
  });
}));

router.delete('/keys', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  await revokeAllMcpKeys(userId);
  res.json({ success: true });
}));

export default router;
