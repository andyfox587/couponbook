<template>
  <div id="app">
    <div v-if="isDemoHost" class="demo-banner">
      ✨ DEMO — evaluation site preloaded with sample data. Powered by VivaSpot.
    </div>
    <div v-else-if="isStagingHost" class="staging-banner">
      ⚠️ STAGING — test site. Nothing done here reaches members. The real site is couponbook.vivaspot.com
    </div>
    <div v-if="impersonating" class="impersonation-banner">
      <span>
        👤 Viewing as <strong>{{ impersonating.name || impersonating.email }}</strong>
        <template v-if="impersonating.name && impersonating.email"> ({{ impersonating.email }})</template>
        — every action is logged.
      </span>
      <button class="exit-impersonation" @click="exitImpersonation">Exit</button>
    </div>
    <AppHeader v-if="!bare" />
    <router-view />
    <AppFooter v-if="!bare" />
  </div>
</template>

<script>
import AppHeader from './components/Common/Header.vue'
import AppFooter from './components/Common/Footer.vue'
import { getImpersonatedUser, clearImpersonation } from '@/services/authService'
import { isDemoHostname } from '@/demoHost'

export default {
  name: 'App',
  components: {
    AppHeader,
    AppFooter
  },
  data() {
    return {
      // Read once at mount; start/exit both trigger a full navigation, which
      // re-mounts App and re-reads this from localStorage.
      impersonating: getImpersonatedUser()
    }
  },
  computed: {
    // Routes flagged meta.bare render without the site header/footer (used by
    // the full-screen mobile UI prototype).
    bare() {
      return !!this.$route.meta?.bare
    },
    // Unmissable banner on every non-production host (staging, previews) so
    // admin work can't silently happen in the sandbox. Hostname-based: needs
    // no env var and can't drift.
    isStagingHost() {
      if (typeof window === 'undefined') return false
      const h = window.location.hostname
      return h !== 'couponbook.vivaspot.com' && h !== 'localhost' && h !== '127.0.0.1'
    },
    // Demo instances (prospect evaluations with their own DB of sample data)
    // get a friendly banner instead of the scary staging one.
    isDemoHost() {
      if (typeof window === 'undefined') return false
      return isDemoHostname(window.location.hostname)
    }
  },
  methods: {
    exitImpersonation() {
      clearImpersonation()
      window.location.assign('/')
    }
  }
}
</script>

<style>
/* Basic global styles */
#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

router-view {
  flex: 1;
}

.demo-banner {
  position: sticky;
  top: 0;
  z-index: 2100;
  background: linear-gradient(90deg, #1d4ed8, #2563eb);
  color: #fff;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 7px 14px;
}

.staging-banner {
  position: sticky;
  top: 0;
  z-index: 2100;
  background: repeating-linear-gradient(
    -45deg,
    #f2a413,
    #f2a413 14px,
    #d98a00 14px,
    #d98a00 28px
  );
  color: #1a1205;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  padding: 7px 14px;
}

.impersonation-banner {
  position: sticky;
  top: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
  background: #d8472f;
  color: #fff;
  padding: 8px 16px;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
}

.exit-impersonation {
  background: #fff;
  color: #d8472f;
  border: none;
  border-radius: 6px;
  padding: 4px 14px;
  font-weight: 700;
  cursor: pointer;
}
.exit-impersonation:hover {
  background: #ffe9e4;
}
</style>
