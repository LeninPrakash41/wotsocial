/**
 * Integration test harness.
 *
 * Boots the real API app against a throwaway database and a stand-in Graph
 * API, so the tests exercise the same middleware ordering and route wiring the
 * server runs rather than a reconstruction of it.
 */
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import express, { Express } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';

export interface Harness {
  baseUrl: string;
  graphUrl: string;
  /** Requests the Graph stand-in received, for asserting on what was sent. */
  graphCalls: GraphCall[];
  close: () => Promise<void>;
  /** Direct database access, for arranging state the API cannot set up. */
  db: any;
}

export interface GraphCall {
  method: string;
  path: string;
  query: Record<string, string>;
  body: Record<string, string>;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  role: string;
}

const listen = (app: Express): Promise<{ server: Server; port: number }> =>
  new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
    });
  });

/** Enough of the Graph API to drive connect and publish, and nothing more. */
const createGraphStub = (calls: GraphCall[]): Express => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  let containerPolls = 0;

  app.use((req, _res, next) => {
    calls.push({
      method: req.method,
      path: req.path.replace(/^\/v\d+\.\d+\//, ''),
      query: req.query as Record<string, string>,
      body: (req.body || {}) as Record<string, string>
    });
    next();
  });

  const route = (p: string) => new RegExp(`^/v\\d+\\.\\d+/${p}$`);

  app.get(route('me'), (_req, res) => res.json({ id: 'user_1', name: 'Test User' }));
  app.get(route('debug_token'), (_req, res) =>
    res.json({ data: { is_valid: true, app_id: 'app', user_id: 'user_1', scopes: ['ads_management'] } }));

  app.get(route('me/accounts'), (_req, res) => res.json({
    data: [{
      id: 'page_1', name: 'Test Page', access_token: 'PAGE_TOKEN',
      instagram_business_account: { id: 'ig_1', username: 'testbrand', name: 'Test Brand' }
    }]
  }));
  app.get(route('me/adaccounts'), (_req, res) => res.json({
    data: [{ id: 'act_555', account_id: '555', name: 'Test Ad Account', currency: 'USD', timezone_name: 'UTC', account_status: 1 }]
  }));
  app.get(route('act_555'), (_req, res) => res.json({
    id: 'act_555', name: 'Test Ad Account', currency: 'USD', timezone_name: 'UTC', account_status: 1
  }));

  app.get(route('ig_1'), (_req, res) => res.json({
    id: 'ig_1', username: 'testbrand', name: 'Test Brand', followers_count: 1234, media_count: 9
  }));

  // Instagram's two-phase publish. The container is deliberately not ready on
  // the first poll, so a publisher that skips the wait fails the test.
  app.post(route('ig_1/media'), (_req, res) => { containerPolls = 0; res.json({ id: 'container_1' }); });
  app.get(route('container_1'), (_req, res) => {
    containerPolls += 1;
    res.json({ status_code: containerPolls >= 2 ? 'FINISHED' : 'IN_PROGRESS' });
  });
  app.post(route('ig_1/media_publish'), (_req, res) => res.json({ id: 'ig_media_1' }));
  app.get(route('ig_media_1'), (_req, res) => res.json({ permalink: 'https://instagram.com/p/TEST' }));
  app.post(route('ig_media_1/comments'), (_req, res) => res.json({ id: 'comment_1' }));

  app.post(route('page_1/feed'), (_req, res) => res.json({ id: 'fb_post_1' }));
  app.post(route('page_1/photos'), (_req, res) => res.json({ id: 'fb_photo_1' }));

  // Targeting resolution: names in, Meta ids out.
  app.get(route('search'), (req, res) => {
    const q = String(req.query.q || '');
    if (req.query.type === 'adgeolocation') {
      return res.json({ data: [{ key: 'US', name: q, type: 'country', country_code: 'US' }] });
    }
    res.json({ data: [{ id: '6003', name: q }] });
  });
  app.get(route('act_555/adspixels'), (_req, res) => res.json({ data: [{ id: 'pixel_1', name: 'Pixel' }] }));

  // The campaign chain, each step returning the id the next one needs.
  app.post(route('act_555/campaigns'), (_req, res) => res.json({ id: 'camp_1' }));
  app.post(route('act_555/adsets'), (_req, res) => res.json({ id: 'adset_1' }));
  app.post(route('act_555/adcreatives'), (_req, res) => res.json({ id: 'creative_1' }));
  app.post(route('act_555/ads'), (_req, res) => res.json({ id: 'ad_1' }));

  // Status changes and rollback deletes.
  app.post(route('(camp_1|adset_1|ad_1)'), (_req, res) => res.json({ success: true }));
  app.delete(route('(camp_1|adset_1|ad_1)'), (_req, res) => res.json({ success: true }));

  app.get(route('act_555/campaigns'), (_req, res) => res.json({
    data: [{
      id: 'camp_1', name: 'Stub Campaign', objective: 'OUTCOME_TRAFFIC', status: 'PAUSED',
      effective_status: 'PAUSED', buying_type: 'AUCTION', daily_budget: '1000',
      special_ad_categories: [], created_time: '2026-01-01T00:00:00+0000',
      insights: { data: [{ impressions: '1000', clicks: '40', spend: '12.50', reach: '800', ctr: '4', cpc: '0.31', actions: [] }] }
    }]
  }));
  app.get(/\/insights$/, (_req, res) => res.json({
    data: [{ impressions: '1000', clicks: '40', spend: '12.50', reach: '800', ctr: '4', cpc: '0.31',
             actions: [], date_start: '2026-01-01', date_stop: '2026-01-01' }]
  }));

  app.all('*', (req, res) =>
    res.status(404).json({ error: { message: `no stub for ${req.method} ${req.path}`, code: 803 } }));

  return app;
};

