<!-- src/views/Home.vue
     The Foodies Coupon Book cover / front page (Claude Design "4b — Two paths").
     Full-bleed food hero with two CTAs: open the book (members) or join the
     group (newcomers). Counts + group name/link come from real data; the hero
     photo is a swappable placeholder. -->
<template>
  <div class="foodie-cover">
    <section class="cover-hero" :style="heroStyle">
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
          <router-link class="cover-btn outline" :to="joinTo">Join the group</router-link>
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

        // Dominant group → its name (badge) + id (join link).
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

.cover-hero {
  position: relative;
  min-height: calc(100vh - 70px);
  background-color: #0f151c;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 22px 64px;
}

/* Directional scrim (not a flat grey box) so the headline stays legible on
   the dark side of the photo. */
.cover-scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(10, 14, 19, 0.55) 0%, rgba(10, 14, 19, 0.35) 42%, rgba(10, 14, 19, 0.9) 100%),
    radial-gradient(120% 90% at 50% 40%, rgba(10, 14, 19, 0.15) 0%, rgba(10, 14, 19, 0.6) 100%);
}

.cover-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 720px;
  text-align: center;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cover-badge {
  display: inline-block;
  padding: 6px 15px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(2px);
}

.cover-title {
  margin: 20px 0 0;
  font-size: 56px;
  line-height: 1.02;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #f4eee4;
  max-width: 15ch;
}

.cover-powered {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 18px;
}
.cover-powered-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.7);
}
.cover-logo {
  height: 22px;
  width: auto;
  object-fit: contain;
}

.cover-sub {
  margin: 20px 0 0;
  max-width: 30rem;
  font-size: 18px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.85);
}

.cover-ctas {
  display: flex;
  gap: 14px;
  margin-top: 28px;
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
  box-shadow: 0 12px 30px rgba(242, 84, 45, 0.35);
}
.cover-btn.primary:hover {
  background: #e04a25;
  transform: translateY(-2px);
}
.cover-btn.outline {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  border: 1.5px solid rgba(255, 255, 255, 0.55);
}
.cover-btn.outline:hover {
  background: rgba(255, 255, 255, 0.14);
  transform: translateY(-2px);
}

.cover-foot {
  margin: 18px 0 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.6);
}

/* Mobile: tighter type, full-width stacked buttons */
@media (max-width: 640px) {
  .cover-hero {
    min-height: calc(100vh - 60px);
    padding: 40px 20px 52px;
  }
  .cover-title {
    font-size: 36px;
  }
  .cover-sub {
    font-size: 16px;
  }
  .cover-ctas {
    flex-direction: column;
    align-self: stretch;
    gap: 12px;
  }
  .cover-btn {
    width: 100%;
  }
}
</style>
