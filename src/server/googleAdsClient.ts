/**
 * Google Ads API client.
 *
 * Google Ads was export-only: the agent wrote fifteen headlines and four
 * descriptions and a human pasted them into Google Ads Editor. This creates
 * them through the API instead.
 *
 * Shaped like the Meta client on purpose — retries, normalised errors, a
 * readable message at the end — because the failure modes are the same and
 * the two should not need different habits to debug.
 */
import { HttpError } from './http';
import { logger } from './logging';

export const GOOGLE_ADS_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v18';

const API_BASE = () =>
  (process.env.GOOGLE_ADS_BASE_URL || 'https://googleads.googleapis.com').replace(/\/$/, '');

const OAUTH_BASE = () =>
  (process.env.GOOGLE_OAUTH_BASE_URL || 'https://oauth2.googleapis.com').replace(/\/$/, '');

const TIMEOUT_MS = Number(process.env.GOOGLE_ADS_TIMEOUT_MS || 30_000);
const MAX_ATTEMPTS = Number(process.env.GOOGLE_ADS_MAX_RETRIES || 3);

/** Google's own transient classes; anything else is a real failure. */
const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);

export class GoogleAdsError extends Error {
  status: number;
  endpoint: string;
  errorCode?: string;
  trigger?: string;
  requestId?: string;
  isTransient: boolean;

  constructor(params: {
    message: string; status: number; endpoint: string;
    errorCode?: string; trigger?: string; requestId?: string;
  }) {
    super(params.message);
    this.name = 'GoogleAdsError';
    this.status = params.status;
    this.endpoint = params.endpoint;
    this.errorCode = params.errorCode;
    this.trigger = params.trigger;
    this.requestId = params.requestId;
    this.isTransient = RETRYABLE_HTTP.has(params.status);
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.errorCode === 'AUTHENTICATION_ERROR';
  }

  get isPermissionError(): boolean {
    return this.status === 403 || this.errorCode === 'AUTHORIZATION_ERROR';
  }

  /** A sentence a marketer can act on. */
  toClientMessage(): string {
    if (this.isAuthError) {
      return 'Google rejected the credentials for this account. Reconnect it to continue.';
    }
    if (this.isPermissionError) {
      return 'This Google Ads account does not permit that action. Check the user has standard access, ' +
        'and that the developer token is approved for it.';
    }
    if (this.status === 429) {
      return 'Google Ads is rate limiting this account. The request was retried and still throttled.';
    }
    return this.message;
  }

  toJSON() {
    return {
      message: this.toClientMessage(),
      detail: this.message,
      status: this.status,
      errorCode: this.errorCode,
      trigger: this.trigger,
      requestId: this.requestId,
      endpoint: this.endpoint,
      isAuthError: this.isAuthError,
      isPermissionError: this.isPermissionError
    };
  }
}

