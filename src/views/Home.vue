<!-- src/views/Home.vue
     The Foodies Coupon Book cover / front page (Claude Design "4b — Two paths").
     Desktop: full-bleed food hero, centered content over a directional scrim.
     Mobile: photo banner on top, left-aligned content below on dark, buttons
     stacked. Counts + group name/link come from real data; hero photo is a
     swappable placeholder. -->
<template>
  <div class="foodie-cover">
    <section class="cover-hero">
      <div class="cover-photo" :style="heroStyle"></div>
      <div class="cover-scrim"></div>

      <div class="cover-content">
        <span class="cover-badge">{{ groupBadge }}</span>

        <h1 class="cover-title">Welcome to the Foodies Coupon Book</h1>

        <div class="cover-powered">
          <span class="cover-powered-label">POWERED BY</span>
          <img :src="logo" alt="VivaSpot" class="cover-logo" />
        </div>

        <p class="cover-sub">{{ subcopy }}</p>

        <div class="cover-ctas">
          <router-link class="cover-btn primary" to="/coupon-book">Open my coupon book</router-link>
          <router-link class="cover-btn outline" :to="joinTo">Get the Book</router-link>
        </div>

        <p class="cover-foot">Already a member? Your book is waiting · No card required</p>
      </div>
    </section>
  </div>
</template>

<script>
import logo from '@/assets/logo.png';

// Swappable placeholder hero photo (the design used stock food shots until
// real photography is ready).
const HERO_PHOTO =
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=75';
const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=Outfit:wght@400;500;600;700&display=swap';

export default {
  name: 'AppHome',
  data() {
    return {
      logo,
      heroPhoto: HERO_PHOTO,
      dealCount: null,
      restaurantCount: null,
      groupName: '',
      groupId: null,
    };
  },
  computed: {
    groupBadge() {
      return (this.groupName || 'Chapel Hill Carrboro Foodies').toUpperCase();
    },
    subcopy() {
      if (this.dealCount != null && this.restaurantCount != null) {
        const deals = `${this.dealCount} deal${this.dealCount === 1 ? '' : 's'}`;
        const kitchens = `${this.restaurantCount} neighborhood kitchen${this.restaurantCount === 1 ? '' : 's'}`;
        return `${deals} at ${kitchens}, plus tastings and classes. Free for members of the group.`;
      }
      return 'Local restaurant deals, plus tastings and classes. Free for members of the group.';
    },
    joinTo() {
      return this.groupId
        ? { name: 'FoodieGroupView', params: { id: this.groupId } }
        : '/foodie-groups';
    },
    heroStyle() {
      return { backgroundImage: `url("${this.heroPhoto}")` };
    },
  },
  mounted() {
    this.loadFonts();
    this.fetchData();
  },
  methods: {
    loadFonts() {
      if (typeof document === 'undefined' || document.getElementById('coupon-book-fonts')) return;
      const link = document.createElement('link');
      link.id = 'coupon-book-fonts';
      link.rel = 'stylesheet';
      link.href = FONTS;
      document.head.appendChild(link);
    },

    async fetchData() {
      try {
        const res = await fetch('/api/v1/coupons');
        if (!res.ok) return;
        const all = await res.json();
        const now = Date.now();
        const live = all.filter((c) => {
          if (!c.expires_at) return true;
          const exp = new Date(String(c.expires_at).replace(' ', 'T')).getTime();
          return Number.isNaN(exp) || exp >= now;
        });
        this.dealCount = live.length;
        this.restaurantCount = new Set(
          live.map((c) => c.merchant_id || c.merchant_name).filter(Boolean),
        ).size;

        const counts = {};
        for (const c of live) {
          if (c.foodie_group_id) counts[c.foodie_group_id] = (counts[c.foodie_group_id] || 0) + 1;
        }
        const topId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        if (topId) {
          this.groupId = topId;
          this.fetchGroup(topId);
        }
      } catch (e) {
        /* best-effort — the cover still renders with fallback copy */
      }
    },

    async fetchGroup(id) {
      try {
        const res = await fetch(`/api/v1/groups/${id}`);
        if (!res.ok) return;
        const g = await res.json();
        if (g && g.name) this.groupName = g.name;
      } catch (e) {
        /* fallback badge is fine */
      }
    },
  },
};
</script>

