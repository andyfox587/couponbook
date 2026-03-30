<template>
  <header class="app-header">
    <div class="header-container">
      <div class="branding">
        <router-link to="/">
          <img src="@/assets/logo.png" alt="VivaSpot Logo" class="logo" />
        </router-link>
      </div>
      <button class="hamburger" @click="toggleMenu">
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
        <span class="hamburger-line"></span>
      </button>
      <nav class="navigation" :class="{ open: isMenuOpen }">
        <ul>
          <li><router-link to="/"><i class="pi pi-home icon-spacing-sm"></i>Home</router-link></li>
          <li><router-link to="/coupon-book"><i class="pi pi-ticket icon-spacing-sm"></i>Local Coupons</router-link></li>
          <li><router-link to="/foodie-groups"><i class="pi pi-users icon-spacing-sm"></i>Foodie Groups</router-link></li>
          <li><router-link to="/events"><i class="pi pi-calendar icon-spacing-sm"></i>Events</router-link></li>
          <li v-if="!isAuthenticated">
            <button @click="login" class="auth-btn">
              <i class="pi pi-sign-in icon-spacing-sm"></i>Sign In
            </button>
          </li>
          <li v-else class="profile-dropdown-container">
            <a @click.prevent="toggleProfileDropdown" href="#" class="nav-link profile-link" ref="profileButton">
              Profile
              <i class="pi pi-chevron-down dropdown-arrow" :class="{ open: isProfileDropdownOpen }"></i>
            </a>
            <ul v-if="isProfileDropdownOpen" class="profile-dropdown" ref="profileDropdown">
              <li>
                <button @click="goToProfilePage" class="dropdown-item">
                  <i class="pi pi-user"></i>Profile Page
                </button>
              </li>
              <li>
                <button @click="handleLogout" class="dropdown-item">
                  <i class="pi pi-sign-out"></i>Log out
                </button>
              </li>
            </ul>
          </li>
        </ul>
      </nav>
    </div>
  </header>
</template>
<script>
import { mapGetters, mapActions } from 'vuex';
import { getAccessToken } from '@/services/authService';

export default {
  name: 'AppHeader',
  data() {
    return {
      isMenuOpen: false,
      userRole: null,
      isProfileDropdownOpen: false
    };
  },
  computed: {
    // pulls auth/isAuthenticated getter into this.isAuthenticated
    ...mapGetters('auth', ['isAuthenticated'])
  },
  async created() {
    if (this.isAuthenticated) {
      await this.loadUserRole();
    }
    // Add click outside listener for dropdown
    document.addEventListener('click', this.handleClickOutside);
  },
  beforeUnmount() {
    // Remove click outside listener
    document.removeEventListener('click', this.handleClickOutside);
  },
  watch: {
    isAuthenticated(newVal) {
      if (newVal) {
        this.loadUserRole();
      } else {
        this.userRole = null;
        this.isProfileDropdownOpen = false;
      }
    },
    // Close menu on route change
    $route() {
      this.isMenuOpen = false;
      this.isProfileDropdownOpen = false;
    }
  },
  methods: {
    toggleMenu() {
      this.isMenuOpen = !this.isMenuOpen;
    },
    // exposes this.login() and this.logout()
    ...mapActions('auth', ['login', 'logout']),
    
    toggleProfileDropdown() {
      this.isProfileDropdownOpen = !this.isProfileDropdownOpen;
    },

    handleClickOutside(event) {
      if (this.isProfileDropdownOpen) {
        const profileButton = this.$refs.profileButton;
        const profileDropdown = this.$refs.profileDropdown;
        
        if (profileButton && profileDropdown) {
          if (!profileButton.contains(event.target) && !profileDropdown.contains(event.target)) {
            this.isProfileDropdownOpen = false;
          }
        }
      }
    },

    goToProfilePage() {
      this.isProfileDropdownOpen = false;
      this.isMenuOpen = false;
      this.$router.push({ name: 'Profile' });
    },

    handleLogout() {
      this.isProfileDropdownOpen = false;
      this.isMenuOpen = false;
      this.logout();
    },
    
    async loadUserRole() {
      if (!this.isAuthenticated) {
        this.userRole = null;
        return;
      }

      try {
        const token = await getAccessToken();
        if (!token) {
          this.userRole = null;
          return;
        }

        const res = await fetch('/api/v1/users/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          console.error('Failed to load user role in Header', res.status);
          this.userRole = null;
          return;
        }

        const data = await res.json();
        this.userRole = data.role || null;
      } catch (err) {
        console.error('Error loading user role in Header', err);
        this.userRole = null;
      }
    }
  }
};
</script>

<style scoped>
.auth-btn {
  background: none;
  border: none;
  color: var(--color-secondary);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-base);
  min-height: var(--button-height-md);
  box-shadow: var(--shadow-xs);
}

.auth-btn:hover {
  background: var(--color-secondary);
  color: var(--color-text-on-secondary);
  box-shadow: var(--shadow-sm);
}

.profile-btn {
  margin-right: var(--spacing-sm);
}

.profile-dropdown-container {
  position: relative;
}

