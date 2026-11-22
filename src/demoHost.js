// Demo-instance detection + per-demo branding, keyed on hostname so it needs
// no env vars and is inert everywhere else. Each entry is one prospect
// evaluation deployment (its own Vercel project + its own database).
import sjfsLogo from '@/assets/sjfs-logo.png';

const DEMOS = {
  'southjersey.vivaspot.com': 'sjfs',
  // Vercel project URLs for the same deployment (couponbook-demo-*.vercel.app)
};

export const DEMO_BRANDS = {
  sjfs: {
    name: 'South Jersey Food Scene',
    logo: sjfsLogo,
    statNum: 'Thousands',
    statCaption: 'of South Jersey foodies — Cherry Hill, Collingswood, Haddonfield, Medford and beyond — deciding where to eat next.',
    appName: 'South Jersey Food Scene Coupon Book',
  },
};

export function demoKeyFor(hostname) {
  if (!hostname) return null;
  if (DEMOS[hostname]) return DEMOS[hostname];
  if (hostname.startsWith('couponbook-demo') && hostname.endsWith('.vercel.app')) return 'sjfs';
  return null;
}

export function isDemoHostname(hostname) {
  return demoKeyFor(hostname) !== null;
}

export function demoBrand() {
  if (typeof window === 'undefined') return null;
  const key = demoKeyFor(window.location.hostname);
  return key ? DEMO_BRANDS[key] : null;
}
