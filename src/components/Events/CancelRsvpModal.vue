<template>
  <div class="cancel-modal-overlay" @click.self="$emit('close')">
    <div class="cancel-modal">
      <h3>Cancel RSVP</h3>

      <div v-if="loading" class="muted">Checking your refund eligibility…</div>
      <div v-else-if="error" class="error-msg">{{ error }}</div>

      <template v-else-if="!result">
        <p class="event-line">
          <strong>{{ eventName }}</strong>
          <span v-if="preview && preview.attendees > 1" class="muted">
            · {{ preview.attendees }} tickets
          </span>
        </p>

        <!-- Free / unpaid RSVP: simple confirm -->
        <p v-if="!quote">Are you sure you want to cancel your RSVP?</p>

        <!-- Paid RSVP: refund quote per policy window -->
        <div v-else class="quote-box">
          <p v-if="quote.refundPercent === 100">
            Cancelling now refunds your full payment of
            <strong>{{ formatMoney(quote.amountCents) }}</strong>.
          </p>

          <template v-else-if="quote.refundPercent === 50">
            <p>Your event is 3–7 days away. Choose how you'd like to be compensated:</p>
            <label class="comp-option">
              <input type="radio" value="cash" v-model="compensation" />
              <span><strong>{{ formatMoney(quote.amountCents) }} cash refund</strong> (50%) back to your card</span>
            </label>
            <label class="comp-option">
              <input type="radio" value="credit" v-model="compensation" />
              <span>
                <strong>{{ formatMoney(quote.creditAmountCents) }} event credit</strong> (100%)
                — valid 12 months at the same restaurant
              </span>
            </label>
          </template>

          <p v-else>
            Your event starts in less than 72 hours, so a cash refund isn't available.
            Cancelling now issues a
            <strong>{{ formatMoney(quote.creditAmountCents) }} event credit</strong>
            (50%), valid for 12 months at the same restaurant.
          </p>
        </div>

        <div class="modal-actions">
          <button class="btn btn-danger" :disabled="submitting" @click="confirmCancel">
            {{ submitting ? 'Cancelling…' : 'Yes, cancel my RSVP' }}
          </button>
          <button class="btn btn-secondary" :disabled="submitting" @click="$emit('close')">
            Keep my RSVP
          </button>
        </div>
      </template>

      <template v-else>
        <div class="result-box">
          <p><strong>Your RSVP has been cancelled.</strong></p>
          <p v-if="result.refundAmountCents">
            Refund issued: <strong>{{ formatMoney(result.refundAmountCents) }}</strong> back to your card.
          </p>
          <p v-if="result.creditAmountCents">
            Event credit issued: <strong>{{ formatMoney(result.creditAmountCents) }}</strong><template v-if="result.creditExpiresAt"> (valid until {{ formatDate(result.creditExpiresAt) }})</template>.
            It will be applied automatically the next time you book an event at this restaurant.
          </p>
          <p v-if="!result.refundAmountCents && !result.creditAmountCents" class="muted">
            No refund was issued under the event refund policy.
          </p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="$emit('cancelled', result)">Done</button>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
import { cancelRsvp, getCancelPreview } from '@/services/eventService'

export default {
  name: 'CancelRsvpModal',

  props: {
    eventId: { type: String, required: true },
    rsvpId: { type: String, required: true },
    eventName: { type: String, default: 'this event' },
  },

  emits: ['close', 'cancelled'],

  data() {
    return {
      loading: true,
      submitting: false,
      error: null,
      preview: null,
      result: null,
      compensation: 'cash',
    }
  },

  computed: {
    quote() {
      return this.preview?.refundQuote || null
    },
  },

  async created() {
    try {
      this.preview = await getCancelPreview(this.eventId, this.rsvpId)
    } catch (err) {
      // Preview is best-effort — fall back to a plain confirmation so the
      // guest can still cancel even if the quote endpoint hiccups.
      console.warn('[CancelRsvpModal] preview failed', err)
      this.preview = null
    } finally {
      this.loading = false
    }
  },

  methods: {
    async confirmCancel() {
      this.submitting = true
      this.error = null
      try {
        this.result = await cancelRsvp(this.eventId, this.rsvpId, null, this.compensation)
      } catch (err) {
        this.error = err.message || 'Could not cancel this RSVP. Please try again.'
      } finally {
        this.submitting = false
      }
    },
    formatMoney(amountCents, currency = 'usd') {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format((amountCents || 0) / 100)
    },
    formatDate(value) {
      return value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
    },
  },
}
</script>

<style scoped>
.cancel-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--spacing-lg, 16px);
}

.cancel-modal {
  background: var(--color-bg-surface, #fff);
  border-radius: var(--radius-lg, 12px);
  padding: var(--spacing-xl, 24px);
  max-width: 480px;
  width: 100%;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.25);
}

.cancel-modal h3 {
  margin: 0 0 var(--spacing-md, 12px);
}

.event-line {
  margin: 0 0 var(--spacing-md, 12px);
}

.quote-box {
  margin: var(--spacing-md, 12px) 0;
  padding: var(--spacing-md, 12px);
  border: 1px solid var(--color-border, #ddd);
  border-radius: 8px;
}

.comp-option {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0.5rem 0;
  cursor: pointer;
}

.result-box p {
  margin: 0 0 0.5rem;
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: var(--spacing-lg, 16px);
  flex-wrap: wrap;
}

.btn-danger {
  background: var(--color-danger, #9c2121);
  color: #fff;
}

.muted {
  color: var(--color-text-muted, #6b7280);
}

.error-msg {
  color: var(--color-danger, #9c2121);
  margin: 0.5rem 0;
}
</style>
