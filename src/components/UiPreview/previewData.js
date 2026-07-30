// Shared data shaping for the consumer-UI prototype.
//
// All three design directions render the SAME content so the comparison is
// purely visual. This module turns the live /api/v1/coupons payload into the
// shape those designs need: a hero "deal value" (the thing that must POP), a
// short label, urgency, and rail groupings.

export const CHAPEL_HILL_GROUP_ID = '28e7dccf-4a8f-4894-b50a-0f439958e9d8';

/** Split a coupon into a big hero value + a short supporting label. */
export function dealValue(c) {
  const n = Number(c.discount_value);
  switch (c.coupon_type) {
    case 'percent':
      return Number.isFinite(n) && n > 0 ? `${n}%` : 'DEAL';
    case 'amount':
      return Number.isFinite(n) && n > 0 ? `$${n % 1 === 0 ? n : n.toFixed(2)}` : 'DEAL';
    case 'bogo':
      return 'BOGO';
    case 'free_item':
      return 'FREE';
    default:
      return 'DEAL';
  }
}

/**
 * Supporting label under the hero value — the title with any leading value
 * phrase stripped ("$10 Off First Order" -> "OFF FIRST ORDER"), so the number
 * isn't said twice.
 */
export function dealLabel(c) {
  const title = (c.title || '').trim();
  const stripped = title
    .replace(/^\$?\d+(\.\d+)?\s*%?\s*(off|of)?\s*/i, '')
    .replace(/^(bogo|buy one[, ]?\s*get one( free)?)\s*/i, '')
    .replace(/^free\s+/i, '')
    .trim();
  const label = stripped || title;
  return label.toUpperCase();
}

/** Whole-dollar savings we can honestly claim (only amount-type coupons). */
export function knownSavings(coupons) {
  return coupons.reduce((sum, c) => {
    const n = Number(c.discount_value);
    return c.coupon_type === 'amount' && Number.isFinite(n) ? sum + n : sum;
  }, 0);
}

export function daysLeft(c) {
  if (!c.expires_at) return null;
  const exp = new Date(String(c.expires_at).replace(' ', 'T'));
  if (Number.isNaN(exp.getTime())) return null;
  return Math.ceil((exp.getTime() - Date.now()) / 86400000);
}

/** Small urgency/novelty flag shown as a badge on the card. */
export function badgeFor(c) {
  const d = daysLeft(c);
  if (d !== null && d >= 0 && d <= 7) {
    return { text: d <= 1 ? 'ENDS TODAY' : `${d} DAYS LEFT`, tone: 'urgent' };
  }
  if (c.valid_from) {
    const from = new Date(String(c.valid_from).replace(' ', 'T'));
    if (!Number.isNaN(from.getTime()) && Date.now() - from.getTime() < 14 * 86400000) {
      return { text: 'NEW THIS WEEK', tone: 'new' };
    }
  }
  return null;
}

/** Merchant initials for the little logo-fallback chip. */
export function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/**
 * SAMPLE restaurant backgrounds.
 *
 * The real feature is: a merchant uploads ONE background image and it backs
 * all of their coupons — behind the OFFER only, never behind the merchant
 * header, and always under a white scrim so the deal stays legible.
 *
 * Nothing in the schema stores this yet, so the prototype assigns a stable
 * sample photo per merchant (hashed off the id) purely so the effect can be
 * judged and the scrim tuned. Swap for `coupon.merchant_background_url` once
 * the upload lands.
 */
