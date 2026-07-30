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

    // A deal card was tapped. Gate on auth + book purchase, then open the
    // real redemption popup (same flow the old list used).
    onOpen(card) {
      const coupon = this.couponById(card.id);
      if (!coupon) return;

      // Already used → reopen the popup so they can show the code again.
      if (coupon.redeemed_by_user) {
        this.openRedeemPopup(coupon);
        return;
      }

      if (!this.isAuthenticated) {
        try {
          signIn();
        } catch (e) {
          alert('Please sign in to redeem coupons.');
        }
        return;
      }

      // Foodie-group coupons need an active purchased book. If they don't own
      // it yet, send them to that group's page to buy it.
      if (coupon.foodie_group_id && !this.purchasedGroupIds.includes(coupon.foodie_group_id)) {
        this.$router.push({ name: 'FoodieGroupView', params: { id: coupon.foodie_group_id } });
        return;
      }

      this.openRedeemPopup(coupon);
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
</style>
