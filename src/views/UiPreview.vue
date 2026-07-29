<template>
  <div class="preview-page">
    <!-- Prototype chrome. NOT part of the design — it's the harness that lets
         you flip between directions on a real phone with real coupon data. -->
    <header class="switcher">
      <div class="sw-row">
        <span class="sw-title">Coupon Book UI</span>
        <button
          v-for="d in directions"
          :key="d.key"
          class="sw-btn"
          :class="{ on: d.key === active }"
          type="button"
          @click="select(d.key)"
        >
          <b>{{ d.key }}</b> {{ d.name }}
        </button>
        <button
          v-if="wideScreen"
          class="sw-btn sw-view"
          type="button"
          @click="phoneView = !phoneView"
        >
          {{ phoneView ? '🖥 Desktop view' : '📱 Phone view' }}
        </button>
      </div>

      <!-- Restaurant backgrounds behind the offer + scrim tuner -->
      <div class="sw-row sw-bg">
        <label class="sw-toggle">
          <input type="checkbox" v-model="backgrounds" />
          Restaurant backgrounds
        </label>
        <template v-if="backgrounds">
          <span class="sw-label">white overlay</span>
          <input
            class="sw-range"
            type="range" min="0.5" max="0.95" step="0.01"
            v-model.number="scrim"
          />
          <span class="sw-val">{{ Math.round(scrim * 100) }}%</span>
          <button class="sw-btn sw-mini" type="button" @click="showPicker = true">
            Set per restaurant…
          </button>
        </template>
      </div>
      <p class="sw-note">
        {{ status }}
      </p>
    </header>

    <div class="stage" :class="{ wide: isDesktop }">
      <div class="frame" :class="{ phone: !isDesktop }">
        <div v-if="loading" class="state">Loading your book…</div>
        <div v-else-if="error" class="state err">{{ error }}</div>

        <component
          v-else
          :is="activeComponent"
          :desktop="isDesktop"
          :backgrounds="backgrounds"
          :scrim="scrim"
          :group-name="groupName"
          :banner-url="bannerUrl"
          :rails="rails"
          :chips="chips"
          :active-chip="activeChip"
          :events="events"
          :unused-count="unusedCount"
          :total-count="totalCount"
          :ending-soon-count="endingSoonCount"
          :merchant-count="merchantCount"
          :savings="savings"
          @chip="activeChip = $event"
          @open="openDeal"
        />
      </div>
    </div>

    <BackgroundPicker
      v-if="showPicker"
      :merchants="merchants"
      @close="showPicker = false"
      @set="setBackground"
      @reset="resetBackgrounds"
    />

    <!-- Redemption sheet: proves the "3 taps to a redeemable code" goal -->
    <div v-if="openCoupon" class="sheet-overlay" @click.self="openCoupon = null">
      <div class="sheet">
        <button class="sheet-close" type="button" @click="openCoupon = null">✕</button>

        <!-- Merchant unmistakable (3e): staff must see at a glance that this
             code is for THEIR restaurant. -->
        <div class="sheet-head">
          <img v-if="openCoupon.logo" :src="openCoupon.logo" :alt="openCoupon.merchant" class="sheet-logo" />
          <span v-else class="sheet-logo sheet-init">{{ openCoupon.initials }}</span>
          <div class="sheet-head-text">
            <p class="sheet-merchant">{{ openCoupon.merchant }}</p>
            <p v-if="openCoupon.cuisine" class="sheet-sub">{{ openCoupon.cuisine }}</p>
          </div>
        </div>

        <div class="sheet-body">
          <p class="sheet-value">{{ openCoupon.value }}</p>
          <p class="sheet-label">{{ openCoupon.label }}</p>
          <p class="sheet-desc">{{ openCoupon.description }}</p>
          <p v-if="openCoupon.daysLeft !== null" class="sheet-meta">
            {{ openCoupon.daysLeft }} days left to use
          </p>
          <button class="sheet-cta" type="button" @click="redeemed = true">
            {{ redeemed ? '✓ Show this at the counter' : 'Redeem now' }}
          </button>
          <div v-if="redeemed" class="sheet-code">
            <div class="code-box">{{ shortCode }}</div>
            <p class="sheet-meta">Prototype only — no redemption was recorded.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import DirectionA from '@/components/UiPreview/DirectionA.vue';
import DirectionB from '@/components/UiPreview/DirectionB.vue';
import DirectionC from '@/components/UiPreview/DirectionC.vue';
import BackgroundPicker from '@/components/UiPreview/BackgroundPicker.vue';
import {
  loadCoupons,
  loadGroup,
  buildRails,
  buildChips,
  buildMerchants,
  loadBackgroundChoices,
  saveBackgroundChoice,
  resetBackgroundChoices,
  applyChip,
  daysLeft,
  knownSavings,
  SAMPLE_EVENTS,
} from '@/components/UiPreview/previewData';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=Outfit:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Instrument+Serif&family=Inter:wght@400;500;600;700&display=swap';

