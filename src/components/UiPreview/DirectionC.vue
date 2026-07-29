<template>
  <!-- 1c — Premium Dining Club: hairline cards, Instrument Serif values, gold accent -->
  <div class="dirC" :class="{ desktop }">
    <nav v-if="desktop" class="topnav">
      <span class="topnav-brand">VIVASPOT</span>
      <div class="topnav-links">
        <button v-for="t in tabs" :key="t" class="topnav-link" :class="{ on: t === 'BOOK' }" type="button">
          {{ t }}
        </button>
      </div>
    </nav>

    <header class="head">
      <div class="head-row">
        <p class="eyebrow">MEMBER · CHAPEL HILL</p>
        <span v-if="!desktop" class="mark">VIVASPOT</span>
      </div>
      <h1 class="title">The Foodies Book</h1>
    </header>

    <section class="avail">
      <div>
        <p class="avail-big">{{ unusedCount }} <span>of {{ totalCount }} unredeemed</span></p>
        <p class="avail-sub">
          across {{ merchantCount }} restaurants<span v-if="endingSoonCount"> · {{ endingSoonCount }} end this week</span>
        </p>
      </div>
      <button class="search" type="button">SEARCH</button>
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

    <section v-for="rail in rails" :key="rail.key" class="rail-block">
      <div class="rail-head">
        <h2>{{ rail.caps }}</h2>
        <button class="see-all" type="button">See all</button>
      </div>

      <div class="grid" role="list">
        <article
          v-for="c in rail.items"
          :key="c.id"
          class="offer"
          role="listitem"
          @click="$emit('open', c)"
        >
          <!-- merchant header (Turn 3) — the card leads with the restaurant -->
          <div class="m-head">
            <img v-if="c.logo" :src="c.logo" :alt="c.merchant" class="m-logo" />
            <span v-else class="m-logo m-init">{{ c.initials }}</span>
            <span class="m-name">{{ c.merchant }}</span>
          </div>
          <p class="o-value">{{ c.value }}</p>
          <p class="o-label">{{ c.label }}</p>
          <p v-if="c.badge" class="badge">{{ c.badge.text }}</p>
        </article>
      </div>
    </section>

    <section class="rail-block">
      <div class="rail-head">
        <h2>THIS WEEK</h2>
        <button class="see-all" type="button">See all</button>
      </div>
      <div class="events">
        <article v-for="e in events" :key="e.id" class="event">
          <div>
            <p class="event-meta">{{ e.day }} · {{ e.time }}</p>
            <p class="event-name">{{ e.name }}</p>
            <p class="event-sub">{{ e.venue }} · {{ e.price }}</p>
          </div>
          <button class="rsvp" type="button">RSVP</button>
        </article>
      </div>
    </section>

    <nav v-if="!desktop" class="tabs">
      <button v-for="t in tabs" :key="t" class="tab" :class="{ on: t === 'BOOK' }" type="button">
        {{ t }}
      </button>
    </nav>
  </div>
</template>

<script>
export default {
  name: 'DirectionC',
  props: {
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
  },
  emits: ['chip', 'open'],
  data: () => ({ tabs: ['BOOK', 'RESTAURANTS', 'EVENTS', 'YOU'] }),
};
</script>

<style scoped>
.dirC {
  --ink: #10151a;
  --line: rgba(255, 255, 255, 0.14);
  --gold: #c8a24a;
  --orange: #f2542d;
  background: var(--ink);
  color: #f2efe9;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100%;
  padding: 22px 0 84px;
}
.serif { font-family: 'Instrument Serif', Georgia, 'Times New Roman', serif; }

.head { padding: 0 22px; }
.head-row { display: flex; align-items: center; justify-content: space-between; }
.eyebrow {
  margin: 0; font-size: 9px; letter-spacing: 0.2em;
  color: rgba(242, 239, 233, 0.5); font-weight: 600;
}
.mark { font-size: 8.5px; letter-spacing: 0.2em; color: rgba(242, 239, 233, 0.32); font-weight: 600; }
.title {
  margin: 10px 0 0;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 33px; font-weight: 400; letter-spacing: 0.005em;
}

