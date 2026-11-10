import crypto from 'crypto';
import pg from 'pg';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

export type DBMode = 'postgres' | 'sqlite';

export let dbMode: DBMode = 'sqlite';
export let pgPool: pg.Pool | null = null;
export let sqliteDb: any = null;

// Initialize Database connection and auto-create tables
export const initDatabase = async () => {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (connectionString) {
    console.log("🐘 Connecting to PostgreSQL database...");
    dbMode = 'postgres';
    pgPool = new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    await initPostgresSchema();
  } else {
    console.log(`⚡ SQLite database: ${process.env.SQLITE_PATH || 'wotsocial.db'}`);
    dbMode = 'sqlite';
    // Configurable so tests can point at a throwaway file rather than the
    // developer's own database.
    sqliteDb = new Database(process.env.SQLITE_PATH || 'wotsocial.db');
    sqliteDb.pragma('journal_mode = WAL');
    initSqliteSchema();
  }

  await migrateUsersTable();
  await seedDefaultAdmin();
};

// PostgreSQL Schema Initializer
const initPostgresSchema = async () => {
  if (!pgPool) return;

  const client = await pgPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(32) DEFAULT 'user',
        must_change_password VARCHAR(1) DEFAULT '0',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS brands (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        website_url TEXT,
        social_urls TEXT,
        guidelines_text TEXT,
        brand_tone VARCHAR(255),
        brand_personality VARCHAR(255),
        logo_url TEXT,
        industry VARCHAR(255),
        category VARCHAR(255),
        primary_color VARCHAR(32),
        secondary_color VARCHAR(32),
        accent_color VARCHAR(32),
        brand_colors JSONB,
        automation_settings JSONB,
        agent_research_data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS posts (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        brand_id VARCHAR(64) NOT NULL,
        content TEXT NOT NULL,
        media_url TEXT,
        media_type VARCHAR(32) DEFAULT 'none',
        scheduled_time TIMESTAMP WITH TIME ZONE,
        status VARCHAR(32) DEFAULT 'suggested',
        platforms JSONB,
        visual_prompt TEXT,
        is_agent_generated BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS integrations (
        user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        gemini_api_key TEXT,
        claude_api_key TEXT,
        openart_api_key TEXT,
        seedance_api_key TEXT,
        twitter_api_key TEXT,
        twitter_api_secret TEXT,
        linkedin_access_token TEXT,
        facebook_access_token TEXT,
        instagram_access_token TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } finally {
    client.release();
  }
};

// SQLite Schema Initializer
const initSqliteSchema = () => {
  if (!sqliteDb) return;

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      must_change_password TEXT DEFAULT '0',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      website_url TEXT,
      social_urls TEXT,
      guidelines_text TEXT,
      brand_tone TEXT,
      brand_personality TEXT,
      logo_url TEXT,
      industry TEXT,
      category TEXT,
      primary_color TEXT,
      secondary_color TEXT,
      accent_color TEXT,
      brand_colors TEXT,
      automation_settings TEXT,
      agent_research_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      brand_id TEXT NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT,
      media_type TEXT DEFAULT 'none',
      scheduled_time DATETIME,
      status TEXT DEFAULT 'suggested',
      platforms TEXT,
      visual_prompt TEXT,
      is_agent_generated INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS integrations (
      user_id TEXT PRIMARY KEY,
      gemini_api_key TEXT,
      claude_api_key TEXT,
      openart_api_key TEXT,
      seedance_api_key TEXT,
      twitter_api_key TEXT,
      twitter_api_secret TEXT,
      linkedin_access_token TEXT,
      facebook_access_token TEXT,
      instagram_access_token TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

// Creates the first administrator account on an empty database.
/**
 * Creates the first administrator, once.
 *
 * This used to seed a fixed password that was also printed on the sign-in
 * screen, so every deployment shipped with a publicly known administrator
 * credential. The password is now either supplied through the environment or
 * generated, shown once in the server log, and flagged for mandatory change at
 * first sign-in.
 */
const seedDefaultAdmin = async () => {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@wotsocial.com').toLowerCase();
  const adminId = 'admin-user-001';
  const adminName = process.env.ADMIN_NAME || 'WotSocial Admin';

  const existing = dbMode === 'postgres' && pgPool
    ? (await pgPool.query('SELECT id FROM users WHERE LOWER(email) = $1', [adminEmail])).rows
    : sqliteDb
      ? [sqliteDb.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(adminEmail)].filter(Boolean)
      : [];

  if (existing.length) return;

  const supplied = (process.env.ADMIN_PASSWORD || '').trim();
  const password = supplied || crypto.randomBytes(18).toString('base64url');
  // A supplied password is the operator's own choice; a generated one must be
  // replaced by the person who first signs in with it.
  const mustChange = supplied ? '0' : '1';
  const passwordHash = await bcrypt.hash(password, 12);

  if (dbMode === 'postgres' && pgPool) {
    await pgPool.query(
      `INSERT INTO users (id, email, password_hash, name, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [adminId, adminEmail, passwordHash, adminName, 'admin', mustChange]
    );
  } else if (sqliteDb) {
    sqliteDb.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(adminId, adminEmail, passwordHash, adminName, 'admin', mustChange);
  }

  if (supplied) {
    console.log(`✅ Administrator created: ${adminEmail} (password taken from ADMIN_PASSWORD)`);
    return;
  }

  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │  Administrator account created                              │');
  console.log('  ├─────────────────────────────────────────────────────────────┤');
  console.log(`  │  Email:    ${adminEmail.padEnd(48)} │`);
  console.log(`  │  Password: ${password.padEnd(48)} │`);
  console.log('  │                                                             │');
  console.log('  │  Shown once. You must change it at first sign-in.           │');
  console.log('  │  Set ADMIN_PASSWORD to choose your own instead.             │');
  console.log('  └─────────────────────────────────────────────────────────────┘');
  console.log('');
};

/** Adds columns to a users table created before they existed. */
const migrateUsersTable = async () => {
  const additions = [{ name: 'must_change_password', sqlite: "TEXT DEFAULT '0'", postgres: "VARCHAR(1) DEFAULT '0'" }];

  for (const column of additions) {
    try {
      if (dbMode === 'postgres' && pgPool) {
        await pgPool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${column.name} ${column.postgres}`);
      } else if (sqliteDb) {
        const present = sqliteDb.prepare('PRAGMA table_info(users)').all().some((c: any) => c.name === column.name);
        if (!present) sqliteDb.exec(`ALTER TABLE users ADD COLUMN ${column.name} ${column.sqlite}`);
      }
    } catch (err) {
      console.error(`users.${column.name} migration failed:`, (err as Error).message);
    }
  }
};

// Query Execution Helper abstraction
export const queryDb = async (text: string, params: any[] = []): Promise<any[]> => {
  if (dbMode === 'postgres' && pgPool) {
    const res = await pgPool.query(text, params);
    return res.rows;
  } else if (sqliteDb) {
    // Convert Postgres $1, $2 params to ? for SQLite
    let i = 1;
    let sqliteQuery = text;
    while (sqliteQuery.includes(`$${i}`)) {
      sqliteQuery = sqliteQuery.replace(`$${i}`, '?');
      i++;
    }

    if (sqliteQuery.trim().toUpperCase().startsWith('SELECT')) {
      return sqliteDb.prepare(sqliteQuery).all(...params);
    } else {
      const result = sqliteDb.prepare(sqliteQuery).run(...params);
      return [result];
    }
  }
  return [];
};
