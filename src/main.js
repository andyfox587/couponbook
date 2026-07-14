// src/main.js
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import { surveyPlugin } from 'survey-vue3-ui'
import 'survey-core/survey-core.css'
import './assets/styles/surveyjs-theme.css'
import 'primeicons/primeicons.css'
import './assets/styles/global.css'

import surveyjs from './plugins/surveyjs'
import vueQRCode from './plugins/vueQRCode'
import { userManager, getImpersonationId } from '@/services/authService';

// Super-admin "Act as": attach the impersonation header to same-app API calls.
// Covers all fetch-based services/components; axios calls are handled in
// apiService.js. The backend only honors the header for super-admins.
const _origFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  try {
    const impId = getImpersonationId();
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (impId && url.includes('/api/v1')) {
      const headers = new Headers(init.headers || {});
      headers.set('X-Impersonate-User-Id', impId);
      init = { ...init, headers };
    }
  } catch (e) { /* noop */ }
  return _origFetch(input, init);
};

// Initialize theme before app mount to avoid flash
function initializeTheme() {
  // Priority: 1) localStorage (user preference), 2) browser adaptive (defaults to light)
  const savedTheme = localStorage.getItem('theme');
  
  if (savedTheme === 'dark' || savedTheme === 'light') {
    // User has explicitly set a preference, use it
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else {
    // No saved preference - don't set data-theme attribute
    // This allows browser adaptive CSS to handle it:
    // - Defaults to light mode (from :root)
    // - Uses dark if browser prefers dark (from @media prefers-color-scheme: dark)
    document.documentElement.removeAttribute('data-theme');
  }
}

// Initialize theme immediately
initializeTheme();

const app = createApp(App);

// make userManager available via inject()
app.provide('userManager', userManager);

app.use(router);
app.use(store);
app.use(surveyjs);
app.use(surveyPlugin);
app.use(vueQRCode);

(async () => {
  // hydrate auth from existing oidc session (if any)
  await store.dispatch('auth/initialize');
  // ensure initial route is ready
  await router.isReady();
  app.mount('#app');
})();