export const BACKGROUND_LIBRARY = [
  { id: 'table',   label: 'Shared table',  url: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=900&q=70' },
  { id: 'counter', label: 'Counter',       url: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=900&q=70' },
  { id: 'dining',  label: 'Dining room',   url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=70' },
  { id: 'greens',  label: 'Fresh produce', url: 'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=900&q=70' },
  { id: 'spread',  label: 'Table spread',  url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=70' },
  { id: 'pastry',  label: 'Bakery case',   url: 'https://images.unsplash.com/photo-1424847651672-bf20a4b0982b?w=900&q=70' },
  { id: 'coffee',  label: 'Coffee bar',    url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=900&q=70' },
  { id: 'tacos',   label: 'Tacos',         url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&q=70' },
];

const SAMPLE_BACKGROUNDS = BACKGROUND_LIBRARY.map((b) => b.url);

/**
 * Style for the offer area's background: the restaurant's photo under a flat
 * white scrim, so the image reads but the deal value stays the loudest thing
 * on the card. `scrim` is 0–1 white opacity (higher = more washed out).
 *
 * Returns {} when disabled, when there's no image, or on a solid accent card
 * (white text on a white scrim would be unreadable — those keep their colour).
 */
export function offerBackgroundStyle(
  coupon,
  { enabled = true, scrim = 0.82, accent = false, overlayRgb = '255,255,255' } = {},
) {
  if (!enabled || accent || !coupon || !coupon.background) return {};
  const tint = `rgba(${overlayRgb},${scrim})`;
  return {
    backgroundImage: `linear-gradient(${tint}, ${tint}), url("${coupon.background}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

export function sampleBackground(merchantKey) {
  const s = String(merchantKey || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SAMPLE_BACKGROUNDS[h % SAMPLE_BACKGROUNDS.length];
}


/**
 * Merchant background choices.
 *
 * In the real product this is one column on `merchant`, set from a picker in
 * Merchant Tools. The prototype keeps it in localStorage so the whole merchant
 * flow (pick from library / upload your own / remove) can be demonstrated with
 * no DB write and no S3 round-trip.
 *
 * Value is a library URL or a downscaled data: URL from an upload.
 * `null` explicitly means "no background — plain card".
 */
const BG_KEY = 'uiPreviewMerchantBackgrounds';

export function loadBackgroundChoices() {
  try {
    return JSON.parse(localStorage.getItem(BG_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveBackgroundChoice(merchantId, value) {
  const all = loadBackgroundChoices();
  if (value === undefined) delete all[merchantId];
  else all[merchantId] = value;
  try {
    localStorage.setItem(BG_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Could not persist background choice (storage full?)', e);
  }
  return all;
}

export function resetBackgroundChoices() {
  localStorage.removeItem(BG_KEY);
}

/** Explicit merchant choice wins; otherwise fall back to the demo sample. */
export function backgroundFor(merchantId, merchantName, choices) {
  const key = merchantId || merchantName;
  if (choices && Object.prototype.hasOwnProperty.call(choices, key)) {
    return choices[key];
  }
  return sampleBackground(key);
}

/**
 * Downscale an uploaded image in-browser before storing it — keeps
 * localStorage small and mirrors the resize a real upload endpoint would do.
 */
export function fileToScaledDataUrl(file, maxW = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a readable image.'));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Normalize one API coupon into what the design components consume.
 *
 * opts.sampleFallback (default true): when a merchant hasn't set a real
 * background, fall back to a demo library photo. The real coupon book passes
 * false so unset restaurants render as clean cards (only genuine, merchant-set
 * photos appear); the /ui-preview playground keeps the samples.
 */
export function normalize(c, choices, opts = {}) {
  const { sampleFallback = true } = opts;
  return {
    id: c.id,
    // per-restaurant background, applied behind the offer only
    background:
      c.merchant_background_url ||
      (sampleFallback ? backgroundFor(c.merchant_id, c.merchant_name, choices) : null),
    value: dealValue(c),
    label: dealLabel(c),
    title: c.title,
    description: c.description,
    merchant: c.merchant_name,
    logo: c.merchant_logo,
    initials: initials(c.merchant_name),
    cuisine: c.cuisine_type,
    type: c.coupon_type,
    badge: badgeFor(c),
    daysLeft: daysLeft(c),
    expiresAt: c.expires_at,
    redeemed: !!c.redeemed_by_user,
  };
}

/** Rails: the horizontal, swipeable groupings that replace the endless scroll. */
export function buildRails(coupons, choices, opts = {}) {
  const live = coupons.filter((c) => {
    const d = daysLeft(c);
    return d === null || d >= 0;
  });
  const norm = live.map((c) => normalize(c, choices, opts));

  const endingSoon = [...norm]
    .filter((c) => c.daysLeft !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 8);

  const endingIds = new Set(endingSoon.map((c) => c.id));
  const rest = norm.filter((c) => !endingIds.has(c.id));

  const rails = [];
  if (endingSoon.length) {
    // Only call it "Ending soon" if something genuinely is. Chapel Hill's live
    // coupons run months out, so the honest label there is "Ending soonest" —
    // otherwise the rail contradicts the "N ending this week" stat above it.
    const genuinelySoon = endingSoon.some((c) => c.daysLeft <= 30);
    rails.push({
      key: 'ending',
      title: genuinelySoon ? 'Ending soon' : 'Ending soonest',
      caps: genuinelySoon ? 'ENDING SOON' : 'ENDING SOONEST',
      items: endingSoon,
    });
  }
  if (rest.length) {
    rails.push({ key: 'more', title: 'More in your book', caps: 'MORE IN YOUR BOOK', items: rest });
  }
  return rails;
}

/**
 * Group deals under their restaurant — the "Browse by restaurant" view (3d).
 * Sorted by deal count so the most-invested restaurants lead.
 */
export function buildMerchants(coupons, choices, opts = {}) {
  const { sampleFallback = true } = opts;
  const byId = new Map();
  for (const c of coupons) {
    const key = c.merchant_id || c.merchant_name;
    if (!key) continue;
    if (!byId.has(key)) {
      byId.set(key, {
        id: key,
        name: c.merchant_name,
        logo: c.merchant_logo,
        initials: initials(c.merchant_name),
        // Real data has no address/distance, so the sub-line uses what exists:
        // cuisine (when set) and the deal count.
        cuisine: c.cuisine_type || null,
        background:
          c.merchant_background_url ||
          (sampleFallback ? backgroundFor(c.merchant_id, c.merchant_name, choices) : null),
        deals: [],
      });
    }
    byId.get(key).deals.push(normalize(c, choices, opts));
  }
  return [...byId.values()].sort((a, b) => b.deals.length - a.deals.length);
}

/** Filter chips — derived from the data so they're never empty/lying. */
export function buildChips(coupons) {
  const chips = [
    { key: 'all', label: `All ${coupons.length}` },
    { key: 'by-restaurant', label: 'By restaurant' },
  ];
  const cuisines = [...new Set(coupons.map((c) => c.cuisine_type).filter(Boolean))];
  cuisines.slice(0, 4).forEach((c) => chips.push({ key: `cuisine:${c}`, label: c }));
  if (cuisines.length === 0) {
    const has = (t) => coupons.some((c) => c.coupon_type === t);
    if (has('amount') || has('percent')) chips.push({ key: 'type:money', label: '$ Off' });
    if (has('bogo')) chips.push({ key: 'type:bogo', label: 'BOGO' });
    if (has('free_item')) chips.push({ key: 'type:free_item', label: 'Freebies' });
  }
  chips.push({ key: 'soon', label: 'Ending soon' });
  return chips;
}

export function applyChip(coupons, key) {
  if (!key || key === 'all' || key === 'by-restaurant') return coupons;
  if (key === 'soon') {
    return coupons.filter((c) => {
      const d = daysLeft(c);
      return d !== null && d <= 14;
    });
  }
  const [kind, val] = key.split(':');
  if (kind === 'cuisine') return coupons.filter((c) => c.cuisine_type === val);
  if (kind === 'type' && val === 'money') {
    return coupons.filter((c) => c.coupon_type === 'amount' || c.coupon_type === 'percent');
  }
  if (kind === 'type') return coupons.filter((c) => c.coupon_type === val);
  return coupons;
}

/**
 * Sample events. The Chapel Hill group has no published events yet, but all
 * three directions feature an events section — so the prototype shows these,
 * clearly flagged as sample data in the preview toolbar (never inside the
 * design itself, which must be judged as if real).
 */
export const SAMPLE_EVENTS = [
  { id: 'e1', day: 'THU', time: '7:00 PM', name: 'Taco & Mezcal Tasting', venue: 'Carrboro', price: '$25' },
  { id: 'e2', day: 'SAT', time: '11:00 AM', name: 'Fresh Pasta Class', venue: 'Chapel Hill', price: '$40' },
];

/** Load the live Chapel Hill coupons for the prototype. */
export async function loadCoupons() {
  const res = await fetch('/api/v1/coupons');
  if (!res.ok) throw new Error(`Could not load coupons (${res.status})`);
  const all = await res.json();
  const group = all.filter((c) => c.foodie_group_id === CHAPEL_HILL_GROUP_ID);
  return group.length ? group : all;
}

/** Group name + banner, so the book is branded as the member's own. */
export async function loadGroup() {
  const res = await fetch(`/api/v1/groups/${CHAPEL_HILL_GROUP_ID}`);
  if (!res.ok) return null;
  return res.json();
}
