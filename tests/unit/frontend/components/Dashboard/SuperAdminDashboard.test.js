// SuperAdminDashboard component tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import SuperAdminDashboard from '../../../../../src/components/Dashboard/SuperAdminDashboard.vue';
import { createMockStore, createMockRouter } from '../../../../helpers/vue.js';

// Mock authService - can't reference external variables in vi.mock factory
vi.mock('../../../../../src/services/authService.js', () => ({
  getAccessToken: vi.fn(),
  signIn: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn();

function mockDashboardFetch(url) {
  if (String(url).includes('/users/me')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({
        id: 'user-id',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'super_admin',
      }),
    });
  }

  if (String(url).includes('/admin/redemption-overview')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({
        redemptionsLast30Days: 421,
        topGroup: {
          groupId: 'group-1',
          groupName: 'Charlotte Foodie Group',
          redemptions: 88,
        },
        recentRedemptions: [
          {
            redemptionId: 'redemption-1',
            redeemedAt: '2026-03-10T00:00:00.000Z',
            couponId: 'coupon-1',
            couponTitle: 'Free App',
            merchantId: 'merchant-1',
            merchantName: 'Burger Shop',
            groupId: 'group-1',
            groupName: 'Charlotte Foodie Group',
            customerEmail: 'customer@example.com',
          },
        ],
      }),
    });
  }

  if (String(url).includes('/admin/overview')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({
        counts: {
          users: { total: 10 },
          merchants: 4,
          foodieGroups: 3,
          coupons: 8,
          couponSubmissions: { pending: 1 },
          purchases: { paid: 5 },
        },
        paymentHealth: { unprocessedEvents: 0, failedEvents: 0 },
        trends: { last30Days: { signups: 2, purchases: 3 } },
        revenue: { grossCents: 12000 },
      }),
    });
  }

  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue({}),
  });
}

