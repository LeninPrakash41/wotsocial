/**
 * Meta webhook receiver — the inbound half of every live integration.
 *
 * Handles three subscriptions on one endpoint, as Meta requires:
 *   • whatsapp_business_account → message status transitions + inbound replies
 *   • instagram                 → DMs and comments (drives keyword automation)
 *   • page                      → lead-gen form submissions
 *
 * Every request is signature-verified against META_APP_SECRET before its
 * payload is trusted, and every event is persisted for audit before handling.
 */
import express, { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { graphGet, graphPost, MetaApiError } from './graphClient';
import {
  getConnection, saveRow, selectRows, q, recordWebhookEvent, markWebhookProcessed,
  stringifyJson, timestamp, num, ensureStoreReady
} from './store';
import { asyncHandler } from './http';
import { randomId } from './crypto';

const router = Router();

/** Retains the exact bytes Meta signed; a re-serialised body will not match. */
const rawBodyJson = express.json({
  verify: (req: any, _res, buf) => { req.rawBody = buf; }
});

const verifySignature = (req: any): boolean => {
  const appSecret = process.env.META_APP_SECRET;
  const header = req.header('x-hub-signature-256') || req.header('X-Hub-Signature-256');

  if (!appSecret) {
    console.warn('⚠️  META_APP_SECRET is not set — webhook signatures cannot be verified.');
    return false;
  }
  if (!header || !req.rawBody) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/* ------------------------------------------------------------------ */
/* Subscription verification handshake                                 */
/* ------------------------------------------------------------------ */

router.get('/meta', (req: Request, res: Response) => {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!verifyToken) {
    return res.status(500).send('META_WEBHOOK_VERIFY_TOKEN is not configured on this server.');
  }
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ Meta webhook subscription verified.');
    return res.status(200).send(String(challenge));
  }
  res.sendStatus(403);
});

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

