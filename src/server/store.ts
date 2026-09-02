/**
 * Persistence layer for live platform integrations.
 *
 * Runs on top of the existing Postgres/SQLite abstraction in src/db/db.ts.
 * All columns are TEXT so the same DDL and the same values work on both
 * engines; JSON is stored as serialised text and timestamps as ISO-8601.
 */
import { dbMode, pgPool, sqliteDb, initDatabase } from '../db/db';
import { encryptSecret, decryptSecret, maskSecret, randomId, sha256 } from './crypto';

export type Platform = 'meta_ads' | 'instagram' | 'whatsapp' | 'facebook_page';
export type ConnectionStatus = 'connected' | 'expired' | 'revoked' | 'error';

export interface PlatformConnection {
  id: string;
  userId: string;
  brandId: string;
  platform: Platform;
  externalId: string;
  name: string;
  username?: string;
  accessToken: string;
  tokenExpiresAt?: string | null;
  scopes: string[];
  metadata: Record<string, any>;
  status: ConnectionStatus;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The browser-safe projection: never carries the decrypted token. */
export interface PublicConnection extends Omit<PlatformConnection, 'accessToken'> {
  tokenPreview: string;
  hasToken: boolean;
}

const nowISO = () => new Date().toISOString();

/* ------------------------------------------------------------------ */
/* Query helper                                                        */
/* ------------------------------------------------------------------ */

/**
 * Runs a $1-style parameterised query on whichever engine is active.
 * The regex rewrite handles double-digit placeholders correctly, which the
 * sequential string replace in src/db/db.ts does not.
 */
export const q = async <T = any>(text: string, params: any[] = []): Promise<T[]> => {
  if (dbMode === 'postgres' && pgPool) {
    const res = await pgPool.query(text, params);
    return res.rows as T[];
  }
  if (sqliteDb) {
    const sql = text.replace(/\$(\d+)/g, '?');
    const stmt = sqliteDb.prepare(sql);
    // PRAGMA returns rows like a SELECT does; without it, schema introspection
    // silently comes back empty and migrations quietly do nothing.
    if (/^\s*(SELECT|WITH|PRAGMA)/i.test(sql)) return stmt.all(...params) as T[];
    stmt.run(...params);
    return [] as T[];
  }
  return [] as T[];
};

const json = (value: any): string => {
  try { return JSON.stringify(value ?? null); } catch { return 'null'; }
};

const unjson = <T>(value: any, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    const parsed = JSON.parse(value);
    return parsed === null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
};

/* ------------------------------------------------------------------ */
/* Schema                                                              */
/* ------------------------------------------------------------------ */

const DDL = [
  `CREATE TABLE IF NOT EXISTS platform_connections (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     brand_id TEXT NOT NULL,
     platform TEXT NOT NULL,
     external_id TEXT NOT NULL,
     name TEXT,
     username TEXT,
     access_token_enc TEXT NOT NULL,
     token_expires_at TEXT,
     scopes TEXT,
     metadata TEXT,
     status TEXT DEFAULT 'connected',
     last_verified_at TEXT,
     last_error TEXT,
     created_at TEXT,
     updated_at TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_conn_brand_platform
     ON platform_connections (brand_id, platform)`,

  `CREATE TABLE IF NOT EXISTS meta_campaigns (
     id TEXT PRIMARY KEY,
     brand_id TEXT NOT NULL,
     connection_id TEXT,
     name TEXT,
     objective TEXT,
     status TEXT,
     effective_status TEXT,
     buying_type TEXT,
     special_ad_categories TEXT,
     daily_budget TEXT,
     lifetime_budget TEXT,
     adset_id TEXT,
     ad_id TEXT,
     creative_id TEXT,
     config TEXT,
     start_date TEXT,
     end_date TEXT,
     created_at TEXT,
     synced_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_campaign_brand ON meta_campaigns (brand_id)`,

  `CREATE TABLE IF NOT EXISTS meta_insights (
     id TEXT PRIMARY KEY,
     object_id TEXT NOT NULL,
     level TEXT NOT NULL,
     date_start TEXT,
     date_stop TEXT,
     impressions TEXT,
     clicks TEXT,
     spend TEXT,
     reach TEXT,
     conversions TEXT,
     ctr TEXT,
     cpc TEXT,
     cpa TEXT,
     roas TEXT,
     raw TEXT,
     fetched_at TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_insight_object
     ON meta_insights (object_id, level, date_start, date_stop)`,

  `CREATE TABLE IF NOT EXISTS instagram_publications (
     id TEXT PRIMARY KEY,
     brand_id TEXT NOT NULL,
     connection_id TEXT,
     container_id TEXT,
     media_id TEXT,
     media_type TEXT,
     media_url TEXT,
     caption TEXT,
     first_comment TEXT,
     permalink TEXT,
     status TEXT,
     error TEXT,
     scheduled_for TEXT,
     created_at TEXT,
     published_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_igpub_brand ON instagram_publications (brand_id)`,

  `CREATE TABLE IF NOT EXISTS instagram_dm_rules (
     id TEXT PRIMARY KEY,
     brand_id TEXT NOT NULL,
     keyword TEXT NOT NULL,
     reply_message TEXT NOT NULL,
     capture_email TEXT DEFAULT '0',
     status TEXT DEFAULT 'ACTIVE',
     triggered_count TEXT DEFAULT '0',
     leads_captured TEXT DEFAULT '0',
     created_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_igdm_brand ON instagram_dm_rules (brand_id)`,

  `CREATE TABLE IF NOT EXISTS whatsapp_templates (
     id TEXT PRIMARY KEY,
     brand_id TEXT NOT NULL,
     connection_id TEXT,
     name TEXT,
     language TEXT,
     category TEXT,
     status TEXT,
     components TEXT,
     quality_score TEXT,
     rejected_reason TEXT,
     synced_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_watmpl_brand ON whatsapp_templates (brand_id)`,

  `CREATE TABLE IF NOT EXISTS whatsapp_broadcasts (
     id TEXT PRIMARY KEY,
     brand_id TEXT NOT NULL,
     connection_id TEXT,
     name TEXT,
     template_name TEXT,
     language TEXT,
     status TEXT,
     audience TEXT,
     recipients_count TEXT DEFAULT '0',
     sent_count TEXT DEFAULT '0',
     delivered_count TEXT DEFAULT '0',
     read_count TEXT DEFAULT '0',
     failed_count TEXT DEFAULT '0',
     clicked_count TEXT DEFAULT '0',
     created_at TEXT,
     completed_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_wabc_brand ON whatsapp_broadcasts (brand_id)`,

  `CREATE TABLE IF NOT EXISTS whatsapp_messages (
     id TEXT PRIMARY KEY,
     broadcast_id TEXT,
     brand_id TEXT NOT NULL,
     wamid TEXT,
     to_number TEXT,
     status TEXT,
     error TEXT,
     sent_at TEXT,
     delivered_at TEXT,
     read_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_wamsg_wamid ON whatsapp_messages (wamid)`,
  `CREATE INDEX IF NOT EXISTS idx_wamsg_broadcast ON whatsapp_messages (broadcast_id)`,

  `CREATE TABLE IF NOT EXISTS crm_leads (
     id TEXT PRIMARY KEY,
     brand_id TEXT NOT NULL,
     source TEXT,
     external_id TEXT,
     name TEXT,
     email TEXT,
     phone TEXT,
     company TEXT,
     campaign_id TEXT,
     campaign_name TEXT,
     adset_name TEXT,
     status TEXT DEFAULT 'NEW',
     cost_per_lead TEXT,
     notes TEXT,
     raw TEXT,
     created_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_lead_brand ON crm_leads (brand_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_external ON crm_leads (external_id)`,

  `CREATE TABLE IF NOT EXISTS webhook_events (
     id TEXT PRIMARY KEY,
     platform TEXT,
     object_type TEXT,
     signature_valid TEXT,
     payload TEXT,
     processed TEXT DEFAULT '0',
     error TEXT,
     received_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_wh_received ON webhook_events (received_at)`,

  `CREATE TABLE IF NOT EXISTS mcp_api_keys (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     key_hash TEXT NOT NULL,
     key_prefix TEXT,
     label TEXT,
     last_used_at TEXT,
     revoked TEXT DEFAULT '0',
     created_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mcpkey_hash ON mcp_api_keys (key_hash)`,

  `CREATE TABLE IF NOT EXISTS media_assets (
     id TEXT PRIMARY KEY,
     brand_id TEXT,
     user_id TEXT,
     title TEXT,
     url TEXT,
     type TEXT,
     source TEXT,
     mime_type TEXT,
     created_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_media_brand ON media_assets (brand_id)`,

  `CREATE TABLE IF NOT EXISTS mcp_tool_calls (
     id TEXT PRIMARY KEY,
     user_id TEXT,
     brand_id TEXT,
     tool_name TEXT,
     arguments TEXT,
     status TEXT,
     result TEXT,
     error TEXT,
     duration_ms TEXT,
     created_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mcpcall_created ON mcp_tool_calls (created_at)`,

  `CREATE TABLE IF NOT EXISTS agents (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     brand_id TEXT,
     agent_key TEXT NOT NULL,
     name TEXT,
     role TEXT,
     description TEXT,
     icon TEXT,
     provider TEXT,
     model TEXT,
     temperature TEXT,
     system_prompt TEXT,
     user_prompt_template TEXT,
     output_schema TEXT,
     capabilities TEXT,
     inputs TEXT,
     pipeline_stage TEXT,
     sort_order TEXT,
     status TEXT DEFAULT 'published',
     version TEXT DEFAULT '1',
     published_version TEXT,
     is_builtin TEXT DEFAULT '0',
     archived TEXT DEFAULT '0',
     created_at TEXT,
     updated_at TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_scope ON agents (user_id, agent_key)`,

  `CREATE TABLE IF NOT EXISTS agent_versions (
     id TEXT PRIMARY KEY,
     agent_id TEXT NOT NULL,
     version TEXT NOT NULL,
     snapshot TEXT,
     notes TEXT,
     published_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_agentver_agent ON agent_versions (agent_id)`,

  `CREATE TABLE IF NOT EXISTS agent_runs (
     id TEXT PRIMARY KEY,
     agent_id TEXT,
     agent_key TEXT,
     brand_id TEXT,
     version TEXT,
     status TEXT,
     inputs TEXT,
     error TEXT,
     duration_ms TEXT,
     created_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_agentrun_created ON agent_runs (created_at)`,

  `CREATE TABLE IF NOT EXISTS poster_templates (
     id TEXT PRIMARY KEY,
     user_id TEXT,
     template_key TEXT NOT NULL,
     name TEXT,
     category TEXT,
     brief TEXT,
     ratio TEXT,
     layout TEXT,
     slots TEXT,
     constraints TEXT,
     art_direction TEXT,
     suited_to TEXT,
     is_builtin TEXT DEFAULT '0',
     archived TEXT DEFAULT '0',
     created_at TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_poster_key ON poster_templates (user_id, template_key)`,

  `CREATE TABLE IF NOT EXISTS poster_batches (
     id TEXT PRIMARY KEY,
     brand_id TEXT NOT NULL,
     user_id TEXT,
     name TEXT,
     templates TEXT,
     requested TEXT,
     generated TEXT,
     failed TEXT,
     status TEXT,
     source TEXT,
     error TEXT,
     created_at TEXT,
     completed_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_posterbatch_brand ON poster_batches (brand_id)`,

  `CREATE TABLE IF NOT EXISTS posters (
     id TEXT PRIMARY KEY,
     batch_id TEXT,
     brand_id TEXT NOT NULL,
     template_key TEXT,
     headline TEXT,
     subhead TEXT,
     body TEXT,
     call_to_action TEXT,
     caption TEXT,
     hashtags TEXT,
     image_prompt TEXT,
     image_url TEXT,
     content_pillar TEXT,
     product_ref TEXT,
     status TEXT DEFAULT 'draft',
     created_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_poster_brand ON posters (brand_id)`,
  `CREATE INDEX IF NOT EXISTS idx_poster_batch ON posters (batch_id)`,

  `CREATE TABLE IF NOT EXISTS content_connections (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     brand_id TEXT NOT NULL,
     kind TEXT NOT NULL,
     site_url TEXT,
     identifier TEXT,
     secret_enc TEXT,
     metadata TEXT,
     status TEXT DEFAULT 'connected',
     last_verified_at TEXT,
     last_error TEXT,
     created_at TEXT,
     updated_at TEXT
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_contentconn_scope ON content_connections (brand_id, kind)`,

  `CREATE TABLE IF NOT EXISTS blog_articles (
     id TEXT PRIMARY KEY,
     brand_id TEXT NOT NULL,
     connection_id TEXT,
     title TEXT,
     slug TEXT,
     excerpt TEXT,
     meta_description TEXT,
     body_html TEXT,
     tags TEXT,
     categories TEXT,
     featured_image_prompt TEXT,
     remote_id TEXT,
     remote_url TEXT,
     status TEXT DEFAULT 'draft',
     error TEXT,
     created_at TEXT,
     published_at TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_blog_brand ON blog_articles (brand_id)`,

  `CREATE TABLE IF NOT EXISTS oauth_states (
     state TEXT PRIMARY KEY,
     user_id TEXT,
     brand_id TEXT,
     platform TEXT,
     code_verifier TEXT,
     created_at TEXT
   )`
];

/**
 * Brings existing tables up to date with the DDL above.
 *
 * CREATE TABLE IF NOT EXISTS silently does nothing when a table already
 * exists, so a column added in a later release never reaches an install that
 * has been running since before it. This reads the DDL as the source of truth
 * and adds whatever is missing. Columns are only ever added, never dropped or
 * retyped — a destructive migration should be a deliberate, reviewed change,
 * not something that happens on boot.
 */
const migrateColumns = async (): Promise<void> => {
  const createStatements = DDL.filter(stmt => /CREATE TABLE/i.test(stmt));

  for (const stmt of createStatements) {
    const tableMatch = stmt.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*)\)\s*$/i);
    if (!tableMatch) continue;
    const [, table, columnBlock] = tableMatch;

    const wanted = columnBlock
      .split(',')
      .map(line => line.trim())
      .filter(line => line && !/^(PRIMARY|FOREIGN|UNIQUE|CHECK)\b/i.test(line))
      .map(line => {
        const [name, ...rest] = line.split(/\s+/);
        return { name, definition: rest.join(' ') || 'TEXT' };
      })
      .filter(c => /^\w+$/.test(c.name));

    let existing: Set<string>;
    try {
      if (dbMode === 'postgres' && pgPool) {
        const rows = await q<any>(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1`, [table]
        );
        existing = new Set(rows.map(r => r.column_name));
      } else {
        const rows = await q<any>(`PRAGMA table_info(${table})`);
        existing = new Set(rows.map(r => r.name));
      }
    } catch {
      continue; // Table does not exist yet; the CREATE above will handle it.
    }
    if (!existing.size) continue;

    for (const column of wanted) {
      if (existing.has(column.name)) continue;
      try {
        await q(`ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.definition}`);
        console.log(`   migrated: ${table}.${column.name}`);
      } catch (err) {
        console.error(`   migration failed for ${table}.${column.name}:`, (err as Error).message);
      }
    }
  }
};

let readyPromise: Promise<void> | null = null;

export const ensureStoreReady = async (): Promise<void> => {
  if (!readyPromise) {
    readyPromise = (async () => {
      await initDatabase();
      for (const stmt of DDL) {
        try {
          await q(stmt);
        } catch (err) {
          console.error('Integration schema statement failed:', (err as Error).message);
        }
      }
      await migrateColumns();
      console.log('🔌 Live integration schema ready.');
    })();
  }
  return readyPromise;
};

/* ------------------------------------------------------------------ */
/* Platform connections                                                */
/* ------------------------------------------------------------------ */

const rowToConnection = (row: any): PlatformConnection => ({
  id: row.id,
  userId: row.user_id,
  brandId: row.brand_id,
  platform: row.platform,
  externalId: row.external_id,
  name: row.name || '',
  username: row.username || undefined,
  accessToken: row.access_token_enc ? decryptSecret(row.access_token_enc) : '',
  tokenExpiresAt: row.token_expires_at || null,
  scopes: unjson<string[]>(row.scopes, []),
  metadata: unjson<Record<string, any>>(row.metadata, {}),
  status: (row.status || 'connected') as ConnectionStatus,
  lastVerifiedAt: row.last_verified_at || null,
  lastError: row.last_error || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const toPublicConnection = (conn: PlatformConnection): PublicConnection => {
  const { accessToken, ...rest } = conn;
  return { ...rest, tokenPreview: maskSecret(accessToken), hasToken: Boolean(accessToken) };
};

/**
 * Looks up the existing row WITHOUT decrypting it.
 *
 * upsertConnection must not depend on the stored token being readable: after a
 * vault-key rotation the old ciphertext is garbage, and reconnecting is exactly
 * how a user recovers. Decrypting here would make that recovery impossible.
 */
const getConnectionRowRaw = async (brandId: string, platform: Platform): Promise<any | null> => {
  const rows = await q(
    `SELECT * FROM platform_connections WHERE brand_id = $1 AND platform = $2 LIMIT 1`,
    [brandId, platform]
  );
  return rows[0] || null;
};

export const upsertConnection = async (input: {
  userId: string;
  brandId: string;
  platform: Platform;
  externalId: string;
  name?: string;
  username?: string;
  accessToken: string;
  tokenExpiresAt?: string | null;
  scopes?: string[];
  metadata?: Record<string, any>;
}): Promise<PlatformConnection> => {
  await ensureStoreReady();
  const existing = await getConnectionRowRaw(input.brandId, input.platform);
  const ts = nowISO();
  const id = existing?.id || randomId('conn');
  const existingMetadata = existing ? unjson<Record<string, any>>(existing.metadata, {}) : {};

  if (existing) {
    await q(
      `UPDATE platform_connections
          SET external_id = $1, name = $2, username = $3, access_token_enc = $4,
              token_expires_at = $5, scopes = $6, metadata = $7,
              status = 'connected', last_verified_at = $8, last_error = NULL, updated_at = $9
        WHERE id = $10`,
      [
        input.externalId,
        input.name || existing.name,
        input.username || existing.username || null,
        encryptSecret(input.accessToken),
        input.tokenExpiresAt || null,
        json(input.scopes || unjson<string[]>(existing.scopes, [])),
        json({ ...existingMetadata, ...(input.metadata || {}) }),
        ts, ts, id
      ]
    );
  } else {
    await q(
      `INSERT INTO platform_connections
         (id, user_id, brand_id, platform, external_id, name, username, access_token_enc,
          token_expires_at, scopes, metadata, status, last_verified_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'connected',$12,$13,$14)`,
      [
        id, input.userId, input.brandId, input.platform, input.externalId,
        input.name || '', input.username || null, encryptSecret(input.accessToken),
        input.tokenExpiresAt || null, json(input.scopes || []), json(input.metadata || {}),
        ts, ts, ts
      ]
    );
  }

  const saved = await getConnection(input.brandId, input.platform);
  if (!saved) throw new Error('Connection failed to persist.');
  return saved;
};

export const getConnection = async (
  brandId: string,
  platform: Platform
): Promise<PlatformConnection | null> => {
  await ensureStoreReady();
  const rows = await q(
    `SELECT * FROM platform_connections WHERE brand_id = $1 AND platform = $2 LIMIT 1`,
    [brandId, platform]
  );
  if (!rows.length) return null;
  try {
    return rowToConnection(rows[0]);
  } catch (err) {
    // A decryption failure means the vault key rotated — surface it rather than
    // silently behaving as if the brand were disconnected.
    throw new Error(
      `Stored ${platform} token for this brand could not be decrypted (${(err as Error).message}). Reconnect the account.`
    );
  }
};

export const listConnections = async (brandId: string): Promise<PlatformConnection[]> => {
  await ensureStoreReady();
  const rows = await q(`SELECT * FROM platform_connections WHERE brand_id = $1`, [brandId]);
  return rows.flatMap(r => {
    try { return [rowToConnection(r)]; } catch { return []; }
  });
};

export const markConnectionError = async (id: string, message: string, status: ConnectionStatus = 'error') => {
  await q(
    `UPDATE platform_connections SET status = $1, last_error = $2, updated_at = $3 WHERE id = $4`,
    [status, message.slice(0, 500), nowISO(), id]
  );
};

export const markConnectionVerified = async (id: string) => {
  const ts = nowISO();
  await q(
    `UPDATE platform_connections
        SET status = 'connected', last_error = NULL, last_verified_at = $1, updated_at = $2
      WHERE id = $3`,
    [ts, ts, id]
  );
};

export const deleteConnection = async (brandId: string, platform: Platform) => {
  await ensureStoreReady();
  await q(`DELETE FROM platform_connections WHERE brand_id = $1 AND platform = $2`, [brandId, platform]);
};

/* ------------------------------------------------------------------ */
/* Generic row helpers used by the route modules                       */
/* ------------------------------------------------------------------ */

export const saveRow = async (table: string, row: Record<string, any>) => {
  await ensureStoreReady();
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const values = cols.map(c => {
    const v = row[c];
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') return json(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    return String(v);
  });
  const updates = cols.filter(c => c !== 'id').map(c => `${c} = EXCLUDED.${c}`).join(', ');

  await q(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${updates || 'id = EXCLUDED.id'}`,
    values
  );
};