.avail {
  margin: 20px 22px 0;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--line);
  display: flex; align-items: flex-start; justify-content: space-between; gap: 14px;
}
.avail-big {
  margin: 0;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 30px; font-weight: 400; line-height: 1;
}
.avail-big span { font-size: 15px; color: rgba(242, 239, 233, 0.6); font-family: inherit; }
.avail-sub { margin: 7px 0 0; font-size: 11.5px; color: rgba(242, 239, 233, 0.5); }
.search {
  flex: none;
  border: 1px solid var(--line); border-radius: 999px;
  background: transparent; color: #f2efe9;
  font-family: inherit; font-size: 10px; letter-spacing: 0.14em; font-weight: 600;
  padding: 9px 17px; cursor: pointer;
}

.chips {
  display: flex; gap: 8px;
  padding: 16px 22px 2px;
  overflow-x: auto; scrollbar-width: none;
}
.chips::-webkit-scrollbar { display: none; }
.chip {
  flex: none; padding: 7px 14px;
  border-radius: 999px; border: 1px solid var(--line);
  background: transparent; color: rgba(242, 239, 233, 0.75);
  font-family: inherit; font-size: 11.5px; cursor: pointer; white-space: nowrap;
}
.chip.on { border-color: var(--gold); color: var(--gold); }

.rail-block { margin-top: 22px; }
.rail-head {
  display: flex; align-items: baseline; justify-content: space-between;
  padding: 0 22px 12px;
}
.rail-head h2 {
  margin: 0; font-size: 10px; letter-spacing: 0.2em;
  font-weight: 600; color: rgba(242, 239, 233, 0.55);
}
.see-all {
  background: none; border: none;
  color: rgba(242, 239, 233, 0.45);
  font-family: inherit; font-size: 11.5px; cursor: pointer;
}

/* 2-up hairline grid — the restrained, catalogue-like alternative to big rails */
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 0 22px;
}

.offer {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px 14px 12px;
  min-height: 200px;
  display: flex; flex-direction: column;
  cursor: pointer;
}
/* merchant header — restaurant first, hairline rule under it */
.m-head {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 12px; margin-bottom: 13px;
  border-bottom: 1px solid var(--line);
  min-width: 0;
}
.m-logo, .m-init {
  width: 44px; height: 44px; flex: none;
  border-radius: 11px; background: #fff; object-fit: contain; padding: 2px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #12181f;
}
.m-name {
  font-size: 15px; font-weight: 600; line-height: 1.2;
  color: #f2efe9;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: break-word;
}

.o-value {
  margin: 0;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 38px; line-height: 0.95; font-weight: 400;
}
.o-label {
  margin: 6px 0 0;
  font-size: 9.5px; letter-spacing: 0.11em; font-weight: 600;
  color: rgba(242, 239, 233, 0.7); line-height: 1.35;
}
.badge {
  margin: auto 0 0;
  padding-top: 12px;
  font-size: 8.5px; letter-spacing: 0.14em; font-weight: 600;
  color: var(--gold);
}

