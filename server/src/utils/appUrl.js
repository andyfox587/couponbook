const DEFAULT_BASE_URL = 'https://couponbook.vercel.app';

function stripTrailingSlash(value) {
  return typeof value === 'string' ? value.replace(/\/$/, '') : value;
}

function isValidHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function envBaseUrl() {
  const fromAppPublic = process.env.APP_PUBLIC_URL;
  if (isValidHttpUrl(fromAppPublic)) return stripTrailingSlash(fromAppPublic);

  const fromAppUrl = process.env.APP_URL;
  if (isValidHttpUrl(fromAppUrl)) return stripTrailingSlash(fromAppUrl);

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    const withScheme = vercelUrl.startsWith('http://') || vercelUrl.startsWith('https://')
      ? vercelUrl
      : `https://${vercelUrl}`;
    if (isValidHttpUrl(withScheme)) return stripTrailingSlash(withScheme);
  }

  return DEFAULT_BASE_URL;
}

function parseAllowlist() {
  const raw = process.env.ALLOWED_APP_ORIGINS;
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function patternToRegex(pattern) {
  // Escape regex special chars except '*', which becomes '[^.]*' (matches one
  // label segment, not across dots) so 'https://*.vercel.app' won't match
  // 'https://evil.vercel.app.attacker.com'.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]*');
  return new RegExp(`^${escaped}$`);
}

function originIsAllowed(origin, allowlist) {
  if (!isValidHttpUrl(origin)) return false;
  const normalized = stripTrailingSlash(origin);
  return allowlist.some((entry) => {
    if (!entry) return false;
    if (entry.includes('*')) {
      return patternToRegex(entry).test(normalized);
    }
    return stripTrailingSlash(entry) === normalized;
  });
}

/**
 * Resolve the base URL for an interactive request that needs to redirect the
 * browser back to whichever frontend originated the request (e.g. Stripe
 * checkout success/cancel URLs).
 *
 * Precedence:
 *   1. req.headers.origin (validated against ALLOWED_APP_ORIGINS)
 *   2. APP_PUBLIC_URL / APP_URL
 *   3. https://$VERCEL_URL (per-deployment URL Vercel injects automatically)
 *   4. Hardcoded production default
 */
export function resolveBaseUrl(req) {
  const origin = req?.headers?.origin;
  if (origin) {
    const allowlist = parseAllowlist();
    if (originIsAllowed(origin, allowlist)) {
      return stripTrailingSlash(origin);
    }
  }
  return envBaseUrl();
}

/**
 * Resolve the base URL for server-only paths that have no incoming request
 * context (webhooks, background jobs, transactional emails). Same precedence
 * as resolveBaseUrl but without the request-origin step.
 */
export function serverBaseUrl() {
  return envBaseUrl();
}
