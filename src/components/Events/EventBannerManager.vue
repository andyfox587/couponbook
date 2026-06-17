<template>
  <div class="banner-manager">
    <p class="bm-title">Event images</p>

    <!-- Banner (header) -->
    <div class="bm-field">
      <div class="bm-label-row">
        <span class="bm-label">Banner</span>
        <span class="bm-hint">Wide image shown at the top of your event page</span>
      </div>

      <div v-if="bannerUrl" class="bm-preview-row">
        <img :src="bannerUrl" alt="Event banner" class="bm-thumb bm-thumb-wide" />
        <div class="bm-actions">
          <label class="btn tertiary compact" :class="{ disabled: bannerUploading }">
            <i class="pi pi-refresh icon-spacing-sm"></i>{{ bannerUploading ? 'Uploading…' : 'Change' }}
            <input type="file" accept="image/*" class="bm-input" :disabled="bannerUploading" @change="onBannerChange" />
          </label>
          <button type="button" class="btn tertiary compact danger-text" :disabled="bannerUploading" @click="removeBanner">
            Remove
          </button>
        </div>
      </div>

      <label v-else class="bm-dropzone" :class="{ loading: bannerUploading }">
        <i class="pi pi-cloud-upload bm-upload-icon"></i>
        <span>{{ bannerUploading ? 'Uploading…' : 'Upload banner image' }}</span>
        <span class="bm-dz-hint">PNG, JPG, WebP or SVG · max 5 MB</span>
        <input type="file" accept="image/*" class="bm-input" :disabled="bannerUploading" @change="onBannerChange" />
      </label>
    </div>

    <!-- Cover (card) -->
    <div class="bm-field">
      <div class="bm-label-row">
        <span class="bm-label">Cover</span>
        <span class="bm-hint">Square/portrait image shown on event cards</span>
      </div>

      <div v-if="coverUrl" class="bm-preview-row">
        <img :src="coverUrl" alt="Event cover" class="bm-thumb" />
        <div class="bm-actions">
          <label class="btn tertiary compact" :class="{ disabled: coverUploading }">
            <i class="pi pi-refresh icon-spacing-sm"></i>{{ coverUploading ? 'Uploading…' : 'Change' }}
            <input type="file" accept="image/*" class="bm-input" :disabled="coverUploading" @change="onCoverChange" />
          </label>
          <button type="button" class="btn tertiary compact danger-text" :disabled="coverUploading" @click="removeCover">
            Remove
          </button>
        </div>
      </div>

      <label v-else class="bm-dropzone" :class="{ loading: coverUploading }">
        <i class="pi pi-cloud-upload bm-upload-icon"></i>
        <span>{{ coverUploading ? 'Uploading…' : 'Upload cover image' }}</span>
        <span class="bm-dz-hint">PNG, JPG, WebP or SVG · max 5 MB</span>
        <input type="file" accept="image/*" class="bm-input" :disabled="coverUploading" @change="onCoverChange" />
      </label>
    </div>

    <p v-if="error" class="bm-error">{{ error }}</p>
    <p v-else-if="savedFlash" class="bm-saved">✓ Saved</p>
  </div>
</template>

<script>
import { uploadEventBannerImage, uploadEventCoverImage, updateEvent } from '@/services/eventService'

const MAX_BYTES = 5 * 1024 * 1024

