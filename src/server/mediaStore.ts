/**
 * Object storage for generated and uploaded media.
 *
 * Every platform this app publishes to — Instagram, the Meta Marketing API,
 * WhatsApp — fetches media by URL from their own servers. Generated media was
 * a base64 data URL living in the browser's IndexedDB, which none of them can
 * reach, so nothing that was generated could actually be published. This gives
 * every asset a real, fetchable URL.
 *
 * Two drivers behind one interface:
 *   • s3    — any S3-compatible bucket (AWS, Cloudflare R2, MinIO). Production.
 *   • local — writes to disk and serves from the app. Fine for development,
 *             but only reachable by the platforms if the app itself is, so a
 *             tunnel is needed to publish from a laptop.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

export type StorageDriver = 's3' | 'local';

/** Only formats the platforms actually accept. */
const ALLOWED: Record<string, { ext: string; kind: 'image' | 'video' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/quicktime': { ext: 'mov', kind: 'video' }
};

/**
 * Instagram caps images at 8MB and Reels at 1GB; Meta ad images at 30MB. This
 * is a blanket ceiling to stop a runaway upload, not a per-platform rule —
 * those are enforced by the platform at publish time with a clearer message.
 */
const MAX_BYTES = Number(process.env.MEDIA_MAX_BYTES || 100 * 1024 * 1024);

const LOCAL_DIR = path.resolve(process.cwd(), process.env.MEDIA_LOCAL_DIR || '.media');

export const storageDriver = (): StorageDriver =>
  process.env.S3_BUCKET ? 's3' : 'local';

/**
 * The base the stored path is appended to. For S3 this is the CDN or bucket
 * origin; for local it is the app's own public URL.
 */
const publicBase = (): string => {
  if (storageDriver() === 's3') {
    const explicit = process.env.S3_PUBLIC_BASE_URL;
    if (explicit) return explicit.replace(/\/$/, '');
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || 'us-east-1';
    return `https://${bucket}.s3.${region}.amazonaws.com`;
  }
  return (process.env.APP_URL || 'http://localhost:3050').replace(/\/$/, '');
};

let s3Client: S3Client | null = null;
const getS3 = (): S3Client => {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      // R2 and MinIO need an explicit endpoint; AWS does not.
      ...(process.env.S3_ENDPOINT
        ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
        : {}),
      ...(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
            }
          }
        : {})
    });
  }
  return s3Client;
};

export interface StoredMedia {
  key: string;
  url: string;
  contentType: string;
  kind: 'image' | 'video';
  bytes: number;
  checksum: string;
}

export class MediaError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'MediaError';
    this.status = status;
  }
}

/** Splits a `data:` URL into its content type and bytes. */
export const decodeDataUrl = (dataUrl: string): { contentType: string; buffer: Buffer } => {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new MediaError(400, 'That is not a valid data URL.');

  const [, contentType, isBase64, payload] = match;
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  return { contentType: contentType.toLowerCase(), buffer };
};

const assertAcceptable = (contentType: string, bytes: number) => {
  const spec = ALLOWED[contentType];
  if (!spec) {
    throw new MediaError(
      415,
      `${contentType} is not a format the social platforms accept. Use JPEG, PNG, WebP, GIF or MP4.`
    );
  }
  if (bytes > MAX_BYTES) {
    throw new MediaError(
      413,
      `That file is ${(bytes / 1024 / 1024).toFixed(1)}MB, over the ${Math.round(MAX_BYTES / 1024 / 1024)}MB limit.`
    );
  }
  return spec;
};

/**
 * Stores bytes and returns a URL the platforms can fetch.
 *
 * The key embeds the brand so one tenant's media cannot be guessed from
 * another's, and a content hash so the same asset uploaded twice does not
 * occupy two objects.
 */
export const putMedia = async (params: {
  buffer: Buffer;
  contentType: string;
  brandId: string;
  filename?: string;
}): Promise<StoredMedia> => {
  const { buffer, contentType, brandId } = params;
  const spec = assertAcceptable(contentType, buffer.length);

  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const safeBrand = String(brandId || 'shared').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'shared';
  const key = `media/${safeBrand}/${checksum.slice(0, 32)}.${spec.ext}`;

  if (storageDriver() === 's3') {
    await getS3().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Platforms fetch anonymously; without this they get a 403.
      ...(process.env.S3_PUBLIC_ACL === 'false' ? {} : { ACL: 'public-read' }),
      CacheControl: 'public, max-age=31536000, immutable'
    }));
  } else {
    const destination = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, buffer);
  }

  return {
    key,
    url: `${publicBase()}/${key}`,
    contentType,
    kind: spec.kind,
    bytes: buffer.length,
    checksum
  };
};

export const deleteMedia = async (key: string): Promise<void> => {
  if (!key.startsWith('media/')) throw new MediaError(400, 'Refusing to delete outside the media prefix.');

  if (storageDriver() === 's3') {
    await getS3().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  } else {
    await fs.unlink(path.join(LOCAL_DIR, key)).catch(() => undefined);
  }
};

/** Where the local driver writes, so the server can serve it. */
export const localMediaRoot = (): string => LOCAL_DIR;

/**
 * Whether a stored URL is actually reachable by Meta's servers.
 *
 * The local driver behind localhost is the common development case, and
 * publishing will fail with a confusing platform-side error — better to say so
 * before the call is made.
 */
export const publicReachability = (): { reachable: boolean; reason?: string } => {
  const base = publicBase();
  if (storageDriver() === 's3') return { reachable: true };

  if (/localhost|127\.0\.0\.1|\[::1\]/i.test(base)) {
    return {
      reachable: false,
      reason:
        'Media is stored on this machine and served from ' + base + ', which the social platforms cannot reach. ' +
        'Set S3_BUCKET to publish for real. A tunnel with APP_URL pointed at it also works for testing, ' +
        'but exposes this app to the internet — only do that from a development machine.'
    };
  }
  return { reachable: true };
};

/** Confirms the configured bucket exists and is writable, for the health check. */
export const checkStorage = async (): Promise<{ ok: boolean; driver: StorageDriver; detail: string }> => {
  const driver = storageDriver();
  try {
    if (driver === 's3') {
      await getS3().send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
      return { ok: true, driver, detail: `Bucket ${process.env.S3_BUCKET} reachable.` };
    }
    await fs.mkdir(LOCAL_DIR, { recursive: true });
    const reach = publicReachability();
    return {
      ok: true,
      driver,
      detail: reach.reachable ? `Writing to ${LOCAL_DIR}.` : reach.reason!
    };
  } catch (err) {
    return { ok: false, driver, detail: (err as Error).message };
  }
};

export const mediaLimits = { maxBytes: MAX_BYTES, allowed: Object.keys(ALLOWED) };
