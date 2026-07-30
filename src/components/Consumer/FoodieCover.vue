<!-- src/components/Consumer/FoodieCover.vue
     The Foodies Coupon Book cover (Claude Design "4b — Two paths"), made
     group-aware:
       • no groupId  → NEUTRAL front door (generic welcome, no group badge or
         area counts, "Find your group" CTA). Shown to non-members on /.
       • groupId set → that group's badge + that group's per-group counts, with
         a member/non-member CTA. Shown on the group page and on a member's home.
     Desktop: full-bleed photo, centered content. Mobile: photo banner + left-
     aligned content below. -->
<template>
  <section class="cover-hero" :class="{ neutral: !groupId }">
    <div class="cover-photo" :style="heroStyle"></div>
    <div class="cover-scrim"></div>

    <div class="cover-content">
      <span class="cover-badge">{{ badge }}</span>

      <h1 class="cover-title">Welcome to the Foodies Coupon Book</h1>

      <div class="cover-powered">
        <span class="cover-powered-label">POWERED BY</span>
        <img :src="logo" alt="VivaSpot" class="cover-logo" />
      </div>

      <p class="cover-sub">{{ subcopy }}</p>

      <div class="cover-ctas">
        <router-link
          v-if="primary.to"
          class="cover-btn primary"
          :to="primary.to"
        >{{ primary.label }}</router-link>
        <button
          v-else
          type="button"
          class="cover-btn primary"
          @click="$emit('get-book')"
        >{{ primary.label }}</button>

        <router-link
          v-if="secondary"
          class="cover-btn outline"
          :to="secondary.to"
        >{{ secondary.label }}</router-link>
      </div>

      <p class="cover-foot">{{ footer }}</p>
    </div>
  </section>
</template>

<script>
import logo from '@/assets/logo.png';

const HERO_PHOTO =
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=75';
const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=Outfit:wght@400;500;600;700&display=swap';

export default {
  name: 'FoodieCover',
  props: {
    // The group this cover represents. null = neutral front door.
    groupId: { type: String, default: null },
    // Whether the viewer already owns this group's book.
    isMember: { type: Boolean, default: false },
    // Where it's rendered — decides the non-member primary CTA.
    // 'home'  → link to the group page to join
    // 'group' → emit 'get-book' so the group page can start its purchase flow
    context: { type: String, default: 'home' },
  },
  emits: ['get-book'],
  data() {
    return {
      logo,
      heroPhoto: HERO_PHOTO,
      groupName: '',
      dealCount: null,
      restaurantCount: null,
    };
  },
  computed: {
    badge() {
      return this.groupId
        ? (this.groupName || 'Your foodie group').toUpperCase()
        : 'LOCAL FOODIE DEALS';
    },
    subcopy() {
      if (this.groupId && this.dealCount != null && this.restaurantCount != null) {
        const deals = `${this.dealCount} deal${this.dealCount === 1 ? '' : 's'}`;
        const kitchens = `${this.restaurantCount} neighborhood kitchen${this.restaurantCount === 1 ? '' : 's'}`;
        return `${deals} at ${kitchens}, plus tastings and classes. Free for members of the group.`;
      }
      if (this.groupId) {
        return 'Local restaurant deals, plus tastings and classes. Free for members of the group.';
      }
      return 'Exclusive deals at neighborhood kitchens, plus tastings and classes. Join a foodie group to unlock your book — free.';
    },
    primary() {
      if (this.isMember) return { label: 'Open my coupon book', to: '/coupon-book' };
      if (this.groupId) {
        // Non-member looking at a specific group.
        return this.context === 'group'
          ? { label: 'Get the Book', to: null } // emits get-book → parent purchase flow
          : { label: 'Get the Book', to: { name: 'FoodieGroupView', params: { id: this.groupId } } };
      }
      // Neutral front door.
      return { label: 'Find your group', to: '/foodie-groups' };
    },
    secondary() {
      if (this.isMember) return { label: 'Browse events', to: '/events' };
      return { label: 'Browse the deals', to: '/coupon-book' };
    },
    footer() {
      if (this.isMember) return 'Your book is waiting · No card required';
      return 'No card required · redeem at the counter';
    },
    heroStyle() {
      return { backgroundImage: `url("${this.heroPhoto}")` };
    },
  },
  watch: {
    groupId: {
      immediate: true,
      handler(id) {
        if (id) this.fetchGroupData(id);
        else {
          this.groupName = '';
          this.dealCount = null;
          this.restaurantCount = null;
        }
      },
    },
  },
  mounted() {
    this.loadFonts();
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

    async fetchGroupData(id) {
      // Group name
      try {
        const res = await fetch(`/api/v1/groups/${id}`);
        if (res.ok) {
          const g = await res.json();
          if (g && g.name) this.groupName = g.name;
        }
      } catch (e) {
        /* fallback badge is fine */
      }
      // Per-group counts (this group's live coupons + distinct restaurants)
      try {
        const res = await fetch('/api/v1/coupons');
        if (!res.ok) return;
        const all = await res.json();
        const now = Date.now();
        const mine = all.filter((c) => {
          if (c.foodie_group_id !== id) return false;
          if (!c.expires_at) return true;
          const exp = new Date(String(c.expires_at).replace(' ', 'T')).getTime();
          return Number.isNaN(exp) || exp >= now;
        });
        this.dealCount = mine.length;
        this.restaurantCount = new Set(
          mine.map((c) => c.merchant_id || c.merchant_name).filter(Boolean),
        ).size;
      } catch (e) {
        /* counts are best-effort */
      }
    },
  },
};
</script>

<style scoped>
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
  font-family: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.cover-photo {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
}
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
  max-width: 34rem;
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
  cursor: pointer;
  font-family: inherit;
  transition: transform 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.cover-btn.primary {
  background: #f2542d;
  color: #fff;
  border: none;
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
