<template>
  <div id="app">
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
