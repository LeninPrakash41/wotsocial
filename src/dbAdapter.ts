import { auth } from './auth';
import { saveMediaAssetToIDB, loadMediaAssetsFromIDB, deleteMediaAssetFromIDB } from './services/mediaStorage';

export interface Brand {
  id: string;
  userId: string;
  name: string;
  websiteUrl?: string;
  socialUrls?: string[];
  guidelinesText?: string;
  brandTone?: string;
  brandPersonality?: string;
  logoUrl?: string;
  industry?: string;
  category?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  brandColors?: string[];
  automationSettings?: {
    mode?: 'manual' | 'auto';
    postsPerPeriod?: number;
    periodUnit?: 'day' | 'week' | 'month';
  };
  agentResearchData?: any;
}

export interface Post {
  id: string;
  userId: string;
  brandId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'none';
  scheduledTime?: any;
  status: 'suggested' | 'scheduled' | 'published' | 'failed';
  platforms?: string[];
  visualPrompt?: string;
  isAgentGenerated?: boolean;
  isPlanned?: boolean;
}

export interface SavedTrend {
  id: string;
  brandId?: string;
  title: string;
  description: string;
  type: 'trend' | 'news' | 'holiday' | 'topic';
  category?: string;
  savedAt: string;
}

export interface MediaAsset {
  id: string;
  brandId?: string;
  title: string;
  url: string;
  type: 'image' | 'video';
  source?: 'upload' | 'ai-generated';
  createdAt: string;
}

const SAVED_TRENDS_KEY = 'wot_saved_trends_v1';
const MEDIA_ASSETS_KEY = 'wot_media_assets_v1';
let localMediaCache: MediaAsset[] = [];

