import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import EventDetail from '../../../../../src/views/EventDetail.vue';

vi.mock('../../../../../src/services/eventService.js', () => ({
  getEvent: vi.fn(),
  getEventBySlug: vi.fn(),
}));

vi.mock('../../../../../src/services/authService.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue(''),
}));

import { getEvent } from '../../../../../src/services/eventService.js';

const createStore = (isAuthenticated = false) => ({
  getters: { 'auth/isAuthenticated': isAuthenticated },
  dispatch: vi.fn(),
});

describe('EventDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ hasAccess: false }) });
  });

  it('reloads event data after RSVP events', async () => {
    getEvent.mockResolvedValue({
      id: 'e1',
      name: 'Detail Event',
      description: 'desc',
      startDatetime: new Date().toISOString(),
      capacity: 10,
      confirmedCount: 1,
      isFree: true,
      inviteOnly: false,
      visibility: 'public',
    });

    const wrapper = mount(EventDetail, {
      props: { id: 'e1' },
      global: {
        mocks: {
          $route: { query: {} },
          $router: { push: vi.fn() },
          $store: createStore(),
        },
        stubs: {
          EventRSVP: { template: '<div />' },
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();
    expect(getEvent).toHaveBeenCalledTimes(1);

    await wrapper.vm.onRsvpSubmitted();
    expect(getEvent).toHaveBeenCalledTimes(2);

    await wrapper.vm.onRsvpCancelled();
    expect(getEvent).toHaveBeenCalledTimes(3);
  });

  it('sets hasMembership=false when access check returns false for members-only event', async () => {
    getEvent.mockResolvedValue({
      id: 'e2',
      groupId: 'g1',
      name: 'Members Event',
      description: 'desc',
      startDatetime: new Date().toISOString(),
      capacity: 10,
      confirmedCount: 0,
      isFree: true,
      inviteOnly: false,
      visibility: 'members_only',
    });

    const wrapper = mount(EventDetail, {
      props: { id: 'e2' },
      global: {
        mocks: {
          $route: { query: {} },
          $router: { push: vi.fn() },
          $store: createStore(false),
        },
        stubs: {
          EventRSVP: { template: '<div />' },
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isAuthenticated).toBe(false);
    expect(wrapper.vm.hasMembership).toBe(false);
  });
});
