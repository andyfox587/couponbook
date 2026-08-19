<!-- src/components/Dashboard/CreateCustomerAccount.vue
     Super-admin tool: create a customer account on their behalf, skipping the
     self-signup email-verification code. Two modes:
       invite   → Cognito emails them a temporary password (they set their own)
       password → set a permanent password now and tell them by phone/text -->
<template>
  <div class="cca-card">
    <button type="button" class="cca-toggle" @click="open = !open">
      <i class="pi" :class="open ? 'pi-chevron-down' : 'pi-chevron-right'"></i>
      Create customer account
      <span class="cca-hint">— for members who need help signing up</span>
    </button>

    <form v-if="open" class="cca-form" @submit.prevent="submit">
      <div class="cca-row">
        <label class="cca-field">
          <span>Name</span>
          <input v-model.trim="name" type="text" placeholder="Jane Smith" required maxlength="255" />
        </label>
        <label class="cca-field">
          <span>Email</span>
          <input v-model.trim="email" type="email" placeholder="jane@example.com" required maxlength="255" />
        </label>
      </div>

      <div class="cca-modes">
        <label class="cca-mode" :class="{ on: mode === 'invite' }">
          <input type="radio" value="invite" v-model="mode" />
          <span>
            <strong>Email them an invite</strong>
            <small>They get a temporary password by email (valid 7 days) and set their own at first sign-in. Recommended.</small>
          </span>
        </label>
        <label class="cca-mode" :class="{ on: mode === 'password' }">
          <input type="radio" value="password" v-model="mode" />
          <span>
            <strong>Set a password now</strong>
            <small>No email steps — you tell them the password by phone or text. Double-check the email address first.</small>
          </span>
        </label>
      </div>

      <div v-if="mode === 'password'" class="cca-row cca-password-row">
        <label class="cca-field">
          <span>Password</span>
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="At least 8 characters"
            minlength="8"
            required
            autocomplete="new-password"
          />
        </label>
        <div class="cca-pass-actions">
          <button type="button" class="cca-btn-ghost" @click="generatePassword">Generate</button>
          <button type="button" class="cca-btn-ghost" @click="showPassword = !showPassword">
            {{ showPassword ? 'Hide' : 'Show' }}
          </button>
        </div>
      </div>

      <div class="cca-actions">
        <button type="submit" class="cca-btn-primary" :disabled="busy">
          {{ busy ? 'Creating…' : 'Create account' }}
        </button>
      </div>

      <p v-if="success" class="cca-success">✅ {{ success }}</p>
      <p v-if="warning" class="cca-warning">⚠️ {{ warning }}</p>
      <p v-if="error" class="cca-error">⚠️ {{ error }}</p>
    </form>
  </div>
</template>

<script>
import { getAccessToken } from '@/services/authService';

const API_BASE = '/api/v1';

export default {
  name: 'CreateCustomerAccount',
  emits: ['created'],
  data() {
    return {
      open: false,
      name: '',
      email: '',
      mode: 'invite',
      password: '',
      showPassword: false,
      busy: false,
      success: null,
      warning: null,
      error: null,
    };
  },
  methods: {
    // Random password satisfying upper/lower/digit/symbol policies.
    generatePassword() {
      const sets = [
        'ABCDEFGHJKLMNPQRSTUVWXYZ',
        'abcdefghijkmnopqrstuvwxyz',
        '23456789',
        '!@#$%&*',
      ];
      const rand = (n) => {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return buf[0] % n;
      };
      const chars = [];
      sets.forEach((s) => chars.push(s[rand(s.length)]));
      const all = sets.join('');
      while (chars.length < 14) chars.push(all[rand(all.length)]);
      for (let i = chars.length - 1; i > 0; i--) {
        const j = rand(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
      this.password = chars.join('');
      this.showPassword = true;
    },

    async submit() {
      this.busy = true;
      this.success = null;
      this.warning = null;
      this.error = null;
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Your session has expired — sign in again.');

        const res = await fetch(`${API_BASE}/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: this.name,
            email: this.email,
            mode: this.mode,
            ...(this.mode === 'password' ? { password: this.password } : {}),
          }),
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);

        this.success = body.message || 'Account created.';
        if (body.warning) this.warning = body.warning;
        this.$emit('created', body);

        // Reset for the next one, but keep the success message visible.
        this.name = '';
        this.email = '';
        this.password = '';
        this.showPassword = false;
      } catch (e) {
        this.error = e.message || 'Something went wrong';
      } finally {
        this.busy = false;
      }
    },
  },
};
</script>

<style scoped>
.cca-card {
  border: 1px solid var(--surface-2, rgba(128, 128, 128, 0.25));
  border-radius: 10px;
  margin-bottom: 1rem;
  background: var(--surface-1, transparent);
}
.cca-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.8rem 1rem;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  text-align: left;
}
.cca-hint {
  font-weight: 400;
  opacity: 0.6;
  font-size: 0.85em;
}
.cca-form {
  padding: 0 1rem 1rem;
}
.cca-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.cca-field {
  flex: 1 1 220px;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.cca-field span {
  font-weight: 600;
  opacity: 0.8;
}
.cca-field input {
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--surface-2, rgba(128, 128, 128, 0.35));
  background: transparent;
  color: inherit;
  font: inherit;
}
.cca-modes {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: 0.85rem;
}
.cca-mode {
  flex: 1 1 260px;
  display: flex;
  gap: 0.55rem;
  align-items: flex-start;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--surface-2, rgba(128, 128, 128, 0.35));
  border-radius: 10px;
  cursor: pointer;
}
.cca-mode.on {
  border-color: #f2542d;
}
.cca-mode input {
  margin-top: 0.2rem;
  accent-color: #f2542d;
}
.cca-mode strong {
  display: block;
  font-size: 0.9rem;
}
.cca-mode small {
  display: block;
  opacity: 0.65;
  line-height: 1.35;
  margin-top: 0.15rem;
}
.cca-password-row {
  margin-top: 0.75rem;
  align-items: flex-end;
}
.cca-pass-actions {
  display: flex;
  gap: 0.4rem;
  padding-bottom: 0.15rem;
}
.cca-actions {
  margin-top: 0.9rem;
}
.cca-btn-primary {
  background: #f2542d;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0.6rem 1.3rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.cca-btn-primary:disabled {
  opacity: 0.6;
  cursor: default;
}
.cca-btn-ghost {
  background: none;
  border: 1px solid var(--surface-2, rgba(128, 128, 128, 0.35));
  border-radius: 8px;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-size: 0.85rem;
  color: inherit;
  cursor: pointer;
}
.cca-success { margin: 0.75rem 0 0; color: #1f9c73; font-size: 0.9rem; }
.cca-warning { margin: 0.5rem 0 0; color: #d98a00; font-size: 0.85rem; }
.cca-error { margin: 0.75rem 0 0; color: #d84a33; font-size: 0.9rem; }
</style>
