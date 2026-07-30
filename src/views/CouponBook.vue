<!-- src/views/CouponBook.vue
     The consumer coupon book — Bold Editorial (direction 1a) as the REAL UI.
     Renders the presentational DirectionA component with live coupon data,
     real auth-gated redemption, real events, and per-restaurant backgrounds.
     The design lives in components/UiPreview/DirectionA.vue (also used by the
     /ui-preview playground); this view is the container that feeds it real data. -->
<template>
  <div class="coupon-book-view">
    <div v-if="loading" class="cb-state">Loading your book…</div>
    <div v-else-if="error" class="cb-state cb-error">⚠️ {{ error }}</div>

    <DirectionA
      v-else
      :chrome="false"
      :desktop="isDesktop"
      :group-name="groupName"
      :banner-url="bannerUrl"
      :rails="rails"
      :chips="chips"
      :active-chip="activeChip"
      :events="eventCards"
      :unused-count="unusedCount"
      :total-count="totalCount"
      :ending-soon-count="endingSoonCount"
      :merchant-count="merchantCount"
      :savings="savings"
      :backgrounds="true"
      :scrim="0.82"
      @chip="onChip"
      @open="onOpen"
    />

    <!-- Offer-detail sheet: explains the offer before the member redeems.
         Its CTA runs the real redemption flow (sign-in / purchase / popup). -->
    <div v-if="activeDeal" class="sheet-overlay" @click.self="closeSheet">
      <div class="sheet">
        <button class="sheet-close" type="button" aria-label="Close" @click="closeSheet">✕</button>

        <div class="sheet-head">
          <img v-if="activeDeal.logo" :src="activeDeal.logo" :alt="activeDeal.merchant" class="sheet-logo" />
          <span v-else class="sheet-logo sheet-init">{{ activeDeal.initials }}</span>
          <div class="sheet-head-text">
            <p class="sheet-merchant">{{ activeDeal.merchant }}</p>
            <p v-if="activeDeal.cuisine" class="sheet-sub">{{ activeDeal.cuisine }}</p>
          </div>
        </div>

        <div class="sheet-body">
          <p class="sheet-value">{{ activeDeal.value }}</p>
          <p class="sheet-label">{{ activeDeal.label }}</p>
          <p v-if="activeDeal.description" class="sheet-desc">{{ activeDeal.description }}</p>
          <p v-if="activeDeal.daysLeft !== null && activeDeal.daysLeft >= 0" class="sheet-meta">
            {{ activeDeal.daysLeft }} {{ activeDeal.daysLeft === 1 ? 'day' : 'days' }} left to use
          </p>
          <p v-if="activeDeal.redeemed" class="sheet-meta sheet-redeemed">✓ You’ve already redeemed this</p>

          <button class="sheet-cta" type="button" @click="onRedeemCta">
            {{ redeemState.label }}
          </button>
          <p v-if="redeemState.hint" class="sheet-meta">{{ redeemState.hint }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import DirectionA from '@/components/UiPreview/DirectionA.vue';
import {
  buildRails,
  buildChips,
  buildMerchants,
  applyChip,
  daysLeft,
  knownSavings,
} from '@/components/UiPreview/previewData';
import { listEvents } from '@/services/eventService';
import { getAccessToken, signIn } from '@/services/authService';

// DirectionA is set in Archivo; load it so the real page matches the design.
const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=Outfit:wght@400;500;600;700&display=swap';

/** Live API event → the small event-card shape DirectionA renders. */
function mapEvent(e) {
  if (!e || !e.id) return null;
  const dt = e.startDatetime ? new Date(e.startDatetime) : null;
  const valid = dt && !Number.isNaN(dt.getTime());
  const day = valid ? dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() : '';
  const time = valid ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
  let price = '';
  if (e.isFree) price = 'Free';
  else if (Number.isFinite(e.priceCents) && e.priceCents > 0) price = `$${Math.round(e.priceCents / 100)}`;
  return { id: e.id, day, time, name: e.name, venue: e.location || e.merchantName || '', price };
}

export default {
  name: 'CouponBookView',
  components: { DirectionA },
  data() {
    return {
      coupons: [],
      events: [],
      loading: true,
      error: null,
      activeChip: 'all',
      groupName: 'Your Coupon Book',
      bannerUrl: '',
      purchasedGroupIds: [],
      activeDeal: null,
      winWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
    };
  },

  computed: {
    ...mapGetters('auth', ['isAuthenticated']),

    // Real page → key the desktop layout off the actual viewport width.
    isDesktop() {
      return this.winWidth >= 900;
    },

    // Coupons that are still live (not past expiry). Not-yet-valid and
    // no-expiry coupons are kept, matching the prototype's rail rule.
    liveCoupons() {
      return this.coupons.filter((c) => {
        const d = daysLeft(c);
        return d === null || d >= 0;
      });
    },

    filtered() {
      return applyChip(this.liveCoupons, this.activeChip);
    },

    rails() {
      // "By restaurant" reuses the rail renderer: one rail per restaurant.
      if (this.activeChip === 'by-restaurant') {
        return buildMerchants(this.liveCoupons, {}, { sampleFallback: false }).map((m) => ({
          key: m.id,
          title: m.name,
          caps: (m.name || '').toUpperCase(),
          items: m.deals,
        }));
      }
      return buildRails(this.filtered, {}, { sampleFallback: false });
    },

    chips() {
      return buildChips(this.liveCoupons);
    },

    merchants() {
      return buildMerchants(this.liveCoupons, {}, { sampleFallback: false });
    },
    merchantCount() {
      return this.merchants.length;
    },

    endingSoonCount() {
      return this.liveCoupons.filter((c) => {
        const d = daysLeft(c);
        return d !== null && d >= 0 && d <= 7;
      }).length;
    },

    // "X of Y unredeemed" — Y = live coupons, X = the ones not yet used.
    unusedCount() {
      return this.liveCoupons.filter((c) => !c.redeemed_by_user).length;
    },
    totalCount() {
      return this.liveCoupons.length;
    },
    savings() {
      return knownSavings(this.liveCoupons);
    },

    eventCards() {
      return this.events.map(mapEvent).filter(Boolean);
    },

    // Drives the offer-sheet CTA: label + what tapping it does, based on the
    // member's auth + whether they own the book + whether it's already used.
    redeemState() {
      const card = this.activeDeal;
      if (!card) return { label: 'Redeem now', mode: 'redeem' };
      const coupon = this.couponById(card.id);
      if (card.redeemed || (coupon && coupon.redeemed_by_user)) {
        return { label: 'Show your code', mode: 'show' };
      }
      if (!this.isAuthenticated) {
        return { label: 'Sign in to redeem', mode: 'signin' };
      }
      if (coupon && coupon.foodie_group_id && !this.purchasedGroupIds.includes(coupon.foodie_group_id)) {
        return {
          label: 'Get this coupon book',
          mode: 'purchase',
          hint: 'This offer is part of a coupon book you don’t own yet.',
        };
      }
      return { label: 'Redeem now', mode: 'redeem' };
    },
  },

  watch: {
    isAuthenticated(newVal, oldVal) {
      if (newVal && !oldVal) {
        this.hydrateMember();
      } else if (!newVal) {
        this.purchasedGroupIds = [];
        this.coupons = this.coupons.map((c) => ({ ...c, redeemed_by_user: false }));
      }
    },
  },

  mounted() {
    this.loadFonts();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('message', this.onRedeemedMessage);
    this.init();
  },

  beforeUnmount() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('message', this.onRedeemedMessage);
  },

  methods: {
    async init() {
      await this.fetchCoupons();
      this.fetchGroupBranding();
      this.fetchEvents();
      if (this.isAuthenticated) this.hydrateMember();
    },

    async fetchCoupons() {
      try {
        const res = await fetch('/api/v1/coupons');
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        const raw = await res.json();
        // Use the raw payload (as the approved prototype does). NOTE: do NOT run
        // this through ensureCouponsHaveCuisine — its type-normalizer rewrites
        // free_item/bogo to a default, which would turn "FREE" into "DEAL".
        this.coupons = raw.map((c) => ({ ...c, redeemed_by_user: false }));
      } catch (err) {
        console.error('Failed to load coupons', err);
        this.error = 'Could not load coupons. ' + err.message;
      } finally {
        this.loading = false;
      }
    },

    // Title + banner come from the group most of the loaded coupons belong to
    // (single-market launch → the one foodie group).
    async fetchGroupBranding() {
      const counts = {};
      for (const c of this.coupons) {
        if (c.foodie_group_id) counts[c.foodie_group_id] = (counts[c.foodie_group_id] || 0) + 1;
      }
      const topId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      if (!topId) return;
      try {
        const res = await fetch(`/api/v1/groups/${topId}`);
        if (!res.ok) return;
        const g = await res.json();
        if (g && g.name) this.groupName = g.name;
        if (g && g.bannerImageUrl) this.bannerUrl = g.bannerImageUrl;
      } catch (e) {
        /* branding is best-effort */
      }
    },

    async fetchEvents() {
      try {
        this.events = await listEvents({});
      } catch (e) {
        console.warn('Could not load events', e);
        this.events = [];
      }
    },

    hydrateMember() {
      this.fetchRedemptionsMe();
      this.loadMyGroupPurchases();
    },

    // Mark which coupons this signed-in member has already redeemed.
    async fetchRedemptionsMe() {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch('/api/v1/coupons/redemptions/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          console.warn('[CouponBook] redemptions/me failed', res.status);
          return;
        }
        const rows = await res.json();
        rows.forEach((r) => this._markRedeemed(r.couponId, true, r.redeemedAt));
      } catch (e) {
        console.error('[CouponBook] failed to hydrate redemptions', e);
      }
    },

    // Which foodie-group books this member has actively purchased (paid + unexpired).
    async loadMyGroupPurchases() {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch('/api/v1/groups/my/purchases', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          console.warn('[CouponBook] my/purchases failed', res.status);
          return;
        }
        const purchases = await res.json();
        const now = new Date();
        this.purchasedGroupIds = (Array.isArray(purchases) ? purchases : [])
          .filter((p) => {
            if (p.status !== 'paid') return false;
            if (!p.expiresAt) return true;
            const exp = new Date(p.expiresAt);
            return Number.isNaN(exp.getTime()) ? true : exp >= now;
          })
          .map((p) => p.groupId);
      } catch (err) {
        console.error('[CouponBook] error loading purchases', err);
      }
    },

    _markRedeemed(couponId, isRedeemed = true, redeemedAt = new Date().toISOString()) {
      const idx = this.coupons.findIndex((c) => String(c.id) === String(couponId));
      if (idx === -1) return;
      this.coupons.splice(idx, 1, {
        ...this.coupons[idx],
        redeemed_by_user: isRedeemed,
        redeemed_at: redeemedAt,
      });
    },

    // The redeem popup posts this back when a code is generated.
    onRedeemedMessage(event) {
      const data = event && event.data;
      if (!data || data.type !== 'coupon-redeemed' || !data.couponId) return;
      this._markRedeemed(data.couponId, true, data.redeemedAt || new Date().toISOString());
    },

    couponById(id) {
      return this.coupons.find((c) => String(c.id) === String(id));
    },

    onChip(key) {
      this.activeChip = key;
    },

    // Tapping a deal opens the offer-detail sheet first (explains the offer);
    // redemption itself happens from the sheet's CTA.
    onOpen(card) {
      this.activeDeal = card;
    },

    closeSheet() {
      this.activeDeal = null;
    },

    // The sheet CTA. Runs the real flow based on redeemState.mode:
    // sign in, go buy the book, or open the real redemption popup.
    onRedeemCta() {
      const card = this.activeDeal;
      if (!card) return;
      const coupon = this.couponById(card.id);
      const mode = this.redeemState.mode;

      if (mode === 'signin') {
        try {
          signIn();
        } catch (e) {
          alert('Please sign in to redeem coupons.');
        }
        return;
      }

      if (mode === 'purchase') {
        if (coupon && coupon.foodie_group_id) {
          this.$router.push({ name: 'FoodieGroupView', params: { id: coupon.foodie_group_id } });
        }
        return;
      }

      // 'redeem' or 'show' → open the real redemption popup, then close the sheet.
      if (coupon) this.openRedeemPopup(coupon);
      this.closeSheet();
    },

    openRedeemPopup(coupon) {
      const route = this.$router.resolve({ name: 'CouponRedeemPopup', params: { id: coupon.id } });
      const url = route && route.href ? route.href : `/coupon/redeem/${coupon.id}`;
      window.open(url, 'coupon-redeem', 'width=520,height=720,noopener,noreferrer');
    },

    onResize() {
      this.winWidth = window.innerWidth;
    },

    loadFonts() {
      if (typeof document === 'undefined' || document.getElementById('coupon-book-fonts')) return;
      const link = document.createElement('link');
      link.id = 'coupon-book-fonts';
      link.rel = 'stylesheet';
      link.href = FONTS;
      document.head.appendChild(link);
    },
  },
};
</script>

