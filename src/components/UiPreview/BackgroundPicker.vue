<template>
  <!-- Stands in for what Merchant Tools would offer each restaurant: pick a
       background from a curated library, upload your own, or have none. -->
  <div class="bp-overlay" @click.self="$emit('close')">
    <div class="bp">
      <header class="bp-head">
        <div>
          <h2>Restaurant backgrounds</h2>
          <p class="bp-sub">
            What each restaurant would set in Merchant Tools. Applies behind the
            offer on all of that restaurant's coupons.
          </p>
        </div>
        <button class="bp-close" type="button" @click="$emit('close')">✕</button>
      </header>

      <p v-if="error" class="bp-error">{{ error }}</p>

      <ul class="bp-list">
        <li v-for="m in merchants" :key="m.id" class="bp-row">
          <div class="bp-current" :style="thumbStyle(m)">
            <span v-if="!m.background" class="bp-none">None</span>
          </div>

          <div class="bp-info">
            <p class="bp-name">{{ m.name }}</p>
            <p class="bp-meta">{{ m.deals.length }} deal{{ m.deals.length === 1 ? '' : 's' }}</p>

            <div class="bp-actions">
              <button class="bp-btn" type="button" @click="openFor = openFor === m.id ? null : m.id">
                {{ openFor === m.id ? 'Close library' : 'Choose from library' }}
              </button>
              <label class="bp-btn">
                Upload photo
                <input type="file" accept="image/*" hidden @change="onUpload($event, m)" />
              </label>
              <button
                v-if="m.background"
                class="bp-btn bp-btn-quiet"
                type="button"
                @click="set(m, null)"
              >
                Remove
              </button>
            </div>

            <div v-if="openFor === m.id" class="bp-library">
              <button
                v-for="opt in library"
                :key="opt.id"
                class="bp-swatch"
                :class="{ on: m.background === opt.url }"
                type="button"
                :title="opt.label"
                :style="{ backgroundImage: `url(${opt.url})` }"
                @click="set(m, opt.url)"
              >
                <span>{{ opt.label }}</span>
              </button>
            </div>
          </div>
        </li>
      </ul>

      <footer class="bp-foot">
        <button class="bp-btn bp-btn-quiet" type="button" @click="resetAll">
          Reset to demo defaults
        </button>
        <span class="bp-note">
          Prototype only — choices are saved in this browser, not to the database.
        </span>
      </footer>
    </div>
  </div>
</template>

<script>
import { BACKGROUND_LIBRARY, fileToScaledDataUrl } from '@/components/UiPreview/previewData';

export default {
  name: 'BackgroundPicker',
  props: {
    merchants: { type: Array, default: () => [] },
  },
  emits: ['close', 'set', 'reset'],
  data: () => ({ library: BACKGROUND_LIBRARY, openFor: null, error: null }),
  methods: {
    thumbStyle(m) {
      return m.background ? { backgroundImage: `url("${m.background}")` } : {};
    },
    set(m, value) {
      this.error = null;
      this.$emit('set', { id: m.id, value });
    },
    resetAll() {
      this.error = null;
      this.openFor = null;
      this.$emit('reset');
    },
    async onUpload(e, m) {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        this.error = 'Please choose an image file.';
        return;
      }
      try {
        const dataUrl = await fileToScaledDataUrl(file);
        this.set(m, dataUrl);
      } catch (err) {
        this.error = err.message || 'Could not read that image.';
      }
    },
  },
};
</script>

<style scoped>
.bp-overlay {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(0, 0, 0, 0.65);
  display: flex; align-items: flex-start; justify-content: center;
  padding: 4vh 12px;
  overflow-y: auto;
}
.bp {
  width: 100%; max-width: 620px;
  background: #151b22; color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.bp-head {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.bp-head h2 { margin: 0; font-size: 17px; font-weight: 700; }
.bp-sub { margin: 5px 0 0; font-size: 12px; opacity: 0.55; line-height: 1.45; }
.bp-close {
  margin-left: auto; flex: none;
  width: 30px; height: 30px; border-radius: 50%;
  border: none; background: rgba(255, 255, 255, 0.1); color: #fff;
  cursor: pointer; font-size: 13px;
}
.bp-error {
  margin: 12px 18px 0; padding: 9px 12px;
  background: rgba(242, 84, 45, 0.15);
  border: 1px solid rgba(242, 84, 45, 0.4);
  border-radius: 8px; font-size: 12.5px; color: #ffb9a6;
}

.bp-list { list-style: none; margin: 0; padding: 6px 0; }
.bp-row {
  display: flex; gap: 14px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.bp-current {
  width: 74px; height: 60px; flex: none;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.07);
  background-size: cover; background-position: center;
  display: flex; align-items: center; justify-content: center;
}
.bp-none { font-size: 10px; opacity: 0.45; }
.bp-info { flex: 1; min-width: 0; }
.bp-name { margin: 0; font-size: 14.5px; font-weight: 700; }
.bp-meta { margin: 2px 0 0; font-size: 11.5px; opacity: 0.5; }

.bp-actions { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 9px; }
.bp-btn {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent; color: #fff;
  border-radius: 999px; padding: 6px 13px;
  font-family: inherit; font-size: 12px; cursor: pointer;
  transition: background .15s;
}
.bp-btn:hover { background: rgba(255, 255, 255, 0.1); }
.bp-btn-quiet { opacity: 0.65; }

.bp-library {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px; margin-top: 11px;
}
.bp-swatch {
  position: relative;
  height: 62px; border-radius: 8px;
  border: 2px solid transparent;
  background-size: cover; background-position: center;
  cursor: pointer; overflow: hidden;
  font-family: inherit;
}
.bp-swatch.on { border-color: #f2542d; }
.bp-swatch span {
  position: absolute; left: 0; right: 0; bottom: 0;
  padding: 3px 5px;
  font-size: 9.5px; color: #fff;
  background: rgba(0, 0, 0, 0.55);
  text-align: left;
}

.bp-foot {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 14px 18px 16px;
}
.bp-note { font-size: 11px; opacity: 0.45; }
</style>
