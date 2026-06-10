<template>
  <main class="guest-cancel container">
    <section class="card">
      <div v-if="loading" class="muted">Loading cancellation details…</div>
      <div v-else-if="error" class="alert alert-error">{{ error }}</div>
      <template v-else>
        <h1>Cancel RSVP</h1>
        <p v-if="preview?.event">
          {{ preview.event.name }}<br />
          <span class="muted">{{ formatDate(preview.event.startDatetime) }}</span>
        </p>
        <p v-if="preview?.rsvp">
          {{ preview.rsvp.attendees }} ticket{{ preview.rsvp.attendees === 1 ? '' : 's' }}
          for {{ preview.rsvp.guestEmail || 'guest' }}.
        </p>
        <p v-if="preview?.order" class="muted">
          Original payment: {{ formatMoney(preview.order.amountCents) }}
        </p>

        <!-- What the guest will receive if they cancel now -->
        <div v-if="!result && quote" class="quote-box">
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

        <div v-if="result" class="alert alert-success">
          RSVP cancelled.
          <span v-if="result.refundAmountCents">
            Refund: {{ formatMoney(result.refundAmountCents) }}.
          </span>
          <span v-if="result.creditAmountCents">
            Event credit issued: {{ formatMoney(result.creditAmountCents) }}<template v-if="result.creditExpiresAt"> (valid until {{ formatDate(result.creditExpiresAt) }})</template>.
          </span>
          <span v-if="!result.refundAmountCents && !result.creditAmountCents">
            No refund was issued under the event refund policy.
          </span>
        </div>
        <button v-if="!result" class="btn btn-primary" :disabled="submitting" @click="confirmCancel">
          {{ submitting ? 'Cancelling…' : 'Cancel RSVP' }}
        </button>
      </template>
    </section>
  </main>
</template>

<script>
import { cancelGuestRsvpByToken, previewGuestCancellation } from '@/services/eventService'

export default {
  name: 'EventGuestCancel',
  props: {
    id: { type: String, required: true },
  },
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
      const token = this.$route.query.token
      if (!token) throw new Error('Cancellation token is missing.')
      this.preview = await previewGuestCancellation(this.id, token)
    } catch (err) {
      this.error = err.message || 'Cancellation link is invalid or expired.'
    } finally {
      this.loading = false
    }
  },
  methods: {
    async confirmCancel() {
      this.submitting = true
      this.error = null
      try {
        this.result = await cancelGuestRsvpByToken(this.id, this.$route.query.token, this.compensation)
      } catch (err) {
        this.error = err.message || 'Could not cancel this RSVP.'
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
      return value ? new Date(value).toLocaleString() : ''
    },
  },
}
</script>

<style scoped>
.guest-cancel {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--spacing-2xl) var(--spacing-lg);
}

.card {
  padding: var(--spacing-xl);
}

.muted {
  color: var(--color-text-muted);
}

.quote-box {
  margin: var(--spacing-lg) 0;
  padding: var(--spacing-md);
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
</style>