export default {
  name: 'UiPreview',
  components: { DirectionA, DirectionB, DirectionC, BackgroundPicker },
  data() {
    return {
      directions: [
        { key: '1a', name: 'Editorial', comp: 'DirectionA' },
        { key: '1b', name: 'Ticket', comp: 'DirectionB' },
        { key: '1c', name: 'Club', comp: 'DirectionC' },
      ],
      active: '1a',
      coupons: [],
      loading: true,
      error: null,
      activeChip: 'all',
      events: SAMPLE_EVENTS,
      groupName: 'Chapel Hill Carrboro Foodies',
      bannerUrl: '',
      openCoupon: null,
      redeemed: false,
      // Desktop is a first-class layout, not a stretched phone. `phoneView`
      // lets you force the mobile frame on a big screen to compare the two.
      phoneView: false,
      backgrounds: true,
      scrim: 0.82,
      bgChoices: {},
      showPicker: false,
      winWidth: typeof window !== 'undefined' ? window.innerWidth : 1440,
    };
  },
  computed: {
    wideScreen() {
      return this.winWidth >= 1024;
    },
    // Direction components key their desktop styles off this prop rather than
    // @media, because the phone frame is narrower than the viewport — a
    // viewport media query would fire inside a 390px frame and break it.
    isDesktop() {
      return this.wideScreen && !this.phoneView;
    },
    activeComponent() {
      return (this.directions.find((d) => d.key === this.active) || this.directions[0]).comp;
    },
    filtered() {
      return applyChip(this.coupons, this.activeChip);
    },
    // "By restaurant" (Turn 3, screen 3d) reuses the rail renderer — one rail
    // per restaurant, titled with the restaurant — so all three directions get
    // the grouped browse with no per-direction markup.
    rails() {
      if (this.activeChip === 'by-restaurant') {
        return buildMerchants(this.coupons, this.bgChoices).map((m) => ({
          key: m.id,
          title: m.name,
          caps: (m.name || '').toUpperCase(),
          items: m.deals,
        }));
      }
      return buildRails(this.filtered, this.bgChoices);
    },
    merchants() {
      return buildMerchants(this.coupons, this.bgChoices);
    },
    merchantCount() {
      return this.merchants.length;
    },
    endingSoonCount() {
      return this.coupons.filter((c) => {
        const d = daysLeft(c);
        return d !== null && d >= 0 && d <= 7;
      }).length;
    },
    chips() {
      return buildChips(this.coupons);
    },
    unusedCount() {
      return this.coupons.length;
    },
    totalCount() {
      return this.coupons.length;
    },
    savings() {
      return knownSavings(this.coupons);
    },
    status() {
      if (this.loading) return 'Loading…';
      if (this.error) return this.error;
      return `${this.coupons.length} live coupons · events are sample data`;
    },
    shortCode() {
      return (this.openCoupon?.id || '').slice(0, 8).toUpperCase();
    },
  },
  mounted() {
    if (!document.getElementById('ui-preview-fonts')) {
      const link = document.createElement('link');
      link.id = 'ui-preview-fonts';
      link.rel = 'stylesheet';
      link.href = FONTS;
      document.head.appendChild(link);
    }
    const d = this.$route.query.d;
    if (d && this.directions.some((x) => x.key === d)) this.active = d;
    this.bgChoices = loadBackgroundChoices();
    window.addEventListener('resize', this.onResize);
    this.fetch();
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.onResize);
  },
  methods: {
    async fetch() {
      try {
        const [coupons, group] = await Promise.all([
          loadCoupons(),
          loadGroup().catch(() => null),
        ]);
        this.coupons = coupons;
        if (coupons.length) {
          this.groupName = coupons[0].foodie_group_name || this.groupName;
        }
        if (group) {
          this.groupName = group.name || this.groupName;
          this.bannerUrl = group.bannerImageUrl || '';
        }
      } catch (e) {
        this.error = e.message || 'Could not load coupons.';
      } finally {
        this.loading = false;
      }
    },
    onResize() {
      this.winWidth = window.innerWidth;
    },
    setBackground({ id, value }) {
      this.bgChoices = { ...saveBackgroundChoice(id, value) };
    },
    resetBackgrounds() {
      resetBackgroundChoices();
      this.bgChoices = {};
    },
    select(key) {
      this.active = key;
      this.$router.replace({ query: { ...this.$route.query, d: key } }).catch(() => {});
    },
    openDeal(c) {
      this.openCoupon = c;
      this.redeemed = false;
    },
  },
};
</script>

