// server/src/db.js
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- helpers ---
function splitCertBlocks(pemText) {
  if (!pemText) return [];
  const txt = pemText.replace(/\r\n/g, '\n');
  const blocks = txt.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  return blocks.map(b => Buffer.from(b.trim() + '\n', 'utf8'));
}

function guessServername() {
  try {
    if (process.env.DATABASE_URL) {
      const u = new URL(process.env.DATABASE_URL.replace('postgres://', 'postgresql://'));
      return u.hostname;
    }
  } catch {}
  return process.env.DB_HOST || undefined;
}

// Strip SSL-related query params from a Postgres connection string so the
// `ssl` config object (resolved separately) is the single source of truth.
function sanitizeDatabaseUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl.replace('postgres://', 'postgresql://'));
    for (const k of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl']) {
      url.searchParams.delete(k);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function resolveSsl() {
  // 0) Local-dev escape hatch — explicitly disable SSL entirely. Use for
  //    plain Postgres on localhost where SSL isn't configured.
  if (process.env.PG_NO_SSL === '1') {
    console.log('🔓 PG_NO_SSL=1 → SSL disabled (local dev only)');
    return false;
  }

  // 1) Highest priority: inline PEM via env (PG_CA_CERT or PG_SSL_CA)
  for (const varName of ['PG_CA_CERT', 'PG_SSL_CA']) {
    const val = process.env[varName]?.trim();
    if (val) {
      console.log(`🔒 Using CA from ${varName} (raw bundle)`);
      return {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        servername: process.env.DB_HOST || undefined,
        ca: val,            // <-- use the PEM string directly
      };
    }
  }

  // Debug (safe)
  const urlForLog = (process.env.DATABASE_URL || '').replace('postgres://','postgresql://');
  let hostForLog = '';
  try { hostForLog = new URL(urlForLog).hostname; } catch {}
  console.log('SSL pre-debug:', {
    sni: process.env.DB_HOST || undefined,
    dbHost: hostForLog,
    node: process.version,
    openssl: process.versions.openssl,
  });

  // 2) Next: a file path in env (PG_CA_FILE)
  const pathVar = process.env.PG_CA_FILE?.trim();
  if (pathVar && fs.existsSync(pathVar)) {
    if (process.env.PG_CA_PAIR === '1') {
      const interPath = process.env.PG_CA_INTER || path.resolve(path.dirname(pathVar), 'part-02.pem');
      const rootPath  = process.env.PG_CA_ROOT  || path.resolve(path.dirname(pathVar), 'root-g1.pem');
      const ca = [fs.readFileSync(interPath), fs.readFileSync(rootPath)];
      console.log(`🔒 Using CA PAIR (Buffers):\n - ${interPath}\n - ${rootPath}`);
      return { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: process.env.DB_HOST || undefined, ca };
    }
    const caText = fs.readFileSync(pathVar, 'utf8');     // <-- RAW STRING, not split
    console.log(`🔒 Using CA file from PG_CA_FILE=${pathVar} (raw bundle)`);
    return {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      servername: process.env.DB_HOST || undefined,
      ca: caText,                                         // <-- pass the full bundle string
    };
  }

  // 3) Fall back to known repo paths (prefer raw string)
  const candidates = [
    path.resolve(process.cwd(), 'server/certs/us-east-1-bundle.pem'),
    path.resolve(process.cwd(), 'server/certs/rds-combined-ca-bundle.pem'),
    path.resolve(process.cwd(), 'server/certs/rds-min-clean.pem'),
    path.resolve(process.cwd(), 'server/certs/us-east-1-root-only.pem'),
    path.resolve(__dirname, './certs/us-east-1-bundle.pem'),
    path.resolve(__dirname, './certs/us-east-1-root-only.pem'),
  ];

  console.log('🔎 SSL CA candidates:\n - ' + candidates.join('\n - '));
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const caText = fs.readFileSync(p, 'utf8');
      if (/-----BEGIN CERTIFICATE-----/.test(caText)) {
        console.log(`✅ Using CA file: ${p} (raw bundle)`);
        return { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: process.env.DB_HOST || undefined, ca: caText };
      }
      console.warn(`⚠️  CA file had 0 cert blocks: ${p}`);
    }
  }

  // 4) Dev-only escape hatch
  if (process.env.PG_SSL_ALLOW_NO_CA === '1') {
    console.warn('⚠️  PG_SSL_ALLOW_NO_CA=1 → allowing SSL without CA (dev only)');
    return { rejectUnauthorized: false, minVersion: 'TLSv1.2', servername: process.env.DB_HOST || undefined };
  }

  console.warn('⚠️  No CA found. Proceeding without SSL (not recommended).');
  return undefined;
}


const ssl = resolveSsl();

// Prefer discrete envs when we explicitly provide a CA file or DB_HOST
const preferDiscrete = !!process.env.DB_HOST || !!process.env.PG_CA_FILE;
const haveUrl = !!process.env.DATABASE_URL;

let poolConfig;
if (preferDiscrete) {
  console.log('🔧 Using discrete DB envs (ignoring DATABASE_URL if present).');
  poolConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl, // <- your resolved raw-bundle SSL object
  };
} else if (haveUrl) {
  console.log('🔧 Using DATABASE_URL (sanitized of ssl params).');
  poolConfig = {
    connectionString: sanitizeDatabaseUrl(process.env.DATABASE_URL),
    ssl, // <- will be honored because we removed conflicting qs params
  };
} else {
  console.warn('⚠️ No DB envs detected.');
  poolConfig = { ssl };
}

// Short timeouts so lambdas fail fast
export const pool = new Pool({
  ...poolConfig,
  connectionTimeoutMillis: 2000,
  query_timeout: 5000,
});

// Optional: set server-side statement timeout per connection
pool.on('connect', (client) => {
  client.query('SET statement_timeout = 5000').catch(() => {});
});

export const db = drizzle(pool, { schema });

export async function connectDB() {
  const client = await pool.connect();
  client.release();
  console.log('🟢  Drizzle connected');
}
