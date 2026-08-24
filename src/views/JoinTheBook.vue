<!-- src/views/JoinTheBook.vue
     PUBLIC coupon-first merchant onboarding: "Get your deal in the book."
     One form, no login. Creates a pending submission + restaurant record +
     an invited account (temp password by email) via POST /api/v1/join. -->
<template>
  <div class="join-page">
    <!-- Success -->
    <section v-if="done" class="join-card join-success">
      <div class="join-success-icon">🎉</div>
      <h1>Your deal is in!</h1>
      <p class="join-lead">{{ done.message }}</p>
      <div class="join-summary">
        <p><strong>{{ done.restaurant }}</strong> → {{ done.group }}</p>
        <p class="join-muted">A group admin reviews every deal before it goes live in the book.</p>
      </div>
      <button type="button" class="join-btn primary" @click="reset">Add another deal</button>
    </section>

    <!-- Form -->
    <section v-else class="join-card">
      <div class="join-brand">
        <span class="join-brand-name">Chapel Hill Foodies</span>
        <span class="join-powered">POWERED BY <img :src="logo" alt="VivaSpot" class="join-logo" /></span>
      </div>
      <p class="join-eyebrow">FOR RESTAURANTS · FREE</p>
      <h1>Get your deal in the Coupon Book</h1>
      <p class="join-lead">
        One quick form — about 3 minutes. No account setup, no verification codes.
        We'll email you a login for later, but you never need to use it.
      </p>

      <form @submit.prevent="submit">
        <!-- honeypot: humans never see or fill this -->
        <input v-model="form.company" type="text" name="company" class="join-hp" tabindex="-1" autocomplete="off" aria-hidden="true" />

        <h2 class="join-step"><span>1</span>Your restaurant</h2>
        <div class="join-grid">
          <label class="join-field">
            <span>Restaurant name *</span>
            <input v-model.trim="form.restaurant_name" type="text" required maxlength="255" placeholder="e.g. Chimney" />
          </label>
          <label class="join-field">
            <span>Your foodie group *</span>
            <select v-model="form.group_id" required>
              <option value="" disabled>Choose your group…</option>
              <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </label>
          <label class="join-field">
            <span>Restaurant type</span>
            <select v-model="form.cuisine_type">
              <option value="">Choose…</option>
              <option v-for="c in cuisines" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="join-field">
            <span>Website</span>
            <input v-model.trim="form.website" type="text" maxlength="500" placeholder="https://yourrestaurant.com" />
          </label>
          <label class="join-field">
            <span>Instagram (optional)</span>
            <input v-model.trim="form.instagram" type="text" maxlength="100" placeholder="@yourrestaurant" />
          </label>
          <label class="join-field join-file">
            <span>Logo (optional)</span>
            <input ref="logoInput" type="file" accept="image/png,image/jpeg,image/webp" @change="onLogo" />
            <small class="join-muted">Square PNG/JPG, up to 5 MB. No logo? We'll show your initial until you add one.</small>
          </label>
        </div>

        <h2 class="join-step"><span>2</span>Your deal</h2>
        <div class="join-grid">
          <label class="join-field">
            <span>Offer type *</span>
            <select v-model="form.coupon_type" required>
              <option value="" disabled>Choose…</option>
              <option value="percent">Percent off</option>
              <option value="amount">Dollar amount off</option>
              <option value="bogo">Buy one, get one</option>
              <option value="free_item">Free item</option>
            </select>
          </label>
          <label v-if="needsValue" class="join-field">
            <span>{{ form.coupon_type === 'percent' ? 'Percent off *' : 'Dollars off *' }}</span>
            <input v-model="form.discount_value" type="number" min="1" :max="form.coupon_type === 'percent' ? 100 : 1000" step="0.01" required />
          </label>
          <label class="join-field join-wide">
            <span>Coupon title *</span>
            <input v-model.trim="form.title" type="text" required minlength="3" maxlength="255" placeholder='e.g. "20% off Dine-in Food Bill"' />
          </label>
          <label class="join-field join-wide">
            <span>Describe the offer *</span>
            <textarea v-model.trim="form.description" required minlength="3" maxlength="2000" rows="3"
              placeholder="What the customer gets, and any conditions (dine-in only, one per table, …)"></textarea>
          </label>
          <label class="join-field">
            <span>Valid from *</span>
            <input v-model="form.valid_from" type="date" required />
          </label>
          <label class="join-field">
            <span>Expires *</span>
            <input v-model="form.expires_at" type="date" required />
          </label>
          <p class="join-commitment join-wide">
            📅 We've set your deal to run a <strong>full 12 months</strong> — that's what
            members count on when they buy the book. You can shorten it if you need to.
          </p>
        </div>

        <h2 class="join-step"><span>3</span>You</h2>
        <div class="join-grid">
          <label class="join-field">
            <span>Your name *</span>
            <input v-model.trim="form.contact_name" type="text" required maxlength="255" />
          </label>
          <label class="join-field">
            <span>Email *</span>
            <input v-model.trim="form.email" type="email" required maxlength="255" placeholder="you@yourrestaurant.com" />
            <small class="join-muted">We'll send your account details here — no codes to type.</small>
          </label>
        </div>

        <p v-if="error" class="join-error">⚠️ {{ error }}</p>

        <button type="submit" class="join-btn primary join-submit" :disabled="busy">
          {{ busy ? 'Submitting…' : 'Submit my deal' }}
        </button>
        <p class="join-muted join-fineprint">
          Free to join. A group admin reviews every deal before it appears in the book.
        </p>
      </form>
    </section>
  </div>
