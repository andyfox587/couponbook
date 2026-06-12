import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import EventRSVP from '../../../../../src/components/Events/EventRSVP.vue';

vi.mock('../../../../../src/services/eventService.js', () => ({
  createRsvp: vi.fn(),
  cancelRsvp: vi.fn(),
  getCancelPreview: vi.fn(),
}));

import { createRsvp, cancelRsvp, getCancelPreview } from '../../../../../src/services/eventService.js';

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

  it('shows the error inside the cancel dialog when cancellation fails', async () => {
    createRsvp.mockResolvedValueOnce({ id: 'r1', status: 'going' });
    getCancelPreview.mockResolvedValueOnce({ rsvpId: 'r1', attendees: 1, order: null, refundQuote: null });
    cancelRsvp.mockRejectedValueOnce(new Error('boom'));

    const wrapper = mount(EventRSVP, { props: { event: publicEvent } });
    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.vm.$nextTick();

    // Opens the confirmation dialog instead of cancelling immediately
    await wrapper.find('button.btn-secondary').trigger('click');
    await flushPromises();
    expect(cancelRsvp).not.toHaveBeenCalled();
    expect(wrapper.find('.cancel-modal').exists()).toBe(true);

    await wrapper.find('.cancel-modal .btn-danger').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('boom');
  });

  it('renders an existing RSVP and cancels it through the confirm dialog', async () => {
    getCancelPreview.mockResolvedValueOnce({ rsvpId: 'r-existing', attendees: 2, order: null, refundQuote: null });
    cancelRsvp.mockResolvedValueOnce({ cancelled: true, refundAmountCents: 0, creditAmountCents: 0 });

    const wrapper = mount(EventRSVP, {
      props: {
        event: publicEvent,
        existingRsvp: { id: 'r-existing', eventId: 'evt-1', status: 'going', attendees: 2 },
      },
    });

    expect(wrapper.text()).toContain("You're going");
    expect(wrapper.text()).toContain('2 guests');
    expect(wrapper.find('form').exists()).toBe(false);

    // Step 1: open the dialog — nothing is cancelled yet
    await wrapper.find('button.btn-secondary').trigger('click');
    await flushPromises();
    expect(cancelRsvp).not.toHaveBeenCalled();
    expect(wrapper.find('.cancel-modal').exists()).toBe(true);

    // Step 2: confirm in the dialog
    await wrapper.find('.cancel-modal .btn-danger').trigger('click');
    await flushPromises();
    expect(createRsvp).not.toHaveBeenCalled();
    expect(cancelRsvp).toHaveBeenCalledWith('evt-1', 'r-existing', null, 'cash');

    // Step 3: success state shows, then Done emits rsvp-cancelled
    expect(wrapper.text()).toContain('Your RSVP has been cancelled');
    await wrapper.find('.cancel-modal .btn-primary').trigger('click');
    expect(wrapper.emitted('rsvp-cancelled')?.[0]?.[0]).toMatchObject({ id: 'r-existing' });
  });

  it('asks before spending an event credit, then resubmits with the choice', async () => {
    // First submit: backend pauses for a credit decision (no order created)
    createRsvp.mockResolvedValueOnce({
      requiresCreditDecision: true,
      credit: { amountCents: 1250, currency: 'usd', expiresAt: '2027-06-10T00:00:00Z' },
      ticketTotalCents: 50,
      currency: 'usd',
    });
    // Second submit (after "Yes"): paid with credit
    createRsvp.mockResolvedValueOnce({
      requiresPayment: false,
      paidWithCredit: true,
      status: 'paid',
      orderId: 'o1',
      creditAppliedCents: 50,
    });

    const wrapper = mount(EventRSVP, { props: { event: paidPublicEvent } });
    await wrapper.find('input#rsvp-name').setValue('Andy');
    await wrapper.find('input#rsvp-email').setValue('andy@example.com');
    await wrapper.find('.policy-check input[type="checkbox"]').setValue(true);
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    // Prompt shown, nothing committed yet
    expect(wrapper.find('.credit-prompt').exists()).toBe(true);
    expect(wrapper.text()).toContain('Use your event credit?');
    expect(createRsvp).toHaveBeenCalledTimes(1);
    expect(createRsvp.mock.calls[0][1].use_credit).toBeUndefined();

    // Guest says yes → resubmits with use_credit: true
    await wrapper.find('.credit-prompt .btn-primary').trigger('click');
    await flushPromises();

    expect(createRsvp).toHaveBeenCalledTimes(2);
    expect(createRsvp.mock.calls[1][1].use_credit).toBe(true);
    expect(wrapper.find('.credit-prompt').exists()).toBe(false);
    expect(wrapper.text()).toContain('Paid with your event credit');
  });

  it('keeps the credit and proceeds to card payment when guest declines', async () => {
    createRsvp.mockResolvedValueOnce({
      requiresCreditDecision: true,
      credit: { amountCents: 1250, currency: 'usd', expiresAt: '2027-06-10T00:00:00Z' },
      ticketTotalCents: 50,
      currency: 'usd',
    });
    createRsvp.mockResolvedValueOnce({
      requiresPayment: true,
      checkoutUrl: 'https://checkout.stripe.com/test',
    });

    const wrapper = mount(EventRSVP, { props: { event: paidPublicEvent } });
    await wrapper.find('input#rsvp-name').setValue('Andy');
    await wrapper.find('input#rsvp-email').setValue('andy@example.com');
    await wrapper.find('.policy-check input[type="checkbox"]').setValue(true);
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();

    await wrapper.find('.credit-prompt .btn-secondary').trigger('click');
    await flushPromises();

    expect(createRsvp.mock.calls[1][1].use_credit).toBe(false);
    expect(window.location.assign).toHaveBeenCalledWith('https://checkout.stripe.com/test');
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
