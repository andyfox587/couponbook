import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveBaseUrl, serverBaseUrl } from '../../../../server/src/utils/appUrl.js';

const ENV_KEYS = ['APP_PUBLIC_URL', 'APP_URL', 'VERCEL_URL', 'ALLOWED_APP_ORIGINS'];

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe('appUrl helper', () => {
  const savedEnv = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    clearEnv();
  });

  afterEach(() => {
    clearEnv();
    for (const key of ENV_KEYS) {
      if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
    }
  });

  describe('serverBaseUrl', () => {
    it('falls back to the hardcoded production default when nothing is set', () => {
      expect(serverBaseUrl()).toBe('https://couponbook.vercel.app');
    });

    it('prefers APP_PUBLIC_URL over APP_URL and VERCEL_URL', () => {
      process.env.APP_PUBLIC_URL = 'https://prod.example.com';
      process.env.APP_URL = 'https://other.example.com';
      process.env.VERCEL_URL = 'preview-abc.vercel.app';
      expect(serverBaseUrl()).toBe('https://prod.example.com');
    });

    it('falls back to APP_URL when APP_PUBLIC_URL is unset', () => {
      process.env.APP_URL = 'https://legacy.example.com';
      expect(serverBaseUrl()).toBe('https://legacy.example.com');
    });

    it('uses VERCEL_URL when no APP_*_URL is set, prepending https://', () => {
      process.env.VERCEL_URL = 'viva-spot-events-abc123.vercel.app';
      expect(serverBaseUrl()).toBe('https://viva-spot-events-abc123.vercel.app');
    });

    it('strips a trailing slash from APP_PUBLIC_URL', () => {
      process.env.APP_PUBLIC_URL = 'https://prod.example.com/';
      expect(serverBaseUrl()).toBe('https://prod.example.com');
    });

    it('ignores invalid (non-http) APP_PUBLIC_URL and falls through', () => {
      process.env.APP_PUBLIC_URL = 'ftp://nope.example.com';
      process.env.APP_URL = 'https://fallback.example.com';
      expect(serverBaseUrl()).toBe('https://fallback.example.com');
    });
  });

  describe('resolveBaseUrl', () => {
    it('returns the request Origin when it matches the allowlist', () => {
      process.env.ALLOWED_APP_ORIGINS = 'https://couponbook.vercel.app,https://*.vercel.app,http://localhost:8080';
      const req = { headers: { origin: 'https://viva-spot-events-abc123.vercel.app' } };
      expect(resolveBaseUrl(req)).toBe('https://viva-spot-events-abc123.vercel.app');
    });

    it('matches exact-string allowlist entries', () => {
      process.env.ALLOWED_APP_ORIGINS = 'https://couponbook.vercel.app';
      const req = { headers: { origin: 'https://couponbook.vercel.app' } };
      expect(resolveBaseUrl(req)).toBe('https://couponbook.vercel.app');
    });

    it('falls through to env when Origin is not on the allowlist', () => {
      process.env.ALLOWED_APP_ORIGINS = 'https://couponbook.vercel.app';
      process.env.APP_PUBLIC_URL = 'https://prod.example.com';
      const req = { headers: { origin: 'https://evil.example.com' } };
      expect(resolveBaseUrl(req)).toBe('https://prod.example.com');
    });

    it('does not let a wildcard match leak across dots (no subdomain takeover)', () => {
      process.env.ALLOWED_APP_ORIGINS = 'https://*.vercel.app';
      process.env.APP_PUBLIC_URL = 'https://prod.example.com';
      const req = { headers: { origin: 'https://evil.vercel.app.attacker.com' } };
      expect(resolveBaseUrl(req)).toBe('https://prod.example.com');
    });

    it('falls through to env when no Origin header is present', () => {
      process.env.APP_PUBLIC_URL = 'https://prod.example.com';
      expect(resolveBaseUrl({ headers: {} })).toBe('https://prod.example.com');
      expect(resolveBaseUrl(undefined)).toBe('https://prod.example.com');
    });

    it('still works when allowlist env var is unset (no Origin is allowed)', () => {
      process.env.APP_PUBLIC_URL = 'https://prod.example.com';
      const req = { headers: { origin: 'https://couponbook.vercel.app' } };
      expect(resolveBaseUrl(req)).toBe('https://prod.example.com');
    });

    it('uses VERCEL_URL fallback when Origin is missing and no APP_*_URL is set', () => {
      process.env.VERCEL_URL = 'preview-xyz.vercel.app';
      expect(resolveBaseUrl({ headers: {} })).toBe('https://preview-xyz.vercel.app');
    });
  });
});
