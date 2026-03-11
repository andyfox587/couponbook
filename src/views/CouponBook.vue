<!-- src/views/CouponBook.vue -->
<template>
  <div class="coupon-book-view">
  
    <div class="content-wrapper">
      <!-- Sidebar Filters Container for Layout -->
      <div class="sidebar-filters-container">
        <SidebarFilters 
          :availableCuisines="availableCuisines"
          @filter-changed="updateFilters" 
        />
      </div>

      <!-- Main Content Area -->
      <div class="coupons-content">
        <h1>Vivaspot Community Coupons</h1>
        <p class="banner-description">
          Welcome to Vivaspot Community Coupons – your ultimate destination for exclusive savings from local merchants. 
          Whether you're looking for the latest foodie group deals or independent offers, explore a world of discounts and local flavor all in one place!
        </p>
        <!-- Active Filter Tags -->
        <div class="active-filter-tags">
          <span 
            v-if="filters.keyword" 
            class="filter-tag"
            @click="removeFilter('keyword')">
            Search: {{ filters.keyword }} &times;
          </span>
          <span 
            v-if="filters.activeOnly" 
            class="filter-tag"
            @click="removeFilter('activeOnly')">
            Active Only &times;
          </span>
          <span 
            v-if="filters.couponType" 
            class="filter-tag"
            @click="removeFilter('couponType')">
            Type: {{ filters.couponType }} &times;
          </span>
          <span 
            v-if="filters.cuisineType" 
            class="filter-tag"
            @click="removeFilter('cuisineType')">
            Cuisine: {{ filters.cuisineType }} &times;
          </span>
        </div>

        <!-- Loading / Error States -->
        <p v-if="loading">Loading coupons…</p>
        <p v-else-if="error" class="error">⚠️ {{ error }}</p>

        <!-- Coupon List -->
        <CouponList
          v-else
          :coupons="filteredCoupons"
          :purchasedGroupIds="purchasedGroupIds"
          :isAuthenticated="isAuthenticated"
          :forceGoToGroupForFoodieGroupCoupons="true"
          @redeem="handleRedeem"
        />
      </div>
    </div>
  </div>
</template>

<script>
import CouponList from '@/components/Coupons/CouponList.vue';
import SidebarFilters from '@/components/Coupons/SidebarFilters.vue';
import { mapGetters } from 'vuex';
import { getAccessToken } from '@/services/authService';
import { ensureCouponsHaveCuisine, assembleSearchableText } from '@/utils/helpers';

const getCouponSortPriority = (coupon, now = new Date()) => {
  // 1: Redeem (not expired, not redeemed)
  // 2: Redeemed
  // 3: Expired OR Not yet valid (end)

  if (coupon.redeemed_by_user) return 2;

  if (coupon.expires_at) {
    const expiresAt = new Date(coupon.expires_at);
    if (expiresAt < now) return 3;
  }

  if (coupon.valid_from) {
    const validFrom = new Date(coupon.valid_from);
    if (validFrom > now) return 3;
  }

  return 1;
};

