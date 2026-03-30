<template>
  <div class="event-rsvp">
    <!-- Members-only gate: not signed in -->
    <div v-if="isMembersOnly && !isAuthenticated" class="members-gate">
      <i class="pi pi-lock gate-icon"></i>
      <h3>Members Only</h3>
      <p>Sign in and purchase the coupon book to RSVP for this event.</p>
      <button class="btn primary" @click="$emit('login-requested')">Sign In</button>
    </div>

    <!-- Members-only gate: signed in but no purchase -->
    <div v-else-if="isMembersOnly && !hasMembership" class="members-gate">
      <i class="pi pi-lock gate-icon"></i>
      <h3>Coupon Book Required</h3>
      <p>You need to purchase the coupon book for this group to RSVP for this members-only event.</p>
    </div>

    <!-- Success state -->
    <div v-else-if="rsvpResult" class="rsvp-success">
      <i class="pi pi-check-circle success-icon"></i>
      <h3 v-if="rsvpResult.status === 'going'">You're in!</h3>
      <h3 v-else>You're on the waitlist</h3>
      <p v-if="rsvpResult.status === 'waitlist'" class="waitlist-pos">
        Waitlist position: #{{ rsvpResult.waitlistPosition }}
      </p>
      <button class="btn secondary" @click="cancelConfirmed">Cancel RSVP</button>
      <div v-if="submitError" class="error-msg">{{ submitError }}</div>
    </div>

    <!-- RSVP form -->
    <form v-else class="rsvp-form" @submit.prevent="submitRSVP">
      <h3>RSVP for {{ event.name }}</h3>

      <div class="form-group">
        <label for="rsvp-name">Your Name</label>
        <input id="rsvp-name" type="text" v-model="form.guest_name" placeholder="Optional if signed in" />
      </div>

      <div class="form-group">
        <label for="rsvp-email">Your Email</label>
        <input id="rsvp-email" type="email" v-model="form.guest_email" placeholder="Optional if signed in" />
      </div>

      <div class="form-group" v-if="event.maxTicketsPerGuest > 1">
        <label for="rsvp-attendees">Number of Tickets (max {{ event.maxTicketsPerGuest }})</label>
        <select id="rsvp-attendees" v-model.number="form.attendees">
          <option v-for="n in event.maxTicketsPerGuest" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>

      <div v-if="submitError" class="error-msg">{{ submitError }}</div>

      <div v-if="isPaidEvent && !checkoutComplete" class="checkout-placeholder">
        <p class="checkout-title">Demo Checkout Required</p>
        <p class="checkout-copy">
          This event requires ticket purchase. Use this placeholder step to simulate Stripe checkout.
        </p>
        <button
          type="button"
          class="btn checkout-btn"
          :disabled="submitting"
          @click="openDemoCheckout"
        >
          Proceed to Demo Checkout
        </button>
      </div>

      <button type="submit" class="btn primary" :disabled="submitDisabled">
        {{ submitting ? 'Submitting…' : 'RSVP Now' }}
      </button>
    </form>

    <div v-if="showCheckoutDialog" class="checkout-overlay" role="dialog" aria-modal="true">
      <div class="checkout-modal">
        <h4>Demo Stripe Checkout</h4>
        <p class="checkout-copy">
          Placeholder only: no payment is processed. Click "Complete Demo Payment" to continue RSVP.
        </p>
        <div class="checkout-actions">
          <button type="button" class="btn secondary-outline" @click="closeDemoCheckout">
            Cancel
          </button>
          <button type="button" class="btn primary" @click="completeDemoCheckout">
            Complete Demo Payment
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { createRsvp, cancelRsvp } from '@/services/eventService'