.dropdown-arrow {
  font-size: 0.7em;
  transition: transform var(--transition-fast);
  display: inline-block;
  margin-left: var(--spacing-xs);
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.profile-dropdown {
  position: absolute;
  top: calc(100% + var(--spacing-xs));
  right: 0;
  background-color: var(--color-bg-surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  list-style: none;
  padding: var(--spacing-xs) 0;
  margin: 0;
  min-width: 220px;
  z-index: calc(var(--z-index-dropdown) + 1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--color-text-primary);
}

.profile-dropdown li {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.profile-dropdown li:not(:last-child) {
  box-shadow: inset 0 -1px 2px rgba(0, 0, 0, 0.06);
}

.dropdown-item {
  width: 100%;
  background: none;
  border: none;
  color: var(--color-text-primary);
  padding: var(--spacing-md) var(--spacing-lg);
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: var(--font-size-base);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  line-height: 1.5;
}

.dropdown-item i {
  color: var(--color-text-muted);
  font-size: var(--font-size-base);
  width: 1.2em;
  text-align: center;
  transition: color var(--transition-fast);
}

.dropdown-item:hover {
  background-color: var(--color-bg-muted);
  color: var(--color-text-primary);
}

.dropdown-item:hover i {
  color: var(--color-primary);
}

.dropdown-item:active {
  background-color: var(--color-neutral-200);
}

.app-header {
  background-color: var(--color-bg-primary);
  padding: var(--spacing-lg) 0;
  position: relative;
  z-index: var(--z-index-fixed);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: var(--container-xl);
  margin: 0 auto;
  padding: 0 var(--spacing-lg);
  width: 100%;
}

.header-container > * {
  flex-shrink: 0;
}

.navigation {
  display: flex;
  align-items: center;
}

@media (min-width: 1024px) {
  .header-container {
    padding: 0 var(--spacing-2xl);
  }
  
  .navigation ul {
    gap: var(--spacing-xl);
  }
}

.branding {
  display: flex;
  align-items: center;
}

.logo {
  height: 8vh;
  width: auto;
  max-width: 100%;
  background-color: var(--color-bg-primary);
  padding: var(--spacing-xs);
  border-radius: var(--radius-sm);
}

.navigation ul {
  list-style: none;
  display: flex;
  gap: var(--spacing-lg);
  margin: 0;
  padding: 0;
  align-items: center;
}

.navigation li {
  font-size: var(--font-size-base);
  display: flex;
  align-items: center;
}

/* Menu link styles */
.navigation a,
.navigation router-link,
.navigation a.router-link,
.navigation router-link a {
  text-decoration: none !important;
  color: var(--color-text-primary) !important;
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-md);
  transition: background-color var(--transition-slow), color var(--transition-slow);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
}

.navigation a:hover,
.navigation router-link:hover,
.navigation a.router-link:hover {
  background-color: var(--color-primary);
  color: var(--color-text-on-primary) !important;
  text-decoration: none !important;
}

.navigation a.router-link-active,
.navigation router-link.router-link-active {
  color: var(--color-text-primary) !important;
  font-weight: var(--font-weight-medium);
}

.navigation a i,
.navigation router-link i {
  color: inherit !important;
}

.navigation a:hover i,
.navigation router-link:hover i {
  color: inherit !important;
}

/* Hamburger Button Styles */
.hamburger {
  display: none;
  flex-direction: column;
  justify-content: space-around;
  width: var(--spacing-2xl);
  height: var(--spacing-2xl);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
  min-height: var(--button-height-md);
  min-width: var(--button-height-md);
}

.hamburger:focus {
  outline: 2px solid var(--color-secondary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.hamburger-line {
  width: var(--spacing-2xl);
  height: 3px;
  background-color: var(--color-text-primary);
  border-radius: var(--radius-sm);
  transition: all var(--transition-base);
}

/* Responsive Styles for Mobile */
@media (max-width: 768px) {
  /* show burger, hide desktop layout */
  .hamburger {
    display: flex;
  }

  /* base closed state: completely hidden off-canvas */
  .navigation {
    position: absolute;
    top: 70px;
    right: 0;
    background-color: var(--color-bg-primary);
    width: 220px;
    display: none;             /* hide from layout */
    opacity: 0;                /* invisible */
    pointer-events: none;      /* not clickable when closed */
    transform: translateX(100%);
    transition: transform var(--transition-slow), opacity var(--transition-slow);
    box-shadow: var(--shadow-lg);
    z-index: var(--z-index-dropdown);
    flex-direction: column;
  }

  /* open state: slide in + visible + interactive */
  .navigation.open {
    display: block;
    opacity: 1;
    pointer-events: auto;
    transform: translateX(0);
  }

  .navigation ul {
    flex-direction: column;
    gap: var(--spacing-lg);
    padding: var(--spacing-lg);
  }

  .profile-dropdown-container {
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .profile-link {
    width: 100%;
  }

  .profile-dropdown {
    position: static;
    margin-top: var(--spacing-sm);
    margin-left: 0;
    margin-right: 0;
    width: 100%;
    box-shadow: none;
    border: none;
    box-shadow: inset 2px 0 4px rgba(0, 0, 0, 0.06);
    border-radius: 0;
    background-color: var(--color-bg-muted);
    padding: var(--spacing-xs) 0;
    display: flex;
    flex-direction: column;
  }

  .profile-dropdown li {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .profile-dropdown li:not(:last-child) {
    box-shadow: inset 0 -1px 2px rgba(0, 0, 0, 0.06);
  }

  .dropdown-item {
    padding: var(--spacing-md) var(--spacing-lg);
    padding-left: var(--spacing-xl);
    width: 100%;
    text-align: left;
    white-space: normal;
    word-wrap: break-word;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .dropdown-item i {
    flex-shrink: 0;
  }
}
</style>
