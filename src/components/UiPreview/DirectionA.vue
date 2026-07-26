<template>
  <!-- 1a — Bold Editorial Menu: cream deal chips on ink, value as huge numerals -->
  <div class="dirA">
    <div class="banner" :style="bannerStyle">
      <span class="banner-mark">VIVASPOT</span>
    </div>

    <header class="head">
      <p class="eyebrow">YOUR BOOK · MEMBER</p>
      <h1 class="title">{{ groupName }}</h1>
    </header>

    <section class="stat">
      <div>
        <p class="stat-big">{{ unusedCount }} deals unused</p>
        <p class="stat-sub">${{ savings }}+ off, plus freebies</p>
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

    <section v-for="(rail, ri) in rails" :key="rail.key" class="rail-block">
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
          <span v-if="c.badge" class="badge">{{ c.badge.text }}</span>
          <p class="deal-value">{{ c.value }}</p>
          <p class="deal-label">{{ c.label }}</p>
          <div class="merchant">
            <img v-if="c.logo" :src="c.logo" :alt="c.merchant" class="m-logo" />
            <span v-else class="m-init">{{ c.initials }}</span>
            <span class="m-name">{{ c.merchant }}</span>
          </div>
        </article>
      </div>
    </section>

    <section class="rail-block">
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

    <nav class="tabs">
      <button v-for="t in tabs" :key="t" class="tab" :class="{ on: t === 'Book' }" type="button">
        <span class="tab-dot"></span>{{ t }}
      </button>
    </nav>
  </div>
</template>

<script>
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
    savings: { type: Number, default: 0 },
  },
  emits: ['chip', 'open'],
  data: () => ({ tabs: ['Book', 'Events', 'Saved', 'You'] }),
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
  width: 150px;
  min-height: 168px;
  scroll-snap-align: start;
  background: var(--cream);
  color: #12181f;
  border-radius: 16px;
  padding: 12px 13px 11px;
  display: flex; flex-direction: column;
  cursor: pointer;
}
.deal.accent { background: var(--orange); color: #fff; }

.badge {
  display: inline-block;
  align-self: flex-start;
  font-size: 8.5px; font-weight: 800;
  letter-spacing: 0.09em;
  padding: 3px 7px;
  border-radius: 5px;
  background: var(--orange); color: #fff;
  margin-bottom: 8px;
}
.deal.accent .badge { background: rgba(0, 0, 0, 0.28); }

.deal-value {
  margin: 0;
  font-size: 40px; line-height: 0.94;
  font-weight: 800; letter-spacing: -0.035em;
}
.deal-label {
  margin: 5px 0 0;
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.03em; line-height: 1.25;
}

.merchant {
  margin-top: auto;
  padding-top: 10px;
  display: flex; align-items: center; gap: 6px;
}
.m-logo, .m-init {
  width: 20px; height: 20px; flex: none;
  border-radius: 5px; background: #fff;
  object-fit: contain;
  display: flex; align-items: center; justify-content: center;
  font-size: 7.5px; font-weight: 800; color: #12181f;
  border: 1px solid rgba(0, 0, 0, 0.1);
}
.m-name {
  font-size: 11px; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

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
</style>