.events { padding: 0 22px; display: flex; flex-direction: column; gap: 10px; }
.event {
  border: 1px solid var(--line); border-radius: 10px;
  padding: 13px 14px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.event-meta { margin: 0; font-size: 9px; letter-spacing: 0.16em; color: rgba(242, 239, 233, 0.5); font-weight: 600; }
.event-name {
  margin: 5px 0 0;
  font-family: 'Instrument Serif', Georgia, serif;
  font-size: 17px; font-weight: 400;
}
.event-sub { margin: 3px 0 0; font-size: 11px; color: rgba(242, 239, 233, 0.5); }
.rsvp {
  flex: none; border: none; border-radius: 999px;
  background: var(--orange); color: #fff;
  font-family: inherit; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em;
  padding: 8px 15px; cursor: pointer;
}

.tabs {
  position: sticky; bottom: 0;
  margin-top: 26px;
  display: flex;
  background: rgba(16, 21, 26, 0.96);
  border-top: 1px solid var(--line);
  padding: 13px 0 calc(13px + env(safe-area-inset-bottom, 0px));
  backdrop-filter: blur(8px);
}
.tab {
  flex: 1;
  background: none; border: none;
  color: rgba(242, 239, 233, 0.45);
  font-family: inherit; font-size: 9.5px; letter-spacing: 0.16em; font-weight: 600;
  cursor: pointer; position: relative; padding: 4px 0;
}
.tab.on { color: #f2efe9; }
.tab.on::after {
  content: '';
  position: absolute; left: 50%; bottom: -5px;
  transform: translateX(-50%);
  width: 20px; height: 1px; background: var(--gold);
}

/* ───────────────────────────────────────────────────────────────
   DESKTOP — the club look scales up well: wider hairline rules, a
   letterspaced top nav, and a 4-up catalogue grid. Keyed off .desktop
   (prop), not @media, so the phone-frame preview stays intact.
   ─────────────────────────────────────────────────────────────── */
.dirC.desktop { padding: 0 0 60px; }
.dirC.desktop .head,
.dirC.desktop .avail,
.dirC.desktop .chips,
.dirC.desktop .rail-head,
.dirC.desktop .grid,
.dirC.desktop .events {
  max-width: 1240px; margin-left: auto; margin-right: auto;
  padding-left: 44px; padding-right: 44px;
}

.topnav {
  display: flex; align-items: center;
  max-width: 1240px; margin: 0 auto;
  padding: 20px 44px;
  border-bottom: 1px solid var(--line);
}
.topnav-brand { font-size: 10px; letter-spacing: 0.24em; color: rgba(242, 239, 233, 0.45); font-weight: 600; }
.topnav-links { display: flex; gap: 30px; margin-left: auto; }
.topnav-link {
  background: none; border: none;
  color: rgba(242, 239, 233, 0.5);
  font-family: inherit; font-size: 10.5px; letter-spacing: 0.18em; font-weight: 600;
  cursor: pointer; padding: 4px 0; position: relative;
  transition: color .15s;
}
.topnav-link:hover { color: #f2efe9; }
.topnav-link.on { color: #f2efe9; }
.topnav-link.on::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: -6px;
  height: 1px; background: var(--gold);
}

.dirC.desktop .head { padding-top: 40px; }
.dirC.desktop .title { font-size: 60px; margin-top: 14px; }
.dirC.desktop .eyebrow { font-size: 10px; }
.dirC.desktop .avail { margin-top: 30px; padding-bottom: 26px; align-items: flex-end; }
.dirC.desktop .avail-big { font-size: 44px; }
.dirC.desktop .avail-big span { font-size: 19px; }
.dirC.desktop .avail-sub { font-size: 13px; }
.dirC.desktop .search { font-size: 11px; padding: 11px 24px; transition: border-color .15s, color .15s; }
.dirC.desktop .search:hover { border-color: var(--gold); color: var(--gold); }

.dirC.desktop .chips { padding-top: 24px; flex-wrap: wrap; overflow: visible; }
.dirC.desktop .chip { font-size: 13px; padding: 9px 18px; transition: border-color .15s, color .15s; }
.dirC.desktop .chip:hover:not(.on) { border-color: rgba(242, 239, 233, 0.4); color: #f2efe9; }

.dirC.desktop .rail-block { margin-top: 44px; }
.dirC.desktop .rail-head { padding-bottom: 18px; }
.dirC.desktop .rail-head h2 { font-size: 11px; letter-spacing: 0.24em; }
.dirC.desktop .see-all { font-size: 13px; }
.dirC.desktop .see-all:hover { color: var(--gold); }

.dirC.desktop .grid {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
}
.dirC.desktop .offer {
  min-height: 240px; padding: 20px 20px 17px;
  transition: border-color .15s ease, transform .15s ease;
}
.dirC.desktop .offer:hover { border-color: var(--gold); transform: translateY(-2px); }
.dirC.desktop .o-value { font-size: 48px; }
.dirC.desktop .o-label { font-size: 11px; }
.dirC.desktop .m-name { font-size: 16px; }

.dirC.desktop .events { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.dirC.desktop .event { padding: 18px 20px; transition: border-color .15s; }
.dirC.desktop .event:hover { border-color: var(--gold); }
.dirC.desktop .event-name { font-size: 21px; }
</style>
