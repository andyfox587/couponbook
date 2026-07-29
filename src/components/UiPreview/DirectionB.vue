<template>
  <!-- 1b — Tear-Off Ticket: stub-and-notch cards, Outfit + Space Mono -->
  <div class="dirB" :class="{ desktop }">
    <nav v-if="desktop" class="topnav">
      <span class="topnav-brand">CHAPEL HILL · CARRBORO</span>
      <div class="topnav-links">
        <button class="topnav-link on" type="button">My Book</button>
        <button class="topnav-link" type="button">Restaurants</button>
        <button class="topnav-link" type="button">Events</button>
        <span class="topnav-avatar">{{ memberInitials }}</span>
      </div>
    </nav>

    <header class="head">
      <p v-if="!desktop" class="eyebrow">CHAPEL HILL · CARRBORO</p>
      <div class="head-row">
        <h1 class="title">Foodies Book</h1>
        <span v-if="!desktop" class="avatar">{{ memberInitials }}</span>
      </div>
    </header>

    <section class="strip">
      <div class="strip-top">
        <p class="strip-label">UNREDEEMED IN YOUR BOOK</p>
        <p class="strip-count">{{ unusedCount }} OF {{ totalCount }} LEFT</p>
      </div>
      <p class="strip-big">
        <strong>{{ unusedCount }}</strong> of {{ totalCount }} deals
      </p>
      <div class="strip-bar"><span :style="{ width: pct + '%' }"></span></div>
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
        <button class="see-all" type="button">SEE ALL</button>
      </div>

      <div class="rail" role="list">
        <article
          v-for="(c, i) in rail.items"
          :key="c.id"
          class="ticket"
          :class="{ green: (ri + i) % 3 === 1 }"
          role="listitem"
          @click="$emit('open', c)"
        >
          <div class="ticket-main">
            <!-- merchant header (Turn 3) — 44px mark, name wraps, never clipped -->
            <div class="m-head">
              <img v-if="c.logo" :src="c.logo" :alt="c.merchant" class="m-logo" />
              <span v-else class="m-logo m-init">{{ c.initials }}</span>
              <span class="m-name">{{ c.merchant }}</span>
            </div>
            <p class="t-value">
              {{ c.value }}<span v-if="isMoney(c)" class="t-off">OFF</span>
            </p>
            <p class="t-label">{{ c.label }}</p>
            <span v-if="c.badge" class="badge">{{ c.badge.text }}</span>
          </div>
          <div class="ticket-stub"><span>REDEEM</span></div>
        </article>
      </div>
    </section>

    <section class="rail-block">
      <div class="rail-head">
        <h2>Events this week</h2>
        <button class="see-all" type="button">SEE ALL</button>
      </div>
      <div class="rail" role="list">
        <article v-for="e in events" :key="e.id" class="event" role="listitem">
          <div class="event-img"></div>
          <div class="event-body">
            <p class="event-meta">{{ e.day }} · {{ e.time }}</p>
            <p class="event-name">{{ e.name }}</p>
            <div class="event-foot">
              <span class="event-sub">{{ e.venue }} · {{ e.price }}</span>
              <button class="rsvp" type="button">RSVP</button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <nav v-if="!desktop" class="tabbar">
      <button class="tab on" type="button">My Book</button>
      <button class="tab" type="button">Restaurants</button>
      <button class="tab" type="button">Events</button>
      <span class="tab-avatar">{{ memberInitials }}</span>
    </nav>
  </div>
</template>

<script>
export default {
  name: 'DirectionB',
  props: {
    rails: { type: Array, default: () => [] },
    chips: { type: Array, default: () => [] },
    activeChip: { type: String, default: 'all' },
    events: { type: Array, default: () => [] },
    unusedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },
    savings: { type: Number, default: 0 },
    memberInitials: { type: String, default: 'AF' },
    desktop: { type: Boolean, default: false },
  },
  emits: ['chip', 'open'],
  computed: {
    pct() {
      if (!this.totalCount) return 0;
      return Math.min(100, Math.round((this.unusedCount / this.totalCount) * 100));
    },
  },
  methods: {
    isMoney(c) {
      return c.type === 'amount' || c.type === 'percent';
    },
  },
};
</script>

<style scoped>
.dirB {
  --ink: #11161c;
  --cream: #f6f1e7;
  --orange: #f2542d;
  --green: #17a077;
  background: var(--ink);
  color: #fff;
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100%;
  padding: 20px 0 92px;
}
.mono, .eyebrow, .strip-label, .strip-count, .see-all, .badge, .event-meta, .t-off {
  font-family: 'Space Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

.head { padding: 0 20px; }
.eyebrow {
  margin: 0 0 6px;
  font-size: 9.5px; letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.5);
}
.head-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.title { margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.015em; }
.avatar {
  flex: none;
  width: 34px; height: 34px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700;
}

