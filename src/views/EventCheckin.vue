<template>
  <main class="checkin container">
    <section class="card">
      <h1>Event Check-In</h1>

      <div v-if="!isAuthenticated" class="state-box">
        <p>Door check-in requires a merchant or admin sign-in.</p>
        <button class="btn btn-primary" @click="signIn()">Sign In</button>
      </div>

      <div v-else-if="loading" class="muted">Looking up ticket…</div>

      <template v-else-if="ticket">
        <!-- Verdict banner -->
        <div class="verdict" :class="verdictClass">
          <span class="verdict-icon">{{ verdictIcon }}</span>
          <span class="verdict-text">{{ verdictText }}</span>
        </div>

        <table class="guest-table">
          <tbody>
            <tr><td class="label">Guest</td><td><strong>{{ ticket.guestName || ticket.guestEmail || 'Guest' }}</strong></td></tr>
            <tr v-if="ticket.guestEmail && ticket.guestName"><td class="label">Email</td><td>{{ ticket.guestEmail }}</td></tr>
            <tr><td class="label">Party size</td><td>{{ ticket.attendees }} {{ ticket.attendees === 1 ? 'guest' : 'guests' }}</td></tr>
            <tr><td class="label">Status</td><td>{{ statusLabel }}</td></tr>
          </tbody>
        </table>

        <div v-if="checkinError" class="error-msg">{{ checkinError }}</div>

        <div class="actions">
          <button
            v-if="ticket.admit && !ticket.alreadyCheckedIn && !checkedIn"
            class="btn btn-primary btn-big"
            :disabled="submitting"
            @click="confirmCheckin"
          >
            {{ submitting ? 'Checking in…' : `Check In ${ticket.attendees > 1 ? `(${ticket.attendees} guests)` : ''}` }}
          </button>
          <p v-else-if="checkedIn" class="checked-in-note">✓ Checked in. Enjoy the event!</p>
        </div>
      </template>

      <div v-else class="state-box">
        <div class="verdict verdict-bad">
          <span class="verdict-icon">✕</span>
          <span class="verdict-text">{{ error || 'Ticket not found' }}</span>
        </div>
        <p class="muted tiny">
          Make sure you scanned a ticket for this event, and that you're signed in
          as a manager of this event.
        </p>
      </div>
    </section>
  </main>
</template>

<script>
import { lookupTicket, checkinTicket } from '@/services/eventService'
import { getCurrentUser, signIn } from '@/services/authService'

export default {
  name: 'EventCheckin',

  props: {
    id: { type: String, required: true }, // eventId from route
  },

  data() {
    return {
      isAuthenticated: false,
      loading: true,
      submitting: false,
      ticket: null,
      checkedIn: false,
      error: null,
      checkinError: null,
    }
  },

  computed: {
    verdictClass() {
      if (this.checkedIn) return 'verdict-good'
      if (!this.ticket) return 'verdict-bad'
      if (this.ticket.status === 'cancelled') return 'verdict-bad'
      if (this.ticket.alreadyCheckedIn) return 'verdict-warn'
      return this.ticket.admit ? 'verdict-good' : 'verdict-warn'
    },
    verdictIcon() {
      if (this.checkedIn) return '✓'
      if (!this.ticket || this.ticket.status === 'cancelled') return '✕'
      if (this.ticket.alreadyCheckedIn) return '!'
      return this.ticket.admit ? '✓' : '!'
    },
    verdictText() {
      if (this.checkedIn) return 'Checked in'
      if (!this.ticket) return 'Invalid ticket'
      if (this.ticket.status === 'cancelled') return 'CANCELLED — do not admit'
      if (this.ticket.alreadyCheckedIn) return 'Already checked in — possible duplicate ticket'
      if (this.ticket.admit) return 'Valid ticket'
      return `Not admissible (${this.ticket.status})`
    },
    statusLabel() {
      const map = {
        going: 'Confirmed',
        checked_in: 'Checked in',
        cancelled: 'Cancelled',
        waitlist: 'Waitlist (not confirmed)',
        no_show: 'Marked no-show',
      }
      return map[this.ticket?.status] || this.ticket?.status || '—'
    },
  },

  async created() {
    this.signIn = signIn
    try {
      const currentUser = await getCurrentUser()
      this.isAuthenticated = !!currentUser && !currentUser.expired
    } catch {
      this.isAuthenticated = false
    }
    if (!this.isAuthenticated) {
      this.loading = false
      return
    }

    const code = String(this.$route.query.code || '').trim()
    if (!code) {
      this.error = 'No ticket code in this link.'
      this.loading = false
      return
    }

    try {
      this.ticket = await lookupTicket(this.id, code)
    } catch (err) {
      this.error = err.message || 'Ticket lookup failed.'
    } finally {
      this.loading = false
    }
  },

  methods: {
    async confirmCheckin() {
      this.submitting = true
      this.checkinError = null
      try {
        await checkinTicket(this.id, String(this.$route.query.code || '').trim())
        this.checkedIn = true
        this.ticket.status = 'checked_in'
      } catch (err) {
        this.checkinError = err.message || 'Check-in failed.'
        if (err.body?.status === 'already_checked_in') this.ticket.alreadyCheckedIn = true
        if (err.body?.status === 'cancelled') this.ticket.status = 'cancelled'
      } finally {
        this.submitting = false
      }
    },
  },
}
</script>

<style scoped>
.checkin {
  max-width: 520px;
  margin: 0 auto;
  padding: var(--spacing-2xl, 32px) var(--spacing-lg, 16px);
}

.card {
  padding: var(--spacing-xl, 24px);
}

.verdict {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 14px 18px;
  border-radius: 10px;
  font-size: 1.15rem;
  font-weight: 700;
  margin: var(--spacing-md, 12px) 0 var(--spacing-lg, 16px);
}

.verdict-good { background: #e7f6ef; color: #14674b; }
.verdict-warn { background: #fdf3e0; color: #8a6217; }
.verdict-bad  { background: #fdeaea; color: #8f1d1d; }

.verdict-icon { font-size: 1.5rem; }

.guest-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: var(--spacing-lg, 16px);
}

.guest-table td {
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.guest-table .label {
  color: var(--color-text-muted, #6b7280);
  width: 110px;
  font-size: 0.9rem;
}

.btn-big {
  width: 100%;
  padding: 14px;
  font-size: 1.05rem;
}

.checked-in-note {
  font-weight: 600;
  color: #14674b;
}

.state-box { margin-top: var(--spacing-md, 12px); }
.muted { color: var(--color-text-muted, #6b7280); }
.tiny { font-size: 0.85rem; }
.error-msg { color: #8f1d1d; margin-bottom: 0.75rem; }
</style>