export const googleAdsConfigured = (): boolean =>
  Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const assertConfigured = () => {
  if (!googleAdsConfigured()) {
    throw new HttpError(
      501,
      'Google Ads is not configured on this server. Set GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_CLIENT_ID and ' +
      'GOOGLE_CLIENT_SECRET. The developer token has to be approved by Google before it will work against ' +
      'live accounts.',
      { code: 'GOOGLE_ADS_NOT_CONFIGURED' }
    );
  }
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Customer ids are given with dashes and sent without. */
export const normalizeCustomerId = (id: string): string => String(id || '').replace(/-/g, '').trim();

/**
 * Google access tokens last an hour, so the refresh token is the credential
 * that gets stored and this is called whenever a request is made.
 */
export const refreshAccessToken = async (refreshToken: string): Promise<{
  accessToken: string; expiresAt: string;
}> => {
  assertConfigured();

  const res = await fetch(`${OAUTH_BASE()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GoogleAdsError({
      message: body?.error_description || body?.error || `Token refresh failed with HTTP ${res.status}`,
      status: res.status === 400 ? 401 : res.status,
      endpoint: 'oauth/token'
    });
  }

  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + (body.expires_in || 3600) * 1000).toISOString()
  };
};

export interface GoogleAdsRequest {
  customerId: string;
  accessToken: string;
  /** The manager account, when the customer is managed by one. */
  loginCustomerId?: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  retry?: boolean;
}

/**
 * One Google Ads call.
 *
 * `path` is relative to the version, e.g. `customers/123/campaigns:mutate`.
 */
export const googleAdsRequest = async <T = any>(
  path: string,
  options: GoogleAdsRequest
): Promise<T> => {
  assertConfigured();

  const { accessToken, method = 'POST', body, loginCustomerId, retry = true } = options;
  const url = `${API_BASE()}/${GOOGLE_ADS_VERSION}/${path.replace(/^\//, '')}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    'Content-Type': 'application/json'
  };
  if (loginCustomerId) headers['login-customer-id'] = normalizeCustomerId(loginCustomerId);

  const attempts = retry ? Math.max(1, MAX_ATTEMPTS) : 1;
  let last: GoogleAdsError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timer);

      const text = await res.text();
      let payload: any = {};
      if (text) {
        try { payload = JSON.parse(text); }
        catch { payload = { error: { message: `Non-JSON response: ${text.slice(0, 200)}` } }; }
      }

      if (res.ok) return payload as T;

      // Google nests the useful part several levels down.
      const apiError = payload?.error || {};
      const detail = apiError?.details?.[0]?.errors?.[0];

      last = new GoogleAdsError({
        message: detail?.message || apiError?.message || `Google Ads returned HTTP ${res.status}`,
        status: res.status,
        endpoint: path,
        errorCode: detail?.errorCode ? Object.keys(detail.errorCode)[0] : undefined,
        trigger: detail?.trigger?.stringValue,
        requestId: payload?.error?.details?.[0]?.requestId || res.headers.get('request-id') || undefined
      });

      if (!last.isTransient || attempt === attempts) throw last;
    } catch (err: any) {
      clearTimeout(timer);

      if (err instanceof GoogleAdsError) {
        last = err;
        if (!err.isTransient || attempt === attempts) throw err;
      } else {
        const aborted = err?.name === 'AbortError';
        last = new GoogleAdsError({
          message: aborted
            ? `Google Ads did not respond within ${TIMEOUT_MS / 1000}s.`
            : `Network error calling Google Ads: ${err?.message || String(err)}`,
          status: aborted ? 504 : 502,
          endpoint: path
        });
        if (attempt === attempts) throw last;
      }
    }

    const backoff = Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
    logger.warn('google ads retry', { endpoint: path, attempt, attempts, backoff, detail: last?.message });
    await sleep(backoff);
  }

  throw last || new GoogleAdsError({ message: 'Unknown Google Ads failure', status: 500, endpoint: path });
};

/** Runs a GAQL query, which is how everything is read back. */
export const googleAdsSearch = async <T = any>(params: {
  customerId: string;
  accessToken: string;
  loginCustomerId?: string;
  query: string;
}): Promise<T[]> => {
  const customerId = normalizeCustomerId(params.customerId);
  const result = await googleAdsRequest<{ results?: T[] }>(
    `customers/${customerId}/googleAds:search`,
    {
      customerId,
      accessToken: params.accessToken,
      loginCustomerId: params.loginCustomerId,
      method: 'POST',
      body: { query: params.query }
    }
  );
  return result.results || [];
};

/** Accounts the credential can reach, for the account picker. */
export const listAccessibleCustomers = async (accessToken: string): Promise<string[]> => {
  const result = await googleAdsRequest<{ resourceNames?: string[] }>(
    'customers:listAccessibleCustomers',
    { customerId: '', accessToken, method: 'GET' }
  );
  return (result.resourceNames || []).map(name => name.split('/').pop() || name);
};

/** Google Ads takes budgets and bids in micros. */
export const toMicros = (amount: number): number => Math.round(Number(amount || 0) * 1_000_000);
export const fromMicros = (micros: number | string): number => Number(micros || 0) / 1_000_000;