export default {
  name: 'EventRSVP',

  props: {
    event: { type: Object, required: true },
    isAuthenticated: { type: Boolean, default: false },
    hasMembership: { type: Boolean, default: false },
  },

  emits: ['rsvp-submitted', 'rsvp-cancelled', 'login-requested'],

  computed: {
    isMembersOnly() {
      return this.event?.visibility === 'members_only'
    },
    isPaidEvent() {
      return this.event?.isFree === false
    },
    submitDisabled() {
      return this.submitting || (this.isPaidEvent && !this.checkoutComplete)
    },
  },

  data() {
    return {
      form: {
        guest_name: '',
        guest_email: '',
        attendees: 1,
      },
      rsvpResult: null,
      submitting: false,
      submitError: null,
      showCheckoutDialog: false,
      checkoutComplete: false,
    }
  },

  methods: {
    openDemoCheckout() {
      this.showCheckoutDialog = true
    },
    closeDemoCheckout() {
      this.showCheckoutDialog = false
    },
    completeDemoCheckout() {
      this.checkoutComplete = true
      this.showCheckoutDialog = false
    },
    async submitRSVP() {
      if (this.isPaidEvent && !this.checkoutComplete) {
        this.submitError = 'Please complete demo checkout first.'
        return
      }
      this.submitting = true
      this.submitError = null
      try {
        const payload = {
          attendees: this.form.attendees,
          guest_name: this.form.guest_name || undefined,
          guest_email: this.form.guest_email || undefined,
        }
        this.rsvpResult = await createRsvp(this.event.id, payload)
        this.$emit('rsvp-submitted', this.rsvpResult)
      } catch (err) {
        console.error('[EventRSVP] submitRSVP error', err)
        this.submitError = err.message || 'RSVP failed. Please try again.'
      } finally {
        this.submitting = false
      }
    },

    async cancelConfirmed() {
      if (!this.rsvpResult) return
      this.submitError = null
      try {
        await cancelRsvp(this.event.id, this.rsvpResult.id)
        const prev = this.rsvpResult
        this.rsvpResult = null
        this.$emit('rsvp-cancelled', prev)
      } catch (err) {
        console.error('[EventRSVP] cancelRsvp error', err)
        this.submitError = err.message || 'Cancel failed. Please try again.'
      }
    },
  },
}
</script>

<style scoped>
.event-rsvp {
  background: var(--color-bg-surface);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  box-shadow: var(--shadow-sm);
}

.rsvp-form h3, .rsvp-success h3 {
  margin: 0 0 var(--spacing-lg);
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
}

.form-group {
  margin-bottom: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

input, select {
  background: var(--color-bg-primary);
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  font-family: var(--font-family-base);
  padding: var(--spacing-sm);
  box-shadow: var(--shadow-xs);
  transition: box-shadow var(--transition-fast);
}

input:focus, select:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(56, 66, 76, 0.1), var(--shadow-xs);
}

.error-msg {
  background: var(--color-error-light);
  color: var(--color-error);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-md);
}

.btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  font-size: var(--font-size-base);
  font-family: var(--font-family-base);
  font-weight: var(--font-weight-medium);
  min-height: var(--button-height-md);
  transition: background-color var(--transition-base);
  width: 100%;
}

.btn:disabled { opacity: var(--opacity-disabled); cursor: not-allowed; }
.btn.primary { background: var(--color-secondary); color: var(--color-text-on-secondary); }
.btn.primary:hover:not(:disabled) { background: var(--color-secondary-hover); }
.btn.secondary { background: var(--color-error); color: var(--color-text-on-error); margin-top: var(--spacing-sm); }
.btn.secondary:hover:not(:disabled) { background: var(--color-error-hover); }

.btn.checkout-btn {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
}

.btn.checkout-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.secondary-outline {
  background: transparent;
  border: 1px solid var(--color-border-light);
  color: var(--color-text-primary);
}

.secondary-outline:hover:not(:disabled) {
  background: var(--color-bg-secondary);
}

.rsvp-success {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
}

.success-icon { font-size: 3rem; color: var(--color-success); }
.waitlist-pos { color: var(--color-text-secondary); font-size: var(--font-size-sm); }

.members-gate {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
}

.gate-icon { font-size: 2.5rem; color: var(--color-text-muted); }

.members-gate h3 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
}

.members-gate p {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  margin: 0;
  line-height: var(--line-height-relaxed);
}

.checkout-placeholder {
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}

.checkout-title {
  margin: 0 0 var(--spacing-xs);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
}

.checkout-copy {
  margin: 0 0 var(--spacing-sm);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
}

.checkout-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: var(--spacing-md);
}

.checkout-modal {
  width: min(420px, 100%);
  background: var(--color-bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-lg);
}

.checkout-modal h4 {
  margin: 0 0 var(--spacing-sm);
  color: var(--color-text-primary);
}

.checkout-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
}
</style>
