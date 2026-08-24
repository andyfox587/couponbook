<!-- src/views/JoinTheBook.vue
     PUBLIC coupon-first merchant onboarding — "Get your deal in the Coupon Book."
     Visual design: Claude Design "Chapel Hill Foodies Signup" (Modernist,
     light editorial, sharp corners, accent #ec3013), ported 1:1 as a 3-step
     wizard for phones. All machinery preserved: live group dropdown, curated
     restaurant types, offer types w/ conditional value, 12-month default run,
     Instagram normalization, optional logo, honeypot, POST /api/v1/join. -->
<template>
  <div class="jn">
    <!-- Brand bar -->
    <header class="jn-bar">
      <img :src="chfLogo" alt="Chapel Hill Foodies" class="jn-bar-mark" />
      <div class="jn-bar-name">Chapel Hill Foodies</div>
      <div class="jn-bar-powered">
        <span>Powered by</span>
        <img :src="vsLogo" alt="Vivaspot" class="jn-bar-vs" />
      </div>
    </header>

    <!-- Accent hero -->
    <section class="jn-hero">
      <div class="jn-hero-inner">
        <div>
          <div class="jn-kicker jn-kicker-light">For restaurants · Free to join</div>
          <h1 class="jn-h1">Get your deal in the Coupon&nbsp;Book</h1>
          <p class="jn-hero-lead">
            One quick form — about 3 minutes. No account setup, no verification codes.
            We'll email you a login for later, but you never need to use it.
          </p>
        </div>
        <div class="jn-hero-stat">
          <div class="jn-hero-stat-num">50K+</div>
          <div class="jn-hero-stat-sub">Foodies across Chapel Hill, Carrboro, Raleigh and Durham deciding where to eat next.</div>
        </div>
      </div>
    </section>

    <!-- Benefits strip -->
    <section class="jn-strip">
      <div class="jn-strip-inner">
        <div class="jn-strip-cell">
          <div class="jn-strip-title">Free to join</div>
          <div class="jn-strip-sub">No listing fee and no commission. You set the offer and the terms.</div>
        </div>
        <div class="jn-strip-cell">
          <div class="jn-strip-title">Three minutes, no setup</div>
          <div class="jn-strip-sub">One form. Nothing to install, no codes to type, no account to configure.</div>
        </div>
        <div class="jn-strip-cell">
          <div class="jn-strip-title">Track your redemptions</div>
          <div class="jn-strip-sub">After you submit, you get credentials for the Chapel Hill Foodies Coupon Book app.</div>
        </div>
      </div>
    </section>

    <!-- Success -->
    <section v-if="done" class="jn-main">
      <div class="jn-kicker jn-kicker-accent">Submitted</div>
      <h2 class="jn-h2">Your deal is in the queue.</h2>
      <p class="jn-success-copy">{{ done.message }}</p>
      <p class="jn-success-summary"><strong>{{ done.restaurant }}</strong> → {{ done.group }}</p>
      <button type="button" class="jn-btn jn-btn-secondary" @click="reset">Submit another deal</button>
    </section>

    <!-- Wizard -->
    <section v-else class="jn-main">
      <form @submit.prevent>
        <!-- honeypot: humans never see or fill this -->
        <input v-model="form.company" type="text" name="company" class="jn-hp" tabindex="-1" autocomplete="off" aria-hidden="true" />

        <!-- Step tabs + progress -->
        <div class="jn-tabs">
          <div class="jn-tab" :style="{ opacity: step === 1 ? 1 : 0.5 }"><span class="jn-tab-num">01</span><span class="jn-tab-label">Your restaurant</span></div>
          <div class="jn-tab" :style="{ opacity: step === 2 ? 1 : 0.5 }"><span class="jn-tab-num">02</span><span class="jn-tab-label">Your deal</span></div>
          <div class="jn-tab" :style="{ opacity: step === 3 ? 1 : 0.5 }"><span class="jn-tab-num">03</span><span class="jn-tab-label">You</span></div>
        </div>
        <div class="jn-progress"><div class="jn-progress-fill" :style="{ width: (step / 3 * 100) + '%' }"></div></div>

        <!-- STEP 1 · restaurant -->
        <template v-if="step === 1">
          <div class="jn-grid">
            <div class="jn-field">
              <label>Restaurant name *</label>
              <input v-model.trim="form.restaurant_name" class="jn-input" maxlength="255" placeholder="e.g. Chimney" />
            </div>
            <div class="jn-field">
              <label>Your foodie group *</label>
              <select v-model="form.group_id" class="jn-input">
                <option value="" disabled>Choose your group…</option>
                <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>
            </div>
            <div class="jn-field">
              <label>Restaurant type</label>
              <select v-model="form.cuisine_type" class="jn-input">
                <option value="">Choose…</option>
                <option v-for="c in cuisines" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <div class="jn-field">
              <label>Website</label>
              <input v-model.trim="form.website" class="jn-input" maxlength="500" placeholder="https://yourrestaurant.com" />
            </div>
            <div class="jn-field">
              <label>Instagram (optional)</label>
              <input v-model.trim="form.instagram" class="jn-input" maxlength="100" placeholder="@yourrestaurant" />
            </div>
            <div class="jn-field">
              <label>Logo (optional)</label>
              <div class="jn-filerow" @click="$refs.logoInput.click()">
                <span class="jn-btn jn-btn-secondary jn-btn-small">Choose file</span>
                <span class="jn-filename">{{ logoFile ? logoFile.name : 'No file selected' }}</span>
              </div>
              <input ref="logoInput" type="file" accept="image/png,image/jpeg,image/webp" class="jn-hiddenfile" @change="onLogo" />
              <div class="jn-hint">Square PNG/JPG, up to 5&nbsp;MB. No logo? We'll show your initial until you add one.</div>
            </div>
          </div>
          <p v-if="error" class="jn-error">⚠️ {{ error }}</p>
          <div class="jn-actions">
            <button type="button" class="jn-btn jn-btn-primary" @click="next">Continue to your deal</button>
            <span class="jn-stepnote">Step 1 of 3</span>
          </div>
        </template>

        <!-- STEP 2 · the deal -->
        <template v-if="step === 2">
          <div class="jn-col">
            <div class="jn-grid">
              <div class="jn-field">
                <label>Offer type *</label>
                <select v-model="form.coupon_type" class="jn-input">
                  <option value="" disabled>Choose…</option>
                  <option value="percent">Percent off</option>
                  <option value="amount">Dollar amount off</option>
                  <option value="bogo">Buy one, get one</option>
                  <option value="free_item">Free item</option>
                </select>
              </div>
              <div v-if="needsValue" class="jn-field">
                <label>{{ form.coupon_type === 'percent' ? 'Percent off *' : 'Dollars off *' }}</label>
                <input v-model="form.discount_value" class="jn-input" type="number" min="1"
                  :max="form.coupon_type === 'percent' ? 100 : 1000" step="0.01" />
              </div>
              <div v-else></div>
            </div>
            <div class="jn-field">
              <label>Coupon title *</label>
              <input v-model.trim="form.title" class="jn-input" maxlength="255" placeholder='e.g. "20% off Dine-in Food Bill"' />
            </div>
            <div class="jn-field">
              <label>Describe the offer *</label>
              <textarea v-model.trim="form.description" class="jn-input jn-textarea" maxlength="2000"
                placeholder="What the customer gets, and any conditions (dine-in only, one per table, …)"></textarea>
            </div>
            <div class="jn-grid">
              <div class="jn-field">
                <label>Valid from *</label>
                <input v-model="form.valid_from" class="jn-input" type="date" />
              </div>
              <div class="jn-field">
                <label>Expires *</label>
                <input v-model="form.expires_at" class="jn-input" type="date" />
              </div>
            </div>
            <div class="jn-callout">
              We've set your deal to run a <strong>full 12 months</strong> — that's what members
              count on when they buy the book. You can shorten it if you need to.
            </div>
          </div>
          <p v-if="error" class="jn-error">⚠️ {{ error }}</p>
          <div class="jn-actions">
            <button type="button" class="jn-btn jn-btn-primary" @click="next">Continue</button>
            <button type="button" class="jn-btn jn-btn-secondary" @click="back">Back</button>
            <span class="jn-stepnote jn-push">Step 2 of 3</span>
          </div>
        </template>

        <!-- STEP 3 · you -->
        <template v-if="step === 3">
          <div class="jn-grid">
            <div class="jn-field">
              <label>Your name *</label>
              <input v-model.trim="form.contact_name" class="jn-input" maxlength="255" />
            </div>
            <div class="jn-field">
              <label>Email *</label>
              <input v-model.trim="form.email" class="jn-input" type="email" maxlength="255" placeholder="you@yourrestaurant.com" />
              <div class="jn-hint">We'll send your account details here — no codes to type.</div>
            </div>
          </div>
          <p v-if="error" class="jn-error">⚠️ {{ error }}</p>
          <div class="jn-actions jn-actions-final">
            <div class="jn-actions-row">
              <button type="button" class="jn-btn jn-btn-primary jn-btn-big" :disabled="busy" @click="submit">
                {{ busy ? 'Submitting…' : 'Submit my deal' }}
              </button>
              <button type="button" class="jn-btn jn-btn-secondary" :disabled="busy" @click="back">Back</button>
              <span class="jn-stepnote jn-push">Step 3 of 3</span>
            </div>
            <div class="jn-fineprint">Free to join. A group admin reviews every deal before it appears in the book.</div>
          </div>
        </template>
      </form>
    </section>
  </div>
</template>

<script>
import chfLogo from '@/assets/chf-logo.png';
import vsLogo from '@/assets/vivaspot-lockup.png';

const FONTS =
  'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap';

export default {
  name: 'JoinTheBook',
  data() {
    return {
      chfLogo,
      vsLogo,
      step: 1,
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
    if (typeof document !== 'undefined' && !document.getElementById('join-fonts')) {
      const link = document.createElement('link');
      link.id = 'join-fonts';
      link.rel = 'stylesheet';
      link.href = FONTS;
      document.head.appendChild(link);
    }
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
    validateStep(s) {
      const f = this.form;
      if (s === 1) {
        if (f.restaurant_name.length < 2) return 'Please enter your restaurant name';
        if (!f.group_id) return 'Please choose your foodie group';
      }
      if (s === 2) {
        if (!f.coupon_type) return 'Please choose an offer type';
        if (this.needsValue && !(parseFloat(f.discount_value) > 0)) return 'Please enter the discount value';
        if (f.title.length < 3) return 'A short coupon title is required';
        if (f.description.length < 3) return 'Please describe the offer (a sentence or two)';
        if (!f.valid_from || !f.expires_at) return 'Both dates are required';
        if (new Date(f.expires_at) <= new Date(f.valid_from)) return 'The expiration date must be after the valid-from date';
      }
      if (s === 3) {
        if (!f.contact_name) return 'Your name is required';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return 'A valid email address is required';
      }
      return null;
    },
    next() {
      const err = this.validateStep(this.step);
      if (err) { this.error = err; return; }
      this.error = null;
      this.step = Math.min(3, this.step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    back() {
      this.error = null;
      this.step = Math.max(1, this.step - 1);
    },
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
      const err = this.validateStep(3);
      if (err) { this.error = err; return; }
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
      this.step = 1;
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
/* Modernist tokens from the Claude Design system (light, sharp corners) */
.jn {
  --bg: #f3f2f2;
  --surface: #eae9e9;
  --text: #201e1d;
  --accent: #ec3013;
  --accent-600: #dd2b0f;
  --accent-700: #ae1800;
  --divider: color-mix(in srgb, #201e1d 40%, transparent);
  background: var(--bg);
  color: var(--text);
  font-family: 'Archivo', system-ui, sans-serif;
  min-height: 100vh;
}

/* ── brand bar ── */
.jn-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 18px 40px;
  border-bottom: 2px solid var(--divider);
}
.jn-bar-mark { width: 44px; height: 44px; object-fit: cover; display: block; background: #fff; }
.jn-bar-name { font-weight: 700; font-size: 19px; letter-spacing: -0.01em; margin-right: auto; }
.jn-bar-powered { display: flex; align-items: center; gap: 10px; }
.jn-bar-powered span { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.55; }
.jn-bar-vs { height: 26px; display: block; }

/* ── hero ── */
.jn-hero { background: var(--accent); color: #fff; padding: 56px 40px 44px; }
.jn-hero-inner {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 56px;
  align-items: end;
}
.jn-kicker { font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 18px; }
.jn-kicker-light { opacity: 0.85; }
.jn-kicker-accent { color: var(--accent); margin-bottom: 16px; }
.jn-h1 {
  font-weight: 700;
  font-size: 68px;
  line-height: 0.98;
  letter-spacing: -0.03em;
  margin: 0 0 20px;
  text-wrap: pretty;
}
.jn-hero-lead { margin: 0; font-size: 18px; line-height: 1.45; max-width: 44ch; opacity: 0.95; }
.jn-hero-stat { border-left: 2px solid rgba(255, 255, 255, 0.45); padding-left: 28px; }
.jn-hero-stat-num { font-weight: 700; font-size: 104px; line-height: 0.82; letter-spacing: -0.04em; }
.jn-hero-stat-sub { margin-top: 16px; font-size: 15px; line-height: 1.4; max-width: 26ch; }

/* ── benefits strip ── */
.jn-strip { border-bottom: 2px solid var(--divider); }
.jn-strip-inner {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}
.jn-strip-cell { padding: 26px 32px; border-right: 2px solid var(--divider); }
.jn-strip-cell:first-child { padding-left: 0; }
.jn-strip-cell:last-child { border-right: none; padding-right: 0; }
.jn-strip-title { font-weight: 700; font-size: 17px; margin-bottom: 6px; }
.jn-strip-sub { font-size: 13px; line-height: 1.45; opacity: 0.7; }

/* ── main / wizard ── */
.jn-main { max-width: 1120px; margin: 0 auto; padding: 44px 40px 120px; }
.jn-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-bottom: 2px solid var(--divider);
}
.jn-tab { padding: 0 0 16px; display: flex; align-items: baseline; gap: 10px; transition: opacity 200ms ease; }
.jn-tab-num { font-weight: 700; font-size: 13px; color: var(--accent); }
.jn-tab-label { font-weight: 700; font-size: 15px; }
.jn-progress { height: 4px; background: color-mix(in srgb, var(--text) 12%, transparent); }
.jn-progress-fill { height: 4px; background: var(--accent); transition: width 240ms ease; }

.jn-grid {
  padding-top: 44px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px 40px;
  max-width: 860px;
}
.jn-col { padding-top: 44px; max-width: 860px; display: flex; flex-direction: column; gap: 28px; }
.jn-col .jn-grid { padding-top: 0; }

.jn-field label {
  display: block;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 6px;
  color: color-mix(in srgb, var(--text) 70%, transparent);
}
.jn-input {
  width: 100%;
  min-height: 48px;
  font-size: 15px;
  padding: 10px 14px;
  font-family: inherit;
  color: var(--text);
  caret-color: var(--accent);
  background: var(--surface);
  border: 1px solid var(--divider);
  border-radius: 0;
}
.jn-input:hover { border-color: color-mix(in srgb, var(--text) 45%, transparent); }
.jn-input:focus-visible { outline: none; border-color: var(--accent); }
.jn-textarea { min-height: 120px; padding: 12px 14px; resize: vertical; }

.jn-filerow {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 48px;
  border: 1px solid var(--divider);
  padding: 0 14px;
  cursor: pointer;
  background: var(--surface);
}
.jn-filename { font-size: 13px; opacity: 0.55; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jn-hiddenfile { display: none; }
.jn-hint { font-size: 12px; line-height: 1.4; opacity: 0.6; margin-top: 8px; }

.jn-callout {
  border-left: 4px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  padding: 18px 22px;
  font-size: 14px;
  line-height: 1.5;
}
.jn-callout strong { font-weight: 700; }

/* buttons (design-system .btn ported) */
.jn-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 700;
  font-size: 15px;
  line-height: 1.2;
  color: var(--text);
  background: transparent;
  border: 1px solid transparent;
  padding: 14px 28px;
  border-radius: 0;
}
.jn-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.jn-btn-primary { background: var(--accent); color: var(--bg); }
.jn-btn-primary:hover { background: var(--accent-600); }
.jn-btn-primary:active { background: var(--accent-700); }
.jn-btn-secondary { border-color: var(--divider); padding: 14px 22px; }
.jn-btn-secondary:hover { background: color-mix(in srgb, var(--text) 7%, transparent); }
.jn-btn-small { font-size: 12px; padding: 6px 12px; }
.jn-btn-big { font-size: 17px; padding: 18px 36px; }

.jn-actions {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-top: 44px;
  padding-top: 28px;
  border-top: 2px solid var(--divider);
  max-width: 860px;
}
.jn-actions-final { flex-direction: column; align-items: stretch; gap: 14px; }
.jn-actions-row { display: flex; gap: 16px; align-items: center; }
.jn-stepnote { font-size: 13px; opacity: 0.6; }
.jn-push { margin-left: auto; }
.jn-fineprint { font-size: 13px; opacity: 0.65; }

.jn-error {
  max-width: 860px;
  margin: 20px 0 0;
  padding: 12px 16px;
  border-left: 4px solid var(--accent-700);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  font-size: 14px;
}

/* success */
.jn-h2 { font-weight: 700; font-size: 46px; line-height: 1.02; letter-spacing: -0.02em; margin: 0 0 20px; }
.jn-success-copy { margin: 0 0 12px; font-size: 17px; line-height: 1.5; max-width: 56ch; }
.jn-success-summary { margin: 0 0 32px; font-size: 15px; opacity: 0.75; }

.jn-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }

/* ── phone ── */
@media (max-width: 720px) {
  .jn-bar { padding: 14px 20px; gap: 12px; }
  .jn-bar-name { font-size: 16px; }
  .jn-bar-vs { height: 20px; }

  .jn-hero { padding: 36px 20px 32px; }
  .jn-hero-inner { grid-template-columns: 1fr; gap: 28px; }
  .jn-h1 { font-size: 42px; }
  .jn-hero-lead { font-size: 16px; }
  .jn-hero-stat-num { font-size: 64px; }

  .jn-strip-inner { grid-template-columns: 1fr; }
  .jn-strip-cell {
    padding: 18px 20px;
    border-right: none;
    border-bottom: 2px solid var(--divider);
  }
  .jn-strip-cell:first-child { padding-left: 20px; }
  .jn-strip-cell:last-child { border-bottom: none; padding-right: 20px; }

  .jn-main { padding: 28px 20px 80px; }
  .jn-tab { flex-direction: column; gap: 3px; align-items: flex-start; }
  .jn-tab-label { font-size: 12.5px; line-height: 1.15; }
  .jn-grid { grid-template-columns: 1fr; gap: 22px; padding-top: 30px; }
  .jn-col { padding-top: 30px; gap: 22px; }

  .jn-actions { flex-wrap: wrap; margin-top: 32px; padding-top: 22px; }
  .jn-actions .jn-btn-primary { width: 100%; order: -1; }
  .jn-actions-row { flex-wrap: wrap; width: 100%; }
  .jn-actions-row .jn-btn-primary { width: 100%; order: -1; }
}
</style>
