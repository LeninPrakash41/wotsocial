/**
 * Client for the live platform integrations.
 *
 * Every call goes to our own server, which holds the encrypted tokens and
 * talks to Meta. The browser never sees an access token, and errors from the
 * platform are surfaced verbatim rather than swallowed.
 */

export interface ApiErrorShape {
  message: string;
  status: number;
  code?: number;
  isAuthError?: boolean;
  isPermissionError?: boolean;
  notConnected?: boolean;
  details?: any;
}

export class IntegrationError extends Error {
  status: number;
  code?: number;
  isAuthError: boolean;
  isPermissionError: boolean;
  notConnected: boolean;
  details?: any;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.name = 'IntegrationError';
    this.status = shape.status;
    this.code = shape.code;
    this.isAuthError = Boolean(shape.isAuthError);
    this.isPermissionError = Boolean(shape.isPermissionError);
    this.notConnected = Boolean(shape.notConnected);
    this.details = shape.details;
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }
    });
  } catch (err: any) {
    throw new IntegrationError({
      message: `Could not reach the WotSocial server. Is it running? (${err?.message || 'network error'})`,
      status: 0
    });
  }

  const text = await res.text();
  let body: any = {};
  if (text) {
    try { body = JSON.parse(text); }
    catch {
      throw new IntegrationError({ message: `Unexpected server response (HTTP ${res.status}).`, status: res.status });
    }
  }

  if (!res.ok) {
    throw new IntegrationError({
      message: body?.error || body?.message || `Request failed with HTTP ${res.status}`,
      status: res.status,
      code: body?.meta?.code,
      isAuthError: body?.meta?.isAuthError,
      isPermissionError: body?.meta?.isPermissionError,
      notConnected: body?.details?.code === 'NOT_CONNECTED',
      details: body?.details || body?.meta
    });
  }
  return body as T;
};

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: any) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body || {}) });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

/* ------------------------------------------------------------------ */
/* Shared types                                                        */
/* ------------------------------------------------------------------ */

export interface PublicConnection {
  id: string;
  brandId: string;
  platform: string;
  externalId: string;
  name: string;
  username?: string;
  tokenPreview: string;
  hasToken: boolean;
  status: 'connected' | 'expired' | 'revoked' | 'error';
  metadata: Record<string, any>;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
}

export interface LiveMetaCampaign {
  id: string;
  brandId: string;
  name: string;
  objective: string;
  status: string;
  effectiveStatus: string;
  buyingType: string;
  specialAdCategory: string;
  dailyBudget: number;
  lifetimeBudget?: number;
  spent: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  revenue: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  startDate: string;
  endDate?: string;
  adSetId?: string;
  adId?: string;
  adSetDetails?: any;
  adDetails?: any;
  createdAt: string;
  isLive: boolean;
}

/* ------------------------------------------------------------------ */
/* Connections overview                                                */
/* ------------------------------------------------------------------ */

export const getBrandConnections = (brandId: string) =>
  get<{
    connections: PublicConnection[];
    summary: { metaAds: boolean; instagram: boolean; whatsapp: boolean };
    server: { oauthConfigured: boolean; webhooksConfigured: boolean; appUrl: string };
  }>(`/api/crm/connections?brandId=${encodeURIComponent(brandId)}`);

export const getOAuthStatus = () =>
  get<{
    configured: boolean;
    appId: string | null;
    redirectUri: string;
    webhookCallbackUrl: string;
    webhookConfigured: boolean;
    scopes: Record<string, string[]>;
  }>('/api/oauth/meta/status');

export const startOAuth = (brandId: string, platform: 'meta_ads' | 'instagram' | 'whatsapp') =>
  get<{ url: string; state: string; scopes: string[]; redirectUri: string }>(
    `/api/oauth/meta/start?brandId=${encodeURIComponent(brandId)}&platform=${platform}`
  );

/**
 * Opens the Meta consent dialog and resolves when the popup reports back.
 * The popup posts its result to this window with the same origin.
 */
export const runOAuthPopup = (url: string): Promise<{ success: boolean; error?: string; summary?: any }> =>
  new Promise((resolve) => {
    const popup = window.open(url, 'meta-oauth', 'width=640,height=760');
    if (!popup) {
      resolve({ success: false, error: 'The popup was blocked. Allow popups for this site and try again.' });
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'OAUTH_RESULT') return;
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
      resolve(event.data);
    };
    window.addEventListener('message', onMessage);

    const poll = setInterval(() => {
      if (popup.closed) {
        clearInterval(poll);
        window.removeEventListener('message', onMessage);
        resolve({ success: false, error: 'The connection window was closed before finishing.' });
      }
    }, 700);
  });