/** Attaches real delivery transitions to the messages we sent. */
const handleWhatsAppEntry = async (entry: any) => {
  for (const change of entry.changes || []) {
    const value = change.value || {};

    for (const status of value.statuses || []) {
      const wamid = status.id;
      const state = status.status; // sent | delivered | read | failed
      const ts = status.timestamp ? new Date(num(status.timestamp) * 1000).toISOString() : timestamp();

      const column =
        state === 'delivered' ? 'delivered_at' : state === 'read' ? 'read_at' : 'sent_at';
      const errorText = (status.errors || [])
        .map((e: any) => `${e.code}: ${e.title || e.message}`)
        .join('; ');

      await q(
        `UPDATE whatsapp_messages SET status = $1, ${column} = $2, error = $3 WHERE wamid = $4`,
        [state, ts, errorText || null, wamid]
      );
    }

    // Inbound replies: a customer answering a broadcast is a lead signal.
    for (const message of value.messages || []) {
      const from = message.from;
      const text = message.text?.body || message.button?.text || '';
      const phoneNumberId = value.metadata?.phone_number_id;

      const rows = await selectRows<any>(
        'platform_connections', `platform = 'whatsapp' AND external_id = $1`, [phoneNumberId]
      );
      const brandId = rows[0]?.brand_id;
      if (!brandId) continue;

      await saveRow('crm_leads', {
        id: `lead_wa_${message.id}`,
        brand_id: brandId,
        source: 'WhatsApp Broadcast',
        external_id: message.id,
        name: value.contacts?.[0]?.profile?.name || from,
        email: '',
        phone: from,
        status: 'CONTACTED',
        notes: text.slice(0, 500),
        raw: stringifyJson(message),
        created_at: timestamp()
      });

      // A reply to a template counts as engagement on its broadcast.
      if (message.context?.id) {
        await q(
          `UPDATE whatsapp_messages SET status = 'read', read_at = $1 WHERE wamid = $2`,
          [timestamp(), message.context.id]
        );
      }
    }
  }
};

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/** Fires the DM keyword rules. This is what makes Instagram automation real. */
const handleInstagramEntry = async (entry: any) => {
  const igAccountId = entry.id;

  const rows = await selectRows<any>(
    'platform_connections', `platform = 'instagram' AND external_id = $1`, [igAccountId]
  );
  const brandId = rows[0]?.brand_id;
  if (!brandId) {
    console.warn(`Instagram webhook for unknown account ${igAccountId} — ignoring.`);
    return;
  }

  const conn = await getConnection(brandId, 'instagram');
  if (!conn) return;

  const rules = await selectRows<any>(
    'instagram_dm_rules', `brand_id = $1 AND status = 'ACTIVE'`, [brandId]
  );

  const messagingEvents = [
    ...(entry.messaging || []),
    ...(entry.changes || []).filter((c: any) => c.field === 'messages').map((c: any) => c.value)
  ];

  for (const event of messagingEvents) {
    const senderId = event.sender?.id;
    const text = event.message?.text || '';
    // Ignore our own echoes, or we would answer ourselves in a loop.
    if (!senderId || senderId === igAccountId || event.message?.is_echo) continue;

    const upper = text.toUpperCase();
    const rule = rules.find(r => upper.includes(String(r.keyword).toUpperCase()));
    if (!rule) continue;

    // Skip a message we have already answered, so a Meta retry does not send
    // the customer a second identical reply.
    const leadExternalId = `ig_${senderId}_${event.message?.mid || 'nomid'}`;
    if (event.message?.mid) {
      const seen = await selectRows<any>('crm_leads', 'external_id = $1', [leadExternalId]);
      if (seen.length) continue;
    }

    try {
      await graphPost(`${igAccountId}/messages`, conn.accessToken, {
        recipient: JSON.stringify({ id: senderId }),
        message: JSON.stringify({ text: rule.reply_message })
      });

      await q(
        `UPDATE instagram_dm_rules SET triggered_count = $1 WHERE id = $2`,
        [String(num(rule.triggered_count) + 1), rule.id]
      );

      // Someone who DMs your keyword is a lead whether or not they left an
      // email, so the row is always written. It doubles as the retry marker
      // checked above, which is why its id is derived from the message id
      // rather than the clock — a redelivery updates the same row instead of
      // violating the unique index.
      const email = rule.capture_email === '1' ? (text.match(EMAIL_RE)?.[0] || '') : '';
      await saveRow('crm_leads', {
        id: `lead_${leadExternalId}`,
        brand_id: brandId,
        source: 'Instagram DM Automation',
        external_id: leadExternalId,
        name: `Instagram user ${senderId}`,
        email,
        phone: '',
        status: 'NEW',
        notes: text.slice(0, 500),
        raw: stringifyJson({ keyword: rule.keyword, senderId }),
        created_at: timestamp()
      });

      if (email) {
        await q(
          `UPDATE instagram_dm_rules SET leads_captured = $1 WHERE id = $2`,
          [String(num(rule.leads_captured) + 1), rule.id]
        );
      }
    } catch (err: any) {
      console.error(
        `Instagram auto-reply for rule ${rule.id} failed:`,
        err instanceof MetaApiError ? err.toClientMessage() : err.message
      );
    }
  }

  // Comment keyword triggers use the same rule set.
  for (const change of entry.changes || []) {
    if (change.field !== 'comments') continue;
    const comment = change.value || {};
    const upper = String(comment.text || '').toUpperCase();
    const rule = rules.find(r => upper.includes(String(r.keyword).toUpperCase()));
    if (!rule || !comment.id) continue;

    try {
      await graphPost(`${comment.id}/replies`, conn.accessToken, { message: rule.reply_message });
      await q(
        `UPDATE instagram_dm_rules SET triggered_count = $1 WHERE id = $2`,
        [String(num(rule.triggered_count) + 1), rule.id]
      );
    } catch (err: any) {
      console.error('Instagram comment reply failed:', err.message);
    }
  }
};