<style scoped>
/* Full-bleed: DirectionA owns its own internal padding + dark ground. */
.coupon-book-view {
  min-height: 100%;
}

.cb-state {
  padding: 48px 20px;
  text-align: center;
  color: var(--color-text-muted, #8a94a0);
  font-size: 15px;
}
.cb-error {
  color: var(--color-error, #ff6b57);
}

/* ── Offer-detail sheet (ported from the /ui-preview prototype) ─────────── */
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
@media (min-width: 720px) {
  .sheet-overlay { align-items: center; }
}
.sheet {
  position: relative;
  width: 100%;
  max-width: 390px;
  background: #f6f1e7;
  color: #12181f;
  border-radius: 20px 20px 0 0;
  padding: 0 0 calc(22px + env(safe-area-inset-bottom, 0px));
  text-align: center;
  overflow: hidden;
  font-family: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
@media (min-width: 720px) {
  .sheet { border-radius: 20px; }
}
.sheet-close {
  position: absolute;
  top: 14px;
  right: 14px;
  border: none;
  background: rgba(0, 0, 0, 0.07);
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 14px;
  cursor: pointer;
  color: #12181f;
  z-index: 2;
}
.sheet-head {
  display: flex;
  align-items: center;
  gap: 13px;
  text-align: left;
  padding: 20px 54px 18px 22px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.sheet-logo,
.sheet-init {
  width: 56px;
  height: 56px;
  flex: none;
  border-radius: 14px;
  background: #fff;
  object-fit: contain;
  padding: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 800;
  color: #12181f;
}
.sheet-head-text { min-width: 0; }
.sheet-body { padding: 22px 22px 4px; }
.sheet-merchant {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: break-word;
}
.sheet-sub { margin: 3px 0 0; font-size: 12.5px; opacity: 0.6; }
.sheet-value {
  margin: 8px 0 0;
  font-size: 60px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.04em;
}
.sheet-label {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.05em;
}
.sheet-desc {
  margin: 14px 0 0;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.75;
  white-space: pre-line;
}
.sheet-meta { margin: 10px 0 0; font-size: 11px; opacity: 0.55; }
.sheet-redeemed { color: #1f9c73; opacity: 1; font-weight: 700; font-size: 12px; }
.sheet-cta {
  margin-top: 20px;
  width: 100%;
  border: none;
  border-radius: 12px;
  background: #f2542d;
  color: #fff;
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  padding: 15px;
  cursor: pointer;
}
.sheet-cta:hover { background: #e04a25; }
</style>
