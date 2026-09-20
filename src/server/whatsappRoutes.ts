/**
 * WhatsApp Business Cloud API routes.
 *
 * Broadcasts are sent per-recipient and each message is persisted with its
 * `wamid`, so the webhook can later attach real sent/delivered/read/failed
 * transitions to it. Delivery counts here are counted, never estimated.
 */
import { Router, Request, Response } from 'express';
import { graphGet, graphPost, graphGetAll, debugToken, MetaApiError } from './graphClient';
import {
  upsertConnection, getConnection, deleteConnection, toPublicConnection,
  markConnectionVerified, markConnectionError, saveRow, selectRows, q,
  parseJson, stringifyJson, timestamp, num, ensureStoreReady
} from './store';
import { asyncHandler, badRequest, notConnected, requireParam, currentUserId, HttpError } from './http';
import { randomId } from './crypto';

const router = Router();

/** Cloud API default throughput is 80 msg/s; stay well under it. */
const SEND_INTERVAL_MS = Number(process.env.WHATSAPP_SEND_INTERVAL_MS || 60);

export const requireWaConnection = async (brandId: string) => {
  const conn = await getConnection(brandId, 'whatsapp');
  if (!conn || !conn.accessToken) throw notConnected('WhatsApp Business');
  return conn;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** E.164 without the leading '+', which is what the Cloud API expects. */
const normalizePhone = (raw: string): string => String(raw || '').replace(/[^\d]/g, '');

/* ------------------------------------------------------------------ */
/* Connection                                                          */
/* ------------------------------------------------------------------ */

router.get('/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const conn = await getConnection(brandId, 'whatsapp');
  if (!conn) return res.json({ connected: false, connection: null, phoneNumber: null });

  try {
    const { data: phone } = await graphGet<any>(conn.externalId, conn.accessToken, {
      fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,throughput'
    });
    await markConnectionVerified(conn.id);

    res.json({
      connected: true,
      connection: toPublicConnection(conn),
      phoneNumber: {
        id: phone.id,
        displayPhoneNumber: phone.display_phone_number,
        verifiedName: phone.verified_name,
        qualityRating: phone.quality_rating || 'UNKNOWN',
        verificationStatus: phone.code_verification_status,
        throughputLevel: phone.throughput?.level
      }
    });
  } catch (err: any) {
    await markConnectionError(conn.id, err.message, err instanceof MetaApiError && err.isAuthError ? 'expired' : 'error');
    res.json({
      connected: false,
      connection: toPublicConnection(conn),
      phoneNumber: null,
      error: err instanceof MetaApiError ? err.toClientMessage() : err.message
    });
  }
}));

router.post('/connect', asyncHandler(async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  const brandId = requireParam(req.body.brandId, 'brandId');
  const accessToken = requireParam(req.body.accessToken, 'accessToken').trim();
  const phoneNumberId = requireParam(req.body.phoneNumberId, 'phoneNumberId').trim();
  const wabaId = (req.body.wabaId || '').trim();

  const info = await debugToken(accessToken);
  if (!info.valid) throw badRequest('Meta rejected this access token. Generate a new one and try again.');

  // Confirm the token actually owns this phone number before storing it.
  const { data: phone } = await graphGet<any>(phoneNumberId, accessToken, {
    fields: 'id,display_phone_number,verified_name,quality_rating,code_verification_status'
  });

  let resolvedWabaId = wabaId;
  if (!resolvedWabaId) {
    try {
      const { data } = await graphGet<any>(phoneNumberId, accessToken, { fields: 'whatsapp_business_account{id,name}' });
      resolvedWabaId = data?.whatsapp_business_account?.id || '';
    } catch { /* the WABA id is only needed for template management */ }
  }

  const connection = await upsertConnection({
    userId, brandId, platform: 'whatsapp',
    externalId: phone.id,
    name: phone.verified_name || phone.display_phone_number,
    username: phone.display_phone_number,
    accessToken,
    tokenExpiresAt: info.expiresAt,
    scopes: info.scopes,
    metadata: {
      wabaId: resolvedWabaId,
      displayPhoneNumber: phone.display_phone_number,
      qualityRating: phone.quality_rating,
      verificationStatus: phone.code_verification_status
    }
  });

  res.json({
    success: true,
    connection: toPublicConnection(connection),
    phoneNumber: {
      id: phone.id,
      displayPhoneNumber: phone.display_phone_number,
      verifiedName: phone.verified_name,
      qualityRating: phone.quality_rating
    },
    wabaId: resolvedWabaId
  });
}));

router.delete('/connection', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId || req.body?.brandId, 'brandId');
  await deleteConnection(brandId, 'whatsapp');
  res.json({ success: true });
}));

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