.strip {
  margin: 16px 20px 0;
  background: var(--orange);
  border-radius: 14px;
  padding: 13px 15px 15px;
}
.strip-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.strip-label { margin: 0; font-size: 9px; letter-spacing: 0.12em; color: rgba(255, 255, 255, 0.9); }
.strip-count { margin: 0; font-size: 8.5px; letter-spacing: 0.1em; color: rgba(255, 255, 255, 0.8); }
.strip-big { margin: 7px 0 0; font-size: 17px; font-weight: 500; }
.strip-big strong { font-size: 27px; font-weight: 700; margin-right: 3px; }
.strip-bar {
  margin-top: 10px; height: 4px; border-radius: 4px;
  background: rgba(255, 255, 255, 0.3); overflow: hidden;
}
.strip-bar span { display: block; height: 100%; background: #fff; border-radius: 4px; }

.chips {
  display: flex; gap: 8px;
  padding: 16px 20px 2px;
  overflow-x: auto; scrollbar-width: none;
}
.chips::-webkit-scrollbar { display: none; }
.chip {
  flex: none; padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: transparent; color: rgba(255, 255, 255, 0.82);
  font-size: 12.5px; font-weight: 500;
  font-family: inherit; cursor: pointer; white-space: nowrap;
}
.chip.on { background: #fff; color: #11161c; border-color: #fff; font-weight: 600; }

.rail-block { margin-top: 22px; }
.rail-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 20px 10px;
}
.rail-head h2 { margin: 0; font-size: 18px; font-weight: 600; }
.see-all {
  background: none; border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 9.5px; letter-spacing: 0.12em; cursor: pointer;
}

.rail {
  display: flex; gap: 13px;
  padding: 0 20px 4px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.rail::-webkit-scrollbar { display: none; }

/* Ticket: main body + tear-off stub, joined by a perforation with notches */
.ticket {
  flex: none;
  width: 250px; min-height: 186px;
  scroll-snap-align: start;
  display: flex;
  background: var(--cream);
  color: #12181f;
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}
.ticket.green { background: var(--green); color: #fff; }

.ticket-main { flex: 1; padding: 11px 12px 10px; display: flex; flex-direction: column; min-width: 0; }

.ticket-stub {
  flex: none; width: 40px;
  border-left: 2px dashed rgba(0, 0, 0, 0.22);
  display: flex; align-items: center; justify-content: center;
}
.ticket.green .ticket-stub { border-left-color: rgba(255, 255, 255, 0.4); }
.ticket-stub span {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-family: 'Space Mono', monospace;
  font-size: 9.5px; letter-spacing: 0.22em;
  opacity: 0.75;
}

/* notches punched out of the perforation line, top and bottom */
.ticket::before, .ticket::after {
  content: '';
  position: absolute;
  right: 40px;
  width: 14px; height: 14px;
  margin-right: -8px;
  border-radius: 50%;
  background: var(--ink);
}
.ticket::before { top: -7px; }
.ticket::after { bottom: -7px; }

/* merchant header — leads the ticket */
.m-head {
  display: flex; align-items: center; gap: 9px;
  margin-bottom: 11px;
  min-width: 0;
}
.m-logo, .m-init {
  width: 44px; height: 44px; flex: none;
  border-radius: 11px; background: #fff; object-fit: contain; padding: 2px;
  display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; color: #12181f;
}
.m-name {
  font-size: 15px; font-weight: 700; line-height: 1.18;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden; overflow-wrap: break-word;
}

.badge {
  align-self: flex-start;
  margin-top: auto;
  font-size: 8px; letter-spacing: 0.1em;
  padding: 4px 6px; border-radius: 4px;
  background: var(--orange); color: #fff;
}
.ticket.green .badge { background: rgba(0, 0, 0, 0.25); }

.t-value { margin: 0; font-size: 33px; line-height: 1; font-weight: 700; letter-spacing: -0.03em; }
.t-off { font-size: 12px; letter-spacing: 0.06em; margin-left: 5px; opacity: 0.75; }
.t-label { margin: 4px 0 9px; font-size: 11.5px; font-weight: 500; opacity: 0.85; }

.event {
  flex: none; width: 215px;
  scroll-snap-align: start;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px; overflow: hidden;
}
.event-img {
  height: 72px;
  background: repeating-linear-gradient(115deg, #2b333d 0 9px, #242c35 9px 18px);
}
.event-body { padding: 10px 12px 12px; }
.event-meta { margin: 0; font-size: 9px; letter-spacing: 0.11em; color: rgba(255, 255, 255, 0.5); }
.event-name { margin: 5px 0 0; font-size: 14.5px; font-weight: 600; }
.event-foot { margin-top: 9px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.event-sub { font-size: 11px; color: rgba(255, 255, 255, 0.55); }
.rsvp {
  border: none; border-radius: 999px;
  background: rgba(255, 255, 255, 0.14); color: #fff;
  font-family: inherit; font-size: 11px; font-weight: 600;
  padding: 5px 13px; cursor: pointer;
}

.tabbar {
  position: sticky; bottom: 0;
  margin: 26px 20px 0;
  display: flex; align-items: center; gap: 10px;
  background: rgba(20, 26, 33, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 7px;
  backdrop-filter: blur(8px);
}
.tab {
  border: none; border-radius: 999px;
  background: transparent; color: rgba(255, 255, 255, 0.6);
  font-family: inherit; font-size: 13px; font-weight: 600;
  padding: 9px 16px; cursor: pointer;
}
.tab.on { flex: 1; background: var(--orange); color: #fff; }
.tab-avatar {
  margin-left: auto; flex: none;
  width: 30px; height: 30px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700;
}

/* ───────────────────────────────────────────────────────────────
   DESKTOP — top nav replaces the floating pill bar, the unredeemed
   strip becomes a full-width banner, and tickets tile into a grid so
   the whole book reads at once. Keyed off .desktop (prop), not @media.
   ─────────────────────────────────────────────────────────────── */
.dirB.desktop { padding: 0 0 60px; }
.dirB.desktop .head,
.dirB.desktop .strip,
.dirB.desktop .chips,
.dirB.desktop .rail-head,
.dirB.desktop .rail {
  max-width: 1280px; margin-left: auto; margin-right: auto;
  padding-left: 40px; padding-right: 40px;
}

.topnav {
  display: flex; align-items: center;
  max-width: 1280px; margin: 0 auto;
  padding: 18px 40px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.topnav-brand {
  font-family: 'Space Mono', monospace;
  font-size: 10.5px; letter-spacing: 0.16em; color: rgba(255, 255, 255, 0.5);
}
.topnav-links { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.topnav-link {
  background: none; border: none; border-radius: 999px;
  color: rgba(255, 255, 255, 0.6);
  font-family: inherit; font-size: 14px; font-weight: 500;
  padding: 8px 16px; cursor: pointer;
  transition: color .15s, background .15s;
}
.topnav-link:hover { color: #fff; background: rgba(255, 255, 255, 0.07); }
.topnav-link.on { background: var(--orange); color: #fff; font-weight: 600; }
.topnav-avatar {
  margin-left: 10px;
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700;
}

.dirB.desktop .head { padding-top: 30px; }
.dirB.desktop .title { font-size: 46px; }
.dirB.desktop .strip {
  margin-top: 22px; padding-top: 20px; padding-bottom: 22px;
  border-radius: 16px;
}
.dirB.desktop .strip-big { font-size: 22px; }
.dirB.desktop .strip-big strong { font-size: 36px; }
.dirB.desktop .strip-label,
.dirB.desktop .strip-count { font-size: 10.5px; }

.dirB.desktop .chips { padding-top: 24px; flex-wrap: wrap; overflow: visible; }
.dirB.desktop .chip { font-size: 14px; padding: 9px 17px; transition: background .15s, color .15s; }
.dirB.desktop .chip:hover:not(.on) { background: rgba(255, 255, 255, 0.1); color: #fff; }

.dirB.desktop .rail-block { margin-top: 40px; }
.dirB.desktop .rail-head { padding-bottom: 16px; }
.dirB.desktop .rail-head h2 { font-size: 25px; }
.dirB.desktop .see-all { font-size: 11px; }
.dirB.desktop .see-all:hover { color: #fff; }

.dirB.desktop .rail {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 20px;
  overflow: visible;
}
.dirB.desktop .ticket {
  width: auto; min-height: 200px;
  transition: transform .15s ease, box-shadow .15s ease;
}
.dirB.desktop .ticket:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.45);
}
.dirB.desktop .ticket-main { padding: 16px 18px 15px; }
.dirB.desktop .ticket-stub { width: 52px; }
.dirB.desktop .ticket::before,
.dirB.desktop .ticket::after { right: 52px; }
.dirB.desktop .t-value { font-size: 44px; }
.dirB.desktop .t-label { font-size: 13px; }
.dirB.desktop .m-name { font-size: 16px; }

.dirB.desktop .event { width: auto; }
.dirB.desktop .event-img { height: 120px; }
.dirB.desktop .event-name { font-size: 17px; }
</style>