<style scoped>
.preview-page {
  min-height: 100vh;
  background: #05080b;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.switcher {
  position: sticky; top: 0; z-index: 30;
  background: rgba(5, 8, 11, 0.95);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 10px 12px;
  backdrop-filter: blur(8px);
}
.sw-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.sw-title { font-size: 12px; font-weight: 700; opacity: 0.55; margin-right: 4px; }
.sw-btn {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: transparent; color: rgba(255, 255, 255, 0.8);
  border-radius: 999px; padding: 7px 13px;
  font-family: inherit; font-size: 12px; cursor: pointer;
}
.sw-btn b { font-weight: 800; margin-right: 3px; }
.sw-btn.on { background: #f2542d; border-color: #f2542d; color: #fff; }
.sw-note { margin: 7px 0 0; font-size: 10.5px; opacity: 0.45; }

.sw-bg { margin-top: 8px; gap: 10px; font-size: 12px; }
.sw-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; opacity: 0.85; }
.sw-toggle input { accent-color: #f2542d; cursor: pointer; }
.sw-label { opacity: 0.5; }
.sw-range { width: 150px; accent-color: #f2542d; cursor: pointer; }
.sw-val { opacity: 0.7; font-variant-numeric: tabular-nums; min-width: 34px; }
.sw-mini { padding: 5px 11px; font-size: 11.5px; }

.stage { display: flex; justify-content: center; padding: 0; }

/* Phone frame — used on real phones, and on desktop when you pick "Phone view" */
.frame.phone {
  width: 100%;
  max-width: 390px;
  min-height: calc(100vh - 62px);
  background: #10151a;
  overflow-x: hidden;
}
@media (min-width: 720px) {
  .stage:not(.wide) { padding: 22px 0 34px; }
  .stage:not(.wide) .frame.phone {
    min-height: 844px; height: 844px;
    overflow-y: auto;
    border-radius: 26px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
  }
}

/* Desktop — the layout fills the window, no frame */
.stage.wide { padding: 0; }
.stage.wide .frame {
  width: 100%;
  min-height: calc(100vh - 62px);
  background: #10151a;
}

.state { padding: 40px 20px; text-align: center; opacity: 0.6; font-size: 14px; }
.state.err { color: #ff8a70; }

/* Redemption sheet */
.sheet-overlay {
  position: fixed; inset: 0; z-index: 50;
  background: rgba(0, 0, 0, 0.6);
  display: flex; align-items: flex-end; justify-content: center;
}
@media (min-width: 720px) { .sheet-overlay { align-items: center; } }
.sheet {
  position: relative;
  width: 100%; max-width: 390px;
  background: #f6f1e7; color: #12181f;
  border-radius: 20px 20px 0 0;
  padding: 0 0 calc(22px + env(safe-area-inset-bottom, 0px));
  text-align: center;
  overflow: hidden;
}
@media (min-width: 720px) { .sheet { border-radius: 20px; } }
.sheet-close {
  position: absolute; top: 14px; right: 14px;
  border: none; background: rgba(0, 0, 0, 0.07);
  width: 30px; height: 30px; border-radius: 50%;
  font-size: 14px; cursor: pointer; color: #12181f;
  z-index: 2;
}
/* merchant header band — big mark, full name, never clipped */
.sheet-head {
  display: flex; align-items: center; gap: 13px;
  text-align: left;
  padding: 20px 54px 18px 22px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.sheet-logo, .sheet-init {
  width: 56px; height: 56px; flex: none;
  border-radius: 14px; background: #fff; object-fit: contain; padding: 3px;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 800; color: #12181f;
}
.sheet-head-text { min-width: 0; }
.sheet-body { padding: 22px 22px 4px; }
.sheet-merchant {
  margin: 0; font-size: 20px; font-weight: 800; line-height: 1.2;
  overflow-wrap: break-word;
}
.sheet-sub { margin: 3px 0 0; font-size: 12.5px; opacity: 0.6; }
.sheet-value { margin: 8px 0 0; font-size: 60px; line-height: 1; font-weight: 800; letter-spacing: -0.04em; }
.sheet-label { margin: 6px 0 0; font-size: 13px; font-weight: 700; letter-spacing: 0.05em; }
.sheet-desc { margin: 14px 0 0; font-size: 13px; line-height: 1.5; opacity: 0.75; white-space: pre-line; }
.sheet-meta { margin: 10px 0 0; font-size: 11px; opacity: 0.55; }
.sheet-cta {
  margin-top: 20px; width: 100%;
  border: none; border-radius: 12px;
  background: #f2542d; color: #fff;
  font-family: inherit; font-size: 16px; font-weight: 700;
  padding: 15px; cursor: pointer;
}
.sheet-code { margin-top: 16px; }
.code-box {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 26px; letter-spacing: 0.16em; font-weight: 700;
  background: #12181f; color: #fff;
  padding: 18px; border-radius: 12px;
}
</style>