export const selectRows = async <T = any>(
  table: string,
  where: string,
  params: any[] = [],
  orderBy = ''
): Promise<T[]> => {
  await ensureStoreReady();
  const clause = where ? `WHERE ${where}` : '';
  return q<T>(`SELECT * FROM ${table} ${clause} ${orderBy}`, params);
};

export const num = (value: any, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const parseJson = unjson;
export const stringifyJson = json;
export const timestamp = nowISO;

/* ------------------------------------------------------------------ */
/* MCP API keys                                                        */
/* ------------------------------------------------------------------ */

export const issueMcpKey = async (userId: string, label = 'Claude Desktop'): Promise<string> => {
  await ensureStoreReady();
  const raw = `wot_mcp_${Buffer.from(randomId('k')).toString('base64url').slice(0, 40)}`;
  await q(
    `INSERT INTO mcp_api_keys (id, user_id, key_hash, key_prefix, label, revoked, created_at)
     VALUES ($1,$2,$3,$4,$5,'0',$6)`,
    [randomId('mcpk'), userId, sha256(raw), raw.slice(0, 14), label, nowISO()]
  );
  return raw;
};

export const verifyMcpKey = async (raw: string): Promise<{ userId: string } | null> => {
  if (!raw) return null;
  await ensureStoreReady();
  const rows = await q(
    `SELECT * FROM mcp_api_keys WHERE key_hash = $1 AND revoked = '0' LIMIT 1`,
    [sha256(raw.trim())]
  );
  if (!rows.length) return null;
  await q(`UPDATE mcp_api_keys SET last_used_at = $1 WHERE id = $2`, [nowISO(), rows[0].id]);
  return { userId: rows[0].user_id };
};

export const revokeAllMcpKeys = async (userId: string) => {
  await ensureStoreReady();
  await q(`UPDATE mcp_api_keys SET revoked = '1' WHERE user_id = $1`, [userId]);
};

export const listMcpKeys = async (userId: string) => {
  await ensureStoreReady();
  return q(
    `SELECT id, key_prefix, label, last_used_at, revoked, created_at
       FROM mcp_api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
};

/* ------------------------------------------------------------------ */
/* Webhook audit trail                                                 */
/* ------------------------------------------------------------------ */

export const recordWebhookEvent = async (input: {
  platform: string;
  objectType: string;
  signatureValid: boolean;
  payload: any;
}): Promise<string> => {
  await ensureStoreReady();
  const id = randomId('wh');
  await q(
    `INSERT INTO webhook_events (id, platform, object_type, signature_valid, payload, processed, received_at)
     VALUES ($1,$2,$3,$4,$5,'0',$6)`,
    [id, input.platform, input.objectType, input.signatureValid ? '1' : '0', json(input.payload), nowISO()]
  );
  return id;
};

export const markWebhookProcessed = async (id: string, error?: string) => {
  await q(
    `UPDATE webhook_events SET processed = '1', error = $1 WHERE id = $2`,
    [error ? error.slice(0, 500) : null, id]
  );
};
