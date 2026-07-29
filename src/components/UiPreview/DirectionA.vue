<template>
  <!-- 1a — Bold Editorial Menu: cream deal chips on ink, value as huge numerals -->
  <div class="dirA" :class="{ desktop }">
    <!-- Desktop gets a real top nav; mobile keeps the bottom tab bar -->
    <nav v-if="desktop" class="topnav">
      <span class="topnav-brand">VIVASPOT</span>
      <div class="topnav-links">
        <button v-for="t in tabs" :key="t" class="topnav-link" :class="{ on: t === 'Book' }" type="button">
          {{ t }}
        </button>
      </div>
    </nav>

    <div class="banner" :style="bannerStyle">
      <span v-if="!desktop" class="banner-mark">VIVASPOT</span>
    </div>

    <div class="shell">
      <header class="head">
        <p class="eyebrow">YOUR BOOK · MEMBER</p>
        <h1 class="title">{{ groupName }}</h1>
      </header>

      <section class="stat">
        <div>
          <p class="stat-big">{{ unusedCount }} of {{ totalCount }} unredeemed</p>
          <p class="stat-sub">
            across {{ merchantCount }} restaurants<span v-if="endingSoonCount"> · {{ endingSoonCount }} ending this week</span>
          </p>
        </div>
        <button class="stat-btn" type="button" aria-label="Refresh">↻</button>
      </section>

      <nav class="chips" aria-label="Filter deals">
        <button
          v-for="chip in chips"
          :key="chip.key"
          class="chip"
          :class="{ on: chip.key === activeChip }"
          type="button"
          @click="$emit('chip', chip.key)"
        >
          {{ chip.label }}
        </button>
      </nav>
    </div>

    <section v-for="(rail, ri) in rails" :key="rail.key" class="rail-block shell">
      <div class="rail-head">
        <h2>{{ rail.title }}</h2>
        <span class="rail-count">{{ rail.items.length }} left</span>
        <button class="see-all" type="button">See all</button>
      </div>

      <div class="rail" role="list">
        <article
          v-for="(c, i) in rail.items"
          :key="c.id"
          class="deal"
          :class="{ accent: ri === 1 && i % 3 === 0 }"
          role="listitem"
          @click="$emit('open', c)"
        >
          <!-- Merchant is the header now (Turn 3): 44px mark, name wraps to
               2 lines rather than ellipsizing. Header row stays merchant-only. -->
          <div class="m-head">
            <img v-if="c.logo" :src="c.logo" :alt="c.merchant" class="m-logo" />
            <span v-else class="m-logo m-init">{{ c.initials }}</span>
            <span class="m-name">{{ c.merchant }}</span>
          </div>
          <!-- Restaurant background sits behind the OFFER only, under a white
               scrim. The merchant header above stays solid and untouched. -->
          <div class="deal-body" :style="bodyStyle(c, ri === 1 && i % 3 === 0)">
            <p class="deal-value">{{ c.value }}</p>
            <p class="deal-label">{{ c.label }}</p>
            <span v-if="c.badge" class="badge">{{ c.badge.text }}</span>
          </div>
        </article>
      </div>
    </section>

    <section class="rail-block shell">
      <div class="rail-head">
        <h2>Events this week</h2>
        <button class="see-all" type="button">See all</button>
      </div>
      <div class="rail" role="list">
        <article v-for="e in events" :key="e.id" class="event" role="listitem">
          <div class="event-img"></div>
          <p class="event-meta">{{ e.day }} · {{ e.time }}</p>
          <p class="event-name">{{ e.name }}</p>
          <p class="event-sub">{{ e.venue }} · {{ e.price }}</p>
        </article>
      </div>
    </section>

    <nav v-if="!desktop" class="tabs">
      <button v-for="t in tabs" :key="t" class="tab" :class="{ on: t === 'Book' }" type="button">
        <span class="tab-dot"></span>{{ t }}
      </button>
    </nav>
  </div>
</template>

<script>
import { offerBackgroundStyle } from '@/components/UiPreview/previewData';

export default {
  name: 'DirectionA',
  props: {
    groupName: { type: String, default: 'Chapel Hill Carrboro Foodies' },
    bannerUrl: { type: String, default: '' },
    rails: { type: Array, default: () => [] },
    chips: { type: Array, default: () => [] },
    activeChip: { type: String, default: 'all' },
    events: { type: Array, default: () => [] },
    unusedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },
    endingSoonCount: { type: Number, default: 0 },
    merchantCount: { type: Number, default: 0 },
    savings: { type: Number, default: 0 },
    desktop: { type: Boolean, default: false },
    backgrounds: { type: Boolean, default: true },
    scrim: { type: Number, default: 0.82 },
  },
  emits: ['chip', 'open'],
  data: () => ({ tabs: ['Book', 'Restaurants', 'Events', 'You'] }),
  methods: {
    bodyStyle(c, accent) {
      return offerBackgroundStyle(c, { enabled: this.backgrounds, scrim: this.scrim, accent });
    },
  },
  computed: {
    bannerStyle() {
      return this.bannerUrl
        ? { backgroundImage: `url(${this.bannerUrl})` }
        : {};
    },
  },
};
</script>

