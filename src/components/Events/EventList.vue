<template>
  <div class="events-container">
    <EventCard
      v-for="ev in events"
      :key="ev.id"
      :event="ev"
      @rsvp="activeRsvpEvent = ev"
    />
    <!-- Inline RSVP modal -->
    <div v-if="activeRsvpEvent" class="rsvp-modal-backdrop" @click.self="activeRsvpEvent = null">
      <div class="rsvp-modal">
        <button class="close-btn" @click="activeRsvpEvent = null">
          <i class="pi pi-times"></i>
        </button>
        <EventRSVP
          :event="activeRsvpEvent"
          @rsvp-submitted="onRsvpSubmitted"
          @rsvp-cancelled="activeRsvpEvent = null"
        />
      </div>
    </div>
  </div>
</template>

<script>
import EventCard from '@/components/Events/EventCard.vue';
import EventRSVP from '@/components/Events/EventRSVP.vue';

export default {
  name: 'EventList',
  components: { EventCard, EventRSVP },
  props: {
    events: { type: Array, default: () => [] },
  },
  emits: ['rsvp-submitted'],
  data() {
    return { activeRsvpEvent: null }
  },
  methods: {
    onRsvpSubmitted(rsvp) {
      this.activeRsvpEvent = null
      this.$emit('rsvp-submitted', rsvp)
    },
  },
};
</script>

<style scoped>
.events-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: stretch;
  gap: var(--spacing-lg);
  color: var(--color-text-primary);
  position: relative;
}

.rsvp-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.rsvp-modal {
  position: relative;
  width: 100%;
  max-width: 420px;
  margin: var(--spacing-lg);
}

.close-btn {
  position: absolute;
  top: var(--spacing-sm);
  right: var(--spacing-sm);
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
  z-index: 1;
  padding: var(--spacing-xs);
}
</style>
