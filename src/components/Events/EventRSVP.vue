<template>
  <div class="event-rsvp">
    <!-- Success state -->
    <div v-if="rsvpResult" class="rsvp-success">
      <i class="pi pi-check-circle success-icon"></i>
      <h3 v-if="rsvpResult.status === 'going'">You're in!</h3>
      <h3 v-else>You're on the waitlist</h3>
      <p v-if="rsvpResult.status === 'waitlist'" class="waitlist-pos">
        Waitlist position: #{{ rsvpResult.waitlistPosition }}
      </p>
      <button class="btn secondary" @click="cancelConfirmed">Cancel RSVP</button>
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

      <button type="submit" class="btn primary" :disabled="submitting">
        {{ submitting ? 'Submitting…' : 'RSVP Now' }}
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
  },

  emits: ['rsvp-submitted', 'rsvp-cancelled'],

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
    }
  },

  methods: {
    async submitRSVP() {
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
      try {
        await cancelRsvp(this.event.id, this.rsvpResult.id)
        const prev = this.rsvpResult
        this.rsvpResult = null
        this.$emit('rsvp-cancelled', prev)
      } catch (err) {
        console.error('[EventRSVP] cancelRsvp error', err)
        alert(`Cancel failed: ${err.message}`)
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

.rsvp-success {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
}

.success-icon { font-size: 3rem; color: var(--color-success); }
.waitlist-pos { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
</style>
