/**
 * Meta Graph API client.
 *
 * Everything that talks to graph.facebook.com goes through here so that
 * retries, rate-limit backoff, appsecret_proof signing, timeouts and error
 * normalisation are applied uniformly. Callers get either a typed result or a
 * MetaApiError — never a silently swallowed failure.
 */
import crypto from 'crypto';

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v21.0';

/**
 * Overridable so the suite (and staging) can point at a Graph test double.
 * Left unset, every call goes to the real graph.facebook.com.
 */
export const GRAPH_BASE =
  process.env.META_GRAPH_BASE_URL
    ? `${process.env.META_GRAPH_BASE_URL.replace(/\/$/, '')}/${GRAPH_VERSION}`
    : `https://graph.facebook.com/${GRAPH_VERSION}`;

const DEFAULT_TIMEOUT_MS = Number(process.env.META_HTTP_TIMEOUT_MS || 30_000);
const MAX_ATTEMPTS = Number(process.env.META_MAX_RETRIES || 4);

/** Meta error codes that are worth retrying rather than surfacing. */
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 368, 613]);
const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);

export class MetaApiError extends Error {
  status: number;
  code?: number;
  subcode?: number;
  type?: string;
  fbtraceId?: string;
  userTitle?: string;
  userMessage?: string;
  endpoint: string;
  isTransient: boolean;

  constructor(params: {
    message: string;
    status: number;
    endpoint: string;
    code?: number;
    subcode?: number;
    type?: string;
    fbtraceId?: string;
    userTitle?: string;
    userMessage?: string;
  }) {
    super(params.message);
    this.name = 'MetaApiError';
    this.status = params.status;
    this.endpoint = params.endpoint;
    this.code = params.code;
    this.subcode = params.subcode;
    this.type = params.type;
    this.fbtraceId = params.fbtraceId;
    this.userTitle = params.userTitle;
    this.userMessage = params.userMessage;
    this.isTransient =
      RETRYABLE_HTTP.has(params.status) || (params.code !== undefined && TRANSIENT_CODES.has(params.code));
  }

  /** True when the token itself is the problem and the user must reconnect. */
  get isAuthError(): boolean {
    return this.status === 401 || this.code === 190 || this.code === 102 || this.code === 10;
  }

  get isPermissionError(): boolean {
    return this.code === 200 || this.code === 3 || this.code === 294 || this.status === 403;
  }

  /** A sentence a marketer can act on, not a stack trace. */
  toClientMessage(): string {
    if (this.isAuthError) {
      return 'Your Meta access token is invalid or has expired. Reconnect the account to continue.';
    }
    if (this.isPermissionError) {
      return `Your Meta app is missing a required permission for this action. ${this.userMessage || this.message}`;
    }
    if (this.status === 429 || this.code === 17 || this.code === 613) {
      return 'Meta is rate limiting this ad account. The request was retried and still throttled — try again shortly.';
    }
    return this.userMessage || this.userTitle || this.message;
  }

  toJSON() {
    return {
      message: this.toClientMessage(),
      detail: this.message,
      status: this.status,
      code: this.code,
      subcode: this.subcode,
      type: this.type,
      fbtraceId: this.fbtraceId,
      endpoint: this.endpoint,
      isAuthError: this.isAuthError,
      isPermissionError: this.isPermissionError
    };
  }
}

/**
 * appsecret_proof binds a call to your app secret so a leaked token alone
 * cannot be replayed. Meta strongly recommends it for all server-side calls.
 */
export const appSecretProof = (accessToken: string): string | null => {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !accessToken) return null;
  return crypto.createHmac('sha256', secret).update(accessToken).digest('hex');
};

export interface RateLimitSnapshot {
  callCount?: number;
  totalCpuTime?: number;
  totalTime?: number;
  estimatedTimeToRegainAccess?: number;
}

const parseRateLimit = (headers: Headers): RateLimitSnapshot | undefined => {
  const raw =
    headers.get('x-business-use-case-usage') ||
    headers.get('x-ad-account-usage') ||
    headers.get('x-app-usage');
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    const entry = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
    const usage = Array.isArray(entry) ? entry[0] : entry;
    if (!usage || typeof usage !== 'object') return undefined;
    return {
      callCount: usage.call_count,
      totalCpuTime: usage.total_cputime,
      totalTime: usage.total_time,
      estimatedTimeToRegainAccess: usage.estimated_time_to_regain_access
    };
  } catch {
    return undefined;
  }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface GraphResponse<T> {
  data: T;
  rateLimit?: RateLimitSnapshot;
}

export interface GraphRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  accessToken: string;
  params?: Record<string, any>;
  body?: Record<string, any>;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Set false for idempotency-sensitive writes that must not be auto-retried. */
  retry?: boolean;
}

/**
 * Low-level Graph call. `path` is relative to the versioned base, e.g.
 * `act_123/campaigns` or `/17841400000000/media`.
 */