/** Lead-gen forms arrive as an ID; the fields must be fetched separately. */
const handlePageEntry = async (entry: any) => {
  for (const change of entry.changes || []) {
    if (change.field !== 'leadgen') continue;
    const value = change.value || {};
    const leadgenId = value.leadgen_id;
    const pageId = value.page_id;
    if (!leadgenId) continue;

    const rows = await selectRows<any>(
      'platform_connections', `platform IN ('meta_ads','facebook_page','instagram')`, []
    );
    const match = rows.find(r => {
      try { return JSON.parse(r.metadata || '{}').pageId === String(pageId); }
      catch { return false; }
    });
    const brandId = match?.brand_id;
    if (!brandId) {
      console.warn(`Lead-gen webhook for unmapped page ${pageId} — ignoring.`);
      continue;
    }

    const conn = await getConnection(brandId, 'meta_ads') || await getConnection(brandId, 'instagram');
    if (!conn) continue;

    try {
      const { data: lead } = await graphGet<any>(leadgenId, conn.accessToken, {
        fields: 'id,created_time,field_data,campaign_id,campaign_name,adset_name,ad_name,form_id'
      });

      const fields: Record<string, string> = {};
      for (const f of lead.field_data || []) fields[f.name] = (f.values || [])[0] || '';

      await saveRow('crm_leads', {
        id: `lead_${lead.id}`,
        brand_id: brandId,
        source: 'Meta Ads Lead Form',
        external_id: lead.id,
        name: fields.full_name || `${fields.first_name || ''} ${fields.last_name || ''}`.trim() || 'Unknown',
        email: fields.email || '',
        phone: fields.phone_number || '',
        company: fields.company_name || '',
        campaign_id: lead.campaign_id || '',
        campaign_name: lead.campaign_name || '',
        adset_name: lead.adset_name || '',
        status: 'NEW',
        raw: stringifyJson(fields),
        created_at: lead.created_time || timestamp()
      });
      console.log(`📥 Lead ${lead.id} captured for brand ${brandId}.`);
    } catch (err: any) {
      console.error('Lead-gen fetch failed:', err.message);
    }
  }
};

/* ------------------------------------------------------------------ */
/* Receiver                                                            */
/* ------------------------------------------------------------------ */

router.post('/meta', rawBodyJson, asyncHandler(async (req: Request, res: Response) => {
  const signatureValid = verifySignature(req);
  const body = req.body || {};

  // Meta retries anything that is not acknowledged quickly, so ack first and
  // process afterwards — but never process an unverified payload.
  res.status(200).send('EVENT_RECEIVED');

  await ensureStoreReady();
  const eventId = await recordWebhookEvent({
    platform: 'meta',
    objectType: body.object || 'unknown',
    signatureValid,
    payload: body
  });

  if (!signatureValid) {
    const reason = process.env.META_APP_SECRET
      ? 'X-Hub-Signature-256 did not match the app secret'
      : 'META_APP_SECRET is not configured';
    console.error(`🚫 Rejected unverified Meta webhook (${reason}). Payload stored for audit only.`);
    await markWebhookProcessed(eventId, `Unverified: ${reason}`);
    return;
  }

  try {
    for (const entry of body.entry || []) {
      if (body.object === 'whatsapp_business_account') await handleWhatsAppEntry(entry);
      else if (body.object === 'instagram') await handleInstagramEntry(entry);
      else if (body.object === 'page') await handlePageEntry(entry);
    }
    await markWebhookProcessed(eventId);
  } catch (err: any) {
    console.error('Webhook processing error:', err);
    await markWebhookProcessed(eventId, err.message);
  }
}));

/** Recent webhook traffic — the fastest way to tell if a subscription is live. */
router.get('/events', asyncHandler(async (req: Request, res: Response) => {
  await ensureStoreReady();
  const rows = await q<any>(
    `SELECT id, platform, object_type, signature_valid, processed, error, received_at
       FROM webhook_events ORDER BY received_at DESC LIMIT 50`
  );
  res.json({
    events: rows.map(r => ({
      id: r.id, platform: r.platform, objectType: r.object_type,
      signatureValid: r.signature_valid === '1',
      processed: r.processed === '1', error: r.error, receivedAt: r.received_at
    })),
    configured: {
      verifyToken: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
      appSecret: Boolean(process.env.META_APP_SECRET),
      callbackUrl: `${process.env.APP_URL || 'http://localhost:3050'}/api/webhooks/meta`
    }
  });
}));

export default router;
