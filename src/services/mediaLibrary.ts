/**
 * Media library client.
 *
 * The generators return base64 data URLs, which no social platform can fetch —
 * Instagram, the Meta Marketing API and WhatsApp all pull media from a URL on
 * their own servers. Everything generated goes through here on its way to
 * being publishable.
 */
import { authFetch } from '../apiClient';
import { IntegrationError } from './integrationsApi';

export interface MediaAssetRecord {
  id: string;
  brandId: string;
  title: string;
  url: string;
  type: 'image' | 'video';
  source: string;
  mimeType: string;
  bytes: number;
  storageKey: string;
  createdAt: string;
}

export interface StorageStatus {
  driver: 's3' | 'local';
  ok: boolean;
  detail: string;
  publiclyReachable: boolean;
  reason?: string;
  limits: { maxBytes: number; allowed: string[] };
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await authFetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }
  });
  const text = await res.text();
  let body: any = {};
  if (text) {
    try { body = JSON.parse(text); } catch {
      throw new IntegrationError({ message: `Unexpected server response (HTTP ${res.status}).`, status: res.status });
    }
  }
  if (!res.ok) {
    throw new IntegrationError({ message: body?.error || `Request failed with HTTP ${res.status}`, status: res.status });
  }
  return body as T;
};

export const mediaApi = {
  status: () => request<StorageStatus>('/api/media/status'),

  list: (brandId: string) =>
    request<{ assets: MediaAssetRecord[]; driver: string }>(
      `/api/media?brandId=${encodeURIComponent(brandId)}`
    ),

  /** Stores a data URL and returns the public URL the platforms will fetch. */
  upload: (payload: { brandId: string; dataUrl: string; title?: string; source?: string }) =>
    request<{
      success: boolean;
      asset: MediaAssetRecord;
      deduplicated: boolean;
      publiclyReachable: boolean;
      reason?: string;
    }>('/api/media', { method: 'POST', body: JSON.stringify(payload) }),

  importUrl: (payload: { brandId: string; url: string; title?: string }) =>
    request<{ success: boolean; asset: MediaAssetRecord }>(
      '/api/media/import', { method: 'POST', body: JSON.stringify(payload) }
    ),

  remove: (id: string) =>
    request<{ success: boolean }>(`/api/media/${encodeURIComponent(id)}`, { method: 'DELETE' })
};

/** True for anything a platform cannot fetch — a data URL or a blob handle. */
export const isLocalMedia = (url?: string): boolean =>
  Boolean(url && (url.startsWith('data:') || url.startsWith('blob:')));

/**
 * Guarantees a URL the platforms can fetch.
 *
 * Generated media arrives as a data URL and is uploaded; anything already
 * hosted is returned untouched. Call this immediately after generating, so the
 * asset is publishable from the moment it appears rather than failing later at
 * the point of publish.
 */
export const ensureHostedUrl = async (params: {
  brandId: string;
  url: string;
  title?: string;
  source?: string;
}): Promise<{ url: string; asset?: MediaAssetRecord; warning?: string }> => {
  if (!isLocalMedia(params.url)) return { url: params.url };

  const res = await mediaApi.upload({
    brandId: params.brandId,
    dataUrl: params.url,
    title: params.title,
    source: params.source || 'ai-generated'
  });

  return {
    url: res.asset.url,
    asset: res.asset,
    // Local storage behind localhost is reachable by the browser but not by
    // Meta, so the caller can warn before a publish that is bound to fail.
    warning: res.publiclyReachable ? undefined : res.reason
  };
};
