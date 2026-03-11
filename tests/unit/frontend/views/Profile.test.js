import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Profile from '../../../../src/views/Profile.vue';
import { createMockStore } from '../../../helpers/vue.js';

vi.mock('../../../../src/services/authService.js', () => ({
  getAccessToken: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn(),
}));

global.fetch = vi.fn();

function mockFetch(url) {
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
          merchants: [],
        }),
    });
  }
  if (String(url).includes('/groups/my/admin-memberships')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ groupId: 'g1', name: 'Group 1' }]),
    });
  }
  if (String(url).includes('/coupons/redemptions/merchant-overview')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          redemptionsLast30Days: 18,
          topCoupon: {
            couponId: 'coupon-1',
            couponTitle: 'Free Appetizer',
            redemptions: 7,
          },
        }),
    });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
  });
}

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Profile - Admin Memberships', () => {
  let store;

  beforeEach(() => {
    store = createMockStore();
    store.state.auth.isAuthenticated = true;
    global.fetch.mockImplementation(mockFetch);
    vi.clearAllMocks();
  });

  it('fetches admin memberships on load', async () => {
    const wrapper = mount(Profile, {
      global: {
        plugins: [store],
        mocks: {
          $router: { push: vi.fn() },
        },
      },
    });

    await flushPromises();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/groups/my/admin-memberships',
      expect.any(Object)
    );

    wrapper.unmount();
  });

  it('shows "Go to Dashboard" button when user has admin memberships', async () => {
    const wrapper = mount(Profile, {
      global: {
        plugins: [store],
        mocks: {
          $router: { push: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      user: { role: 'foodie_group_admin' },
      adminMemberships: [{ groupId: 'g1', name: 'Group 1' }],
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-test="foodie-group-dashboard-btn"]').exists()).toBe(true);
  });

  it('hides "Go to Dashboard" button when user has no admin memberships', async () => {
    const wrapper = mount(Profile, {
      global: {
        plugins: [store],
        mocks: {
          $router: { push: vi.fn() },
        },
      },
    });

    await wrapper.setData({ adminMemberships: [] });

    expect(wrapper.find('[data-test="foodie-group-dashboard-btn"]').exists()).toBe(false);
  });

  it('navigates to stored lastAdminGroupId if valid', async () => {
    const pushSpy = vi.fn();

    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/groups/my/admin-memberships')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              { groupId: 'group-1', name: 'Group 1' },
              { groupId: 'group-2', name: 'Group 2' },
            ]),
        });
      }
      return mockFetch(url);
    });

    const wrapper = mount(Profile, {
      global: {
        plugins: [store],
        mocks: {
          $router: { push: pushSpy },
        },
      },
    });

    await wrapper.setData({
      user: { role: 'foodie_group_admin' },
      adminMemberships: [
        { groupId: 'group-1', name: 'Group 1' },
        { groupId: 'group-2', name: 'Group 2' },
      ],
    });
    await wrapper.vm.$nextTick();

    localStorage.setItem('lastAdminGroupId', 'group-2');
    const getItemSpy = vi
      .spyOn(window.localStorage, 'getItem')
      .mockReturnValue('group-2');
    wrapper.vm.goToFoodieGroupDashboard();

    expect(pushSpy).toHaveBeenCalledWith({
      name: 'FoodieGroupDashboard',
      params: { groupId: 'group-2' },
    });
    getItemSpy.mockRestore();
  });

  it('falls back to first group when lastAdminGroupId is invalid', async () => {
    localStorage.setItem('lastAdminGroupId', 'invalid-group');
    const pushSpy = vi.fn();

    const wrapper = mount(Profile, {
      global: {
        plugins: [store],
        mocks: {
          $router: { push: pushSpy },
        },
      },
    });

    await wrapper.setData({
      user: { role: 'foodie_group_admin' },
      adminMemberships: [
        { groupId: 'group-1', name: 'Group 1' },
        { groupId: 'group-2', name: 'Group 2' },
      ],
    });
    await wrapper.vm.$nextTick();

    wrapper.vm.goToFoodieGroupDashboard();

    expect(pushSpy).toHaveBeenCalledWith({
      name: 'FoodieGroupDashboard',
      params: { groupId: 'group-1' },
    });
  });

  it('displays "Super Admin" for super_admin role', async () => {
    const wrapper = mount(Profile, {
      global: {
        plugins: [store],
        mocks: {
          $router: { push: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      user: { role: 'super_admin' },
    });

    expect(wrapper.vm.roleLabel).toBe('Super Admin');
  });

  it('displays "Foodie Group Admin" for foodie_group_admin role', async () => {
    const wrapper = mount(Profile, {
      global: {
        plugins: [store],
        mocks: {
          $router: { push: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      user: { role: 'foodie_group_admin' },
    });

    expect(wrapper.vm.roleLabel).toBe('Foodie Group Admin');
  });

  it('renders merchant redemption analytics from mocked API data', async () => {
    const wrapper = mount(Profile, {
      global: {
        plugins: [store],
        mocks: {
          $router: { push: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      user: { role: 'merchant' },
      merchants: [{ id: 'merchant-1', name: 'Test Merchant' }],
      merchantOverviewLoading: false,
      merchantOverview: {
        redemptionsLast30Days: 18,
        topCoupon: {
          couponId: 'coupon-1',
          couponTitle: 'Free Appetizer',
          redemptions: 7,
        },
      },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Merchant Tools');
    expect(wrapper.text()).toContain('Redemptions (Last 30 Days)');
    expect(wrapper.text()).toContain('18');
    expect(wrapper.text()).toContain('Free Appetizer');
    expect(wrapper.text()).toContain('7 redemptions');
  });

  it('renders a safe merchant empty state when topCoupon is null', async () => {
    const wrapper = mount(Profile, {
      global: {
        plugins: [store],
        mocks: {
          $router: { push: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      user: { role: 'merchant' },
      merchants: [{ id: 'merchant-1', name: 'Test Merchant' }],
      merchantOverviewLoading: false,
      merchantOverview: {
        redemptionsLast30Days: 0,
        topCoupon: null,
      },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('None yet');
    expect(wrapper.text()).toContain('0');
  });

  it('renders merchant analytics error state without breaking the dashboard', async () => {
    const wrapper = mount(Profile, {
      global: {
        plugins: [store],
        mocks: {
          $router: { push: vi.fn() },
        },
      },
    });

    await wrapper.setData({
      user: { role: 'merchant' },
      merchants: [{ id: 'merchant-1', name: 'Test Merchant' }],
      merchantOverviewLoading: false,
      merchantOverviewError: 'Could not load recent coupon performance.',
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Could not load recent coupon performance.');
    expect(wrapper.text()).toContain('Merchant Tools');
  });
});
