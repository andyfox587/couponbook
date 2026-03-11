<template>
  <div class="coupon-card">
    <h3 class="coupon-title">{{ coupon.title }}</h3>

    <div class="merchant-info" v-if="coupon.merchant_name">
      <img
        :src="coupon.merchant_logo || '/logo.png'"
        :alt="`Logo for ${coupon.merchant_name}`"
        class="merchant-logo"
      />
      <span class="merchant-name">{{ coupon.merchant_name }}</span>
    </div>

    <p class="coupon-description">{{ coupon.description }}</p>

    <div class="validity" v-if="coupon.valid_from && coupon.expires_at">
      <small>Valid from: {{ formatDate(coupon.valid_from) }}</small><br />
      <small>Expires: {{ formatDate(coupon.expires_at) }}</small>
    </div>

    <div v-if="redeemedAtDisplay" class="redemption-meta">
      <small>Redeemed: {{ redeemedAtDisplay }}</small>
    </div>

    <!-- Button with dynamic label + disabled logic -->
    <button
      class="action-btn"
      :class="buttonClass"
      :disabled="isDisabled"
      @click="handleClick"
    >
      <i v-if="redeemStatus === 'redeemed'" class="pi pi-check-circle icon-spacing-sm"></i>
      <i v-if="redeemStatus === 'locked' || redeemStatus === 'join-group'" class="pi pi-lock icon-spacing-sm"></i>
      <i v-if="redeemStatus === 'login'" class="pi pi-sign-in icon-spacing-sm"></i>
      <i v-if="redeemStatus === 'active'" class="pi pi-ticket icon-spacing-sm"></i>
      <i v-if="redeemStatus === 'goto-group'" class="pi pi-arrow-right icon-spacing-sm"></i>
      {{ buttonLabel }}
    </button>
  </div>
</template>

<script>
import { signIn } from '@/services/authService';

export default {
  name: 'CouponCard',
  props: {
    coupon: { type: Object, required: true },
    hasPurchasedCouponBook: { type: Boolean, default: false },
    isAuthenticated: { type: Boolean, default: false },
    // When true, foodie group coupons always route to the group page instead of direct redeem
    forceGoToGroupForFoodieGroupCoupons: { type: Boolean, default: false }
  },

  computed: {
    /** 🟥 Is coupon expired? */
    isExpired() {
      if (!this.coupon.expires_at) return false;
      return new Date(this.coupon.expires_at) < new Date();
    },

    /** 🟨 Is coupon not yet active? */
    isNotYetValid() {
      if (!this.coupon.valid_from) return false;
      return new Date(this.coupon.valid_from) > new Date();
    },

    /** 🔒 Is coupon locked? */
    isLocked() {
      return (
        this.coupon.foodie_group_name !== 'Vivaspot Community' &&
        this.coupon.locked
      );
    },

    /** Is this a foodie group coupon (not Vivaspot Community)? */
    isFoodieGroupCoupon() {
      return this.coupon.foodie_group_name && this.coupon.foodie_group_name !== 'Vivaspot Community';
    },

    /** 🧠 Unified metadata state */
    redeemStatus() {
      if (this.coupon.redeemed_by_user) return 'redeemed';
      if (this.isExpired) return 'expired';
      if (this.isNotYetValid) return 'not-yet-valid';
      if (!this.isAuthenticated) return 'login';

      // When on Local Coupons page, foodie group coupons should route to group page
      // EXCEPT if the user has already purchased access - then they can redeem directly.
      if (this.forceGoToGroupForFoodieGroupCoupons && this.isFoodieGroupCoupon) {
        if (this.hasPurchasedCouponBook) {
          return 'active'; // Changed from 'goto-group' to 'active' for purchased access
        } else {
          return 'join-group'; // Not purchased → "Join ... Coupon Book"
        }
      }

      // Original behavior for FoodieGroup.vue (direct redeem page)
      if (this.isLocked && !this.hasPurchasedCouponBook) return 'locked';
      return 'active';
    },

    /** 🏷 Label text for button */
    buttonLabel() {
      switch (this.redeemStatus) {
        case 'redeemed':
          return 'Redeemed';
        case 'expired':
          return 'Expired';
        case 'not-yet-valid':
          return 'Not yet valid';
        case 'login':
          return 'Sign in to redeem';
        case 'locked':
          return `Join ${this.coupon.foodie_group_name} Coupon Book`;
        case 'goto-group':
          return `Go to ${this.coupon.foodie_group_name} Coupon Book to Redeem`;
        case 'join-group':
          return `Join ${this.coupon.foodie_group_name} Coupon Book`;
        default:
          return 'Redeem';
      }
    },

    /** ⛔ Disable button for everything except active coupons */
    isDisabled() {
      return this.coupon.redeemed_by_user || this.isExpired;
    },

    /** 🎨 Button color theme */
    buttonClass() {
      if (this.coupon.redeemed_by_user || this.isExpired) {
        return "btn-gray";
      }
      if (!this.isAuthenticated) {
        return "btn-tertiary"; 
      }
      if (this.redeemStatus === 'goto-group') {
        return "btn-secondary"; // Green - user has access
      }
      if (this.redeemStatus === 'join-group' || this.redeemStatus === 'locked') {
        return "btn-primary"; // Orange - needs to join/purchase
      }
      if (this.isLocked && !this.hasPurchasedCouponBook) {
        return "btn-primary";
      }
      return "btn-secondary";
    },

    redeemedAtDisplay() {
      const redeemedAt = this.coupon.redeemed_at || this.coupon.redeemedAt;
      return redeemedAt ? this.formatDateTime(redeemedAt) : '';
    }
  },

  methods: {
    formatDate(dateStr) {
      return new Date(dateStr).toLocaleDateString();
    },

    formatDateTime(dateStr) {
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime())) return '';

      return new Intl.DateTimeFormat(undefined, {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }).format(date);
    },

    handleClick() {
      if (this.isDisabled) return;

      // Not authenticated → redirect to Cognito
      if (this.redeemStatus === 'login') {
        try {
          signIn();
        } catch (e) {
          console.error(e);
        }
        return;
      }

      // Locked, join-group, or goto-group → redirect to group page
      if (this.redeemStatus === 'locked' || this.redeemStatus === 'join-group' || this.redeemStatus === 'goto-group') {
        this.redirectToGroup();
        return;
      }

      // Active → emit redeem event
      this.$emit('redeem', this.coupon);
    },

    redirectToGroup() {
      const groupId = this.coupon.foodie_group_id;
      if (!groupId) {
        alert('Unable to determine group. Please contact support.');
        return;
      }

      this.$router.push({
        name: 'FoodieGroupView',
        params: { id: groupId }
      });
    }
  }
};
</script>