export const getMediaAssets = (): MediaAsset[] => {
  if (localMediaCache.length > 0) return localMediaCache;
  try {
    const raw = localStorage.getItem(MEDIA_ASSETS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    localMediaCache = parsed;
    return parsed;
  } catch (e) {
    return localMediaCache;
  }
};

export const getMediaAssetsAsync = async (): Promise<MediaAsset[]> => {
  const fromIDB = await loadMediaAssetsFromIDB();
  if (fromIDB && fromIDB.length > 0) {
    localMediaCache = fromIDB;
    return fromIDB;
  }
  return getMediaAssets();
};

export const addMediaAssetAsync = async (asset: Omit<MediaAsset, 'id' | 'createdAt'>): Promise<MediaAsset> => {
  const existing = await loadMediaAssetsFromIDB();
  const newAsset: MediaAsset = {
    ...asset,
    id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    createdAt: new Date().toISOString()
  };

  const updated = [newAsset, ...existing];
  localMediaCache = updated;

  // Persist full asset to IndexedDB (No 5MB Quota limit!)
  await saveMediaAssetToIDB(newAsset);

  // Store lightweight metadata in localStorage
  try {
    const lightAssets = updated.slice(0, 30).map(a => ({
      ...a,
      url: a.url.length > 500 ? a.url.slice(0, 500) : a.url
    }));
    localStorage.setItem(MEDIA_ASSETS_KEY, JSON.stringify(lightAssets));
  } catch (e) {}

  return newAsset;
};

export const addMediaAsset = (asset: Omit<MediaAsset, 'id' | 'createdAt'>): MediaAsset => {
  const existing = getMediaAssets();
  const newAsset: MediaAsset = {
    ...asset,
    id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    createdAt: new Date().toISOString()
  };

  const updated = [newAsset, ...existing];
  localMediaCache = updated;
  saveMediaAssetToIDB(newAsset).catch(err => console.error("IDB save error:", err));
  return newAsset;
};

export const deleteMediaAsset = (id: string): void => {
  const existing = getMediaAssets();
  const updated = existing.filter(m => m.id !== id);
  localMediaCache = updated;
  deleteMediaAssetFromIDB(id).catch(e => {});

  try {
    const lightAssets = updated.slice(0, 15).map(a => ({
      ...a,
      url: a.url.length > 500 ? a.url.slice(0, 500) : a.url
    }));
    localStorage.setItem(MEDIA_ASSETS_KEY, JSON.stringify(lightAssets));
  } catch (e) {}
};

export const getSavedTrends = (): SavedTrend[] => {
  try {
    const raw = localStorage.getItem(SAVED_TRENDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Error reading saved trends:", e);
    return [];
  }
};

export const saveTrendToVault = (trend: Omit<SavedTrend, 'id' | 'savedAt'>): SavedTrend => {
  const existing = getSavedTrends();
  const duplicate = existing.find(t => t.title.toLowerCase() === trend.title.toLowerCase());
  if (duplicate) return duplicate;

  const newTrend: SavedTrend = {
    ...trend,
    id: 'trend_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    savedAt: new Date().toISOString()
  };

  const updated = [newTrend, ...existing];
  localStorage.setItem(SAVED_TRENDS_KEY, JSON.stringify(updated));
  return newTrend;
};

export const removeSavedTrend = (id: string): void => {
  const existing = getSavedTrends();
  const updated = existing.filter(t => t.id !== id);
  localStorage.setItem(SAVED_TRENDS_KEY, JSON.stringify(updated));
};

// Date Sync Helpers (Preserves local datetime-local selection)
export const toLocalDatetimeString = (date: Date): string => {
  const pad = (num: number) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const parseLocalDatetimeString = (dtStr: string): Date => {
  if (!dtStr) return new Date();
  const [datePart, timePart] = dtStr.split('T');
  if (!datePart) return new Date(dtStr);
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = (timePart || '10:00').split(':').map(Number);
  return new Date(year, month - 1, day, hours || 10, minutes || 0);
};

// Helper to safely parse API response or return fallback
const safeApiFetch = async (url: string, options?: RequestInit): Promise<any> => {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      return await res.json();
    }
    const text = await res.text();
    if (text.startsWith('{') || text.startsWith('[')) {
      return JSON.parse(text);
    }
    return null;
  } catch (err) {
    console.warn(`API fetch error for ${url}:`, err);
    return null;
  }
};

// LocalStorage Fallbacks
const getLocalBrands = (): Brand[] => {
  try {
    return JSON.parse(localStorage.getItem('wotsocial_brands') || '[]');
  } catch {
    return [];
  }
};

const saveLocalBrands = (brands: Brand[]) => {
  localStorage.setItem('wotsocial_brands', JSON.stringify(brands));
};

const getLocalPosts = (): Post[] => {
  try {
    return JSON.parse(localStorage.getItem('wotsocial_posts') || '[]');
  } catch {
    return [];
  }
};

const saveLocalPosts = (posts: Post[]) => {
  const cleanPosts = posts.map(p => {
    let schedISO: string | null = null;
    if (p.scheduledTime) {
      if (typeof p.scheduledTime === 'string') {
        schedISO = p.scheduledTime;
      } else if (typeof p.scheduledTime?.toDate === 'function') {
        try { schedISO = p.scheduledTime.toDate().toISOString(); } catch (e) {}
      } else if (typeof p.scheduledTime?.toISOString === 'function') {
        try { schedISO = p.scheduledTime.toISOString(); } catch (e) {}
      } else {
        const d = getSafeDate(p.scheduledTime);
        schedISO = d.toISOString();
      }
    }
    return {
      ...p,
      scheduledTime: schedISO
    };
  });
  localStorage.setItem('wotsocial_posts', JSON.stringify(cleanPosts));
};

// Brands API Client
export const getBrands = async (): Promise<Brand[]> => {
  const userId = auth.currentUser?.uid || 'admin-user-001';
  const data = await safeApiFetch(`/api/brands?userId=${encodeURIComponent(userId)}`);
  
  if (Array.isArray(data)) {
    saveLocalBrands(data);
    return data;
  }
  return getLocalBrands();
};

export const getBrandById = async (id: string): Promise<Brand | null> => {
  const brands = await getBrands();
  return brands.find(b => b.id === id) || null;
};

export const addBrand = async (brandData: Partial<Brand>): Promise<Brand> => {
  const userId = auth.currentUser?.uid || 'admin-user-001';
  const apiRes = await safeApiFetch('/api/brands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...brandData })
  });

  const newBrand: Brand = apiRes || {
    id: `brand-${Date.now()}`,
    userId,
    name: brandData.name || 'New Brand',
    ...brandData
  };

  const current = getLocalBrands();
  saveLocalBrands([newBrand, ...current]);
  return newBrand;
};

