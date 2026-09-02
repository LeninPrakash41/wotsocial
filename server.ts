import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

import apiApp from "./api/index.ts";
import dbApiRoutes from "./src/db/apiRoutes.ts";
import metaRoutes from "./src/server/metaRoutes.ts";
import instagramRoutes from "./src/server/instagramRoutes.ts";
import whatsappRoutes from "./src/server/whatsappRoutes.ts";
import webhookRoutes from "./src/server/webhookRoutes.ts";
import oauthRoutes from "./src/server/oauthRoutes.ts";
import mcpRoutes from "./src/server/mcpRoutes.ts";
import crmRoutes from "./src/server/crmRoutes.ts";
import agentRoutes from "./src/server/agentRoutes.ts";
import contentRoutes from "./src/server/contentRoutes.ts";
import { integrationErrorHandler } from "./src/server/http.ts";
import { ensureStoreReady } from "./src/server/store.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3050;

  // Webhooks mount FIRST and bring their own body parser: verifying Meta's
  // X-Hub-Signature-256 requires the exact bytes that were signed, which a
  // shared upstream JSON parser would have already consumed.
  app.use("/api/webhooks", webhookRoutes);

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Existing API surface
  app.use(apiApp);
  app.use("/api", dbApiRoutes);

  // Live platform integrations
  app.use("/api/meta", metaRoutes);
  app.use("/api/instagram", instagramRoutes);
  app.use("/api/whatsapp", whatsappRoutes);
  app.use("/api/oauth", oauthRoutes);
  app.use("/api/mcp", mcpRoutes);
  app.use("/api/crm", crmRoutes);
  app.use("/api/agents", agentRoutes);
  app.use("/api/content", contentRoutes);

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      integrations: {
        metaOAuth: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
        metaWebhooks: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN && process.env.META_APP_SECRET),
        tokenVault: Boolean(process.env.ENCRYPTION_KEY) ? "env-key" : "local-dev-key",
        graphVersion: process.env.META_GRAPH_VERSION || "v21.0"
      }
    });
  });

  // Turns MetaApiError / HttpError into consistent JSON. Must sit after the
  // API routes and before the SPA catch-all.
  app.use("/api", integrationErrorHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT
      },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Catch-all route for SPA
    app.get("*", async (req, res, next) => {
      try {
        const template = await vite.transformIndexHtml(req.originalUrl, fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8'));
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Production static serving
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  await ensureStoreReady();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!process.env.META_APP_ID) {
      console.log("ℹ️  META_APP_ID / META_APP_SECRET not set — OAuth is disabled; connect with manual access tokens.");
    }
    if (!process.env.META_WEBHOOK_VERIFY_TOKEN) {
      console.log("ℹ️  META_WEBHOOK_VERIFY_TOKEN not set — inbound webhooks (IG DM automation, WhatsApp delivery receipts, lead forms) are inactive.");
    }
  });
}

startServer();
