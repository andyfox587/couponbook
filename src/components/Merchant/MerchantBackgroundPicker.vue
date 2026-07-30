<!-- src/components/Merchant/MerchantBackgroundPicker.vue
     Per-restaurant background photo control for the merchant's Profile card.
     The photo backs that merchant's coupon-card offers (under a white scrim).
     Merchant can pick from a library, upload their own (→ S3), or remove it. -->
<template>
  <div class="bg-picker">
    <div class="bg-head">
      <strong>Coupon background</strong>
      <span class="muted tiny">Sits behind your offers on the coupon book</span>
    </div>

    <div class="bg-row">
      <div class="bg-preview" :style="previewStyle">
        <span v-if="!currentUrl" class="bg-empty">No background</span>
      </div>

      <div class="bg-actions">
        <label class="file-label">
          <span class="file-label-text">
            <i class="pi pi-upload icon-spacing-sm"></i>{{ currentUrl ? 'Change photo' : 'Upload photo' }}
          </span>
          <input type="file" accept="image/*" :disabled="busy" @change="onFile($event)" />
        </label>
        <button type="button" class="btn-action" :disabled="busy" @click="showLibrary = !showLibrary">
          <i class="pi pi-images icon-spacing-sm"></i>{{ showLibrary ? 'Hide library' : 'Choose from library' }}
        </button>
        <button v-if="currentUrl" type="button" class="btn-action danger-action" :disabled="busy" @click="remove">
          <i class="pi pi-times icon-spacing-sm"></i>Remove
        </button>
      </div>
    </div>

    <p class="muted tiny bg-hint">
      Wide photo of your space or food · JPG, PNG or WebP · max 5 MB. The book adds a
      light overlay so your offer stays easy to read.
    </p>

    <div v-if="showLibrary" class="bg-library">
      <button
        v-for="b in library"
        :key="b.id"
        type="button"
        class="bg-lib-item"
        :class="{ on: currentUrl === b.url }"
        :style="{ backgroundImage: `url(${b.url})` }"
        :title="b.label"
        :disabled="busy"
        @click="setLibrary(b.url)"
      >
        <span class="bg-lib-label">{{ b.label }}</span>
      </button>
    </div>

    <p v-if="busy" class="muted tiny">Saving…</p>
    <p v-if="error" class="tiny error-text">{{ error }}</p>
  </div>
</template>

<script>
import { getAccessToken } from '@/services/authService';
import { BACKGROUND_LIBRARY } from '@/components/UiPreview/previewData';

export default {
  name: 'MerchantBackgroundPicker',
  props: {
    merchant: { type: Object, required: true },
  },
  emits: ['updated'],
  data() {
    return {
      showLibrary: false,
      busy: false,
      error: null,
      library: BACKGROUND_LIBRARY,
    };
  },
  computed: {
    currentUrl() {
      return this.merchant.background_image_url || '';
    },
    // Preview under the same white scrim the coupon card uses, so what the
    // merchant sees here is what members will see.
    previewStyle() {
      if (!this.currentUrl) return {};
      const tint = 'rgba(255,255,255,0.82)';
      return {
        backgroundImage: `linear-gradient(${tint}, ${tint}), url("${this.currentUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    },
  },
  methods: {
    async authToken() {
      const raw = await getAccessToken();
      const token = typeof raw === 'string' ? raw.replace(/^Bearer\s+/i, '').trim() : '';
      if (!token || token.split('.').length !== 3) {
        throw new Error('Auth token missing or invalid. Please sign out and sign in again.');
      }
      return token;
    },

    async setLibrary(url) {
      await this.save(async (token) => {
        const res = await fetch(`/api/v1/merchants/${this.merchant.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ background_image_url: url }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Save failed');
        return (await res.json()).background_image_url;
      });
      this.showLibrary = false;
    },

    async remove() {
      await this.save(async (token) => {
        const res = await fetch(`/api/v1/merchants/${this.merchant.id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ background_image_url: null }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Remove failed');
        return null;
      });
    },

    async onFile(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      await this.save(async (token) => {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/v1/merchants/${this.merchant.id}/background`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Upload failed');
        return (await res.json()).background_image_url;
      });
      event.target.value = '';
    },

    async save(fn) {
      this.busy = true;
      this.error = null;
      try {
        const token = await this.authToken();
        const newUrl = await fn(token);
        this.$emit('updated', { id: this.merchant.id, background_image_url: newUrl });
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
.bg-picker {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--surface-2, rgba(0, 0, 0, 0.1));
}
.bg-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.6rem;
}
.bg-row {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  flex-wrap: wrap;
}
.bg-preview {
  flex: none;
  width: 132px;
  height: 84px;
  border-radius: 10px;
  background: var(--surface-2, #e9edf1);
  border: 1px solid var(--surface-2, rgba(0, 0, 0, 0.12));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.bg-empty {
  font-size: 11px;
  color: var(--muted, #8a94a0);
}
.bg-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 180px;
}
.bg-actions .file-label input[type='file'] {
  display: none;
}
.bg-hint {
  margin: 0.5rem 0 0;
}

.bg-library {
  margin-top: 0.75rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
}
.bg-lib-item {
  position: relative;
  height: 70px;
  border-radius: 9px;
  border: 2px solid transparent;
  background-size: cover;
  background-position: center;
  cursor: pointer;
  overflow: hidden;
  padding: 0;
}
.bg-lib-item.on {
  border-color: var(--brand, #f2542d);
}
.bg-lib-item:disabled {
  opacity: 0.6;
  cursor: default;
}
.bg-lib-label {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 3px 6px;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  text-align: left;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
}
.error-text {
  color: var(--color-error, #c0392b);
}
</style>
