/**
 * Client for the agent registry and content production endpoints.
 */
import { IntegrationError } from './integrationsApi';

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }
    });
  } catch (err: any) {
    throw new IntegrationError({
      message: `Could not reach the WotSocial server (${err?.message || 'network error'}).`,
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
      message: body?.error || `Request failed with HTTP ${res.status}`,
      status: res.status,
      notConnected: body?.details?.code === 'NOT_CONNECTED',
      details: body?.details
    });
  }
  return body as T;
};

const get = <T>(p: string) => request<T>(p);
const post = <T>(p: string, b?: any) => request<T>(p, { method: 'POST', body: JSON.stringify(b || {}) });
const put = <T>(p: string, b?: any) => request<T>(p, { method: 'PUT', body: JSON.stringify(b || {}) });
const patch = <T>(p: string, b?: any) => request<T>(p, { method: 'PATCH', body: JSON.stringify(b || {}) });
const del = <T>(p: string) => request<T>(p, { method: 'DELETE' });

/* ------------------------------------------------------------------ */
/* Agents                                                              */
/* ------------------------------------------------------------------ */

export interface AgentInputSpec {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  required?: boolean;
  default?: string | number;
  options?: string[];
  help?: string;
}

export interface Agent {
  id: string;
  key: string;
  name: string;
  role: string;
  description: string;
  icon: string;
  provider: 'gemini' | 'claude';
  model: string;
  temperature: number;
  systemPrompt: string;
  userPromptTemplate: string;
  outputSchema: string;
  capabilities: string[];
  inputs: AgentInputSpec[];
  pipelineStage: number | null;
  sortOrder: number;
  status: 'draft' | 'published';
  version: number;
  publishedVersion: number | null;
  isBuiltin: boolean;
  archived: boolean;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityInfo { label: string; description: string }

export const agentsApi = {
  list: () =>
    get<{ agents: Agent[]; capabilities: Record<string, CapabilityInfo>; pipeline: Agent[] }>('/api/agents'),

  detail: (id: string) =>
    get<{
      agent: Agent;
      versions: { id: string; version: number; notes: string; publishedAt: string }[];
      runs: { id: string; status: string; version: number; error: string; durationMs: number; createdAt: string }[];
    }>(`/api/agents/${encodeURIComponent(id)}`),

  /** The definition a run must use — never the unsaved draft. */
  published: (key: string) => get<{ agent: Agent }>(`/api/agents/published/${encodeURIComponent(key)}`),

  create: (payload: Partial<Agent>) => post<{ success: boolean; agent: Agent }>('/api/agents', payload),
  saveDraft: (id: string, payload: Partial<Agent>) =>
    put<{ success: boolean; agent: Agent }>(`/api/agents/${encodeURIComponent(id)}`, payload),
  publish: (id: string, notes?: string) =>
    post<{ success: boolean; agent: Agent; message: string; alreadyLive?: boolean }>(
      `/api/agents/${encodeURIComponent(id)}/publish`, { notes }
    ),
  revert: (id: string, version: number) =>
    post<{ success: boolean; agent: Agent; message: string }>(
      `/api/agents/${encodeURIComponent(id)}/revert`, { version }
    ),
  reset: (id: string) =>
    post<{ success: boolean; agent: Agent; message: string }>(`/api/agents/${encodeURIComponent(id)}/reset`),
  archive: (id: string) => del<{ success: boolean; message: string }>(`/api/agents/${encodeURIComponent(id)}`),
  restore: (id: string) => post<{ success: boolean; agent: Agent }>(`/api/agents/${encodeURIComponent(id)}/restore`),
  logRun: (id: string, payload: { brandId?: string; status: string; inputs?: any; error?: string; durationMs?: number }) =>
    post<{ success: boolean }>(`/api/agents/${encodeURIComponent(id)}/runs`, payload)
};

/* ------------------------------------------------------------------ */
/* Poster templates and batches                                        */
/* ------------------------------------------------------------------ */

export interface PosterSlotSpec { key: string; label: string; maxWords: number; required: boolean }

export interface PosterTemplate {
  id: string;
  key: string;
  name: string;
  category: string;
  brief: string;
  ratio: 'square' | 'portrait' | 'story' | 'landscape';
  layout: 'centered' | 'split-horizontal' | 'split-vertical' | 'hero-number' | 'list'
    | 'quote' | 'product' | 'offer-badge' | 'editorial' | 'documentary';
  slots: PosterSlotSpec[];
  constraints: string;
  artDirection: string;
  suitedTo: string[];
  isBuiltin: boolean;
}

export interface Poster {
  id: string;
  batchId: string;
  templateKey: string;
  headline: string;
  subhead: string;
  body: string;
  callToAction: string;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  imageUrl: string;
  contentPillar: string;
  product: any;
  status: string;
  createdAt: string;
}

export interface PosterBatch {
  id: string;
  name: string;
  templates: string[];
  requested: number;
  generated: number;
  failed: number;
  status: string;
  source: string;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

export const contentApi = {
  posterTemplates: (industry?: string) =>
    get<{ templates: PosterTemplate[]; categories: string[]; maxPerBatch: number }>(
      `/api/content/poster-templates${industry ? `?industry=${encodeURIComponent(industry)}` : ''}`
    ),
  createTemplate: (payload: Partial<PosterTemplate>) =>
    post<{ success: boolean; key: string }>('/api/content/poster-templates', payload),
  deleteTemplate: (key: string) =>
    del<{ success: boolean }>(`/api/content/poster-templates/${encodeURIComponent(key)}`),

  openBatch: (payload: { brandId: string; name?: string; templates: string[]; requested: number; source?: string }) =>
    post<{ success: boolean; batchId: string; requested: number; maxPerBatch: number }>(
      '/api/content/poster-batches', payload
    ),
  savePosters: (batchId: string, brandId: string, posters: any[]) =>
    post<{ success: boolean; saved: number; generated: number }>(
      `/api/content/poster-batches/${encodeURIComponent(batchId)}/posters`, { brandId, posters }
    ),
  completeBatch: (batchId: string, payload: { status?: string; failed?: number; error?: string }) =>
    post<{ success: boolean }>(`/api/content/poster-batches/${encodeURIComponent(batchId)}/complete`, payload),
  batches: (brandId: string) =>
    get<{ batches: PosterBatch[] }>(`/api/content/poster-batches?brandId=${encodeURIComponent(brandId)}`),
  posters: (brandId: string, batchId?: string) =>
    get<{ posters: Poster[] }>(
      `/api/content/posters?brandId=${encodeURIComponent(brandId)}${batchId ? `&batchId=${encodeURIComponent(batchId)}` : ''}`
    ),
  updatePoster: (id: string, payload: Partial<Poster>) =>
    patch<{ success: boolean }>(`/api/content/posters/${encodeURIComponent(id)}`, payload),

  /* Connections */
  connections: (brandId: string) =>
    get<{ wordpress: any; shopify: any }>(`/api/content/connections?brandId=${encodeURIComponent(brandId)}`),
  connectWordPress: (payload: { brandId: string; siteUrl: string; username: string; applicationPassword: string }) =>
    post<{ success: boolean; connection: any; site: any }>('/api/content/connections/wordpress', payload),
  connectShopify: (payload: { brandId: string; storeDomain: string; accessToken: string }) =>
    post<{ success: boolean; connection: any; shop: any }>('/api/content/connections/shopify', payload),
  disconnect: (brandId: string, kind: 'wordpress' | 'shopify') =>
    del<{ success: boolean }>(`/api/content/connections/${kind}?brandId=${encodeURIComponent(brandId)}`),

  shopifyProducts: (brandId: string, limit = 50) =>
    get<{ products: any[]; currency: string; shop: string; count: number }>(
      `/api/content/shopify/products?brandId=${encodeURIComponent(brandId)}&limit=${limit}`
    ),

  publishToWordPress: (payload: {
    brandId: string; title: string; bodyHtml: string; excerpt?: string;
    slug?: string; metaDescription?: string; tags?: string[]; categories?: string[];
    featuredImagePrompt?: string; publish?: boolean;
  }) => post<{ success: boolean; articleId: string; url: string; status: string; note: string }>(
    '/api/content/wordpress/publish', payload
  ),

  blogArticles: (brandId: string) =>
    get<{ articles: any[] }>(`/api/content/blog-articles?brandId=${encodeURIComponent(brandId)}`)
};