<style scoped>
.dirA {
  --ink: #0f151c;
  --cream: #f4eee4;
  --orange: #f2542d;
  --green: #1f9c73;
  background: var(--ink);
  color: #fff;
  font-family: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100%;
  padding-bottom: 84px;
}

.banner {
  height: 88px;
  background: linear-gradient(135deg, #26313d, #161d25);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 10px 16px;
}
.banner-mark {
  font-size: 9px;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.65);
  font-weight: 700;
}

.head { padding: 18px 20px 4px; }
.eyebrow {
  margin: 0 0 6px;
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--orange);
  font-weight: 800;
}
.title {
  margin: 0;
  font-size: 34px;
  line-height: 1.04;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.stat {
  margin: 16px 20px 0;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.stat-big { margin: 0; font-size: 17px; font-weight: 800; }
.stat-sub { margin: 3px 0 0; font-size: 12px; color: rgba(255, 255, 255, 0.6); }
.stat-btn {
  flex: none;
  width: 38px; height: 38px;
  border: none; border-radius: 50%;
  background: var(--green); color: #fff;
  font-size: 17px; cursor: pointer;
}

.chips {
  display: flex; gap: 8px;
  padding: 16px 20px 4px;
  overflow-x: auto;
  scrollbar-width: none;
}
.chips::-webkit-scrollbar { display: none; }
.chip {
  flex: none;
  padding: 8px 15px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px; font-weight: 600;
  font-family: inherit; cursor: pointer;
  white-space: nowrap;
}
.chip.on { background: #fff; color: #10161d; border-color: #fff; }

.rail-block { margin-top: 22px; }
.rail-head {
  display: flex; align-items: baseline; gap: 8px;
  padding: 0 20px 10px;
}
.rail-head h2 { margin: 0; font-size: 19px; font-weight: 800; }
.rail-count { font-size: 11px; color: var(--orange); font-weight: 700; }
.see-all {
  margin-left: auto;
  background: none; border: none;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px; font-family: inherit; cursor: pointer;
}

.rail {
  display: flex; gap: 12px;
  padding: 0 20px 4px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.rail::-webkit-scrollbar { display: none; }

.deal {
  flex: none;
  width: 200px;
  min-height: 178px;
  scroll-snap-align: start;
  background: var(--cream);
  color: #12181f;
  border-radius: 16px;
  padding: 0;
  display: flex; flex-direction: column;
  cursor: pointer;
  overflow: hidden;
}
.deal.accent { background: var(--orange); color: #fff; }

/* Merchant header — the restaurant is what the member is choosing */
.m-head {
  display: flex; align-items: center; gap: 9px;
  padding: 11px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.09);
}
.deal.accent .m-head { border-bottom-color: rgba(255, 255, 255, 0.25); }
.m-logo, .m-init {
  width: 44px; height: 44px; flex: none;
  border-radius: 11px;
  background: #fff;           /* uploaded marks keep their own ground */
  object-fit: contain; padding: 2px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 800; color: #12181f;
}
.m-name {
  font-size: 15px; font-weight: 800; line-height: 1.18;
  /* wrap to 2 lines rather than ellipsizing a real 30-char restaurant name */
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: break-word; hyphens: auto;
}

.deal-body {
  flex: 1;
  padding: 12px 13px 13px;
  display: flex; flex-direction: column; align-items: flex-start;
}
.deal-value {
  margin: 0;
  font-size: 44px; line-height: 0.94;
  font-weight: 800; letter-spacing: -0.035em;
}
.deal-label {
  margin: 5px 0 0;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.03em; line-height: 1.25;
}
/* expiry sits under the value so the header row stays merchant-only */
.badge {
  display: inline-block;
  margin-top: auto;
  padding-top: 0;
  font-size: 8.5px; font-weight: 800;
  letter-spacing: 0.09em;
  padding: 4px 7px;
  border-radius: 5px;
  background: var(--orange); color: #fff;
}
.deal.accent .badge { background: rgba(0, 0, 0, 0.28); }

.event {
  flex: none; width: 190px;
  scroll-snap-align: start;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 14px; overflow: hidden;
  padding-bottom: 11px;
}
.event-img {
  height: 74px;
  background: repeating-linear-gradient(115deg, #2a333d, #2a333d 9px, #232b34 9px, #232b34 18px);
}
.event-meta {
  margin: 10px 12px 0;
  font-size: 9.5px; letter-spacing: 0.11em;
  color: rgba(255, 255, 255, 0.55); font-weight: 700;
}
.event-name { margin: 4px 12px 0; font-size: 14px; font-weight: 700; }
.event-sub { margin: 3px 12px 0; font-size: 11px; color: rgba(255, 255, 255, 0.55); }

.tabs {
  position: sticky; bottom: 0;
  margin-top: 26px;
  display: flex;
  background: rgba(12, 17, 23, 0.96);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 9px 0 calc(9px + env(safe-area-inset-bottom, 0px));
  backdrop-filter: blur(8px);
}
.tab {
  flex: 1;
  background: none; border: none;
  color: rgba(255, 255, 255, 0.45);
  font-size: 10.5px; font-family: inherit; font-weight: 600;
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  cursor: pointer;
}
.tab-dot {
  width: 13px; height: 13px; border-radius: 4px;
  border: 2px solid currentColor;
}
.tab.on { color: var(--orange); }
.tab.on .tab-dot { background: var(--orange); border-color: var(--orange); }

/* ───────────────────────────────────────────────────────────────
   DESKTOP — not a stretched phone. Wide masthead, top nav, and the
   rails open into a multi-column grid so the whole book is visible.
   Keyed off .desktop (a prop), not @media: the phone-frame preview is
   narrower than the viewport, so a media query would fire inside it.
   ─────────────────────────────────────────────────────────────── */
.dirA.desktop { padding-bottom: 60px; }
.dirA.desktop .shell { max-width: 1280px; margin: 0 auto; padding-left: 40px; padding-right: 40px; }

.topnav {
  display: flex; align-items: center; gap: 28px;
  max-width: 1280px; margin: 0 auto;
  padding: 18px 40px;
}
.topnav-brand { font-size: 13px; font-weight: 800; letter-spacing: 0.2em; color: rgba(255, 255, 255, 0.7); }
.topnav-links { display: flex; gap: 4px; margin-left: auto; }
.topnav-link {
  background: none; border: none;
  color: rgba(255, 255, 255, 0.55);
  font-family: inherit; font-size: 14px; font-weight: 600;
  padding: 8px 16px; border-radius: 999px; cursor: pointer;
  transition: color .15s, background .15s;
}
.topnav-link:hover { color: #fff; background: rgba(255, 255, 255, 0.07); }
.topnav-link.on { color: var(--orange); }

.dirA.desktop .banner {
  height: 190px;
  max-width: 1280px; margin: 0 auto;
  border-radius: 16px;
}
.dirA.desktop .head { padding: 26px 0 0; }
.dirA.desktop .title { font-size: 54px; max-width: 15ch; }
.dirA.desktop .eyebrow { font-size: 11px; }

/* stat + filters share one row — no vertical stacking on a wide screen */
.dirA.desktop .stat {
  margin: 22px 0 0; padding: 18px 22px;
  max-width: 420px;
}
.dirA.desktop .stat-big { font-size: 20px; }
.dirA.desktop .chips { padding: 22px 0 0; flex-wrap: wrap; overflow: visible; }
.dirA.desktop .chip { font-size: 14px; padding: 9px 18px; transition: background .15s, color .15s; }
.dirA.desktop .chip:hover:not(.on) { background: rgba(255, 255, 255, 0.1); color: #fff; }

.dirA.desktop .rail-block { margin-top: 40px; }
.dirA.desktop .rail-head { padding: 0 0 16px; }
.dirA.desktop .rail-head h2 { font-size: 26px; }
.dirA.desktop .see-all { font-size: 13px; }
.dirA.desktop .see-all:hover { color: #fff; }

/* the key desktop move: rail -> grid, whole book visible at once */
.dirA.desktop .rail {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 18px;
  padding: 0;
  overflow: visible;
}
.dirA.desktop .deal {
  width: auto; min-height: 230px;
  transition: transform .15s ease, box-shadow .15s ease;
}
.dirA.desktop .deal:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.4);
}
.dirA.desktop .m-head { padding: 13px 15px; }
.dirA.desktop .m-name { font-size: 16px; }
.dirA.desktop .deal-body { padding: 14px 16px 15px; }
.dirA.desktop .deal-value { font-size: 56px; }
.dirA.desktop .deal-label { font-size: 13px; }
.dirA.desktop .badge { font-size: 9.5px; }

.dirA.desktop .event { width: auto; }
.dirA.desktop .event-img { height: 108px; }
.dirA.desktop .event-name { font-size: 16px; }
</style>