export default {
  name: 'EventBannerManager',

  props: {
    eventId: { type: String, required: true },
    merchantId: { type: String, required: true },
    bannerImageUrl: { type: String, default: null },
    coverImageUrl: { type: String, default: null },
  },

  emits: ['updated'],

  data() {
    return {
      bannerUrl: this.bannerImageUrl,
      coverUrl: this.coverImageUrl,
      bannerUploading: false,
      coverUploading: false,
      error: null,
      savedFlash: false,
    }
  },

  watch: {
    bannerImageUrl(v) { this.bannerUrl = v },
    coverImageUrl(v) { this.coverUrl = v },
  },

  methods: {
    validate(file) {
      if (!file) return 'No file selected.'
      if (!file.type.startsWith('image/')) return 'Please choose an image file.'
      if (file.size > MAX_BYTES) return 'Image must be 5 MB or smaller.'
      return null
    },

    flashSaved() {
      this.savedFlash = true
      setTimeout(() => { this.savedFlash = false }, 2500)
    },

    async onBannerChange(e) {
      const file = e.target.files && e.target.files[0]
      e.target.value = '' // allow re-selecting the same file
      const v = this.validate(file)
      if (v) { this.error = v; return }

      this.error = null
      this.bannerUploading = true
      try {
        const url = await uploadEventBannerImage(this.merchantId, file)
        await updateEvent(this.eventId, { banner_image_url: url })
        this.bannerUrl = url
        this.$emit('updated', { eventId: this.eventId, bannerImageUrl: url, coverImageUrl: this.coverUrl })
        this.flashSaved()
      } catch (err) {
        console.error('[EventBannerManager] banner upload failed', err)
        this.error = err.message || 'Could not save the banner. Please try again.'
      } finally {
        this.bannerUploading = false
      }
    },

    async onCoverChange(e) {
      const file = e.target.files && e.target.files[0]
      e.target.value = ''
      const v = this.validate(file)
      if (v) { this.error = v; return }

      this.error = null
      this.coverUploading = true
      try {
        const url = await uploadEventCoverImage(this.merchantId, file)
        await updateEvent(this.eventId, { cover_image_url: url })
        this.coverUrl = url
        this.$emit('updated', { eventId: this.eventId, bannerImageUrl: this.bannerUrl, coverImageUrl: url })
        this.flashSaved()
      } catch (err) {
        console.error('[EventBannerManager] cover upload failed', err)
        this.error = err.message || 'Could not save the cover image. Please try again.'
      } finally {
        this.coverUploading = false
      }
    },

    async removeBanner() {
      this.error = null
      this.bannerUploading = true
      try {
        await updateEvent(this.eventId, { banner_image_url: null })
        this.bannerUrl = null
        this.$emit('updated', { eventId: this.eventId, bannerImageUrl: null, coverImageUrl: this.coverUrl })
        this.flashSaved()
      } catch (err) {
        this.error = err.message || 'Could not remove the banner.'
      } finally {
        this.bannerUploading = false
      }
    },

    async removeCover() {
      this.error = null
      this.coverUploading = true
      try {
        await updateEvent(this.eventId, { cover_image_url: null })
        this.coverUrl = null
        this.$emit('updated', { eventId: this.eventId, bannerImageUrl: this.bannerUrl, coverImageUrl: null })
        this.flashSaved()
      } catch (err) {
        this.error = err.message || 'Could not remove the cover image.'
      } finally {
        this.coverUploading = false
      }
    },
  },
}
</script>

<style scoped>
.banner-manager {
  margin-top: 0.75rem;
  padding: 1rem;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
  background: var(--color-bg-secondary, #f8fafc);
}

.bm-title {
  margin: 0 0 0.75rem;
  font-weight: 600;
  color: var(--color-text-primary);
}

.bm-field { margin-bottom: 1rem; }
.bm-field:last-of-type { margin-bottom: 0.5rem; }

.bm-label-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.4rem;
}

.bm-label { font-weight: 600; color: var(--color-text-primary); }
.bm-hint { font-size: 0.8rem; color: var(--color-text-muted, #6b7280); }

.bm-preview-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.bm-thumb {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--color-border, #e5e7eb);
}

.bm-thumb-wide {
  width: 160px;
  height: 72px;
}

.bm-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }

.bm-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 1rem;
  border: 2px dashed var(--color-border, #cbd5e1);
  border-radius: 8px;
  cursor: pointer;
  background: var(--color-bg-surface, #fff);
  text-align: center;
  color: var(--color-text-primary);
}

.bm-dropzone.loading { opacity: 0.6; pointer-events: none; }
.bm-upload-icon { font-size: 1.3rem; color: var(--color-primary, #f2542d); }
.bm-dz-hint { font-size: 0.78rem; color: var(--color-text-muted, #6b7280); }

.bm-input { display: none; }

.btn.disabled { opacity: 0.6; pointer-events: none; }
.danger-text { color: var(--color-error, #9c2121); }

.bm-error { margin: 0.5rem 0 0; color: var(--color-error, #9c2121); font-size: 0.85rem; }
.bm-saved { margin: 0.5rem 0 0; color: var(--color-success, #22946e); font-size: 0.85rem; }
</style>
