import { auth } from './auth';

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
  scheduledTime?: { toDate: () => Date } | null;
  status: 'suggested' | 'scheduled' | 'published' | 'failed';
  platforms?: string[];
  visualPrompt?: string;
  isAgentGenerated?: boolean;
  isPlanned?: boolean;
}

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
  localStorage.setItem('wotsocial_posts', JSON.stringify(posts));
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
export const getPosts = async (brandId?: string): Promise<Post[]> => {
  const userId = auth.currentUser?.uid || 'admin-user-001';
  let url = `/api/posts?userId=${encodeURIComponent(userId)}`;
  if (brandId) url += `&brandId=${encodeURIComponent(brandId)}`;
  
  const data = await safeApiFetch(url);
  if (Array.isArray(data)) {
    saveLocalPosts(data);
    return data;
  }

  const local = getLocalPosts();
  if (brandId) return local.filter(p => p.brandId === brandId);
  return local;
};

export const addPost = async (postData: Partial<Post>): Promise<Post> => {
  const userId = auth.currentUser?.uid || 'admin-user-001';
  const apiRes = await safeApiFetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...postData })
  });

  const newPost: Post = apiRes || {
    id: `post-${Date.now()}`,
    userId,
    brandId: postData.brandId || 'unassigned',
    content: postData.content || '',
    status: postData.status || 'suggested',
    ...postData
  };

  const current = getLocalPosts();
  saveLocalPosts([newPost, ...current]);
  return newPost;
};

export const updatePost = async (id: string, postData: Partial<Post>): Promise<void> => {
  await safeApiFetch(`/api/posts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(postData)
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