export default {
  name: "CouponBookView",
  components: { CouponList, SidebarFilters },
  data() {
    return {
      coupons: [],
      loading: true,
      error: null,
      filters: {
        keyword: "",
        activeOnly: false,
        couponType: "",
        cuisineType: ""
      },
      purchasedGroupIds: [],
      loadingPurchases: false
    };
  },
  mounted() {
    this.fetchCoupons();
    // If already authenticated on load, fetch purchases and redemptions
    if (this.isAuthenticated) {
      this.loadMyGroupPurchases();
      this.fetchRedemptionsMe();
    }
    window.addEventListener('message', this.onCouponRedeemedMessage);
  },

  beforeUnmount() {
    window.removeEventListener('message', this.onCouponRedeemedMessage);
  },

  watch: {
    // When user logs in, load their purchases
    isAuthenticated(newVal, oldVal) {
      if (newVal && !oldVal) {
        this.loadMyGroupPurchases();
        this.fetchRedemptionsMe();
      } else if (!newVal) {
        this.purchasedGroupIds = [];
        // Reset redeemed status if they log out
        this.coupons = this.coupons.map(c => ({ ...c, redeemed_by_user: false }));
      }
    }
  },

  methods: {
    async fetchCoupons() {
      try {
        const res = await fetch('/api/v1/coupons');
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        const rawCoupons = await res.json();
        const baseCoupons = ensureCouponsHaveCuisine(rawCoupons);
        this.coupons = baseCoupons.map(c => ({ ...c, redeemed_by_user: false }));

        if (this.isAuthenticated) {
          this.fetchRedemptionsMe();
        }
      } catch (err) {
        console.error("Failed to load coupons", err);
        this.error = "Could not load coupons. " + err.message;
      } finally {
        this.loading = false;
      }
    },

    async fetchRedemptionsMe() {
      try {
        const token = await getAccessToken();
        if (!token) return;

        const res = await fetch('/api/v1/coupons/redemptions/me', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!res.ok) {
          console.warn('[CouponBook] redemptions/me failed', res.status);
          return;
        }

        const rows = await res.json();
        rows.forEach(r => {
          this._markRedeemed(r.couponId, true, r.redeemedAt || new Date().toISOString());
        });
      } catch (e) {
        console.error('[CouponBook] failed to hydrate redemptions', e);
      }
    },

    onCouponRedeemedMessage(event) {
      const data = event && event.data;
      if (!data || data.type !== 'coupon-redeemed') return;

      const couponId = data.couponId;
      const redeemedAt = data.redeemedAt || new Date().toISOString();
      if (!couponId) return;

      console.log('[CouponBook] received coupon-redeemed message for', couponId);
      this._markRedeemed(couponId, true, redeemedAt);
    },

    _markRedeemed(couponId, isRedeemed = true, redeemedAt = new Date().toISOString()) {
      const idx = this.coupons.findIndex(c => String(c.id) === String(couponId));
      if (idx === -1) return;

      const updated = {
        ...this.coupons[idx],
        redeemed_by_user: isRedeemed,
        redeemed_at: redeemedAt,
      };
      this.coupons.splice(idx, 1, updated);
    },

    async loadMyGroupPurchases() {
      this.loadingPurchases = true;
      try {
        const token = await getAccessToken();
        if (!token) return;

        const res = await fetch('/api/v1/groups/my/purchases', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          console.error('Failed to load my group purchases', res.status, res.statusText);
          return;
        }

        const purchases = await res.json();
        const now = new Date();

        // Active coupon books: status === 'paid' and not expired
        const activeGroupIds = (Array.isArray(purchases) ? purchases : [])
          .filter((p) => {
            if (p.status !== 'paid') return false;
            if (!p.expiresAt) return true;
            const exp = new Date(p.expiresAt);
            if (Number.isNaN(exp.getTime())) return true;
            return exp >= now;
          })
          .map((p) => p.groupId);

        this.purchasedGroupIds = activeGroupIds;
      } catch (err) {
        console.error('Error loading my group purchases', err);
      } finally {
        this.loadingPurchases = false;
      }
    },

    handleRedeem(coupon) {
      if (!this.isAuthenticated) {
        alert('Please sign in to redeem coupons.');
        return;
      }

      const route = this.$router.resolve({
        name: 'CouponRedeemPopup',
        params: { id: coupon.id }
      });

      const url = route && route.href ? route.href : `/coupon-redeem/${coupon.id}`;

      window.open(
        url,
        'coupon-redeem',
        'width=520,height=720,noopener,noreferrer'
      );
    },

    updateFilters(newFilters) {
      this.filters = newFilters;
    },

    removeFilter(key) {
      if (typeof this.filters[key] === "boolean") {
        this.filters[key] = false;
      } else {
        this.filters[key] = "";
      }
    }
  },

  computed: {
    ...mapGetters('auth', ['isAuthenticated']),

    /**
     * Derive available cuisine types from loaded coupons.
     * This makes the cuisine filter data-driven.
     */
    availableCuisines() {
      const cuisineSet = new Set();
      for (const c of this.coupons) {
        const cuisine = c.cuisine_type || c.cuisineType;
        if (cuisine && typeof cuisine === 'string' && cuisine.trim()) {
          cuisineSet.add(cuisine.trim());
        }
      }
      // Sort alphabetically and return as array of { value, label }
      return Array.from(cuisineSet)
        .sort((a, b) => a.localeCompare(b))
        .map(c => ({ value: c, label: c }));
    },

    filteredCoupons() {
      let filtered = this.coupons;

      // 🔒 Global rule: hide coupons expired ≥ 30 days ago
      const now = new Date();
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

      filtered = filtered.filter(c => {
        // if expires_at is missing, keep it (safety)
        if (!c.expires_at) return true;

        const expiresAt = new Date(c.expires_at);
        const diffMs = now.getTime() - expiresAt.getTime();

        // keep coupons that are not yet expired OR expired less than 30 days ago
        return diffMs < THIRTY_DAYS_MS;
      });

      // "My Coupons" mode: only show coupons from purchased groups
      if (this.$route.query.my === '1') {
        filtered = filtered.filter(c => 
          this.purchasedGroupIds.includes(c.foodie_group_id)
        );
      }

      // Keyword search across merchant, title, description, foodie group, cuisine, coupon type
      if (this.filters.keyword) {
        const keyword = this.filters.keyword.toLowerCase().trim();
        filtered = filtered.filter(c => {
          const searchText = assembleSearchableText(c);
          return searchText.includes(keyword);
        });
      }

      if (this.filters.activeOnly) {
        const nowInner = new Date();
        filtered = filtered.filter(c => {
          const validFrom = c.valid_from ? new Date(c.valid_from) : null;
          const expiresAt = c.expires_at ? new Date(c.expires_at) : null;

          if (validFrom && validFrom > nowInner) return false;
          if (expiresAt && expiresAt <= nowInner) return false;
          return true;
        });
      }

      if (this.filters.couponType) {
        filtered = filtered.filter(c => c.coupon_type === this.filters.couponType);
      }

      if (this.filters.cuisineType) {
        filtered = filtered.filter(c =>
          c.cuisine_type &&
          c.cuisine_type.toLowerCase() === this.filters.cuisineType.toLowerCase()
        );
      }

      const nowForSort = new Date();
      filtered.sort(
        (a, b) => getCouponSortPriority(a, nowForSort) - getCouponSortPriority(b, nowForSort)
      );

      return filtered;
    }
  }
};
</script>

