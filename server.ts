import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

import { createApiApp } from "./src/server/app.ts";
import { ensureStoreReady } from "./src/server/store.ts";
import { pruneExpired } from "./src/server/sessions.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  // Routes, middleware and their ordering live in src/server/app.ts, which the
  // tests import directly so they exercise the real wiring.
  const app = createApiApp();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3050;

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

    app.get("*", async (req, res, next) => {
      try {
        const template = await vite.transformIndexHtml(
          req.originalUrl,
          fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8')
        );
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  await ensureStoreReady();

  // Expired sessions and stale sign-in attempts are cleared on boot and daily.
  await pruneExpired();
  setInterval(() => { void pruneExpired(); }, 24 * 60 * 60 * 1000).unref();

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
