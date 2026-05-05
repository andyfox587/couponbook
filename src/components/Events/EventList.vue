<template>
  <div class="events-container">
    <EventCard
      v-for="ev in events"
      :key="ev.id"
      :event="ev"
      :my-rsvp="myRsvpsByEventId[ev.id] || null"
    />
  </div>
</template>

<script>
import EventCard from '@/components/Events/EventCard.vue';

export default {
  name: 'EventList',
  components: { EventCard },
  props: {
    events: { type: Array, default: () => [] },
    myRsvpsByEventId: { type: Object, default: () => ({}) },
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
}
</style>