export const updateBrand = async (id: string, brandData: Partial<Brand>): Promise<void> => {
  await safeApiFetch(`/api/brands/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(brandData)
  });

  const current = getLocalBrands();
  const updated = current.map(b => b.id === id ? { ...b, ...brandData } : b);
  saveLocalBrands(updated);
};

export const deleteBrand = async (id: string): Promise<void> => {
  await safeApiFetch(`/api/brands/${id}`, {
    method: 'DELETE'
  });

  const current = getLocalBrands();
  saveLocalBrands(current.filter(b => b.id !== id));
};

// Posts API Client
export const getSafeDate = (val: any): Date => {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return !isNaN(d.getTime()) ? d : new Date();
  }
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        const d = val.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      } catch (e) {}
    }
    if (val.seconds) {
      return new Date(val.seconds * 1000);
    }
    if (val.iso) {
      const d = new Date(val.iso);
      return !isNaN(d.getTime()) ? d : new Date();
    }
  }
  const d = new Date(val);
  return !isNaN(d.getTime()) ? d : new Date();
};

export const getPosts = async (brandId?: string): Promise<Post[]> => {
  const userId = auth.currentUser?.uid || 'admin-user-001';
  let url = `/api/posts?userId=${encodeURIComponent(userId)}`;
  if (brandId) {
    url += `&brandId=${encodeURIComponent(brandId)}`;
  }

  const posts = await safeApiFetch(url);
  if (Array.isArray(posts) && posts.length > 0) {
    const normalized = posts.map(p => {
      const d = getSafeDate(p.scheduledTime || p.scheduled_time);
      return {
        ...p,
        scheduledTime: {
          toDate: () => d,
          toString: () => d.toISOString(),
          toISOString: () => d.toISOString(),
          getTime: () => d.getTime()
        }
      };
    });
    saveLocalPosts(normalized);
    return normalized;
  }
  
  const local = getLocalPosts();
  return (brandId ? local.filter(p => p.brandId === brandId) : local).map(p => {
    const d = getSafeDate(p.scheduledTime);
    return {
      ...p,
      scheduledTime: {
        toDate: () => d,
        toString: () => d.toISOString(),
        toISOString: () => d.toISOString(),
        getTime: () => d.getTime()
      }
    };
  });
};

export const addPost = async (postData: Partial<Post>): Promise<Post> => {
  const userId = auth.currentUser?.uid || 'admin-user-001';
  let schedISO: string | null = null;

  if (postData.scheduledTime) {
    if (typeof postData.scheduledTime === 'string') {
      schedISO = postData.scheduledTime;
    } else if (typeof (postData.scheduledTime as any).toDate === 'function') {
      schedISO = (postData.scheduledTime as any).toDate().toISOString();
    } else {
      const d = new Date(postData.scheduledTime as any);
      schedISO = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    }
  }

  const payload = {
    userId,
    ...postData,
    scheduledTime: schedISO
  };

  const apiRes = await safeApiFetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const newPost: Post = (apiRes && apiRes.id) ? {
    ...apiRes,
    scheduledTime: apiRes.scheduledTime ? { toDate: () => new Date(apiRes.scheduledTime) } : null
  } : {
    id: `post-${Date.now()}`,
    userId,
    brandId: postData.brandId || 'unassigned',
    content: postData.content || '',
    status: postData.status || 'suggested',
    ...postData,
    scheduledTime: schedISO ? { toDate: () => new Date(schedISO!) } : null
  };

  const current = getLocalPosts();
  saveLocalPosts([newPost, ...current]);
  return newPost;
};

export const updatePost = async (id: string, postData: Partial<Post>): Promise<void> => {
  let schedISO: string | null = null;

  if (postData.scheduledTime) {
    if (typeof postData.scheduledTime === 'string') {
      schedISO = postData.scheduledTime;
    } else if (typeof (postData.scheduledTime as any).toDate === 'function') {
      schedISO = (postData.scheduledTime as any).toDate().toISOString();
    } else {
      const d = new Date(postData.scheduledTime as any);
      schedISO = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    }
  }

  await safeApiFetch(`/api/posts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...postData,
      scheduledTime: schedISO
    })
  });

  const current = getLocalPosts();
  saveLocalPosts(current.map(p => p.id === id ? { ...p, ...postData } : p));
};

export const deletePost = async (id: string): Promise<void> => {
  await safeApiFetch(`/api/posts/${id}`, {
    method: 'DELETE'
  });

  const current = getLocalPosts();
  saveLocalPosts(current.filter(p => p.id !== id));
};
