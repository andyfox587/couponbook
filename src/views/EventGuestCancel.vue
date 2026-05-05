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
        <div v-if="result" class="alert alert-success">
          RSVP cancelled.
          <span v-if="result.refundAmountCents">Refund: {{ formatMoney(result.refundAmountCents) }}.</span>
          <span v-else>No refund was issued under the event refund policy.</span>
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
    }
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
        this.result = await cancelGuestRsvpByToken(this.id, this.$route.query.token)
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
</style>
