import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import EventPage from '../../../../../src/views/EventPage.vue';

vi.mock('../../../../../src/services/eventService.js', () => ({
  listEvents: vi.fn(),
}));

import { listEvents } from '../../../../../src/services/eventService.js';

describe('EventPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and renders events from API', async () => {
    listEvents.mockResolvedValueOnce([{ id: 'e1', name: 'Live Event' }]);

    const wrapper = mount(EventPage, {
      global: {
        stubs: {
          EventList: { template: '<div class="event-list-stub">{{ events.length }}</div>', props: ['events'] },
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(listEvents).toHaveBeenCalled();
    expect(wrapper.find('.event-list-stub').text()).toBe('1');
  });
});
