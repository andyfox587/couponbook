<template>
  <div class="event-rsvp">
    <!-- Members-only gate: not signed in -->
    <div v-if="isMembersOnly && !isAuthenticated" class="members-gate">
      <i class="pi pi-lock gate-icon"></i>
      <h3>Members Only</h3>
      <p>Sign in and purchase the coupon book to RSVP for this event.</p>
      <button class="btn btn-primary" @click="$emit('login-requested')">Sign In</button>
    </div>

    <!-- Members-only gate: signed in but no purchase -->
    <div v-else-if="isMembersOnly && !hasMembership" class="members-gate">
      <i class="pi pi-lock gate-icon"></i>
      <h3>Coupon Book Required</h3>
      <p>You need to purchase the coupon book for this group to RSVP for this members-only event.</p>
    </div>

    <!-- Existing RSVP lookup state -->
    <div v-else-if="rsvpLoading" class="rsvp-loading">
      <p class="loading-copy">Checking your RSVP…</p>
    </div>

    <!-- Success state -->
    <div v-else-if="activeRsvp" class="rsvp-success">
      <i class="pi pi-check-circle success-icon"></i>
      <h3>{{ activeRsvpTitle }}</h3>
      <p v-if="activeRsvp.status === 'waitlist'" class="waitlist-pos">
        Waitlist position: #{{ activeRsvp.waitlistPosition }}
      </p>
      <p class="rsvp-meta">
        {{ activeRsvp.attendees || form.attendees }}
        {{ (activeRsvp.attendees || form.attendees) === 1 ? 'guest' : 'guests' }}
      </p>
      <button class="btn btn-secondary" @click="cancelConfirmed">Cancel RSVP</button>
      <div v-if="submitError" class="error-msg">{{ submitError }}</div>
    </div>

    <!-- Redirecting to Stripe -->
    <div v-else-if="redirectingToCheckout" class="rsvp-loading">
      <p class="loading-copy">Redirecting to secure checkout…</p>
    </div>

    <!-- RSVP form -->
    <form v-else class="rsvp-form" @submit.prevent="submitRSVP">
      <h3>RSVP for {{ event.name }}</h3>

      <div class="form-group">
        <label for="rsvp-name">Your Name</label>
        <input
          id="rsvp-name"
          type="text"
          v-model="form.guest_name"
          placeholder="Your name"
          @input="touched.guest_name = true"
        />
      </div>

      <div class="form-group">
        <label for="rsvp-email">
          Your Email
          <span v-if="prefilledFromProfile" class="field-hint">(from your account)</span>
        </label>
        <input
          id="rsvp-email"
          type="email"
          v-model="form.guest_email"
          placeholder="you@example.com"
          @input="touched.guest_email = true"
        />
      </div>

      <div class="form-group" v-if="event.maxTicketsPerGuest > 1">
        <label for="rsvp-attendees">Number of Tickets (max {{ event.maxTicketsPerGuest }})</label>
        <select id="rsvp-attendees" v-model.number="form.attendees">
          <option v-for="n in event.maxTicketsPerGuest" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>

      <div v-if="submitError" class="error-msg">{{ submitError }}</div>

      <div v-if="isPaidEvent" class="payment-policy card">
        <p class="checkout-title">Paid Event Ticket</p>
        <p class="checkout-copy">
          You'll be redirected to Stripe to complete payment. Cancellations follow the event refund policy:
          72+ hours full refund, 24-72 hours 50% refund, under 24 hours no refund.
        </p>
        <label class="policy-check">
          <input type="checkbox" v-model="refundPolicyAccepted" />
          <span>I acknowledge the refund policy.</span>
        </label>
      </div>

      <button type="submit" class="btn btn-primary" :disabled="submitDisabled">
        {{ submitting ? 'Submitting…' : isPaidEvent ? 'Continue to Payment' : 'RSVP Now' }}
      </button>
    </form>
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
    existingRsvp: { type: Object, default: null },
    rsvpLoading: { type: Boolean, default: false },
    userProfile: { type: Object, default: null },
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
      return this.submitting || this.redirectingToCheckout || (this.isPaidEvent && !this.refundPolicyAccepted)
    },
    activeRsvp() {
      return this.rsvpResult || this.existingRsvp
    },
    activeRsvpTitle() {
      if (this.activeRsvp?.status === 'going') return "You're going"
      if (this.activeRsvp?.status === 'waitlist') return "You're on the waitlist"
      if (this.activeRsvp?.status === 'checked_in') return 'Checked in'
      return 'RSVP confirmed'
    },
    prefilledFromProfile() {
      return !!(this.userProfile && this.userProfile.email)
    },
  },

  data() {
    return {
      form: {
        guest_name: '',
        guest_email: '',
        attendees: 1,
      },
      touched: {
        guest_name: false,
        guest_email: false,
      },
      rsvpResult: null,
      submitting: false,
      redirectingToCheckout: false,
      submitError: null,
      refundPolicyAccepted: false,
    }
  },

  created() {
    this.applyProfileToForm()
  },

  watch: {
    userProfile: {
      immediate: true,
      handler() {
        this.applyProfileToForm()
      },
    },
  },

  methods: {
    applyProfileToForm() {
      const profile = this.userProfile
      if (!profile) return
      if (!this.touched.guest_name && !this.form.guest_name && profile.name) {
        this.form.guest_name = profile.name
      }
      if (!this.touched.guest_email && !this.form.guest_email && profile.email) {
        this.form.guest_email = profile.email
      }
    },

    async submitRSVP() {
      if (this.isPaidEvent && !this.refundPolicyAccepted) {
        this.submitError = 'Please acknowledge the refund policy before payment.'
        return
      }
      this.submitting = true
      this.submitError = null
      try {
        const payload = {
          attendees: this.form.attendees,
          guest_name: this.form.guest_name || undefined,
          guest_email: this.form.guest_email || undefined,
          refund_policy_accepted: this.refundPolicyAccepted || undefined,
        }
        const result = await createRsvp(this.event.id, payload)
        if (result.requiresPayment && result.checkoutUrl) {
          this.redirectingToCheckout = true
          window.location.assign(result.checkoutUrl)
          return
        }
        this.rsvpResult = result
        this.$emit('rsvp-submitted', this.rsvpResult)
      } catch (err) {
        console.error('[EventRSVP] submitRSVP error', err)
        this.submitError = err.message || 'RSVP failed. Please try again.'
      } finally {
        this.submitting = false
      }
    },

    async cancelConfirmed() {
      const currentRsvp = this.activeRsvp
      if (!currentRsvp) return
      this.submitError = null
      try {
        await cancelRsvp(this.event.id, currentRsvp.id)
        const prev = currentRsvp
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

.field-hint {
  margin-left: var(--spacing-xs);
  font-weight: var(--font-weight-regular);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
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

.rsvp-success {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
}

.success-icon { font-size: 3rem; color: var(--color-success); }
.waitlist-pos,
.rsvp-meta,
.loading-copy {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  margin: 0;
}

.rsvp-loading {
  display: flex;
  justify-content: center;
  text-align: center;
}

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

.policy-check {
  display: flex;
  gap: var(--spacing-xs);
  align-items: flex-start;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.payment-policy {
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}
</style>
