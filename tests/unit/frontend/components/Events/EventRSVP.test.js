import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import EventRSVP from '../../../../../src/components/Events/EventRSVP.vue';

vi.mock('../../../../../src/services/eventService.js', () => ({
  createRsvp: vi.fn(),
  cancelRsvp: vi.fn(),
}));

import { createRsvp, cancelRsvp } from '../../../../../src/services/eventService.js';

describe('EventRSVP', () => {
  const publicEvent = {
    id: 'evt-1',
    name: 'RSVP Event',
    maxTicketsPerGuest: 2,
    visibility: 'public',
  };
  const paidPublicEvent = {
    id: 'evt-paid-1',
    name: 'Paid RSVP Event',
    maxTicketsPerGuest: 2,
    visibility: 'public',
    isFree: false,
    priceCents: 4200,
  };

  const membersOnlyEvent = {
    id: 'evt-2',
    name: 'Members Event',
    maxTicketsPerGuest: 1,
    visibility: 'members_only',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits RSVP and shows success state', async () => {
    createRsvp.mockResolvedValueOnce({ id: 'r1', status: 'going' });
    const wrapper = mount(EventRSVP, { props: { event: publicEvent } });

    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.vm.$nextTick();

    expect(createRsvp).toHaveBeenCalled();
    expect(wrapper.text()).toContain("You're in!");
  });

  it('shows inline error when cancel fails', async () => {
    createRsvp.mockResolvedValueOnce({ id: 'r1', status: 'going' });
    cancelRsvp.mockRejectedValueOnce(new Error('boom'));

    const wrapper = mount(EventRSVP, { props: { event: publicEvent } });
    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.vm.$nextTick();

    await wrapper.find('button.btn.secondary').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('boom');
  });

  // ── Members-only gating ────────────────────────────────────────

  it('shows sign-in gate for members-only event when not authenticated', () => {
    const wrapper = mount(EventRSVP, {
      props: { event: membersOnlyEvent, isAuthenticated: false, hasMembership: false },
    });

    expect(wrapper.text()).toContain('Members Only');
    expect(wrapper.text()).toContain('Sign in');
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('emits login-requested when sign-in button is clicked', async () => {
    const wrapper = mount(EventRSVP, {
      props: { event: membersOnlyEvent, isAuthenticated: false, hasMembership: false },
    });

    await wrapper.find('button.btn.primary').trigger('click');
    expect(wrapper.emitted('login-requested')).toHaveLength(1);
  });

  it('shows purchase-required gate for authenticated user without membership', () => {
    const wrapper = mount(EventRSVP, {
      props: { event: membersOnlyEvent, isAuthenticated: true, hasMembership: false },
    });

    expect(wrapper.text()).toContain('Coupon Book Required');
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('shows RSVP form for authenticated member on members-only event', () => {
    const wrapper = mount(EventRSVP, {
      props: { event: membersOnlyEvent, isAuthenticated: true, hasMembership: true },
    });

    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.text()).toContain('RSVP for Members Event');
  });

  it('shows RSVP form for public events regardless of auth', () => {
    const wrapper = mount(EventRSVP, {
      props: { event: publicEvent, isAuthenticated: false, hasMembership: false },
    });

    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('requires demo checkout before submitting RSVP on paid events', async () => {
    createRsvp.mockResolvedValueOnce({ id: 'r-paid-1', status: 'going' });
    const wrapper = mount(EventRSVP, { props: { event: paidPublicEvent } });

    expect(wrapper.text()).toContain('Demo Checkout Required');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();

    await wrapper.find('button.checkout-btn').trigger('click');
    expect(wrapper.text()).toContain('Demo Stripe Checkout');

    const completeBtn = wrapper
      .findAll('button')
      .find((btn) => btn.text().includes('Complete Demo Payment'));
    await completeBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.checkout-overlay').exists()).toBe(false);
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();

    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.vm.$nextTick();
    expect(createRsvp).toHaveBeenCalled();
    expect(wrapper.text()).toContain("You're in!");
  });
});
