// Header component tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Header from '../../../../../src/components/Common/Header.vue';
import { createMockStore, createMockRouter } from '../../../../helpers/vue.js';

describe('Header', () => {
  let wrapper;
  let store;
  let router;
  let loginSpy;
  let logoutSpy;

  beforeEach(() => {
    loginSpy = vi.fn(() => Promise.resolve());
    logoutSpy = vi.fn(() => Promise.resolve());

    store = createMockStore({
      auth: {
        namespaced: true,
        state: {
          isAuthenticated: false,
        },
        getters: {
          isAuthenticated: (state) => state.isAuthenticated,
        },
        actions: {
          login: loginSpy,
          logout: logoutSpy,
        },
      },
    });

    // Set up actions properly for Vuex
    store._actions = {
      'auth/login': [loginSpy],
      'auth/logout': [logoutSpy],
    };

    router = createMockRouter([
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/coupon-book', component: { template: '<div>Coupons</div>' } },
      { path: '/foodie-groups', component: { template: '<div>Groups</div>' } },
      { path: '/events', component: { template: '<div>Events</div>' } },
      { path: '/profile', component: { template: '<div>Profile</div>' } },
    ]);

    vi.clearAllMocks();
  });

  it('should render navigation links', () => {
    wrapper = mount(Header, {
      global: {
        plugins: [store, router],
      },
    });

    expect(wrapper.text()).toContain('Home');
    expect(wrapper.text()).toContain('Local Coupons');
    expect(wrapper.text()).toContain('Foodie Groups');
    expect(wrapper.text()).toContain('Events');
  });

  it('should show Sign In button when not authenticated', () => {
    wrapper = mount(Header, {
      global: {
        plugins: [store, router],
      },
    });

    expect(wrapper.text()).toContain('Sign In');
    expect(wrapper.find('.auth-btn').text()).toBe('Sign In');
  });

  it('should show profile dropdown when authenticated', async () => {
    store.state.auth.isAuthenticated = true;

    wrapper = mount(Header, {
      global: {
        plugins: [store, router],
      },
    });

    expect(wrapper.text()).not.toContain('Sign In');
    expect(wrapper.find('.profile-link').exists()).toBe(true);
    expect(wrapper.find('.profile-dropdown').exists()).toBe(false);

    await wrapper.find('.profile-link').trigger('click');
    expect(wrapper.find('.profile-dropdown').exists()).toBe(true);

    const logoutButton = wrapper.findAll('.dropdown-item').find((btn) =>
      btn.text().includes('Log out')
    );

    expect(logoutButton?.exists()).toBe(true);
  });

  it('should toggle menu on hamburger click', async () => {
    wrapper = mount(Header, {
      global: {
        plugins: [store, router],
      },
    });

    expect(wrapper.vm.isMenuOpen).toBe(false);
    await wrapper.find('.hamburger').trigger('click');
    expect(wrapper.vm.isMenuOpen).toBe(true);
    await wrapper.find('.hamburger').trigger('click');
    expect(wrapper.vm.isMenuOpen).toBe(false);
  });

  it('should call login action when Sign In is clicked', async () => {
    wrapper = mount(Header, {
      global: {
        plugins: [store, router],
      },
    });

    await wrapper.find('.auth-btn').trigger('click');
    expect(loginSpy).toHaveBeenCalled();
  });

  it('should call logout action when Log out is clicked', async () => {
    store.state.auth.isAuthenticated = true;

    wrapper = mount(Header, {
      global: {
        plugins: [store, router],
      },
    });

    await wrapper.find('.profile-link').trigger('click');

    const logoutButton = wrapper.findAll('.dropdown-item').find((btn) =>
      btn.text().includes('Log out')
    );

    expect(logoutButton?.exists()).toBe(true);
    await logoutButton?.trigger('click');
    expect(logoutSpy).toHaveBeenCalled();
  });
});
