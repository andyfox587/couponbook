import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import FoodieGroupDashboard from '../../../../../src/components/Dashboard/FoodieGroupDashboard.vue';
import { createMockStore } from '../../../../helpers/vue.js';

vi.mock('../../../../../src/services/authService.js', () => ({
  getAccessToken: vi.fn(),
  signIn: vi.fn(),
}));

global.fetch = vi.fn();

function mockFetchOk(url) {
  if (String(url).includes('/users/me')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: 'user-id',
          email: 'test@example.com',
          name: 'Test User',
          role: 'foodie_group_admin',
        }),
    });
  }
  if (String(url).includes('/groups/my/admin-memberships')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
  }
  if (String(url).includes('/redemption-overview')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          redemptionsLast30Days: 52,
          topCoupon: {
            couponId: 'coupon-1',
            couponTitle: '10% Off Dinner',
            redemptions: 11,
          },
        }),
    });
  }
  if (String(url).includes('/groups/')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          name: 'Test Group',
          description: '',
          location: '',
          bannerImageUrl: '',
          socialLinks: {},
          totalMembers: 0,
        }),
    });
  }
  if (String(url).includes('/event-submissions')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
  }
  if (String(url).includes('/event-overview')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          rsvpsLast30Days: 0,
          topEvent: null,
          upcomingPublishedEvents: 0,
        }),
    });
  }
  if (String(url).includes('/coupon-submissions')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
  }
  if (String(url).includes('/coupons')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  });
}

