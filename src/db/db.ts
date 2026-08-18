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
    console.log("⚡ Zero-config local SQLite database mode (wotsocial.db)...");
    dbMode = 'sqlite';
    sqliteDb = new Database('wotsocial.db');
    sqliteDb.pragma('journal_mode = WAL');
    initSqliteSchema();
  }

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

// Seed Default Admin Account: admin@wotsocial.com / Admin@123456
const seedDefaultAdmin = async () => {
  const adminEmail = 'admin@wotsocial.com';
  const defaultPassword = 'Admin@123456';
  const adminId = 'admin-user-001';
  const adminName = 'WotSocial Admin';

  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  if (dbMode === 'postgres' && pgPool) {
    const res = await pgPool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (res.rows.length === 0) {
      await pgPool.query(
        'INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5)',
        [adminId, adminEmail, passwordHash, adminName, 'admin']
      );
      console.log(`✅ Default Admin Account Seeded into PostgreSQL: ${adminEmail}`);
    }
  } else if (sqliteDb) {
    const row = sqliteDb.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
    if (!row) {
      sqliteDb.prepare(
        'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
      ).run(adminId, adminEmail, passwordHash, adminName, 'admin');
      console.log(`✅ Default Admin Account Seeded into SQLite: ${adminEmail}`);
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
