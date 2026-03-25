<!-- src/views/EventPage.vue -->
<template>
  <div class="event-page-view">
    <section class="featured-events">
      <h1>Upcoming Events</h1>

      <div v-if="loading" class="state-card">
        <p class="muted">Loading events…</p>
      </div>

      <div v-else-if="error" class="state-card error-card">
        <p>{{ error }}</p>
        <button class="btn primary" @click="load">Retry</button>
      </div>

      <div v-else-if="!events.length" class="state-card">
        <p class="muted">No upcoming events right now. Check back soon!</p>
      </div>

      <EventList v-else :events="events" @rsvp-submitted="onRsvpSubmitted" />
    </section>
  </div>
</template>

<script>
import EventList from '@/components/Events/EventList.vue'
import { listEvents } from '@/services/eventService'

export default {
  name: 'EventPage',
  components: { EventList },

  data() {
    return {
      events: [],
      loading: true,
      error: null,
    }
  },

  async created() {
    await this.load()
  },

  methods: {
    async load() {
      this.loading = true
      this.error = null
      try {
        this.events = await listEvents()
      } catch (err) {
        console.error('[EventPage] failed to load events', err)
        this.error = 'Failed to load events. Please try again.'
      } finally {
        this.loading = false
      }
    },

    onRsvpSubmitted() {
      // Refresh to reflect updated capacity
      this.load()
    },
  },
}
</script>

<style scoped>
.event-page-view {
  padding: var(--spacing-2xl);
  max-width: 1000px;
  margin: 0 auto;
  text-align: center;
  color: var(--color-text-primary);
}

.event-page-view h1 {
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xl);
}

.state-card {
  padding: var(--spacing-2xl);
  color: var(--color-text-secondary);
}

.error-card { color: var(--color-error); }
.muted { color: var(--color-text-muted); }

.btn {
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-full);
  border: none;
  cursor: pointer;
  font-size: var(--font-size-base);
  transition: all var(--transition-base);
  min-height: var(--button-height-md);
}

.btn.primary { background: var(--color-primary); color: var(--color-text-on-primary); }
.btn.primary:hover { background: var(--color-primary-hover); }
</style>