describe('FoodieGroupDashboard', () => {
  let store;

  beforeEach(() => {
    store = createMockStore();
    global.fetch.mockImplementation(mockFetchOk);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads groupId from route params', () => {
    store.state.auth.isAuthenticated = false;

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'test-uuid-123' } },
          $router: { replace: vi.fn() },
        },
      },
    });

    expect(wrapper.vm.groupId).toBe('test-uuid-123');
  });

  it('redirects to /profile when groupId is missing', () => {
    store.state.auth.isAuthenticated = false;
    const replaceSpy = vi.fn();

    mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: {} },
          $router: { replace: replaceSpy },
        },
      },
    });

    expect(replaceSpy).toHaveBeenCalledWith('/profile');
  });

  it('reloads data when route groupId changes', async () => {
    store.state.auth.isAuthenticated = false;

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'group-1' } },
          $router: { replace: vi.fn() },
        },
      },
    });

    const reloadSpy = vi.spyOn(wrapper.vm, 'reloadAllGroupData');
    await wrapper.vm.$options.watch['$route.params.groupId'].handler.call(
      wrapper.vm,
      'group-2'
    );

    expect(reloadSpy).toHaveBeenCalled();
    expect(wrapper.vm.groupId).toBe('group-2');
  });

  it('shows group selector when admin has multiple groups', async () => {
    store.state.auth.isAuthenticated = true;

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'group-1' } },
          $router: { replace: vi.fn(), push: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      authChecked: true,
      notAuthorized: false,
      adminMemberships: [
        { groupId: 'group-1', name: 'Group One' },
        { groupId: 'group-2', name: 'Group Two' },
      ],
    });

    expect(wrapper.find('.group-selector').exists()).toBe(true);
  });

  it('renders detailed active coupon cards with a single section heading', async () => {
    store.state.auth.isAuthenticated = true;
    const couponPayload = [
      {
        id: 'coupon-1',
        title: '10% Off Dinner',
        description: 'Valid on dine-in orders only.',
        coupon_type: 'percent',
        discount_value: 10,
        valid_from: '2026-03-01T00:00:00.000Z',
        expires_at: '2026-03-31T00:00:00.000Z',
        merchant_name: 'Acme Widgets',
        redemptions: 5,
      },
      {
        id: 'coupon-2',
        title: 'Expired Lunch Deal',
        description: 'This one should not render.',
        coupon_type: 'percent',
        discount_value: 20,
        valid_from: '2025-01-01T00:00:00.000Z',
        expires_at: '2025-01-31T00:00:00.000Z',
        merchant_name: 'Old Merchant',
        redemptions: 99,
      },
    ];

    vi.spyOn(Date, 'now').mockReturnValue(
      new Date('2026-03-15T12:00:00.000Z').getTime()
    );
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/coupons?')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(couponPayload),
        });
      }
      return mockFetchOk(url);
    });

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'group-1' } },
          $router: { replace: vi.fn() },
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('10% Off Dinner');
    expect(wrapper.text()).toContain('Valid on dine-in orders only.');
    expect(wrapper.text()).toContain('Discount: 10%');
    expect(wrapper.text()).toContain(`Active since: ${wrapper.vm.formatDate('2026-03-01T00:00:00.000Z')}`);
    expect(wrapper.text()).toContain(`Expires: ${wrapper.vm.formatDate('2026-03-31T00:00:00.000Z')}`);
    expect(wrapper.text()).toContain('Redemptions: 5');
    expect(wrapper.text()).not.toContain('Expired Lunch Deal');

    const activeCouponHeadings = wrapper
      .findAll('h2, h3')
      .filter((node) => node.text() === 'Active Coupons');
    expect(activeCouponHeadings).toHaveLength(1);
  });

  it('navigates to new group when selector changes', () => {
    store.state.auth.isAuthenticated = false;
    const pushSpy = vi.fn();

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'group-1' } },
          $router: { push: pushSpy, replace: vi.fn() },
        },
      },
    });

    wrapper.vm.switchGroup('group-2');

    expect(pushSpy).toHaveBeenCalledWith({
      name: 'FoodieGroupDashboard',
      params: { groupId: 'group-2' },
    });
  });

  it('renders the group redemption overview cards with labels and values', async () => {
    store.state.auth.isAuthenticated = true;

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'group-1' } },
          $router: { replace: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      authChecked: true,
      notAuthorized: false,
      groupLoaded: true,
      overviewLoading: false,
      overviewError: null,
      groupOverview: {
        counts: { coupons: 12, purchases: { paid: 21 } },
        revenue: { grossCents: 8394 },
        recentPurchases: [],
      },
      redemptionOverviewLoading: false,
      redemptionOverviewError: null,
      redemptionOverview: {
        redemptionsLast30Days: 52,
        topCoupon: {
          couponId: 'coupon-1',
          couponTitle: '10% Off Dinner',
          submittedBy: 'Group Merchant',
          submittedAt: '2026-03-01T12:00:00.000Z',
          expiresAt: '2026-03-31T12:00:00.000Z',
          redemptions: 11,
        },
      },
    });
    await wrapper.vm.$nextTick();

    const text = wrapper.text();
    expect(wrapper.text()).toContain('Group Coupon Performance');
    expect(text).toContain('Group Overview');
    expect(text).toContain('Group Redemptions (Last 30 Days)');
    expect(text).toContain('Top Coupon (Last 30 Days)');
    expect(text).toContain('10% Off Dinner');
    expect(text).toContain('11 redemptions');
    expect(text).toContain('Submitted by: Group Merchant');
    expect(text).toContain(`Submitted at: ${wrapper.vm.formatDate('2026-03-01T12:00:00.000Z')}`);
    expect(text).toContain(`Expires at: ${wrapper.vm.formatDate('2026-03-31T12:00:00.000Z')}`);
    expect(text.indexOf('Group Overview')).toBeLessThan(text.indexOf('Group Coupon Performance'));
  });

  it('renders a safe empty redemption overview state', async () => {
    store.state.auth.isAuthenticated = true;

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'group-1' } },
          $router: { replace: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      authChecked: true,
      notAuthorized: false,
      groupLoaded: true,
      redemptionOverviewLoading: false,
      redemptionOverview: {
        redemptionsLast30Days: 0,
        topCoupon: null,
      },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('None yet');
    expect(wrapper.text()).toContain('0');
  });

  // ─── Event submission moderation ────────────────────────────

  it('renders pending event submission cards when data is loaded', async () => {
    store.state.auth.isAuthenticated = true;

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'group-1' } },
          $router: { replace: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      authChecked: true,
      notAuthorized: false,
      groupLoaded: true,
      pendingEventsLoading: false,
      pendingEventsError: null,
      pendingEvents: [
        {
          id: 'ev-sub-1',
          name: 'Taco Tuesday Bash',
          description: 'Free tacos for members',
          startDatetime: '2026-04-10T18:00:00.000Z',
          location: 'Main Square',
          capacity: 100,
          visibility: 'public',
          merchantName: 'Taco Merchant',
          submittedAt: '2026-03-20T10:00:00.000Z',
        },
      ],
    });
    await wrapper.vm.$nextTick();

    const text = wrapper.text();
    expect(text).toContain('Event Submissions');
    expect(text).toContain('Taco Tuesday Bash');
    expect(text).toContain('Taco Merchant');
    expect(text).toContain('Main Square');
  });

  it('renders empty state when no pending event submissions exist', async () => {
    store.state.auth.isAuthenticated = true;

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'group-1' } },
          $router: { replace: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      authChecked: true,
      notAuthorized: false,
      groupLoaded: true,
      pendingEventsLoading: false,
      pendingEventsError: null,
      pendingEvents: [],
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('No pending event submissions for this group.');
  });

  it('renders event overview analytics section with RSVP data', async () => {
    store.state.auth.isAuthenticated = true;

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'group-1' } },
          $router: { replace: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      authChecked: true,
      notAuthorized: false,
      groupLoaded: true,
      eventOverviewLoading: false,
      eventOverviewError: null,
      eventOverview: {
        rsvpsLast30Days: 42,
        topEvent: {
          eventId: 'ev-1',
          eventName: 'Big Launch Party',
          merchantName: 'Launch Co',
          startDatetime: '2026-04-15T19:00:00.000Z',
          rsvps: 18,
        },
        upcomingPublishedEvents: 3,
      },
    });
    await wrapper.vm.$nextTick();

    const text = wrapper.text();
    expect(text).toContain('Group Event Performance');
    expect(text).toContain('RSVPs (Last 30 Days)');
    expect(text).toContain('42');
    expect(text).toContain('Big Launch Party');
    expect(text).toContain('18 RSVPs');
    expect(text).toContain('Merchant: Launch Co');
    expect(text).toContain('Upcoming Published Events');
    expect(text).toContain('3');
  });

  it('renders event overview empty state when no events exist', async () => {
    store.state.auth.isAuthenticated = true;

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'group-1' } },
          $router: { replace: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      authChecked: true,
      notAuthorized: false,
      groupLoaded: true,
      eventOverviewLoading: false,
      eventOverviewError: null,
      eventOverview: {
        rsvpsLast30Days: 0,
        topEvent: null,
        upcomingPublishedEvents: 0,
      },
    });
    await wrapper.vm.$nextTick();

    const text = wrapper.text();
    expect(text).toContain('Group Event Performance');
    expect(text).toContain('None yet');
  });

  it('shows Published Events and Pending Event Submissions stats in the overview', async () => {
    store.state.auth.isAuthenticated = true;

    const wrapper = mount(FoodieGroupDashboard, {
      global: {
        plugins: [store],
        mocks: {
          $route: { params: { groupId: 'group-1' } },
          $router: { replace: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      authChecked: true,
      notAuthorized: false,
      groupLoaded: true,
      overviewLoading: false,
      overviewError: null,
      groupOverview: {
        counts: {
          coupons: 5,
          events: { published: 7 },
          eventSubmissions: { pending: 2, approved: 4, rejected: 1 },
          purchases: { paid: 10 },
        },
        revenue: { grossCents: 5000 },
        recentPurchases: [],
      },
    });
    await wrapper.vm.$nextTick();

    const text = wrapper.text();
    expect(text).toContain('Published Events');
    expect(text).toContain('7');
    expect(text).toContain('Pending Event Submissions');
    expect(text).toContain('2');
  });
});
