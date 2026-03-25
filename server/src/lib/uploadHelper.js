// server/src/lib/uploadHelper.js
// Shared file-upload utilities: multer, MIME validation, S3 client, upload function.
// Used by merchant logo and event image upload routes.

import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// ── Multer ────────────────────────────────────────────────────────
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ── Multer error handler ──────────────────────────────────────────
export function handleMulterError(err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum size is 5 MB.' });
  }
  if (err && err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Unexpected file field. Use "file" as the field name.' });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'File upload error' });
  }
  next();
}

// ── MIME helpers ──────────────────────────────────────────────────
export const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];

export function getExtensionFromMime(mime) {
  if (!mime) return 'bin';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'bin';
}

// ── S3 client ─────────────────────────────────────────────────────
const REGION = (process.env.AWS_REGION || 'us-east-1').trim();
const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

if (!accessKeyId || !secretAccessKey) {
  console.error('❌ uploadHelper: Missing AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY');
}

export const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId, secretAccessKey },
});

// ── Core upload function ──────────────────────────────────────────
/**
 * Upload a buffer to S3 and return the public URL.
 * @param {{ bucket: string, baseUrl: string, key: string, buffer: Buffer, mimetype: string }} opts
 * @returns {Promise<string>}
 */
export async function uploadFileToS3({ bucket, baseUrl, key, buffer, mimetype }) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
  }));
  return `${baseUrl}/${key}`;
}