<style scoped>
.coupon-book-view {
  padding: var(--spacing-2xl);
  color: var(--color-text-primary);
}

h1 {
  text-align: center;
  margin-bottom: var(--spacing-sm);
  font-size: var(--font-size-5xl);
  color: var(--color-text-primary);
}

/* Banner Description */
.banner-description {
  font-size: var(--font-size-lg);
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-2xl);
  text-align: center;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
  line-height: var(--line-height-normal);
}

/* Content Layout */
.content-wrapper {
  display: flex;
  gap: var(--spacing-2xl);
  margin: 0 auto;
}

/* Sidebar Filters Positioning */
.sidebar-filters-container {
  flex: 0 0 250px;
}

/* Main Content Area */
.coupons-content {
  flex: 1;
}

/* Active Filter Tags */
.active-filter-tags {
  margin-bottom: var(--spacing-lg);
}

.filter-tag {
  display: inline-block;
  background-color: var(--color-info);
  color: var(--color-text-on-info);
  padding: var(--spacing-xs) var(--spacing-md);
  margin: var(--spacing-xs);
  border-radius: var(--radius-full);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: background-color var(--transition-slow);
}

.filter-tag:hover {
  background-color: var(--color-info-hover);
  color: var(--color-text-on-info);
}

/* Fixed sidebar on larger screens */
@media (min-width: 769px) {
  .sidebar-filters-container {
    position: fixed;
    top: 300px;
    left: var(--spacing-xl);
    width: 250px;
  }

  .content-wrapper {
    margin-left: 290px; /* sidebar width + gap */
  }
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .coupon-book-view {
    padding: var(--spacing-md) var(--spacing-sm);
  }

  .content-wrapper {
    flex-direction: column;
    gap: 0; /* Remove gap, use component margins instead */
  }

  .sidebar-filters-container {
    position: relative;
    width: 100%;
    margin-bottom: var(--spacing-sm);
    flex: none; /* Reset flex-basis to prevent fixed height in column layout */
  }
  
  .coupons-content h1 {
    margin-top: var(--spacing-sm);
  }
}

.loading {
  color: var(--color-text-secondary);
  text-align: center;
  padding: var(--spacing-xl);
}

.error {
  color: var(--color-error);
  text-align: center;
  padding: var(--spacing-xl);
  background: var(--color-error-light);
  background: rgba(176, 0, 32, 0.1);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(176, 0, 32, 0.15);
}
</style>
