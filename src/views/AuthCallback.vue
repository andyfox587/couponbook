<!-- src/views/AuthCallback.vue -->
<template>
  <div class="auth-callback">
    <p v-if="!error">Signing you in…</p>
    <template v-else>
      <p class="error">{{ error }}</p>
      <button class="btn primary" @click="retry">Try signing in again</button>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useStore } from 'vuex';
import api from '@/services/apiService';
import { userManager } from '@/services/authService';

const error = ref(null);
const store = useStore();
const router = useRouter();

// One-shot guard so a persistent failure surfaces an error instead of looping.
const RETRY_KEY = 'authCallbackRetried';

// Runs after tokens are in hand: sync the DB user, then route the user onward.
async function finishSignIn() {
  // Sync Cognito user → DB using the ID token (it carries the real email/name;
  // the access token does not). Non-fatal: never block sign-in on a sync hiccup.
  const idToken = store.state.auth.user?.id_token;
  if (idToken) {
    try {
      await api.post('/users/sync', {}, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
    } catch (e) {
      console.error('users/sync failed (non-fatal):', e);
    }
  }

  // Where to land — only internal paths, and never back to /callback.
  let redirectPath = localStorage.getItem('postLoginRedirect');
  localStorage.removeItem('postLoginRedirect');
  if (!redirectPath || !redirectPath.startsWith('/') || redirectPath.startsWith('/callback')) {
    redirectPath = '/';
  }

  // If landing on the homepage, jump straight to their coupon book if they have one.
  if (redirectPath === '/') {
    try {
      const token = store.state.auth.user?.access_token;
      if (token) {
        const res = await api.get('/groups/my/purchases', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const purchases = res.data || [];
        const now = new Date();
        const activePurchases = purchases.filter((p) => {
          if (p.status !== 'paid') return false;
          if (!p.expiresAt) return true;
          const exp = new Date(p.expiresAt);
          return !isNaN(exp.getTime()) && exp >= now;
        });
        if (activePurchases.length === 1) {
          redirectPath = `/foodie-group/${activePurchases[0].groupId}`;
        } else if (activePurchases.length > 1) {
          redirectPath = '/coupon-book?my=1';
        }
      }
    } catch (e) {
      console.error('Error fetching purchases for redirect:', e);
    }
  }

  console.log('🔁 Redirecting user back to:', redirectPath);
  router.replace(redirectPath);
}

onMounted(async () => {
  try {
    // Handle the OIDC redirect (Cognito → SPA). This consumes the stored state.
    await store.dispatch('auth/handleCallback');
    sessionStorage.removeItem(RETRY_KEY); // success → reset the guard
    await finishSignIn();
  } catch (e) {
    // Most commonly "No matching state found in storage" — the transient auth
    // state is missing/consumed (a refresh, a double-process, or a broken
    // registration→confirmation hand-off). Recover instead of dead-ending.
    console.error('Callback error:', e);

    // 1) If a valid session already exists, just proceed.
    try {
      const existing = await userManager.getUser();
      if (existing && !existing.expired) {
        store.commit('auth/setUser', existing);
        sessionStorage.removeItem(RETRY_KEY);
        await finishSignIn();
        return;
      }
    } catch { /* fall through to retry */ }

    // 2) The Cognito session is live, so a fresh redirect bounces straight back
    //    with a valid state. Do it once; guard against loops.
    if (!sessionStorage.getItem(RETRY_KEY)) {
      sessionStorage.setItem(RETRY_KEY, '1');
      try {
        await userManager.signinRedirect(); // preserves postLoginRedirect
        return;
      } catch (re) {
        console.error('Recovery sign-in redirect failed:', re);
      }
    }

    // 3) Already retried (or redirect failed) — surface a friendly error.
    error.value = 'We had trouble finishing your sign-in. Please try again.';
  }
});

function retry() {
  sessionStorage.removeItem(RETRY_KEY);
  error.value = null;
  userManager.signinRedirect().catch((e) => {
    error.value = e.message || 'Sign-in failed';
  });
}
</script>

<style scoped>
.auth-callback {
  padding: var(--spacing-2xl);
  text-align: center;
  color: var(--color-text-primary);
}
.error {
  color: var(--color-error);
  margin-bottom: var(--spacing-md);
}
</style>