</template>

<script>
import logo from '@/assets/logo.png';

export default {
  name: 'JoinTheBook',
  data() {
    return {
      logo,
      groups: [],
      cuisines: ['American', 'Mexican', 'Thai', 'Indian', 'Italian', 'Chinese', 'Japanese',
        'Mediterranean', 'Seafood', 'BBQ', 'Bar & Grill', 'Bakery', 'Baked Goods',
        'Coffee shop', 'Coffee & Crepes', 'Vegetarian', 'Dessert'],
      form: {
        company: '', // honeypot
        restaurant_name: '',
        group_id: '',
        cuisine_type: '',
        website: '',
        instagram: '',
        contact_name: '',
        email: '',
        coupon_type: '',
        discount_value: '',
        title: '',
        description: '',
        valid_from: '',
        expires_at: '',
      },
      logoFile: null,
      busy: false,
      error: null,
      done: null,
    };
  },
  computed: {
    needsValue() {
      return this.form.coupon_type === 'percent' || this.form.coupon_type === 'amount';
    },
  },
  async mounted() {
    try {
      const res = await fetch('/api/v1/groups');
      if (res.ok) {
        this.groups = await res.json();
        if (this.groups.length === 1) this.form.group_id = this.groups[0].id;
      }
    } catch (e) {
      /* dropdown stays empty; server validates anyway */
    }
    // Default: valid today, expires in 12 months — the year-long run members
    // count on (Repeats-style commitment, editable if they need shorter).
    const today = new Date();
    const yearOut = new Date(today);
    yearOut.setFullYear(yearOut.getFullYear() + 1);
    this.form.valid_from = today.toISOString().slice(0, 10);
    this.form.expires_at = yearOut.toISOString().slice(0, 10);
  },
  methods: {
    onLogo(e) {
      const f = e.target.files && e.target.files[0];
      if (f && f.size > 5 * 1024 * 1024) {
        this.error = 'Logo must be under 5 MB';
        e.target.value = '';
        this.logoFile = null;
        return;
      }
      this.error = null;
      this.logoFile = f || null;
    },
    async submit() {
      this.busy = true;
      this.error = null;
      try {
        const fd = new FormData();
        Object.entries(this.form).forEach(([k, v]) => fd.append(k, v == null ? '' : v));
        if (this.logoFile) fd.append('logo', this.logoFile);

        const res = await fetch('/api/v1/join', { method: 'POST', body: fd });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Something went wrong (${res.status})`);
        this.done = body;
        window.scrollTo({ top: 0 });
      } catch (e) {
        this.error = e.message || 'Something went wrong — please try again';
      } finally {
        this.busy = false;
      }
    },
    reset() {
      this.done = null;
      this.form.title = '';
      this.form.description = '';
      this.form.coupon_type = '';
      this.form.discount_value = '';
      this.logoFile = null;
      this.error = null;
    },
  },
};
</script>

<style scoped>
.join-page {
  min-height: 70vh;
  padding: 36px 18px 64px;
  display: flex;
  justify-content: center;
  background: #0f151c;
  font-family: 'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.join-card {
  width: 100%;
  max-width: 760px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 18px;
  padding: 30px 28px 34px;
  color: #fff;
}
.join-brand {
  display: flex;
  align-items: baseline;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.09);
}
.join-brand-name {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #f4eee4;
}
.join-powered {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.55);
}
.join-logo {
  height: 18px;
  width: auto;
  object-fit: contain;
}

.join-eyebrow {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
  color: #f2542d;
}
h1 {
  margin: 0;
  font-size: clamp(28px, 4.5vw, 40px);
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #f4eee4;
}
.join-lead {
  margin: 12px 0 6px;
  font-size: 15.5px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.78);
}
.join-step {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 28px 0 12px;
  font-size: 17px;
  font-weight: 800;
}
.join-step span {
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 50%;
  background: #f2542d;
  color: #fff;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.join-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.join-wide { grid-column: 1 / -1; }
.join-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.join-field > span {
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
}
.join-field input,
.join-field select,
.join-field textarea {
  padding: 11px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font: inherit;
  font-size: 14.5px;
}
.join-field input::placeholder,
.join-field textarea::placeholder { color: rgba(255, 255, 255, 0.35); }
.join-field select option { color: #12181f; }
.join-field input:focus,
.join-field select:focus,
.join-field textarea:focus {
  outline: none;
  border-color: #f2542d;
}
.join-file input[type='file'] { padding: 9px 10px; }
.join-muted {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  line-height: 1.4;
}
.join-hp {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.join-btn {
  border: none;
  border-radius: 12px;
  font: inherit;
  font-size: 16px;
  font-weight: 800;
  padding: 15px 30px;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}
.join-btn.primary {
  background: #f2542d;
  color: #fff;
  box-shadow: 0 12px 30px rgba(242, 84, 45, 0.35);
}
.join-btn.primary:hover { background: #e04a25; transform: translateY(-1px); }
.join-btn.primary:disabled { opacity: 0.6; transform: none; cursor: default; }
.join-submit {
  margin-top: 24px;
  width: 100%;
}
.join-fineprint { text-align: center; margin: 12px 0 0; }
.join-commitment {
  margin: 2px 0 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(242, 84, 45, 0.1);
  border: 1px solid rgba(242, 84, 45, 0.3);
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  line-height: 1.45;
}

.join-error {
  margin: 18px 0 0;
  padding: 11px 14px;
  border-radius: 10px;
  background: rgba(216, 74, 51, 0.15);
  border: 1px solid rgba(216, 74, 51, 0.4);
  color: #ff9a86;
  font-size: 14px;
}

/* success */
.join-success { text-align: center; }
.join-success-icon { font-size: 44px; }
.join-success h1 { margin-top: 6px; }
.join-summary {
  margin: 18px auto 22px;
  padding: 14px 18px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  display: inline-block;
}
.join-summary p { margin: 4px 0; }

@media (max-width: 620px) {
  .join-card { padding: 24px 18px 28px; }
  .join-grid { grid-template-columns: 1fr; }
}
</style>