/**
 * Starts a fresh stack. Modules are imported only after the environment is
 * set, because the database path and storage driver are read at import time.
 */
export const startHarness = async (): Promise<Harness> => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wotsocial-test-'));

  const calls: GraphCall[] = [];
  const graph = await listen(createGraphStub(calls));
  const graphUrl = `http://127.0.0.1:${graph.port}`;

  process.env.SQLITE_PATH = path.join(root, 'test.db');
  process.env.MEDIA_LOCAL_DIR = path.join(root, 'media');
  process.env.ENCRYPTION_KEY = 'test-encryption-key-not-used-in-production';
  process.env.META_GRAPH_BASE_URL = graphUrl;
  process.env.ADMIN_PASSWORD = 'Harness-Admin-Passw0rd!';
  process.env.NODE_ENV = 'test';
  // The real 5s container poll would dominate the run.
  process.env.IG_CONTAINER_POLL_MS = '20';
  // Suites create many users from one address, which is exactly what the
  // limiter exists to stop. It is switched on explicitly by its own tests.
  process.env.RATE_LIMIT_DISABLED = 'true';
  process.env.LOG_LEVEL = 'error';
  delete process.env.DATABASE_URL;
  delete process.env.S3_BUCKET;
  delete process.env.CRON_SECRET;

  const { createApiApp } = await import('../../src/server/app');
  const { ensureStoreReady } = await import('../../src/server/store');

  await ensureStoreReady();
  const api = await listen(createApiApp());
  const baseUrl = `http://127.0.0.1:${api.port}`;

  // APP_URL decides the public media base, so it must match the live port.
  process.env.APP_URL = baseUrl;

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(process.env.SQLITE_PATH);

  return {
    baseUrl,
    graphUrl,
    graphCalls: calls,
    db,
    close: async () => {
      db.close();
      await new Promise<void>(r => { api.server.close(() => r()); });
      await new Promise<void>(r => { graph.server.close(() => r()); });
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
};

/* ------------------------------------------------------------------ */
/* Request helpers                                                     */
/* ------------------------------------------------------------------ */

export interface ApiResponse<T = any> {
  status: number;
  body: T;
}

export const api = async <T = any>(
  harness: Harness,
  path: string,
  options: { method?: string; token?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<ApiResponse<T>> => {
  const res = await fetch(`${harness.baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const text = await res.text();
  let body: any = {};
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
  }
  return { status: res.status, body };
};

/** Creates a user directly, so tests are not coupled to a sign-up flow. */
export const createUser = async (
  harness: Harness,
  options: { email: string; password?: string; role?: string }
): Promise<TestUser> => {
  const password = options.password || 'Tenant-Passw0rd!2026';
  const id = `user-${Math.random().toString(36).slice(2, 10)}`;

  harness.db.prepare(
    `INSERT INTO users (id, email, password_hash, name, role, must_change_password)
     VALUES (?, ?, ?, ?, ?, '0')`
  ).run(id, options.email, bcrypt.hashSync(password, 4), options.email.split('@')[0], options.role || 'user');

  const res = await api(harness, '/api/auth/login', {
    method: 'POST',
    body: { email: options.email, password }
  });
  if (res.status !== 200) throw new Error(`Harness sign-in failed: ${JSON.stringify(res.body)}`);

  return { id, email: options.email, password, token: res.body.token, role: options.role || 'user' };
};

export const createBrand = async (harness: Harness, user: TestUser, name: string): Promise<string> => {
  const res = await api(harness, '/api/brands', {
    method: 'POST', token: user.token, body: { name, industry: 'Testing' }
  });
  if (!res.body?.id) throw new Error(`Harness brand creation failed: ${JSON.stringify(res.body)}`);
  return res.body.id;
};

/** A real 1x1 PNG, so uploads exercise genuine image bytes. */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
