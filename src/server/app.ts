/**
 * The API application.
 *
 * Extracted from server.ts so the tests exercise the same wiring the server
 * runs — the ordering here is load-bearing (webhooks before the JSON parser,
 * authentication before every route), and a test that rebuilt it separately
 * could pass while the real server was misconfigured.
 *
 * server.ts adds the Vite dev middleware or the static production build on
 * top; nothing in this file knows about either.
 */
import express, { Express } from 'express';
import path from 'path';

import apiApp from '../../api/index';
import dbApiRoutes from '../db/apiRoutes';
import metaRoutes from './metaRoutes';
import instagramRoutes from './instagramRoutes';
import whatsappRoutes from './whatsappRoutes';
import webhookRoutes from './webhookRoutes';
import oauthRoutes from './oauthRoutes';
import mcpRoutes from './mcpRoutes';
import crmRoutes from './crmRoutes';
import agentRoutes from './agentRoutes';
import contentRoutes from './contentRoutes';
import mediaRoutes from './mediaRoutes';
import governanceRoutes from './governanceRoutes';
import googleAdsRoutes from './googleAdsRoutes';
import videoPlatformRoutes from './videoPlatformRoutes';
import authRoutes from './authRoutes';
import { requireAuth } from './authMiddleware';
import { integrationErrorHandler } from './http';
import { localMediaRoot, storageDriver, checkStorage } from './mediaStore';
import { requestLogging, metricsSnapshot, logger } from './logging';
import { apiLimiter, loginLimiter, costlyLimiter, uploadLimiter } from './rateLimit';

/**
 * Paths that must never be served, whatever is mounted later.
 *
 * In development Vite serves the project directory, including through its
 * /@fs/ escape hatch, which hands out .env, the token-vault key and the
 * SQLite database to anyone who can reach the port. That is tolerable while
 * it is purely local, but publishing generated media can involve tunnelling
 * the app so Meta can fetch it. Vite's own fs.deny does not reliably match
 * dotfiles, so this does not depend on it.
 */
const BLOCKED = /(^|\/)(\.env($|\.)|\.wotsocial-encryption-key|\.git\/|wotsocial\.db)/i;

export const createApiApp = (): Express => {
  const app = express();

  // Correlates every log line for a request and reports its outcome.
  app.use(requestLogging);

  app.use((req, res, next) => {
    let target: string;
    try {
      target = decodeURIComponent(req.url.split('?')[0]);
    } catch {
      // A malformed escape sequence is not something to serve either.
      return res.status(400).type('text/plain').send('Bad Request');
    }
    if (BLOCKED.test(target)) {
      return res.status(403).type('text/plain').send('Forbidden');
    }
    next();
  });

  // Webhooks mount FIRST and bring their own body parser: verifying Meta's
  // X-Hub-Signature-256 requires the exact bytes that were signed, which a
  // shared upstream JSON parser would have already consumed.
  app.use('/api/webhooks', webhookRoutes);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Authentication gates everything under /api except a small allowlist.
  // Mounting it here rather than per-route means a new endpoint is protected
  // by default.
  // Sign-in is limited by address before authentication, since by definition
  // the caller does not have a session yet.
  app.use('/api/auth/login', loginLimiter);

  app.use('/api', requireAuth);

  // The broad ceiling sits after authentication so it counts per user rather
  // than per address, which is fairer behind a shared NAT or office IP.
  app.use('/api', apiLimiter);

  app.use('/api/auth', authRoutes);

  // Tighter limits where a call costs money: platform writes, AI generation
  // and anything that creates ad spend.
  app.use('/api/meta/campaigns', costlyLimiter);
  app.use('/api/google-ads/campaigns', costlyLimiter);
  app.use('/api/video/tiktok/publish', costlyLimiter);
  app.use('/api/video/youtube/publish', costlyLimiter);
  app.use('/api/instagram/publish', costlyLimiter);
  app.use('/api/whatsapp/broadcasts', costlyLimiter);
  app.use('/api/whatsapp/send', costlyLimiter);
  app.use('/api/content/wordpress/publish', costlyLimiter);
  app.use('/api/media', uploadLimiter);

  app.use(apiApp);
  app.use('/api', dbApiRoutes);

  app.use('/api/meta', metaRoutes);
  app.use('/api/instagram', instagramRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/oauth', oauthRoutes);
  app.use('/api/mcp', mcpRoutes);
  app.use('/api/crm', crmRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/content', contentRoutes);
  app.use('/api/governance', governanceRoutes);
  app.use('/api/google-ads', googleAdsRoutes);
  app.use('/api/video', videoPlatformRoutes);

  // The local media driver's objects are fetched anonymously by the
  // platforms, so this sits outside the authenticated /api tree.
  if (storageDriver() === 'local') {
    app.use('/media', express.static(path.join(localMediaRoot(), 'media'), {
      maxAge: '1y',
      immutable: true,
      index: false,
      dotfiles: 'deny'
    }));
  }

  /**
   * Operational metrics for this instance.
   *
   * In-process and approximate — it answers "is this instance healthy",
   * not "what is the fleet doing". Cross-instance aggregation should come
   * from the structured logs.
   */
  app.get('/api/metrics', (_req, res) => res.json(metricsSnapshot()));

  app.get('/api/health', async (_req, res) => {
    // Storage health matters operationally: without it, generated media cannot
    // be published, and that failure would otherwise only surface at publish.
    const storage = await checkStorage();
    res.json({
      status: storage.ok ? 'ok' : 'degraded',
      storage,
      integrations: {
        metaOAuth: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
        metaWebhooks: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN && process.env.META_APP_SECRET),
        tokenVault: process.env.ENCRYPTION_KEY ? 'env-key' : 'local-dev-key',
        graphVersion: process.env.META_GRAPH_VERSION || 'v21.0'
      }
    });
  });

  // Turns MetaApiError and HttpError into consistent JSON. Must sit after the
  // API routes and before any SPA catch-all.
  app.use('/api', integrationErrorHandler);

  return app;
};
