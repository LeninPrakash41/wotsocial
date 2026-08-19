import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { queryDb, initDatabase } from './db';

const router = Router();

// Ensure DB is initialized
initDatabase().catch(err => console.error("Database initialization error:", err));

// 1. Auth Endpoints
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const rows = await queryDb('SELECT * FROM users WHERE email = $1', [email.trim()]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      success: true,
      user: {
        uid: user.id,
        email: user.email,
        displayName: user.name,
        role: user.role
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// 2. Brands Endpoints
router.get('/brands', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'admin-user-001';
    const rows = await queryDb('SELECT * FROM brands WHERE user_id = $1 ORDER BY created_at DESC', [userId]);

    const brands = rows.map(b => ({
      id: b.id,
      userId: b.user_id,
      name: b.name,
      websiteUrl: b.website_url,
      socialUrls: b.social_urls ? b.social_urls.split(',') : [],
      guidelinesText: b.guidelines_text,
      brandTone: b.brand_tone,
      brandPersonality: b.brand_personality,
      logoUrl: b.logo_url,
      industry: b.industry,
      category: b.category,
      primaryColor: b.primary_color,
      secondaryColor: b.secondary_color,
      accentColor: b.accent_color,
      brandColors: typeof b.brand_colors === 'string' ? JSON.parse(b.brand_colors || '[]') : (b.brand_colors || []),
      automationSettings: typeof b.automation_settings === 'string' ? JSON.parse(b.automation_settings || '{}') : (b.automation_settings || {}),
      agentResearchData: typeof b.agent_research_data === 'string' ? JSON.parse(b.agent_research_data || 'null') : (b.agent_research_data || null)
    }));

    res.json(brands);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/brands', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = `brand-${Date.now()}`;
    const userId = data.userId || 'admin-user-001';

    await queryDb(
      `INSERT INTO brands (
        id, user_id, name, website_url, social_urls, guidelines_text, brand_tone, 
        brand_personality, logo_url, industry, category, primary_color, secondary_color, 
        accent_color, brand_colors, automation_settings, agent_research_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        id,
        userId,
        data.name,
        data.websiteUrl || '',
        Array.isArray(data.socialUrls) ? data.socialUrls.join(',') : (data.socialUrls || ''),
        data.guidelinesText || '',
        data.brandTone || '',
        data.brandPersonality || '',
        data.logoUrl || '',
        data.industry || '',
        data.category || '',
        data.primaryColor || '#000000',
        data.secondaryColor || '#666666',
        data.accentColor || '#3b82f6',
        JSON.stringify(data.brandColors || []),
        JSON.stringify(data.automationSettings || {}),
        JSON.stringify(data.agentResearchData || null)
      ]
    );

    res.json({ id, ...data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/brands/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;

    await queryDb(
      `UPDATE brands SET 
        name = COALESCE($1, name),
        website_url = COALESCE($2, website_url),
        social_urls = COALESCE($3, social_urls),
        guidelines_text = COALESCE($4, guidelines_text),
        brand_tone = COALESCE($5, brand_tone),
        brand_personality = COALESCE($6, brand_personality),
        logo_url = COALESCE($7, logo_url),
        industry = COALESCE($8, industry),
        category = COALESCE($9, category),
        primary_color = COALESCE($10, primary_color),
        secondary_color = COALESCE($11, secondary_color),
        accent_color = COALESCE($12, accent_color),
        brand_colors = COALESCE($13, brand_colors),
        automation_settings = COALESCE($14, automation_settings),
        agent_research_data = COALESCE($15, agent_research_data),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $16`,
      [
        data.name,
        data.websiteUrl,
        Array.isArray(data.socialUrls) ? data.socialUrls.join(',') : data.socialUrls,
        data.guidelinesText,
        data.brandTone,
        data.brandPersonality,
        data.logoUrl,
        data.industry,
        data.category,
        data.primaryColor,
        data.secondaryColor,
        data.accentColor,
        data.brandColors ? JSON.stringify(data.brandColors) : null,
        data.automationSettings ? JSON.stringify(data.automationSettings) : null,
        data.agentResearchData ? JSON.stringify(data.agentResearchData) : null,
        id
      ]
    );

    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/brands/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await queryDb('DELETE FROM brands WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const parseSafeISOString = (val: any): string | null => {
  if (!val) return null;
  try {
    if (typeof val === 'string') {
      const d = new Date(val);
      return !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    }
    if (typeof val === 'number') {
      const d = new Date(val);
      return !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
    }
    if (typeof val === 'object') {
      if (val.seconds) return new Date(val.seconds * 1000).toISOString();
      if (val.iso) return new Date(val.iso).toISOString();
      if (val.date) return new Date(val.date).toISOString();
    }
    const d = new Date(val);
    return !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
};

// 3. Posts Endpoints
router.get('/posts', async (req: Request, res: Response) => {
  try {
    const userId = (req.query.userId as string) || 'admin-user-001';
    const brandId = req.query.brandId as string;

    let text = 'SELECT * FROM posts WHERE user_id = $1';
    const params: any[] = [userId];

    if (brandId) {
      text += ' AND brand_id = $2';
      params.push(brandId);
    }
    text += ' ORDER BY created_at DESC';

    const rows = await queryDb(text, params);
    const posts = rows.map(p => ({
      id: p.id,
      userId: p.user_id,
      brandId: p.brand_id,
      content: p.content,
      mediaUrl: p.media_url,
      mediaType: p.media_type,
      scheduledTime: p.scheduled_time ? { toDate: () => new Date(p.scheduled_time) } : null,
      status: p.status,
      platforms: typeof p.platforms === 'string' ? JSON.parse(p.platforms || '[]') : (p.platforms || []),
      visualPrompt: p.visual_prompt,
      isAgentGenerated: Boolean(p.is_agent_generated)
    }));

    res.json(posts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/posts', async (req: Request, res: Response) => {
  try {
    const data = req.body;
    const id = `post-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const userId = data.userId || 'admin-user-001';
    const scheduledISO = parseSafeISOString(data.scheduledTime);

    await queryDb(
      `INSERT INTO posts (
        id, user_id, brand_id, content, media_url, media_type, scheduled_time, status, platforms, visual_prompt, is_agent_generated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        userId,
        data.brandId || 'unassigned',
        data.content || '',
        data.mediaUrl || '',
        data.mediaType || 'none',
        scheduledISO,
        data.status || 'suggested',
        JSON.stringify(data.platforms || ['twitter', 'linkedin']),
        data.visualPrompt || '',
        data.isAgentGenerated ? 1 : 0
      ]
    );

    res.json({ id, ...data, scheduledTime: scheduledISO });
  } catch (err: any) {
    console.error("POST /api/posts error:", err);
    res.status(500).json({ error: err.message || "Failed to create post" });
  }
});

router.put('/posts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const scheduledISO = parseSafeISOString(data.scheduledTime);

    await queryDb(
      `UPDATE posts SET 
        content = COALESCE($1, content),
        status = COALESCE($2, status),
        scheduled_time = COALESCE($3, scheduled_time),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $4`,
      [
        data.content,
        data.status,
        scheduledISO,
        id
      ]
    );

    res.json({ success: true, id, scheduledTime: scheduledISO });
  } catch (err: any) {
    console.error(`PUT /api/posts/${req.params.id} error:`, err);
    res.status(500).json({ error: err.message || "Failed to update post" });
  }
});

router.delete('/posts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await queryDb('DELETE FROM posts WHERE id = $1', [id]);
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
