import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import EventList from '../../../../../src/components/Events/EventList.vue';

describe('EventList', () => {
  it('renders event cards and no modal RSVP flow', () => {
    const wrapper = mount(EventList, {
      props: {
        events: [
          { id: 'e1', name: 'Event 1' },
          { id: 'e2', name: 'Event 2' },
        ],
      },
      global: {
        stubs: {
          EventCard: { template: '<div class="stub-card">{{ event.name }}</div>', props: ['event'] },
        },
      },
    });

    expect(wrapper.findAll('.stub-card')).toHaveLength(2);
    expect(wrapper.html()).not.toContain('rsvp-modal-backdrop');
  });
});