/** Pulls the real approved/pending/rejected templates from the WABA. */
router.get('/templates', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  const conn = await requireWaConnection(brandId);
  const wabaId = conn.metadata?.wabaId;

  if (!wabaId) {
    throw badRequest(
      'No WhatsApp Business Account ID is stored for this connection. Reconnect and supply the WABA ID to manage templates.'
    );
  }

  const templates = await graphGetAll<any>(`${wabaId}/message_templates`, conn.accessToken, {
    fields: 'id,name,language,status,category,components,quality_score,rejected_reason',
    limit: 100
  });

  for (const t of templates) {
    await saveRow('whatsapp_templates', {
      id: t.id, brand_id: brandId, connection_id: conn.id,
      name: t.name, language: t.language, category: t.category, status: t.status,
      components: stringifyJson(t.components || []),
      quality_score: stringifyJson(t.quality_score || null),
      rejected_reason: t.rejected_reason || '',
      synced_at: timestamp()
    });
  }

  res.json({
    templates: templates.map(t => ({
      id: t.id, name: t.name, language: t.language, category: t.category,
      status: t.status, components: t.components || [],
      qualityScore: t.quality_score?.score, rejectedReason: t.rejected_reason
    }))
  });
}));

/** Submits a new template for Meta review. Approval is not instant. */
router.post('/templates', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.body.brandId, 'brandId');
  const conn = await requireWaConnection(brandId);
  const wabaId = conn.metadata?.wabaId;
  if (!wabaId) throw badRequest('A WhatsApp Business Account ID is required to create templates.');

  const { name, language = 'en_US', category = 'MARKETING', headerType, headerContent, bodyText, footerText, buttons = [] } = req.body;
  if (!name || !bodyText) throw badRequest('Template `name` and `bodyText` are required.');

  const components: any[] = [];
  if (headerType && headerContent) {
    components.push(
      headerType === 'TEXT'
        ? { type: 'HEADER', format: 'TEXT', text: headerContent }
        : { type: 'HEADER', format: headerType, example: { header_handle: [headerContent] } }
    );
  }
  components.push({ type: 'BODY', text: bodyText });
  if (footerText) components.push({ type: 'FOOTER', text: footerText });

  if (buttons.length) {
    components.push({
      type: 'BUTTONS',
      buttons: buttons.slice(0, 3).map((b: any) => {
        if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.value };
        if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.value };
        return { type: 'QUICK_REPLY', text: b.text };
      })
    });
  }

  const { data } = await graphPost<any>(`${wabaId}/message_templates`, conn.accessToken, {
    name: String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    language,
    category,
    components: JSON.stringify(components)
  });

  res.json({
    success: true,
    id: data.id,
    status: data.status || 'PENDING',
    note: 'Meta reviews new templates before they can be sent. This usually takes minutes but can take up to 24 hours.'
  });
}));

/* ------------------------------------------------------------------ */
/* Sending                                                             */
/* ------------------------------------------------------------------ */

export const buildTemplatePayload = (
  to: string,
  templateName: string,
  language: string,
  variables: string[] = [],
  headerVariable?: string
) => {
  const components: any[] = [];
  if (headerVariable) {
    components.push({ type: 'header', parameters: [{ type: 'text', text: headerVariable }] });
  }
  if (variables.length) {
    components.push({
      type: 'body',
      parameters: variables.map(v => ({ type: 'text', text: String(v) }))
    });
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      ...(components.length ? { components } : {})
    }
  };
};

/** Sends one template message. Returns the real `wamid` from Meta. */
router.post('/send', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.body.brandId, 'brandId');
  const conn = await requireWaConnection(brandId);
  const to = normalizePhone(requireParam(req.body.to, 'to'));
  const templateName = requireParam(req.body.templateName, 'templateName');

  const payload = buildTemplatePayload(
    to, templateName, req.body.language || 'en_US',
    req.body.variables || [], req.body.headerVariable
  );

  const { data } = await graphPost<any>(`${conn.externalId}/messages`, conn.accessToken, payload);
  const wamid = data?.messages?.[0]?.id;

  await saveRow('whatsapp_messages', {
    id: randomId('wamsg'), broadcast_id: '', brand_id: brandId,
    wamid: wamid || '', to_number: to, status: 'sent', sent_at: timestamp()
  });

  res.json({ success: true, wamid, to, contacts: data?.contacts });
}));

/**
 * Broadcast to a recipient list.
 *
 * Returns as soon as the job is registered; sending continues in the
 * background and progress is readable from `GET /broadcasts`. Counts reflect
 * actual API acknowledgements, and delivered/read arrive later via webhook.
 */
