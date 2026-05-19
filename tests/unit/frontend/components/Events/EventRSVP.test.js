import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import EventRSVP from '../../../../../src/components/Events/EventRSVP.vue';

vi.mock('../../../../../src/services/eventService.js', () => ({
  createRsvp: vi.fn(),
  cancelRsvp: vi.fn(),
}));

import { createRsvp, cancelRsvp } from '../../../../../src/services/eventService.js';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  let originalLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    originalLocation = window.location;
    delete window.location;
    window.location = { assign: vi.fn(), href: '' };
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('submits RSVP and shows success state', async () => {
    createRsvp.mockResolvedValueOnce({ id: 'r1', status: 'going' });
    const wrapper = mount(EventRSVP, { props: { event: publicEvent } });

    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.vm.$nextTick();

    expect(createRsvp).toHaveBeenCalled();
    expect(wrapper.text()).toContain("You're going");
  });

  it('shows inline error when cancel fails', async () => {
    createRsvp.mockResolvedValueOnce({ id: 'r1', status: 'going' });
    cancelRsvp.mockRejectedValueOnce(new Error('boom'));

    const wrapper = mount(EventRSVP, { props: { event: publicEvent } });
    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.vm.$nextTick();

    await wrapper.find('button.btn-secondary').trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('boom');
  });

  it('renders an existing RSVP and cancels it without a fresh submit', async () => {
    cancelRsvp.mockResolvedValueOnce({ cancelled: true });

    const wrapper = mount(EventRSVP, {
      props: {
        event: publicEvent,
        existingRsvp: { id: 'r-existing', eventId: 'evt-1', status: 'going', attendees: 2 },
      },
    });

    expect(wrapper.text()).toContain("You're going");
    expect(wrapper.text()).toContain('2 guests');
    expect(wrapper.find('form').exists()).toBe(false);

    await wrapper.find('button.btn-secondary').trigger('click');
    await wrapper.vm.$nextTick();

    expect(createRsvp).not.toHaveBeenCalled();
    expect(cancelRsvp).toHaveBeenCalledWith('evt-1', 'r-existing');
    expect(wrapper.emitted('rsvp-cancelled')?.[0]?.[0]).toMatchObject({ id: 'r-existing' });
  });

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

    await wrapper.find('button.btn-primary').trigger('click');
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

  it('requires refund policy acknowledgment before starting paid checkout', async () => {
    const wrapper = mount(EventRSVP, { props: { event: paidPublicEvent } });

    expect(wrapper.text()).toContain('Paid Event Ticket');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
  });

  it('redirects to Stripe Checkout URL for paid events', async () => {
    createRsvp.mockResolvedValueOnce({
      requiresPayment: true,
      orderId: 'eo_1',
      checkoutUrl: 'https://checkout.stripe.com/test/cs_123',
      checkoutSessionId: 'cs_123',
      amountCents: 4200,
      currency: 'usd',
    });
    const wrapper = mount(EventRSVP, { props: { event: paidPublicEvent } });

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(createRsvp).toHaveBeenCalledWith('evt-paid-1', expect.objectContaining({ refund_policy_accepted: true }));
    expect(window.location.assign).toHaveBeenCalledWith('https://checkout.stripe.com/test/cs_123');
    expect(wrapper.text()).toContain('Redirecting to secure checkout');
  });

  it('prefills name and email from userProfile for signed-in users', () => {
    const wrapper = mount(EventRSVP, {
      props: {
        event: publicEvent,
        isAuthenticated: true,
        userProfile: { name: 'Ada Lovelace', email: 'ada@example.com' },
      },
    });

    const nameInput = wrapper.find('#rsvp-name').element;
    const emailInput = wrapper.find('#rsvp-email').element;
    expect(nameInput.value).toBe('Ada Lovelace');
    expect(emailInput.value).toBe('ada@example.com');
    expect(wrapper.text()).toContain('from your account');
  });

  it('does not clobber user-edited fields when profile resolves later', async () => {
    const wrapper = mount(EventRSVP, {
      props: { event: publicEvent, isAuthenticated: true, userProfile: null },
    });

    const nameInput = wrapper.find('#rsvp-name');
    await nameInput.setValue('Custom Name');

    await wrapper.setProps({ userProfile: { name: 'Profile Name', email: 'profile@example.com' } });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('#rsvp-name').element.value).toBe('Custom Name');
    expect(wrapper.find('#rsvp-email').element.value).toBe('profile@example.com');
  });
});