<style scoped>
.coupon-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 250px;
  padding: var(--spacing-lg);
  border-radius: var(--radius-lg);
  background-color: var(--color-bg-surface);
  text-align: center;
  box-shadow: var(--shadow-md);
  transition: box-shadow var(--transition-base), transform var(--transition-base);
}

.coupon-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}

:root[data-theme="dark"] .coupon-card {
  background-color: var(--clr-surface-dark-a30);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}

:root[data-theme="dark"] .coupon-card:hover {
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
}

.coupon-title {
  font-size: var(--font-size-2xl);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-md);
}

.merchant-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.merchant-logo {
  width: 80px;
  height: 80px;
  object-fit: contain;
  border-radius: 50%;
  box-shadow: var(--shadow-card);
  margin-bottom: var(--spacing-sm);
  background-color: #FFFFFF !important;
  padding: var(--spacing-xs);
}

.merchant-name {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.coupon-description {
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-md);
  line-height: var(--line-height-normal);
}

.validity {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin: var(--spacing-sm) 0;
}

.validity small {
  color: var(--color-text-secondary);
}

.redemption-meta {
  margin: 0 0 var(--spacing-md);
  color: var(--color-text-secondary);
}

.redemption-meta small {
  color: var(--color-text-secondary);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  cursor: pointer;
  min-height: var(--button-height-md);
  transition: all var(--transition-base);
  width: 100%;
  font-weight: var(--font-weight-medium);
}

.btn-primary {
  background-color: var(--color-secondary);
  color: var(--color-text-on-secondary);
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--color-secondary-hover);
  color: var(--color-text-on-secondary);
}

.btn-secondary {
  background-color: var(--color-success);
  color: var(--color-text-on-success);
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--color-success-hover);
  color: var(--color-text-on-success);
}

.btn-tertiary {
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
}

.btn-tertiary:hover:not(:disabled) {
  background-color: var(--color-primary-hover);
  color: var(--color-text-on-primary);
}

.btn-gray {
  background-color: var(--color-neutral-600);
  color: var(--color-text-inverse);
  cursor: default;
}

.btn-gray:hover:not(:disabled) {
  background-color: var(--color-neutral-600);
  color: var(--color-text-inverse);
}

.action-btn:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

@media (max-width: 480px) {
  .coupon-card {
    width: 100%;
    max-width: 360px;
    margin: 0 auto;
  }
}
</style>
