#!/usr/bin/env node
/**
 * Apply drizzle/0019_multi_tier_prices.sql to the database pointed at by DATABASE_URL.
 *
 * Usage:
 *   node scripts/run-migration-0019.mjs
 *   node scripts/run-migration-0019.mjs --dry-run
 *   node scripts/run-migration-0019.mjs --no-verify-ssl
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { parse as parsePgUrl } from 'pg-connection-string';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Client } = pg;
const isDryRun = process.argv.includes('--dry-run');
const noVerifySsl = process.argv.includes('--no-verify-ssl');

function parseStatements(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const noComments = s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim();
      return noComments.length > 0;
    });
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const url = dbUrl.replace(/^postgres:\/\//, 'postgresql://');
  const sql = fs.readFileSync(path.join(__dirname, '..', 'drizzle/0019_multi_tier_prices.sql'), 'utf8');
  const statements = parseStatements(sql);

  console.log(`Migration 0019 (${statements.length} statements) — ${isDryRun ? 'DRY RUN' : 'LIVE'}`);

  if (isDryRun) {
    statements.forEach((s, i) => console.log(`-- ${i + 1}\n${s};\n`));
    return;
  }

  let clientConfig;
  if (noVerifySsl) {
    const p = parsePgUrl(url);
    clientConfig = {
      host: p.host,
      port: Number(p.port || 5432),
      user: p.user,
      password: p.password,
      database: (p.pathname || '/').replace(/^\//, '') || p.database,
      ssl: { rejectUnauthorized: false },
    };
  } else {
    clientConfig = {
      connectionString: url,
      ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
    };
  }

  const client = new Client(clientConfig);
  await client.connect();

  for (let i = 0; i < statements.length; i++) {
    try {
      await client.query(statements[i] + ';');
      console.log(`  ✓ ${i + 1}/${statements.length}`);
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      if (e.code === '42701' || msg.includes('already exists')) {
        console.log(`  ⏭ ${i + 1}/${statements.length} (already applied)`);
      } else {
        throw e;
      }
    }
  }

  await client.end();
  console.log('✅ Migration 0019 complete.');
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