<style scoped>
.foodie-cover {
  font-family: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0f151c;
}

/* ── Desktop / default: full-bleed photo, centered content over a scrim ── */
.cover-hero {
  position: relative;
  min-height: calc(100vh - 72px);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #0f151c;
  padding: 56px 24px 72px;
}
.cover-photo {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
}
/* Directional scrim: darker toward the center-where-text-sits and the bottom,
   lighter across the middle so the food photo stays vivid (not a flat box). */
.cover-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(9, 13, 18, 0.45) 0%, rgba(9, 13, 18, 0.26) 38%, rgba(9, 13, 18, 0.82) 100%),
    radial-gradient(78% 66% at 50% 46%, rgba(9, 13, 18, 0.5) 0%, rgba(9, 13, 18, 0.14) 72%);
}

.cover-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 760px;
  text-align: center;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cover-badge {
  display: inline-block;
  padding: 6px 16px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(2px);
}

.cover-title {
  margin: 22px 0 0;
  font-size: clamp(40px, 6.2vw, 74px);
  line-height: 0.98;
  font-weight: 800;
  letter-spacing: -0.025em;
  color: #f4eee4;
  max-width: 16ch;
  text-shadow: 0 2px 30px rgba(0, 0, 0, 0.45);
}

.cover-powered {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}
.cover-powered-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: rgba(255, 255, 255, 0.72);
}
.cover-logo {
  height: 24px;
  width: auto;
  object-fit: contain;
}

.cover-sub {
  margin: 20px 0 0;
  max-width: 32rem;
  font-size: 18px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.88);
  text-shadow: 0 1px 16px rgba(0, 0, 0, 0.4);
}

.cover-ctas {
  display: flex;
  gap: 14px;
  margin-top: 30px;
  flex-wrap: wrap;
  justify-content: center;
}
.cover-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 15px 30px;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.cover-btn.primary {
  background: #f2542d;
  color: #fff;
  box-shadow: 0 14px 34px rgba(242, 84, 45, 0.4);
}
.cover-btn.primary:hover {
  background: #e04a25;
  transform: translateY(-2px);
}
.cover-btn.outline {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border: 1.5px solid rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(2px);
}
.cover-btn.outline:hover {
  background: rgba(255, 255, 255, 0.16);
  transform: translateY(-2px);
}

.cover-foot {
  margin: 20px 0 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.62);
}

/* ── Mobile: photo banner on top, left-aligned content below, stacked CTAs ── */
@media (max-width: 640px) {
  .cover-hero {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    min-height: 0;
    padding: 0;
  }
  .cover-photo {
    position: relative;
    inset: auto;
    width: 100%;
    height: 264px;
    flex: none;
  }
  /* fade the photo into the dark content below */
  .cover-photo::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 72px;
    background: linear-gradient(rgba(15, 21, 28, 0), #0f151c);
  }
  .cover-scrim {
    display: none;
  }
  .cover-content {
    max-width: none;
    text-align: left;
    align-items: flex-start;
    padding: 22px 22px 40px;
  }
  .cover-title {
    margin-top: 14px;
    font-size: 34px;
    line-height: 1.03;
    max-width: none;
    text-shadow: none;
  }
  .cover-powered {
    justify-content: flex-start;
    margin-top: 16px;
  }
  .cover-sub {
    margin-top: 16px;
    font-size: 15.5px;
    text-shadow: none;
  }
  .cover-ctas {
    margin-top: 22px;
    flex-direction: column;
    align-self: stretch;
    gap: 12px;
  }
  .cover-btn {
    width: 100%;
  }
  .cover-foot {
    align-self: center;
    text-align: center;
    margin-top: 18px;
  }
}
</style>