/* ------------------------------------------------------------------ */
/* Meta Ads                                                            */
/* ------------------------------------------------------------------ */

export const metaApi = {
  connection: (brandId: string) =>
    get<{ connected: boolean; health?: string; connection: PublicConnection | null; token?: any }>(
      `/api/meta/connection?brandId=${encodeURIComponent(brandId)}`
    ),

  connect: (payload: {
    brandId: string; accessToken: string; adAccountId: string;
    pageId?: string; pixelId?: string; instagramAccountId?: string;
  }) => post<{ success: boolean; connection: PublicConnection; account: any; token: any }>('/api/meta/connect', payload),

  disconnect: (brandId: string) => del<{ success: boolean }>(`/api/meta/connection?brandId=${encodeURIComponent(brandId)}`),

  /** Lists the ad accounts and Pages a token controls, before committing to one. */
  discover: (accessToken: string) =>
    post<{ adAccounts: any[]; pages: any[] }>('/api/meta/discover', { accessToken }),

  pixels: (brandId: string) =>
    get<{ pixels: any[] }>(`/api/meta/pixels?brandId=${encodeURIComponent(brandId)}`),

  campaigns: (brandId: string, datePreset = 'last_30d') =>
    get<{ campaigns: LiveMetaCampaign[]; accountId: string; currency: string }>(
      `/api/meta/campaigns?brandId=${encodeURIComponent(brandId)}&datePreset=${datePreset}`
    ),

  launchCampaign: (payload: any) =>
    post<{
      success: boolean; campaignId: string; adSetId: string; creativeId: string; adId: string;
      status: string; activated: boolean; targetingWarnings: string[]; reviewUrl: string;
    }>('/api/meta/campaigns', payload),

  setStatus: (campaignId: string, brandId: string, status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED') =>
    post<{ success: boolean; status: string; updatedObjects: string[] }>(
      `/api/meta/campaigns/${encodeURIComponent(campaignId)}/status`, { brandId, status }
    ),

  insights: (brandId: string, opts: { campaignId?: string; datePreset?: string; daily?: boolean } = {}) => {
    const params = new URLSearchParams({ brandId });
    if (opts.campaignId) params.set('campaignId', opts.campaignId);
    if (opts.datePreset) params.set('datePreset', opts.datePreset);
    if (opts.daily) params.set('daily', 'true');
    return get<{ series: any[]; totals: any; currency: string }>(`/api/meta/insights?${params}`);
  },

  searchTargeting: (brandId: string, q: string, type: 'interest' | 'geo' = 'interest') =>
    get<{ results: { id: string; name: string; type: string; audienceSize?: any; path?: string[] }[] }>(
      `/api/meta/targeting/search?brandId=${encodeURIComponent(brandId)}&q=${encodeURIComponent(q)}&type=${type}`
    ),

  syncLeads: (brandId: string, pageId?: string) =>
    post<{ success: boolean; forms: number; imported: number }>('/api/meta/leads/sync', { brandId, pageId })
};

/* ------------------------------------------------------------------ */
/* Instagram                                                           */
/* ------------------------------------------------------------------ */

export interface IgProfile {
  id: string; username: string; name?: string;
  followersCount: number; followsCount?: number; mediaCount: number;
  profilePictureUrl?: string; biography?: string;
}

export const instagramApi = {
  connection: (brandId: string) =>
    get<{ connected: boolean; connection: PublicConnection | null; profile: IgProfile | null; error?: string }>(
      `/api/instagram/connection?brandId=${encodeURIComponent(brandId)}`
    ),

  connect: (payload: { brandId: string; accessToken: string; instagramAccountId?: string; pageId?: string }) =>
    post<{ success: boolean; connection: PublicConnection; profile: IgProfile }>('/api/instagram/connect', payload),

  disconnect: (brandId: string) =>
    del<{ success: boolean }>(`/api/instagram/connection?brandId=${encodeURIComponent(brandId)}`),

  publish: (payload: {
    brandId: string;
    mediaType?: 'IMAGE' | 'REELS' | 'STORIES' | 'CAROUSEL';
    mediaUrl?: string; videoUrl?: string; coverUrl?: string;
    caption?: string; firstComment?: string; shareToFeed?: boolean;
    children?: { url: string; mediaType?: string }[];
  }) =>
    post<{
      success: boolean; publicationId: string; mediaId: string;
      containerId: string; permalink: string; firstComment?: string; mediaType: string;
    }>('/api/instagram/publish', payload),

  publications: (brandId: string) =>
    get<{ publications: any[] }>(`/api/instagram/publications?brandId=${encodeURIComponent(brandId)}`),

  media: (brandId: string) =>
    get<{ media: any[] }>(`/api/instagram/media?brandId=${encodeURIComponent(brandId)}`),

  insights: (brandId: string, days = 30) =>
    get<{ metrics: Record<string, any> }>(`/api/instagram/insights?brandId=${encodeURIComponent(brandId)}&days=${days}`),

  dmRules: (brandId: string) =>
    get<{ rules: any[] }>(`/api/instagram/dm-rules?brandId=${encodeURIComponent(brandId)}`),

  saveDmRule: (payload: any) =>
    post<{ success: boolean; id: string; webhookReady: boolean; warning?: string }>('/api/instagram/dm-rules', payload),

  deleteDmRule: (id: string) => del<{ success: boolean }>(`/api/instagram/dm-rules/${encodeURIComponent(id)}`)
};

/* ------------------------------------------------------------------ */
/* WhatsApp                                                            */
/* ------------------------------------------------------------------ */

export const whatsappApi = {
  connection: (brandId: string) =>
    get<{ connected: boolean; connection: PublicConnection | null; phoneNumber: any; error?: string }>(
      `/api/whatsapp/connection?brandId=${encodeURIComponent(brandId)}`
    ),

  connect: (payload: { brandId: string; accessToken: string; phoneNumberId: string; wabaId?: string }) =>
    post<{ success: boolean; connection: PublicConnection; phoneNumber: any; wabaId: string }>(
      '/api/whatsapp/connect', payload
    ),

  disconnect: (brandId: string) =>
    del<{ success: boolean }>(`/api/whatsapp/connection?brandId=${encodeURIComponent(brandId)}`),

  templates: (brandId: string) =>
    get<{ templates: any[] }>(`/api/whatsapp/templates?brandId=${encodeURIComponent(brandId)}`),

  createTemplate: (payload: any) =>
    post<{ success: boolean; id: string; status: string; note: string }>('/api/whatsapp/templates', payload),

  send: (payload: { brandId: string; to: string; templateName: string; language?: string; variables?: string[] }) =>
    post<{ success: boolean; wamid: string; to: string }>('/api/whatsapp/send', payload),

  broadcast: (payload: {
    brandId: string; name: string; templateName: string; language?: string;
    targetSegment?: string; recipients: (string | { phone: string; variables?: string[] })[];
  }) => post<{ success: boolean; broadcastId: string; recipients: number; status: string; note: string }>(
    '/api/whatsapp/broadcasts', payload
  ),

  broadcasts: (brandId: string) =>
    get<{ broadcasts: any[] }>(`/api/whatsapp/broadcasts?brandId=${encodeURIComponent(brandId)}`),

  broadcastMessages: (id: string) =>
    get<{ messages: any[] }>(`/api/whatsapp/broadcasts/${encodeURIComponent(id)}/messages`)
};

/* ------------------------------------------------------------------ */
/* MCP                                                                 */
/* ------------------------------------------------------------------ */

export const mcpApi = {
  keys: () => get<{ keys: any[] }>('/api/mcp/keys'),
  issueKey: (label?: string, revokeExisting = false) =>
    post<{ key: string; warning: string }>('/api/mcp/keys', { label, revokeExisting }),
  revokeKeys: () => del<{ success: boolean }>('/api/mcp/keys'),
  logs: () => get<{ logs: any[] }>('/api/mcp/logs'),
  /** Executes a tool exactly as Claude would — same endpoint, same auth. */
  callTool: (apiKey: string, tool: string, args: any) =>
    request<{ success: boolean; tool: string; result: any }>('/api/mcp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ tool, arguments: args })
    })
};

/* ------------------------------------------------------------------ */
/* CRM                                                                 */
/* ------------------------------------------------------------------ */

export const crmApi = {
  leads: (brandId: string) =>
    get<{ leads: any[]; totals: { count: number; bySource: Record<string, number>; byStatus: Record<string, number> } }>(
      `/api/crm/leads?brandId=${encodeURIComponent(brandId)}`
    ),
  saveLead: (payload: any) => post<{ success: boolean; id: string }>('/api/crm/leads', payload),
  setLeadStatus: (id: string, status: string) =>
    request<{ success: boolean }>(`/api/crm/leads/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ status })
    })
};

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

export const webhookApi = {
  events: () =>
    get<{
      events: any[];
      configured: { verifyToken: boolean; appSecret: boolean; callbackUrl: string };
    }>('/api/webhooks/events')
};

/** Turns any thrown error into a sentence suitable for a UI banner. */
export const describeError = (err: unknown): string => {
  if (err instanceof IntegrationError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
};
