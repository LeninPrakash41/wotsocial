/**
 * Lead CRM routes. Leads arrive from three live sources — Meta lead forms,
 * Instagram DM automation and WhatsApp replies — all written by the webhook
 * receiver, plus manual entry here.
 */
import { Router, Request, Response } from 'express';
import { saveRow, selectRows, q, listConnections, toPublicConnection, stringifyJson, timestamp, num, ensureStoreReady } from './store';
import { asyncHandler, badRequest, requireParam, currentUserId } from './http';
import { randomId } from './crypto';

const router = Router();

router.get('/leads', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const rows = await selectRows<any>('crm_leads', 'brand_id = $1', [brandId], 'ORDER BY created_at DESC LIMIT 500');

  const leads = rows.map(l => ({
    id: l.id, brandId: l.brand_id, name: l.name, email: l.email, phone: l.phone,
    company: l.company, source: l.source, campaignId: l.campaign_id,
    campaignName: l.campaign_name, adSetName: l.adset_name, status: l.status,
    costPerLead: l.cost_per_lead ? num(l.cost_per_lead) : undefined,
    notes: l.notes, createdAt: l.created_at
  }));

  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const l of leads) {
    bySource[l.source || 'Unknown'] = (bySource[l.source || 'Unknown'] || 0) + 1;
    byStatus[l.status || 'NEW'] = (byStatus[l.status || 'NEW'] || 0) + 1;
  }

  res.json({ leads, totals: { count: leads.length, bySource, byStatus } });
}));

router.post('/leads', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.body.brandId, 'brandId');
  const id = req.body.id || randomId('lead');
  await saveRow('crm_leads', {
    id,
    brand_id: brandId,
    source: req.body.source || 'Website Conversion',
    external_id: req.body.externalId || id,
    name: req.body.name || '',
    email: req.body.email || '',
    phone: req.body.phone || '',
    company: req.body.company || '',
    campaign_id: req.body.campaignId || '',
    campaign_name: req.body.campaignName || '',
    adset_name: req.body.adSetName || '',
    status: req.body.status || 'NEW',
    cost_per_lead: req.body.costPerLead != null ? String(req.body.costPerLead) : '',
    notes: req.body.notes || '',
    raw: stringifyJson(req.body.raw || {}),
    created_at: req.body.createdAt || timestamp()
  });
  res.json({ success: true, id });
}));

router.patch('/leads/:id', asyncHandler(async (req: Request, res: Response) => {
  await ensureStoreReady();
  const status = requireParam(req.body.status, 'status');
  if (!['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED'].includes(status)) {
    throw badRequest('Status must be NEW, CONTACTED, QUALIFIED or CONVERTED.');
  }
  await q('UPDATE crm_leads SET status = $1 WHERE id = $2', [status, req.params.id]);
  res.json({ success: true });
}));

/** One call the dashboard uses to show what is actually live for a brand. */
router.get('/connections', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const connections = await listConnections(brandId);

  res.json({
    connections: connections.map(toPublicConnection),
    summary: {
      metaAds: connections.some(c => c.platform === 'meta_ads' && c.status === 'connected'),
      instagram: connections.some(c => c.platform === 'instagram' && c.status === 'connected'),
      whatsapp: connections.some(c => c.platform === 'whatsapp' && c.status === 'connected')
    },
    server: {
      oauthConfigured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
      webhooksConfigured: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN && process.env.META_APP_SECRET),
      appUrl: process.env.APP_URL || 'http://localhost:3050'
    }
  });
}));

export default router;
