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
      <p v-if="activeRsvp.paidWithCredit" class="rsvp-meta">
        Paid with your event credit — no charge to your card.
      </p>
      <p v-if="activeRsvp.status === 'waitlist'" class="waitlist-pos">
        Waitlist position: #{{ activeRsvp.waitlistPosition }}
      </p>
      <p class="rsvp-meta">
        {{ activeRsvp.attendees || form.attendees }}
        {{ (activeRsvp.attendees || form.attendees) === 1 ? 'guest' : 'guests' }}
      </p>

      <!-- QR ticket: shown for confirmed attendance, scanned at the door -->
      <div v-if="ticketCheckinUrl && activeRsvp.status !== 'waitlist'" class="ticket-box">
        <p class="ticket-title">Your ticket</p>
        <QRCode :value="ticketCheckinUrl" :size="180" level="M" class="ticket-qr" />
        <p v-if="activeRsvp.ticketReference" class="ticket-ref">{{ activeRsvp.ticketReference }}</p>
        <p class="ticket-hint muted">Show this QR code at the door.</p>
      </div>

      <button class="btn btn-secondary" @click="showCancelModal = true">Cancel RSVP</button>
      <div v-if="submitError" class="error-msg">{{ submitError }}</div>

      <CancelRsvpModal
        v-if="showCancelModal"
        :event-id="event.id"
        :rsvp-id="activeRsvp.id"
        :event-name="event.name"
        @close="showCancelModal = false"
        @cancelled="onModalCancelled"
      />
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
        </p>
        <ul class="refund-policy-tiers">
          <li>
            <strong>7+ days before the event</strong>
            <span v-if="fullRefundDeadlineLabel"> (cancel by {{ fullRefundDeadlineLabel }})</span>:
            100% refund.
          </li>
          <li>
            <strong>3–7 days before the event</strong>
            <span v-if="halfRefundDeadlineLabel"> (cancel by {{ halfRefundDeadlineLabel }})</span>:
            50% refund, or a 100% event credit instead.
          </li>
          <li>
            <strong>Less than 72 hours / no-show</strong>:
            no refund. Cancellations made before the event receive a 50% event credit.
          </li>
        </ul>
        <p class="checkout-copy muted tiny">
          Event credits are valid for 12 months at the same restaurant and have no cash value.
        </p>
        <label class="policy-check">
          <input type="checkbox" v-model="refundPolicyAccepted" />
          <span>I have read and agree to the refund policy.</span>
        </label>
      </div>

      <button type="submit" class="btn btn-primary" :disabled="submitDisabled">
        {{ submitting ? 'Submitting…' : isPaidEvent ? 'Continue to Payment' : 'RSVP Now' }}
      </button>
    </form>

    <!-- Event-credit consent: never spend a credit without asking -->
    <div v-if="creditPrompt" class="credit-prompt-overlay" @click.self="chooseCredit(false)">
      <div class="credit-prompt">
        <h3>Use your event credit?</h3>
        <p>
          You have a
          <strong>{{ formatMoney(creditPrompt.credit.amountCents, creditPrompt.credit.currency) }}</strong>
          event credit at this restaurant.
          Would you like to use it for this ticket
          ({{ formatMoney(creditPrompt.ticketTotalCents, creditPrompt.currency) }})?
        </p>
        <p class="muted tiny">
          If you use it, no card payment is needed<template v-if="creditPrompt.credit.amountCents > creditPrompt.ticketTotalCents">
          and the remaining balance stays on your account</template>.
          If not, your credit is saved for next time.
        </p>
        <div class="credit-prompt-actions">
          <button class="btn btn-primary" :disabled="submitting" @click="chooseCredit(true)">
            Yes, use my credit
          </button>
          <button class="btn btn-secondary" :disabled="submitting" @click="chooseCredit(false)">
            No, pay by card
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { createRsvp } from '@/services/eventService'
import CancelRsvpModal from '@/components/Events/CancelRsvpModal.vue'

export default {
  name: 'EventRSVP',

  components: { CancelRsvpModal },

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
    fullRefundDeadlineLabel() {
      return this.refundDeadlineLabel(7 * 24)
    },
    halfRefundDeadlineLabel() {
      return this.refundDeadlineLabel(72)
    },
    ticketCheckinUrl() {
      const code = this.activeRsvp?.ticketCode
      if (!code) return null
      return `${window.location.origin}/checkin/${this.event.id}?code=${encodeURIComponent(code)}`
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
      showCancelModal: false,
      creditPrompt: null,
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
    refundDeadlineLabel(hoursBeforeStart) {
      const start = this.event?.startDatetime ? new Date(this.event.startDatetime) : null
      if (!start || Number.isNaN(start.getTime())) return null
      const deadline = new Date(start.getTime() - hoursBeforeStart * 60 * 60 * 1000)
      if (deadline.getTime() <= Date.now()) return null
      return deadline.toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })
    },

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
      const payload = {
        attendees: this.form.attendees,
        guest_name: this.form.guest_name || undefined,
        guest_email: this.form.guest_email || undefined,
        refund_policy_accepted: this.refundPolicyAccepted || undefined,
      }
      await this.sendRsvp(payload)
    },

    async sendRsvp(payload) {
      this.submitting = true
      this.submitError = null
      try {
        const result = await createRsvp(this.event.id, payload)

        // Guest has an event credit covering this ticket — ask before
        // spending it instead of silently skipping the card payment.
        if (result.requiresCreditDecision) {
          this.creditPrompt = { ...result, payload }
          return
        }

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

    async chooseCredit(useCredit) {
      const payload = { ...this.creditPrompt.payload, use_credit: useCredit }
      this.creditPrompt = null
      await this.sendRsvp(payload)
    },

    formatMoney(amountCents, currency = 'usd') {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format((amountCents || 0) / 100)
    },

    onModalCancelled() {
      const prev = this.activeRsvp
      this.showCancelModal = false
      this.rsvpResult = null
      this.$emit('rsvp-cancelled', prev)
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

.ticket-box {
  margin: var(--spacing-lg) 0;
  padding: var(--spacing-md);
  border: 1px dashed var(--color-border, #cbd5e1);
  border-radius: var(--radius-md);
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  background: #fff;
}

.ticket-title {
  margin: 0;
  font-weight: 600;
  color: var(--color-text-primary);
}

.ticket-qr {
  display: block;
}

.ticket-hint {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.credit-prompt-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--spacing-lg);
}

.credit-prompt {
  background: var(--color-bg-surface, #fff);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  max-width: 440px;
  width: 100%;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.25);
}

.credit-prompt h3 {
  margin: 0 0 var(--spacing-md);
}

.credit-prompt-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: var(--spacing-lg);
  flex-wrap: wrap;
}

.muted {
  color: var(--color-text-muted);
}

.tiny {
  font-size: var(--font-size-xs);
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
.btn.primary {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  box-shadow: 0 2px 6px rgba(242, 84, 45, 0.25);
}
.btn.primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  box-shadow: 0 4px 10px rgba(242, 84, 45, 0.35);
}
.btn.secondary { background: var(--color-error); color: var(--color-text-on-error); margin-top: var(--spacing-sm); }
.btn.secondary:hover:not(:disabled) { background: var(--color-error-hover); }

/* Dark mode: card gets primary-tinted border for definition against dark surfaces */
:root[data-theme="dark"] .event-rsvp {
  border: 1px solid rgba(217, 75, 41, 0.2);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .event-rsvp {
    border: 1px solid rgba(217, 75, 41, 0.2);
  }
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