router.post('/broadcasts', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.body.brandId, 'brandId');
  const conn = await requireWaConnection(brandId);
  const name = requireParam(req.body.name, 'name');
  const templateName = requireParam(req.body.templateName, 'templateName');
  const language = req.body.language || 'en_US';

  const recipients: any[] = Array.isArray(req.body.recipients) ? req.body.recipients : [];
  if (!recipients.length) {
    throw badRequest(
      'A broadcast needs at least one recipient. Provide `recipients` as an array of phone numbers or ' +
      '{ phone, variables } objects.'
    );
  }

  const normalized = recipients
    .map(r => (typeof r === 'string' ? { phone: normalizePhone(r), variables: [] } : { phone: normalizePhone(r.phone), variables: r.variables || [] }))
    .filter(r => r.phone.length >= 8);

  if (!normalized.length) throw badRequest('No valid E.164 phone numbers were found in the recipient list.');

  const broadcastId = randomId('wabc');
  await saveRow('whatsapp_broadcasts', {
    id: broadcastId, brand_id: brandId, connection_id: conn.id,
    name, template_name: templateName, language, status: 'SENDING',
    audience: stringifyJson({ segment: req.body.targetSegment || 'Custom list', size: normalized.length }),
    recipients_count: String(normalized.length),
    sent_count: '0', delivered_count: '0', read_count: '0', failed_count: '0', clicked_count: '0',
    created_at: timestamp()
  });

  // Fire-and-continue: the HTTP response should not wait on thousands of sends.
  void (async () => {
    let sent = 0, failed = 0;
    for (const recipient of normalized) {
      try {
        const payload = buildTemplatePayload(recipient.phone, templateName, language, recipient.variables);
        const { data } = await graphPost<any>(`${conn.externalId}/messages`, conn.accessToken, payload);
        const wamid = data?.messages?.[0]?.id;
        await saveRow('whatsapp_messages', {
          id: randomId('wamsg'), broadcast_id: broadcastId, brand_id: brandId,
          wamid: wamid || '', to_number: recipient.phone, status: 'sent', sent_at: timestamp()
        });
        sent++;
      } catch (err: any) {
        const message = err instanceof MetaApiError ? err.toClientMessage() : err.message;
        await saveRow('whatsapp_messages', {
          id: randomId('wamsg'), broadcast_id: broadcastId, brand_id: brandId,
          wamid: '', to_number: recipient.phone, status: 'failed',
          error: String(message).slice(0, 300), sent_at: timestamp()
        });
        failed++;

        // An auth failure will hit every remaining recipient — stop early.
        if (err instanceof MetaApiError && err.isAuthError) {
          await q(
            `UPDATE whatsapp_broadcasts SET status = 'FAILED', sent_count = $1, failed_count = $2, completed_at = $3 WHERE id = $4`,
            [String(sent), String(failed), timestamp(), broadcastId]
          );
          return;
        }
      }

      await q(
        `UPDATE whatsapp_broadcasts SET sent_count = $1, failed_count = $2 WHERE id = $3`,
        [String(sent), String(failed), broadcastId]
      );
      await sleep(SEND_INTERVAL_MS);
    }

    await q(
      `UPDATE whatsapp_broadcasts SET status = 'COMPLETED', sent_count = $1, failed_count = $2, completed_at = $3 WHERE id = $4`,
      [String(sent), String(failed), timestamp(), broadcastId]
    );
  })().catch(err => console.error('WhatsApp broadcast worker failed:', err));

  res.json({
    success: true,
    broadcastId,
    recipients: normalized.length,
    status: 'SENDING',
    note: 'Sending has started. Delivered and read counts populate as Meta delivers webhook events.'
  });
}));

/** Broadcast list with counts derived from the per-message table. */
router.get('/broadcasts', asyncHandler(async (req: Request, res: Response) => {
  const brandId = requireParam(req.query.brandId, 'brandId');
  await ensureStoreReady();

  const rows = await selectRows<any>('whatsapp_broadcasts', 'brand_id = $1', [brandId], 'ORDER BY created_at DESC LIMIT 50');

  const broadcasts = await Promise.all(rows.map(async r => {
    const counts = await q<any>(
      `SELECT status, COUNT(*) AS total FROM whatsapp_messages WHERE broadcast_id = $1 GROUP BY status`,
      [r.id]
    );
    const byStatus: Record<string, number> = {};
    for (const c of counts) byStatus[c.status] = num(c.total ?? c.count);

    return {
      id: r.id,
      brandId: r.brand_id,
      name: r.name,
      templateName: r.template_name,
      language: r.language,
      status: r.status,
      targetSegment: parseJson<any>(r.audience, {}).segment || 'Custom list',
      recipientsCount: num(r.recipients_count),
      sentCount: byStatus.sent || num(r.sent_count),
      deliveredCount: byStatus.delivered || num(r.delivered_count),
      readCount: byStatus.read || num(r.read_count),
      failedCount: byStatus.failed || num(r.failed_count),
      createdAt: r.created_at,
      completedAt: r.completed_at
    };
  }));

  res.json({ broadcasts });
}));

router.get('/broadcasts/:id/messages', asyncHandler(async (req: Request, res: Response) => {
  const rows = await selectRows<any>(
    'whatsapp_messages', 'broadcast_id = $1', [req.params.id], 'ORDER BY sent_at DESC LIMIT 500'
  );
  res.json({
    messages: rows.map(r => ({
      id: r.id, wamid: r.wamid, to: r.to_number, status: r.status,
      error: r.error, sentAt: r.sent_at, deliveredAt: r.delivered_at, readAt: r.read_at
    }))
  });
}));

export default router;