export const graphRequest = async <T = any>(
  path: string,
  options: GraphRequestOptions
): Promise<GraphResponse<T>> => {
  const {
    method = 'GET',
    accessToken,
    params = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxAttempts = MAX_ATTEMPTS,
    retry = true
  } = options;

  if (!accessToken) {
    throw new MetaApiError({
      message: 'No access token available for this request.',
      status: 401,
      endpoint: path,
      code: 190
    });
  }

  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(`${GRAPH_BASE}/${cleanPath}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }

  const proof = appSecretProof(accessToken);
  if (proof) url.searchParams.set('appsecret_proof', proof);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json'
  };

  let requestBody: string | undefined;
  if (method === 'POST') {
    // Meta expects form-encoded values; nested objects/arrays are JSON strings.
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body || {})) {
      if (value === undefined || value === null || value === '') continue;
      form.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    if (proof) form.set('appsecret_proof', proof);
    requestBody = form.toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const attempts = retry ? Math.max(1, maxAttempts) : 1;
  let lastError: MetaApiError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: requestBody,
        signal: controller.signal
      });
      clearTimeout(timer);

      const rateLimit = parseRateLimit(res.headers);
      const text = await res.text();
      let payload: any = {};
      if (text) {
        try { payload = JSON.parse(text); }
        catch {
          payload = { error: { message: `Non-JSON response from Meta: ${text.slice(0, 200)}` } };
        }
      }

      if (res.ok && !payload.error) {
        return { data: payload as T, rateLimit };
      }

      const err = payload.error || {};
      lastError = new MetaApiError({
        message: err.message || `Graph API returned HTTP ${res.status}`,
        status: res.status,
        endpoint: cleanPath,
        code: err.code,
        subcode: err.error_subcode,
        type: err.type,
        fbtraceId: err.fbtrace_id,
        userTitle: err.error_user_title,
        userMessage: err.error_user_msg
      });

      if (!lastError.isTransient || attempt === attempts) throw lastError;
    } catch (err: any) {
      clearTimeout(timer);

      if (err instanceof MetaApiError) {
        lastError = err;
        if (!err.isTransient || attempt === attempts) throw err;
      } else {
        const isAbort = err?.name === 'AbortError';
        lastError = new MetaApiError({
          message: isAbort
            ? `Request to Meta timed out after ${timeoutMs}ms.`
            : `Network error calling Meta: ${err?.message || String(err)}`,
          status: isAbort ? 504 : 502,
          endpoint: cleanPath
        });
        if (attempt === attempts) throw lastError;
      }
    }

    // Exponential backoff with jitter, capped at 8s.
    const backoff = Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
    console.warn(
      `Graph ${method} ${cleanPath} attempt ${attempt}/${attempts} failed (${lastError?.message}); retrying in ${backoff}ms`
    );
    await sleep(backoff);
  }

  throw lastError || new MetaApiError({ message: 'Unknown Graph API failure', status: 500, endpoint: cleanPath });
};

export const graphGet = <T = any>(
  path: string,
  accessToken: string,
  params: Record<string, any> = {}
) => graphRequest<T>(path, { method: 'GET', accessToken, params });

export const graphPost = <T = any>(
  path: string,
  accessToken: string,
  body: Record<string, any> = {},
  opts: Partial<GraphRequestOptions> = {}
) => graphRequest<T>(path, { method: 'POST', accessToken, body, retry: false, ...opts });

export const graphDelete = <T = any>(path: string, accessToken: string) =>
  graphRequest<T>(path, { method: 'DELETE', accessToken });

/** Follows `paging.next` cursors up to `maxPages`. */
export const graphGetAll = async <T = any>(
  path: string,
  accessToken: string,
  params: Record<string, any> = {},
  maxPages = 10
): Promise<T[]> => {
  const out: T[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const { data } = await graphRequest<{ data: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      path,
      { method: 'GET', accessToken, params: { ...params, limit: params.limit || 100, after } }
    );
    if (Array.isArray(data?.data)) out.push(...data.data);
    after = data?.paging?.next ? data?.paging?.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
};

/**
 * Validates a token and reports what it can actually do. Used on connect and
 * by the health endpoint, so a broken connection is visible before a campaign
 * launch depends on it.
 */
export const debugToken = async (accessToken: string) => {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (appId && appSecret) {
    const { data } = await graphRequest<any>('debug_token', {
      method: 'GET',
      accessToken: `${appId}|${appSecret}`,
      params: { input_token: accessToken }
    });
    const info = data?.data || {};
    return {
      valid: Boolean(info.is_valid),
      appId: info.app_id,
      userId: info.user_id,
      scopes: info.scopes || [],
      expiresAt: info.expires_at ? new Date(info.expires_at * 1000).toISOString() : null,
      dataAccessExpiresAt: info.data_access_expires_at
        ? new Date(info.data_access_expires_at * 1000).toISOString()
        : null,
      type: info.type
    };
  }

  // Without app credentials we can still prove the token resolves to an identity.
  const { data } = await graphGet<any>('me', accessToken, { fields: 'id,name' });
  return {
    valid: Boolean(data?.id),
    appId: undefined,
    userId: data?.id,
    scopes: [] as string[],
    expiresAt: null,
    dataAccessExpiresAt: null,
    type: 'USER'
  };
};

/** Exchanges a short-lived user token for a ~60-day long-lived one. */
export const exchangeForLongLivedToken = async (shortToken: string) => {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET must be configured to exchange tokens.');
  }
  const { data } = await graphRequest<any>('oauth/access_token', {
    method: 'GET',
    accessToken: shortToken,
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortToken
    }
  });
  return {
    accessToken: data.access_token as string,
    expiresIn: data.expires_in as number | undefined,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null
  };
};
