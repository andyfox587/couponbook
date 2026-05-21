<!-- src/views/FoodieGroupList.vue -->
<template>
  <div class="foodie-group-list">
    <h1>Available Foodie Groups</h1>

    <!-- Loading / Error States -->
    <p v-if="loading">Loading groups…</p>
    <p v-else-if="error" class="error">⚠️ {{ error }}</p>

    <!-- Groups Grid -->
    <div v-else class="group-list-container">
      <div
        v-for="group in groups"
        :key="group.id"
        class="group-card"
        :class="{ 'group-card--joined': hasActiveCouponBook(group.id) }"
      >
        <div class="card-content">
          <!-- Joined badge -->
          <div
            v-if="hasActiveCouponBook(group.id)"
            class="badge-joined"
          >
            Joined · Coupon Book Active
          </div>

          <h2>{{ group.name }}</h2>
          <p>{{ group.description }}</p>
          <p class="location" v-if="group.location">
            Location: {{ group.location }}
          </p>
        </div>

        <router-link
          :to="{ name: 'FoodieGroupView', params: { id: group.id } }"
          class="btn"
        >
          View Group
        </router-link>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import { getAccessToken } from '@/services/authService';

export default {
  name: 'FoodieGroupList',

  data() {
    return {
      groups: [],              // API data
      loading: true,
      error: null,

      // For highlighting joined / purchased groups
      purchasedGroupIds: [],
      loadingPurchases: false,
    };
  },

  computed: {
    ...mapGetters('auth', ['isAuthenticated']),
  },

  watch: {
    // If user logs in while on this page, pull their purchases
    isAuthenticated(newVal, oldVal) {
      if (newVal && !oldVal) {
        this.loadMyGroupPurchases();
      } else if (!newVal) {
        this.purchasedGroupIds = [];
      }
    },
  },

  async mounted() {
    await this.loadGroups();

    // If already logged in, immediately load purchases
    if (this.isAuthenticated) {
      this.loadMyGroupPurchases();
    }
  },

  methods: {
    async loadGroups() {
      this.loading = true;
      this.error = null;
      try {
        const res = await fetch('/api/v1/groups');
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        this.groups = await res.json();
      } catch (err) {
        console.error('Failed to load groups', err);
        this.error = 'Could not load groups. ' + err.message;
      } finally {
        this.loading = false;
      }
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
          console.error(
            'Failed to load my group purchases',
            res.status,
            res.statusText
          );
          return;
        }

        const purchases = await res.json();
        const now = new Date();

        // Mirror the "active coupon books" logic from Profile.vue:
        // status === 'paid' and not expired
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

    hasActiveCouponBook(groupId) {
      return this.purchasedGroupIds.includes(groupId);
    },
  },
};
</script>

<style scoped>
.foodie-group-list {
  padding: var(--spacing-2xl);
  text-align: center;
  color: var(--color-text-primary);
}

.foodie-group-list h1 {
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xl);
}

.group-list-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
}

.group-card {
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  width: 300px;
  background-color: var(--color-bg-surface);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 350px;
  transition: box-shadow var(--transition-base), transform var(--transition-base);
  box-shadow: var(--shadow-card);
}

:root[data-theme="dark"] .group-card {
  background-color: var(--clr-surface-dark-a30);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
}

/* Highlight when user has an active coupon book for this group */
.group-card--joined {
  box-shadow:
    0 0 0 2px rgba(242, 84, 45, 0.35),
    var(--shadow-card-hover);
  transform: translateY(-2px);
}

.card-content {
  margin-bottom: var(--spacing-lg);
  color: var(--color-text-primary);
}

.card-content h2 {
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}

.card-content p {
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}

.badge-joined {
  display: inline-block;
  padding: var(--spacing-xs) var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  background-color: var(--color-primary-light);
  background-color: rgba(242, 84, 45, 0.1);
  color: var(--color-primary);
  box-shadow: var(--shadow-xs);
}

.location {
  font-style: italic;
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
}

.btn,
a.btn,
router-link.btn {
  display: inline-block;
  padding: var(--spacing-md) var(--spacing-xl);
  background-color: var(--color-primary);
  color: var(--color-text-on-primary) !important;
  text-decoration: none !important;
  border-radius: var(--radius-md);
  transition: background-color var(--transition-base), color var(--transition-base), box-shadow var(--transition-base), transform var(--transition-base);
  min-height: var(--button-height-md);
  font-weight: var(--font-weight-semibold);
  box-shadow: 0 2px 6px rgba(242, 84, 45, 0.25);
}

.btn:hover,
a.btn:hover,
router-link.btn:hover {
  background-color: var(--color-primary-hover);
  color: var(--color-text-on-primary) !important;
  text-decoration: none !important;
  box-shadow: 0 4px 12px rgba(242, 84, 45, 0.35);
  transform: translateY(-1px);
}

.btn:visited,
a.btn:visited,
router-link.btn:visited {
  color: var(--color-text-on-primary) !important;
}

.error {
  color: var(--color-error);
  margin-top: var(--spacing-lg);
}
</style>