describe('SuperAdminDashboard', () => {
  let wrapper;
  let store;
  let router;
  let mockGetAccessToken;
  let mockSignIn;

  beforeEach(async () => {
    // Import the mocked module to access the mock functions
    const authService = await import('../../../../../src/services/authService.js');
    mockGetAccessToken = authService.getAccessToken;
    mockSignIn = authService.signIn;

    store = createMockStore({
      auth: {
        namespaced: true,
        state: {
          isAuthenticated: false,
          user: null,
        },
        getters: {
          isAuthenticated: (state) => state.isAuthenticated,
        },
      },
    });

    router = createMockRouter();

    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue('test-token');
  });

  it('should show sign-in prompt when not authenticated', () => {
    wrapper = mount(SuperAdminDashboard, {
      global: {
        plugins: [store, router],
      },
    });

    expect(wrapper.text()).toContain('Sign In to Your Account');
    expect(wrapper.find('.signin-card').exists()).toBe(true);
  });

  it('should show access check message when authenticated but role unknown', async () => {
    store.state.auth.isAuthenticated = true;
    mockGetAccessToken.mockResolvedValue('test-token');
    global.fetch.mockImplementation(mockDashboardFetch);

    wrapper = mount(SuperAdminDashboard, {
      global: {
        plugins: [store, router],
      },
    });

    // Wait for component to initialize and check auth
    await wrapper.vm.$nextTick();
    // The component should show checking initially
    expect(wrapper.text()).toMatch(/Checking your super admin permissions|Super Admin Dashboard/);
  });

  it('should show access denied for non-admin users', async () => {
    store.state.auth.isAuthenticated = true;
    mockGetAccessToken.mockResolvedValue('test-token');
    
    const mockJson = vi.fn().mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
      name: 'Test User',
      role: 'customer',
    });
    
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: mockJson,
    });

    wrapper = mount(SuperAdminDashboard, {
      global: {
        plugins: [store, router],
      },
    });

    // Wait for created() hook to complete (which calls loadCurrentUser)
    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Access Denied');
    expect(wrapper.vm.notAuthorized).toBe(true);
  });

  it('should deny access for legacy admin role', async () => {
    store.state.auth.isAuthenticated = true;
    mockGetAccessToken.mockResolvedValue('test-token');

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: vi.fn().mockResolvedValue({
        id: 'user-id',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
      }),
    });

    wrapper = mount(SuperAdminDashboard, {
      global: {
        plugins: [store, router],
      },
    });

    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.notAuthorized).toBe(true);
    expect(wrapper.text()).toContain('Access Denied');
  });

  it('should show dashboard for super admin users', async () => {
    store.state.auth.isAuthenticated = true;
    mockGetAccessToken.mockResolvedValue('test-token');
    
    const mockJson = vi.fn().mockResolvedValue({
      id: 'user-id',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'super_admin',
    });
    
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: mockJson,
    });

    wrapper = mount(SuperAdminDashboard, {
      global: {
        plugins: [store, router],
      },
    });

    // Wait for created() hook to complete (which calls loadCurrentUser)
    await wrapper.vm.$nextTick();
    // Wait a bit more for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Super Admin Dashboard');
    expect(wrapper.text()).toContain('Platform Overview');
    expect(wrapper.vm.notAuthorized).toBe(false);
  });

  it('should handle API errors gracefully', async () => {
    store.state.auth.isAuthenticated = true;
    mockGetAccessToken.mockResolvedValue('test-token');
    
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    wrapper = mount(SuperAdminDashboard, {
      global: {
        plugins: [store, router],
      },
    });

    // Wait for created() hook to complete (which calls loadCurrentUser)
    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.notAuthorized).toBe(true);
  });

  it('renders the platform redemption overview cards', async () => {
    store.state.auth.isAuthenticated = true;
    mockGetAccessToken.mockResolvedValue('test-token');
    global.fetch.mockImplementation(mockDashboardFetch);

    wrapper = mount(SuperAdminDashboard, {
      global: {
        plugins: [store, router],
      },
    });

    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Platform Redemptions (30d)');
    expect(wrapper.text()).toContain('Top Foodie Group (30d)');
    expect(wrapper.text()).toContain('Charlotte Foodie Group');
    expect(wrapper.text()).toContain('88 redemptions');
  });

  it('sends the platform redemptions card to coupon operations', async () => {
    store.state.auth.isAuthenticated = true;
    mockGetAccessToken.mockResolvedValue('test-token');
    global.fetch.mockImplementation(mockDashboardFetch);

    wrapper = mount(SuperAdminDashboard, {
      global: {
        plugins: [store, router],
      },
    });

    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    const platformRedemptionsCard = wrapper
      .findAll('.stat-card.clickable')
      .find((card) => card.text().includes('Platform Redemptions (30d)'));

    expect(platformRedemptionsCard).toBeTruthy();

    await platformRedemptionsCard.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.activeTab).toBe('coupons');
    expect(wrapper.text()).toContain('Coupon Operations');
    expect(wrapper.text()).toContain('Recent Redemptions (Last 30 Days)');
    expect(wrapper.text()).toContain('Free App');
    expect(wrapper.text()).toContain('Burger Shop');
    expect(wrapper.text()).toContain('customer@example.com');
  });

  it('renders a safe empty state when no recent platform redemptions exist', async () => {
    store.state.auth.isAuthenticated = true;
    mockGetAccessToken.mockResolvedValue('test-token');
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/admin/redemption-overview')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: vi.fn().mockResolvedValue({
            redemptionsLast30Days: 0,
            topGroup: null,
            recentRedemptions: [],
          }),
        });
      }
      return mockDashboardFetch(url);
    });

    wrapper = mount(SuperAdminDashboard, {
      global: {
        plugins: [store, router],
      },
    });

    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('None yet');
    expect(wrapper.text()).toContain('Top Foodie Group (30d)');
  });

  it('does not crash the page when redemption overview fails', async () => {
    store.state.auth.isAuthenticated = true;
    mockGetAccessToken.mockResolvedValue('test-token');
    global.fetch.mockImplementation((url) => {
      if (String(url).includes('/admin/redemption-overview')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: vi.fn(),
        });
      }
      return mockDashboardFetch(url);
    });

    wrapper = mount(SuperAdminDashboard, {
      global: {
        plugins: [store, router],
      },
    });

    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Failed to load redemption overview: 500');
    expect(wrapper.text()).toContain('Platform Overview');
  });
});
