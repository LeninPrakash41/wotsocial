/**
 * Token encryption at rest (AES-256-GCM).
 *
 * Access tokens for Meta / Instagram / WhatsApp are long-lived credentials that
 * grant spend authority and messaging rights. They are never stored in plaintext
 * and never returned to the browser — only a masked preview is exposed.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_FILE = path.resolve(process.cwd(), '.wotsocial-encryption-key');

let cachedKey: Buffer | null = null;

const deriveKey = (secret: string): Buffer =>
  crypto.scryptSync(secret, 'wotsocial.token.vault.v1', 32);

/**
 * Resolution order:
 *  1. ENCRYPTION_KEY env var (required in production).
 *  2. A locally generated key file, so local dev works with zero config.
 */
export const getEncryptionKey = (): Buffer => {
  if (cachedKey) return cachedKey;

  const envSecret = process.env.ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY;
  if (envSecret && envSecret.trim().length >= 16) {
    cachedKey = deriveKey(envSecret.trim());
    return cachedKey;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ENCRYPTION_KEY is required in production. Generate one with: openssl rand -hex 32'
    );
  }

  try {
    if (fs.existsSync(KEY_FILE)) {
      cachedKey = deriveKey(fs.readFileSync(KEY_FILE, 'utf-8').trim());
      return cachedKey;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(KEY_FILE, generated, { mode: 0o600 });
    console.warn(
      '⚠️  No ENCRYPTION_KEY set. Generated a local dev key at .wotsocial-encryption-key ' +
      '(git-ignored). Set ENCRYPTION_KEY before deploying.'
    );
    cachedKey = deriveKey(generated);
    return cachedKey;
  } catch (err) {
    throw new Error(`Unable to establish an encryption key: ${(err as Error).message}`);
  }
};

/** Returns `v1:<iv>:<authTag>:<ciphertext>`, all base64url. */
export const encryptSecret = (plaintext: string): string => {
  if (!plaintext) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
};

export const decryptSecret = (payload: string): string => {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Malformed encrypted payload — the vault key may have changed.');
  }
  const key = getEncryptionKey();
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const data = Buffer.from(parts[3], 'base64url');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

/** Safe for logs and API responses: `EAAG…a1b2`. */
export const maskSecret = (secret: string): string => {
  if (!secret) return '';
  if (secret.length <= 12) return `${secret.slice(0, 2)}${'•'.repeat(6)}`;
  return `${secret.slice(0, 6)}${'•'.repeat(8)}${secret.slice(-4)}`;
};

export const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

/** Timing-safe comparison that tolerates unequal lengths. */
export const safeCompare = (a: string, b: string): boolean => {
  const ha = crypto.createHash('sha256').update(a || '').digest();
  const hb = crypto.createHash('sha256').update(b || '').digest();
  return crypto.timingSafeEqual(ha, hb);
};

export const randomId = (prefix: string): string =>
  `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
