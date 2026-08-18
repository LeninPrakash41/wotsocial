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

// Brands API Client
export const getBrands = async (): Promise<Brand[]> => {
  const userId = auth.currentUser?.uid || 'admin-user-001';
  const res = await fetch(`/api/brands?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error("Failed to fetch brands from database");
  return await res.json();
};

export const getBrandById = async (id: string): Promise<Brand | null> => {
  const brands = await getBrands();
  return brands.find(b => b.id === id) || null;
};

export const addBrand = async (brandData: Partial<Brand>): Promise<Brand> => {
  const userId = auth.currentUser?.uid || 'admin-user-001';
  const res = await fetch('/api/brands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...brandData })
  });
  if (!res.ok) throw new Error("Failed to save brand to database");
  return await res.json();
};

export const updateBrand = async (id: string, brandData: Partial<Brand>): Promise<void> => {
  const res = await fetch(`/api/brands/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(brandData)
  });
  if (!res.ok) throw new Error("Failed to update brand in database");
};

export const deleteBrand = async (id: string): Promise<void> => {
  const res = await fetch(`/api/brands/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error("Failed to delete brand from database");
};

// Posts API Client
export const getPosts = async (brandId?: string): Promise<Post[]> => {
  const userId = auth.currentUser?.uid || 'admin-user-001';
  let url = `/api/posts?userId=${encodeURIComponent(userId)}`;
  if (brandId) url += `&brandId=${encodeURIComponent(brandId)}`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch posts from database");
  return await res.json();
};

export const addPost = async (postData: Partial<Post>): Promise<Post> => {
  const userId = auth.currentUser?.uid || 'admin-user-001';
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...postData })
  });
  if (!res.ok) throw new Error("Failed to create post in database");
  return await res.json();
};

export const updatePost = async (id: string, postData: Partial<Post>): Promise<void> => {
  const res = await fetch(`/api/posts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(postData)
  });
  if (!res.ok) throw new Error("Failed to update post in database");
};

export const deletePost = async (id: string): Promise<void> => {
  const res = await fetch(`/api/posts/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error("Failed to delete post from database");
};
