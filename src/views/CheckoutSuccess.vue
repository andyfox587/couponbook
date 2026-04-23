<!-- src/views/CheckoutSuccess.vue -->
<template>
  <div class="checkout-success-page">
    <div class="success-card">
      <div class="success-icon">✅</div>
      <h1 v-if="isGift">Gift Subscription Activated!</h1>
      <h1 v-else-if="isSubscription">Subscription Started!</h1>
      <h1 v-else>Payment Successful!</h1>

      <p class="success-message" v-if="isGift">
        Your gift subscription has been set up. The recipient will receive access to all group coupons and events.
      </p>
      <p class="success-message" v-else-if="isSubscription">
        Your subscription is now active. You have full access to all group coupons and events.
        We'll send you a reminder before your next renewal.
      </p>
      <p class="success-message" v-else>
        Your coupon book has been purchased and is now unlocked.
        You can now access all group coupons and RSVP for events.
      </p>

      <div v-if="groupName" class="group-info">
        <span class="group-label">Coupon Book:</span>
        <span class="group-name">{{ groupName }}</span>
      </div>

      <div class="success-actions">
        <button @click="goToGroup" class="btn btn-primary">
          <i class="pi pi-ticket"></i>
          View Coupons
        </button>
        <button @click="goToHome" class="btn btn-secondary">
          <i class="pi pi-home"></i>
          Go to Home
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CheckoutSuccess',

  data() {
    return {
      groupSlug: null,
      groupName: null,
      sessionId: null,
      isGift: false,
      isSubscription: false,
      loading: true,
    };
  },

  created() {
    this.groupSlug = this.$route.params.groupSlug || this.$route.query.group;
    this.sessionId = this.$route.query.session_id;
    this.isGift = this.$route.query.gift === 'true';

    if (this.groupSlug) {
      this.fetchGroupInfo();
    } else {
      this.loading = false;
    }
  },

  methods: {
    async fetchGroupInfo() {
      try {
        const res = await fetch(`/api/v1/groups/${this.groupSlug}`);
        if (res.ok) {
          const group = await res.json();
          this.groupName = group.name;
          this.isSubscription = group.billingModel === 'subscription' && !this.isGift;
        }
      } catch (e) {
        console.error('[CheckoutSuccess] Failed to fetch group info', e);
      } finally {
        this.loading = false;
      }
    },

    goToGroup() {
      if (this.groupSlug) {
        this.$router.push(`/foodie-group/${this.groupSlug}`);
      } else {
        this.$router.push('/foodie-groups');
      }
    },

    goToHome() {
      this.$router.push('/');
    },
  },
};
</script>

<style scoped>
.checkout-success-page {
  min-height: calc(100vh - 80px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xl);
  background: var(--color-bg-secondary);
}

.success-card {
  background: var(--color-bg-surface);
  border-radius: var(--radius-xl);
  padding: var(--spacing-3xl) var(--spacing-2xl);
  max-width: 500px;
  width: 100%;
  text-align: center;
  box-shadow: var(--shadow-lg);
}

.success-icon {
  font-size: 4rem;
  line-height: 1;
  margin-bottom: var(--spacing-lg);
  filter: drop-shadow(0 4px 8px rgba(34, 148, 110, 0.3));
}

.success-card h1 {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  color: var(--clr-success-a0);
  margin-bottom: var(--spacing-lg);
  letter-spacing: var(--letter-spacing-tight);
}

.success-message {
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xl);
}

.group-info {
  background: var(--color-bg-muted);
  border-radius: var(--radius-md);
  padding: var(--spacing-md) var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.group-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.group-name {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.success-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.success-actions .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-xl);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  border: none;
  min-height: var(--button-height-lg);
  width: 100%;
}

.success-actions .btn-primary {
  background: var(--clr-success-a0);
  color: var(--clr-text-on-success-a0);
}

.success-actions .btn-primary:hover {
  background: var(--clr-success-dark-a0);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.success-actions .btn-secondary {
  background: var(--color-bg-muted);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.success-actions .btn-secondary:hover {
  background: var(--color-bg-secondary);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

/* Dark mode */
:root[data-theme="dark"] .success-card {
  background: var(--surface-1);
}

:root[data-theme="dark"] .success-card h1 {
  color: var(--clr-success-a10);
}

:root[data-theme="dark"] .group-info {
  background: var(--surface-2);
}

/* Mobile */
@media (max-width: 768px) {
  .checkout-success-page {
    padding: var(--spacing-lg);
    align-items: flex-start;
    padding-top: var(--spacing-3xl);
  }

  .success-card {
    padding: var(--spacing-2xl) var(--spacing-lg);
  }

  .success-icon {
    font-size: 3rem;
  }

  .success-card h1 {
    font-size: var(--font-size-2xl);
  }
}
</style>
