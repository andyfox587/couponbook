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

      <div v-if="isPaidEvent" class="payment-policy card">
        <p class="checkout-title">Paid Event Ticket</p>
        <p class="checkout-copy">
          Your card is charged when checkout completes. Cancellations follow the event refund policy:
          72+ hours full refund, 24-72 hours 50% refund, under 24 hours no refund.
        </p>
        <label class="policy-check">
          <input type="checkbox" v-model="refundPolicyAccepted" :disabled="!!paymentClientSecret" />
          <span>I acknowledge the refund policy.</span>
        </label>
      </div>

      <button v-if="!paymentClientSecret" type="submit" class="btn btn-primary" :disabled="submitDisabled">
        {{ submitting ? 'Submitting…' : isPaidEvent ? 'Continue to Payment' : 'RSVP Now' }}
      </button>
    </form>

    <div v-if="paymentClientSecret" class="payment-card card">
      <h3>Complete Payment</h3>
      <p class="checkout-copy">
        Total: {{ formatMoney(paymentAmountCents, paymentCurrency) }}
      </p>
      <div ref="paymentElement" class="payment-element"></div>
      <div v-if="paymentStatusMessage" class="alert alert-success">{{ paymentStatusMessage }}</div>
      <div v-if="submitError" class="alert alert-error">{{ submitError }}</div>
      <div class="checkout-actions">
        <button type="button" class="btn btn-secondary" :disabled="confirmingPayment" @click="resetPayment">
          Back
        </button>
        <button type="button" class="btn btn-primary" :disabled="confirmingPayment || paymentComplete" @click="confirmPayment">
          {{ confirmingPayment ? 'Processing…' : 'Pay and RSVP' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { loadStripe } from '@stripe/stripe-js'
import { createRsvp, cancelRsvp } from '@/services/eventService'

function getStripePublishableKey() {
  return process.env.VUE_APP_STRIPE_PUBLISHABLE_KEY || import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY || ''
}

export default {
  name: 'EventRSVP',

  props: {
    event: { type: Object, required: true },
    isAuthenticated: { type: Boolean, default: false },
    hasMembership: { type: Boolean, default: false },
    existingRsvp: { type: Object, default: null },
    rsvpLoading: { type: Boolean, default: false },
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
      return this.submitting || (this.isPaidEvent && !this.refundPolicyAccepted)
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
      confirmingPayment: false,
      submitError: null,
      refundPolicyAccepted: false,
      stripe: null,
      elements: null,
      paymentElement: null,
      paymentClientSecret: null,
      paymentOrderId: null,
      paymentAmountCents: 0,
      paymentCurrency: 'usd',
      paymentComplete: false,
      paymentStatusMessage: '',
    }
  },

  methods: {
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
        if (result.requiresPayment) {
          this.paymentClientSecret = result.clientSecret
          this.paymentOrderId = result.orderId
          this.paymentAmountCents = result.amountCents
          this.paymentCurrency = result.currency || 'usd'
          await this.mountPaymentElement()
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

    async mountPaymentElement() {
      const publishableKey = getStripePublishableKey()
      if (!publishableKey) {
        this.submitError = 'Stripe publishable key is not configured.'
        return
      }
      this.stripe = this.stripe || await loadStripe(publishableKey)
      if (!this.stripe) {
        this.submitError = 'Could not load Stripe. Please try again.'
        return
      }
      this.elements = this.stripe.elements({ clientSecret: this.paymentClientSecret })
      this.paymentElement = this.elements.create('payment')
      await this.$nextTick()
      this.paymentElement.mount(this.$refs.paymentElement)
    },

    async confirmPayment() {
      if (!this.stripe || !this.elements) return
      this.confirmingPayment = true
      this.submitError = null
      try {
        const { error, paymentIntent } = await this.stripe.confirmPayment({
          elements: this.elements,
          redirect: 'if_required',
        })
        if (error) {
          this.submitError = error.message || 'Payment failed. Please try again.'
          return
        }
        this.paymentComplete = true
        this.paymentStatusMessage = paymentIntent?.status === 'succeeded'
          ? 'Payment received. Your RSVP will be confirmed shortly.'
          : 'Payment is processing. Your RSVP will update when Stripe confirms it.'
        this.$emit('rsvp-submitted', {
          requiresPayment: true,
          status: paymentIntent?.status || 'processing',
          orderId: this.paymentOrderId,
        })
      } catch (err) {
        console.error('[EventRSVP] confirmPayment error', err)
        this.submitError = err.message || 'Payment failed. Please try again.'
      } finally {
        this.confirmingPayment = false
      }
    },

    resetPayment() {
      if (this.paymentElement) {
        this.paymentElement.unmount()
      }
      this.elements = null
      this.paymentElement = null
      this.paymentClientSecret = null
      this.paymentOrderId = null
      this.paymentComplete = false
      this.paymentStatusMessage = ''
    },

    formatMoney(amountCents, currency = 'usd') {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format((amountCents || 0) / 100)
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
