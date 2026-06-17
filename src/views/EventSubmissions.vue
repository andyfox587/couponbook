<!-- src/views/EventSubmissions.vue -->
<template>
  <div class="event-submissions">
    <!-- NOT AUTHENTICATED -->
    <section v-if="!isAuthenticated" class="section-card signin-card">
      <h1>{{ editMode ? 'Edit Pending Event Submission' : 'Submit a New Event' }}</h1>
      <p class="muted">
        You need to be signed in as a merchant or super admin to submit events.
      </p>
      <button class="btn primary" @click="signInNow">
        <i class="pi pi-sign-in icon-spacing-sm"></i>Sign In to Continue
      </button>
      <p class="muted tiny">
        You'll be redirected to the secure sign-in page and brought back here after.
      </p>
    </section>

    <!-- ACCESS CHECK IN PROGRESS -->
    <section v-else-if="!authChecked" class="section-card access-check-card">
      <h1>{{ editMode ? 'Edit Pending Event Submission' : 'Submit a New Event' }}</h1>
      <p class="subtitle">Checking your permissions…</p>
    </section>

    <!-- AUTHENTICATED BUT NOT AUTHORIZED -->
    <section v-else-if="notAuthorized" class="section-card access-denied-card">
      <h1>Access Denied</h1>
      <p>{{ notAuthorizedMessage }}</p>
      <button class="btn primary" @click="$router.push('/profile')">
        <i class="pi pi-arrow-left icon-spacing-sm"></i>Back to Profile
      </button>
    </section>

    <!-- AUTHORIZED BUT NO MERCHANTS -->
    <section v-else-if="noMerchants" class="section-card empty-state-card">
      <h1>No Restaurants Linked</h1>
      <p class="muted">
        You don't have any restaurants linked to your account yet.
        To submit events, you need to own at least one restaurant.
      </p>
      <button class="btn primary" @click="$router.push('/profile')">
        <i class="pi pi-arrow-left icon-spacing-sm"></i>Back to Profile
      </button>
      <p class="muted tiny">
        Contact support if you believe this is an error.
      </p>
    </section>

    <!-- AUTHENTICATED + AUTHORIZED -->
    <template v-else>
      <!-- SUCCESS STATE -->
      <section v-if="submissionSuccess" class="section-card success-card">
        <div class="success-content">
          <div class="success-icon">
            <i class="pi pi-check-circle"></i>
          </div>
          <h1>{{ editMode ? 'Submission Updated!' : 'Event Submitted Successfully!' }}</h1>
          <p class="success-message">
            {{ editMode
              ? 'Your pending event submission has been updated successfully. The Foodie Group will review the latest version.'
              : "Your event has been sent for approval. You'll see it live once your Foodie Group accepts it."
            }}
          </p>
          <div class="success-actions">
            <button class="btn primary" @click="$router.push('/profile')">
              <i class="pi pi-arrow-left icon-spacing-sm"></i>Back to Profile
            </button>
            <button v-if="!editMode" class="btn secondary" @click="submitAnother">
              <i class="pi pi-plus icon-spacing-sm"></i>Submit Another Event
            </button>
          </div>
        </div>
      </section>

      <!-- LOADING EXISTING SUBMISSION -->
      <section v-else-if="loadingSubmission" class="section-card access-check-card">
        <h1>Edit Pending Event Submission</h1>
        <p class="subtitle">Loading submission…</p>
      </section>

      <!-- SURVEY FORM -->
      <div v-else class="submissions">
        <h1>{{ editMode ? 'Edit Pending Event Submission' : 'Submit a New Event' }}</h1>
        <p v-if="editMode" class="edit-hint">You can edit this submission until it is reviewed by the Foodie Group admin.</p>
        <p v-if="submissionError" class="error-text">{{ submissionError }}</p>

        <!-- Images + preview combined (shown only on the images page) -->
        <div v-if="currentSurveyPage === 'images'" class="images-and-preview">

          <!-- Upload controls -->
          <div class="image-upload-section">
            <h2>Event Images</h2>

            <!-- Cover Image -->
            <div class="image-upload-field">
              <label class="image-upload-label">
                Cover Image
                <span class="image-hint">Shown on event cards · recommended 800 × 450 px (landscape)</span>
              </label>
              <div v-if="coverImagePreview" class="image-preview-row">
                <img :src="coverImagePreview" alt="" class="image-thumb" />
                <label class="btn-upload" :class="{ loading: coverUploading }">
                  <i class="pi pi-refresh icon-spacing-sm"></i>
                  {{ coverUploading ? 'Uploading…' : 'Change' }}
                  <input type="file" accept="image/*" class="hidden-input" :disabled="coverUploading" @change="handleCoverImageChange" />
                </label>
              </div>
              <label v-else class="upload-dropzone" :class="{ loading: coverUploading }">
                <i class="pi pi-cloud-upload upload-icon"></i>
                <span>{{ coverUploading ? 'Uploading…' : 'Click to upload cover image' }}</span>
                <span class="upload-hint">Recommended 800 × 450 px · PNG, JPG, WebP · max 5 MB</span>
                <input type="file" accept="image/*" class="hidden-input" :disabled="coverUploading" @change="handleCoverImageChange" />
              </label>
              <p v-if="coverUploadError" class="error-text">{{ coverUploadError }}</p>
            </div>

            <!-- Banner Image -->
            <div class="image-upload-field">
              <label class="image-upload-label">
                Banner Image
                <span class="image-hint">Detail page header · recommended 1600 × 600 px (wide landscape)</span>
              </label>
              <div v-if="bannerImagePreview" class="image-preview-row">
                <img :src="bannerImagePreview" alt="" class="image-thumb image-thumb-wide" />
                <label class="btn-upload" :class="{ loading: bannerUploading }">
                  <i class="pi pi-refresh icon-spacing-sm"></i>
                  {{ bannerUploading ? 'Uploading…' : 'Change' }}
                  <input type="file" accept="image/*" class="hidden-input" :disabled="bannerUploading" @change="handleBannerImageChange" />
                </label>
              </div>
              <label v-else class="upload-dropzone" :class="{ loading: bannerUploading }">
                <i class="pi pi-cloud-upload upload-icon"></i>
                <span>{{ bannerUploading ? 'Uploading…' : 'Click to upload banner image' }}</span>
                <span class="upload-hint">Recommended 1600 × 600 px · PNG, JPG, WebP · max 5 MB</span>
                <input type="file" accept="image/*" class="hidden-input" :disabled="bannerUploading" @change="handleBannerImageChange" />
              </label>
              <p v-if="bannerUploadError" class="error-text">{{ bannerUploadError }}</p>
            </div>
          </div>

          <!-- Live preview -->
          <div v-if="previewEvent" class="preview-section">
            <h2>Preview</h2>
            <p class="muted tiny">How your event will appear to members</p>

            <div class="preview-columns">
              <!-- Card preview -->
              <div class="preview-col">
                <p class="preview-col-label">Card</p>
                <EventCard :event="previewEvent" />
              </div>

              <!-- Detail preview -->
              <div class="preview-col preview-col-detail">
                <p class="preview-col-label">Detail page</p>
                <div class="preview-detail-container">
                  <div
                    class="preview-hero"
                    :style="previewEvent.bannerImageUrl ? `background-image: url('${previewEvent.bannerImageUrl}')` : ''"
                    :class="{ 'preview-hero-no-image': !previewEvent.bannerImageUrl }"
                  >
                    <div class="preview-hero-overlay">
                      <h3>{{ previewEvent.name }}</h3>
                      <p v-if="previewEvent.merchantName" class="preview-merchant-name">by {{ previewEvent.merchantName }}</p>
                    </div>
                  </div>
                  <div class="preview-detail-body">
                    <p class="preview-description">{{ previewEvent.description }}</p>
                    <dl class="preview-meta-list">
                      <template v-if="previewEvent.location">
                        <dt><i class="pi pi-map-marker"></i> Location</dt>
                        <dd>{{ previewEvent.location }}</dd>
                      </template>
                      <dt><i class="pi pi-calendar"></i> Starts</dt>
                      <dd>{{ previewFormatDate(previewEvent.startDatetime) }}</dd>
                      <template v-if="previewEvent.endDatetime">
                        <dt><i class="pi pi-calendar"></i> Ends</dt>
                        <dd>{{ previewFormatDate(previewEvent.endDatetime) }}</dd>
                      </template>
                      <dt><i class="pi pi-users"></i> Capacity</dt>
                      <dd>{{ previewEvent.capacity > 0 ? previewEvent.capacity + ' spots' : 'Unlimited' }}</dd>
                      <dt><i class="pi pi-tag"></i> Price</dt>
                      <dd>{{ previewPriceLabel }}</dd>
                    </dl>
                    <div v-if="previewEvent.inviteOnly" class="invite-badge">Invite Only</div>
                    <div v-else-if="previewEvent.visibility === 'members_only'" class="members-badge">Members Only</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <survey-component :model="survey" />
      </div>
    </template>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'
import { Model } from 'survey-core'
import { SurveyComponent } from 'survey-vue3-ui'
import { eventSurveyJson } from '@/data/eventSurvey.js'
import { getAccessToken, signIn } from '@/services/authService'
import { uploadEventCoverImage, uploadEventBannerImage } from '@/services/eventService'
import EventCard from '@/components/Events/EventCard.vue'

const API_BASE = '/api/v1'
const WEBHOOK_URL = import.meta.env?.VITE_EVENT_SUBMISSION_WEBHOOK_URL || ''

const ALLOWED_ROLES = ['super_admin', 'merchant', 'foodie_group_admin']

export default {
  name: 'EventSubmissions',

  components: {
    SurveyComponent,
    EventCard,
  },

  props: {
    id: { type: String, default: null },
  },

  data() {
    return {
      user: null,
      merchants: [],
      merchantsList: [],
      authChecked: false,
      notAuthorized: false,
      notAuthorizedMessage: 'You are not authorized to submit events.',
      survey: null,
      surveyData: {},
      submissionSuccess: false,
      existingSubmission: null,
      loadingSubmission: false,
      submissionError: null,
      currentSurveyPage: null,
      // Image upload state
      coverImageUrl: null,      // URL returned from API (used in submission)
      coverImagePreview: null,  // blob URL for display
      bannerImageUrl: null,
      bannerImagePreview: null,
      coverUploading: false,
      bannerUploading: false,
      coverUploadError: null,
      bannerUploadError: null,
    }
  },

  computed: {
    ...mapGetters('auth', ['isAuthenticated']),

    role() {
      return this.user?.role || null
    },

    editMode() {
      return !!this.id
    },

    noMerchants() {
      if (this.role === 'foodie_group_admin' && this.merchants.length === 0) {
        return true
      }
      return false
    },

    previewEvent() {
      const d = this.surveyData
      if (!d.name) return null
      const merchant = this.merchantsList.find((m) => m.id === d.merchant_id) || {}
      return {
        id: 'preview',
        slug: null,
        name: d.name || '',
        description: d.description || '',
        location: d.location || null,
        startDatetime: d.start_datetime ? new Date(d.start_datetime).toISOString() : null,
        endDatetime: d.end_datetime ? new Date(d.end_datetime).toISOString() : null,
        capacity: Number(d.capacity) || 0,
        isFree: d.is_free !== false,
        priceCents: d.is_free !== false ? null : Math.round((parseFloat(d.price_dollars) || 0) * 100),
        visibility: d.visibility || 'public',
        inviteOnly: d.visibility === 'invite_only',
        coverImageUrl: this.coverImagePreview || null,
        bannerImageUrl: this.bannerImagePreview || null,
        merchantName: merchant.name || null,
        merchantLogoUrl: merchant.logoUrl || null,
        maxTicketsPerGuest: Number(d.max_tickets_per_guest) || 1,
      }
    },

    previewPriceLabel() {
      if (!this.previewEvent) return ''
      if (this.previewEvent.isFree) return 'Free'
      if (this.previewEvent.priceCents) return `$${(this.previewEvent.priceCents / 100).toFixed(2)}`
      return 'See details'
    },
  },

  async created() {
    if (!this.isAuthenticated) {
      this.authChecked = true
      return
    }

    try {
      await this.loadCurrentUser()
      if (this.notAuthorized) return
      if (this.noMerchants) return

      if (this.editMode) {
        this.loadingSubmission = true
        const loaded = await this.loadExistingSubmission()
        this.loadingSubmission = false
        if (!loaded) return
      }

      await this.initializeSurvey()

      if (this.editMode && this.existingSubmission) {
        this.preloadSurveyData()
      }
    } finally {
      this.authChecked = true
    }
  },

  unmounted() {
    // Clean up blob URLs to avoid memory leaks
    if (this.coverImagePreview?.startsWith('blob:')) URL.revokeObjectURL(this.coverImagePreview)
    if (this.bannerImagePreview?.startsWith('blob:')) URL.revokeObjectURL(this.bannerImagePreview)
  },

  methods: {
    signInNow() {
      signIn()
    },

    markNotAuthorized(customMsg) {
      this.notAuthorized = true
      if (customMsg) this.notAuthorizedMessage = customMsg
    },

    async loadCurrentUser() {
      try {
        const token = await getAccessToken()
        if (!token) {
          this.markNotAuthorized('Your session does not have a valid access token. Please sign in again.')
          return
        }

        const res = await fetch(`${API_BASE}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (res.status === 401) {
          this.markNotAuthorized('You are not signed in with a valid session. Please sign in again.')
          return
        }

        if (!res.ok) {
          console.error('[EventSubmissions] Failed to load /api/v1/users/me', res.status)
          this.markNotAuthorized('Unable to verify your account at this time. Please try again later.')
          return
        }

        const data = await res.json()
        this.user = { id: data.id, email: data.email, name: data.name, role: data.role }
        this.merchants = data.merchants || []

        if (!ALLOWED_ROLES.includes(this.user.role)) {
          this.markNotAuthorized('You are signed in, but you do not have permission to submit events. Only merchants and admins can submit events.')
        }
      } catch (err) {
        console.error('[EventSubmissions] loadCurrentUser error', err)
        this.markNotAuthorized('Unable to verify your permissions at this time.')
      }
    },

    async loadExistingSubmission() {
      try {
        const token = await getAccessToken()
        if (!token) {
          this.markNotAuthorized('Your session does not have a valid access token.')
          return false
        }

        const res = await fetch(`${API_BASE}/event-submissions/${this.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          this.markNotAuthorized('Unable to load the submission. It may not exist or you may not have access.')
          return false
        }

        const sub = await res.json()

        if (sub.state !== 'pending') {
          this.markNotAuthorized(`This submission has already been ${sub.state}. Only pending submissions can be edited.`)
          return false
        }

        this.existingSubmission = sub
        return true
      } catch (err) {
        console.error('[EventSubmissions] loadExistingSubmission error', err)
        this.markNotAuthorized('Unable to load the submission at this time.')
        return false
      }
    },

    preloadSurveyData() {
      if (!this.survey || !this.existingSubmission) return
      const sd = this.existingSubmission.submissionData || this.existingSubmission.submission_data
      if (!sd) return

      const fieldMap = {
        group_id:                    this.existingSubmission.groupId || this.existingSubmission.group_id,
        merchant_id:                 this.existingSubmission.merchantId || this.existingSubmission.merchant_id,
        name:                        sd.name,
        description:                 sd.description,
        location:                    sd.location,
        start_datetime:              sd.start_datetime ? sd.start_datetime.slice(0, 16) : null,
        end_datetime:                sd.end_datetime ? sd.end_datetime.slice(0, 16) : null,
        capacity:                    sd.capacity,
        max_tickets_per_guest:       sd.max_tickets_per_guest,
        is_free:                     sd.is_free !== false,
        price_dollars:               sd.price_cents ? (sd.price_cents / 100) : 0,
        members_only_price_dollars:  sd.members_only_price_cents ? (sd.members_only_price_cents / 100) : 0,
        visibility:                  sd.visibility || 'public',
        cover_image_url:             sd.cover_image_url,
        banner_image_url:            sd.banner_image_url,
      }

      for (const [key, value] of Object.entries(fieldMap)) {
        if (value !== undefined && value !== null) {
          this.survey.setValue(key, value)
        }
      }

      // Pre-populate image state for edit mode (use existing URLs as preview too)
      if (sd.cover_image_url) {
        this.coverImageUrl = sd.cover_image_url
        this.coverImagePreview = sd.cover_image_url
      }
      if (sd.banner_image_url) {
        this.bannerImageUrl = sd.banner_image_url
        this.bannerImagePreview = sd.banner_image_url
      }

      this.surveyData = { ...this.survey.data }
    },

    async initializeSurvey() {
      this.survey = new Model(eventSurveyJson)
      this.survey.showCompletedPage = false

      const [, merchantItems] = await Promise.all([
        this.loadChoices('group_id', 'groups'),
        this.loadChoices('merchant_id', 'merchants/mine', { authRequired: true }),
      ])
      this.merchantsList = merchantItems || []

      // Keep surveyData in sync so previewEvent reacts to changes
      this.survey.onValueChanged.add(() => {
        this.surveyData = { ...this.survey.data }
      })

      // Track current page to show/hide upload controls and preview
      this.currentSurveyPage = this.survey.currentPage?.name || null
      this.survey.onCurrentPageChanged.add((_, options) => {
        this.currentSurveyPage = options.newCurrentPage?.name || null
      })

      this.survey.onComplete.add(this.handleSubmit)
    },

    async loadChoices(questionName, endpoint, { authRequired = false } = {}) {
      try {
        const headers = {}
        if (authRequired) {
          const token = await getAccessToken()
          if (!token) throw new Error('You must be signed in to load this data')
          headers.Authorization = `Bearer ${token}`
        }

        const res = await fetch(`${API_BASE}/${endpoint}`, { headers })
        if (!res.ok) throw new Error(res.statusText)
        const items = await res.json()
        const q = this.survey.getQuestionByName(questionName)
        if (q) {
          q.choices = items.map((i) => ({ value: i.id, text: i.name }))
        }
        return items
      } catch (err) {
        console.error(`Failed to load ${endpoint}:`, err)
        return []
      }
    },

    // ── Image upload handlers ──────────────────────────────────────

    async handleCoverImageChange(e) {
      const file = e.target.files?.[0]
      if (!file) return
      const merchantId = this.survey?.getValue('merchant_id')
      if (!merchantId) {
        this.coverUploadError = 'Please select a restaurant on the first page before uploading images.'
        return
      }

      // Show local blob preview immediately — no waiting for S3
      if (this.coverImagePreview?.startsWith('blob:')) URL.revokeObjectURL(this.coverImagePreview)
      this.coverImagePreview = URL.createObjectURL(file)

      this.coverUploading = true
      this.coverUploadError = null
      try {
        const url = await uploadEventCoverImage(merchantId, file)
        this.coverImageUrl = url
        this.survey.setValue('cover_image_url', url)
      } catch (err) {
        this.coverUploadError = err.message || 'Cover image upload failed. Please try again.'
        // Keep showing the local preview even if upload failed
      } finally {
        this.coverUploading = false
      }
    },

    async handleBannerImageChange(e) {
      const file = e.target.files?.[0]
      if (!file) return
      const merchantId = this.survey?.getValue('merchant_id')
      if (!merchantId) {
        this.bannerUploadError = 'Please select a restaurant on the first page before uploading images.'
        return
      }

      // Show local blob preview immediately
      if (this.bannerImagePreview?.startsWith('blob:')) URL.revokeObjectURL(this.bannerImagePreview)
      this.bannerImagePreview = URL.createObjectURL(file)

      this.bannerUploading = true
      this.bannerUploadError = null
      try {
        const url = await uploadEventBannerImage(merchantId, file)
        this.bannerImageUrl = url
        this.survey.setValue('banner_image_url', url)
      } catch (err) {
        this.bannerUploadError = err.message || 'Banner image upload failed. Please try again.'
      } finally {
        this.bannerUploading = false
      }
    },

    // ── Submission ─────────────────────────────────────────────────

    async handleSubmit(sender) {
      const d = sender.data
      this.submissionError = null

      const submissionData = {
        name:                        d.name,
        description:                 d.description,
        location:                    d.location || null,
        start_datetime:              d.start_datetime ? new Date(d.start_datetime).toISOString() : null,
        end_datetime:                d.end_datetime ? new Date(d.end_datetime).toISOString() : null,
        capacity:                    Number(d.capacity) || 0,
        max_tickets_per_guest:       Number(d.max_tickets_per_guest) || 1,
        is_free:                     d.is_free !== false,
        price_cents:                 d.is_free !== false ? null : Math.round((parseFloat(d.price_dollars) || 0) * 100),
        members_only_price_cents:    d.is_free !== false ? null : Math.round((parseFloat(d.members_only_price_dollars) || 0) * 100),
        visibility:                  d.visibility || 'public',
        cover_image_url:             this.coverImageUrl || d.cover_image_url || null,
        banner_image_url:            this.bannerImageUrl || d.banner_image_url || null,
      }

      try {
        const token = await getAccessToken()
        if (!token) throw new Error('You must be signed in to submit an event')

        if (this.editMode) {
          const res = await fetch(`${API_BASE}/event-submissions/${this.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ submission_data: submissionData }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `Status ${res.status}`)
          }
          console.log('📅 Updated event submission:', (await res.json()))
        } else {
          const res = await fetch(`${API_BASE}/event-submissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              group_id:        d.group_id,
              merchant_id:     d.merchant_id,
              submission_data: submissionData,
            }),
          })
          if (!res.ok) throw new Error(`Status ${res.status}`)
          const saved = await res.json()
          console.log('📅 Saved event submission:', saved)

          if (WEBHOOK_URL) {
            fetch(WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userEmail:       this.user?.email || '',
                groupId:         d.group_id,
                merchantId:      d.merchant_id,
                submission_data: submissionData,
              }),
            }).catch((err) => console.warn('[EventSubmissions] webhook failed:', err))
          }
        }

        this.submissionSuccess = true
      } catch (err) {
        console.error('❌ Event submission error:', err)
        this.submissionError = `${this.editMode ? 'Update' : 'Event submission'} failed: ${err.message}`
      }
    },

    previewFormatDate(dt) {
      if (!dt) return ''
      return new Date(dt).toLocaleString(undefined, {
        weekday: 'short', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    },

    submitAnother() {
      this.submissionSuccess = false
      this.submissionError = null
      if (this.coverImagePreview?.startsWith('blob:')) URL.revokeObjectURL(this.coverImagePreview)
      if (this.bannerImagePreview?.startsWith('blob:')) URL.revokeObjectURL(this.bannerImagePreview)
      this.coverImageUrl = null
      this.coverImagePreview = null
      this.bannerImageUrl = null
      this.bannerImagePreview = null
      this.surveyData = {}
      this.initializeSurvey()
    },
  },
}
</script>

<style scoped>
.event-submissions {
  padding: var(--spacing-2xl);
  max-width: var(--container-xl);
  margin: 0 auto;
}

@media (max-width: 768px) {
  .event-submissions {
    padding: var(--spacing-lg);
  }
}

.submissions {
  max-width: 700px;
  margin: 0 auto;
}

.edit-hint {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-lg);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.section-card {
  background: var(--color-bg-primary);
  padding: var(--spacing-xl);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--spacing-xl);
  color: var(--color-text-primary);
}

.section-card h1,
.section-card h2 {
  color: var(--color-text-primary);
}

.signin-card,
.access-check-card,
.access-denied-card,
.empty-state-card,
.success-card {
  text-align: center;
  max-width: 600px;
  margin: var(--spacing-3xl) auto;
  padding: var(--spacing-xl);
  color: var(--color-text-primary);
}

.success-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-lg);
}

.success-icon {
  font-size: 4rem;
  color: var(--color-success);
  margin-bottom: var(--spacing-sm);
}

.success-icon .pi-check-circle {
  font-size: 4rem;
}

.success-card h1 {
  color: var(--color-text-primary);
  margin: 0;
}

.success-message {
  color: var(--color-text-secondary);
  font-size: var(--font-size-lg);
  line-height: var(--line-height-relaxed);
  margin: 0;
}

.success-actions {
  display: flex;
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
  flex-wrap: wrap;
  justify-content: center;
}

.btn.secondary {
  background: var(--color-success);
  color: var(--color-text-on-success);
}

.btn.secondary:hover:not(:disabled) {
  background: var(--color-success-hover);
}

.subtitle {
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
}

.btn {
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-full);
  border: none;
  cursor: pointer;
  font-size: var(--font-size-base);
  transition: all var(--transition-base);
  min-height: var(--button-height-md);
}

.btn.primary {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
}

.btn.primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.muted {
  color: var(--color-text-muted);
}

.tiny {
  font-size: var(--font-size-xs);
}

.error-text {
  color: var(--color-error);
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-sm);
}

/* ── Images + preview combined ───────────────────────────────────── */

.images-and-preview {
  margin-bottom: var(--spacing-lg);
}

/* ── Image upload controls ──────────────────────────────────────── */

.image-upload-section {
  padding: var(--spacing-xl);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-xl);
  margin-bottom: var(--spacing-xl);
}

.image-upload-section h2,
.preview-section h2 {
  margin: 0 0 var(--spacing-sm);
  color: var(--color-text-primary);
  font-size: var(--font-size-xl);
}

.image-upload-field {
  margin-top: var(--spacing-xl);
}

.image-upload-label {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-sm);
}

.image-hint {
  font-weight: var(--font-weight-normal);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.upload-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-2xl);
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  cursor: pointer;
  transition: all var(--transition-base);
  color: var(--color-text-secondary);
  text-align: center;
}

.upload-dropzone:hover:not(.loading) {
  border-color: var(--color-primary);
  background: var(--color-bg-muted);
}

.upload-dropzone.loading {
  opacity: 0.7;
  cursor: wait;
}

.upload-icon {
  font-size: 2rem;
  color: var(--color-text-muted);
}

.upload-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.hidden-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.image-preview-row {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.image-thumb {
  width: 100px;
  height: 100px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.image-thumb-wide {
  width: 200px;
  height: 80px;
}

.btn-upload {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-base);
  position: relative;
}

.btn-upload:hover:not(.loading) {
  background: var(--color-bg-muted);
}

.btn-upload.loading {
  opacity: 0.7;
  cursor: wait;
}

/* ── Preview section ─────────────────────────────────────────────── */

.preview-section {
  margin-bottom: var(--spacing-xl);
}

.preview-col-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 var(--spacing-sm);
}

.preview-columns {
  display: flex;
  gap: var(--spacing-2xl);
  flex-wrap: wrap;
  margin-top: var(--spacing-md);
}

.preview-col {
  flex: 0 0 auto;
}

.preview-col-detail {
  flex: 1 1 340px;
  min-width: 280px;
}

.preview-detail-container {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.preview-hero {
  height: 180px;
  background-size: cover;
  background-position: center;
  position: relative;
}

.preview-hero-no-image {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
}

.preview-hero-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: var(--spacing-lg);
  color: #fff;
}

.preview-hero-overlay h3 {
  margin: 0;
  font-size: var(--font-size-xl);
  color: #fff;
}

.preview-merchant-name {
  margin: var(--spacing-xs) 0 0;
  opacity: 0.85;
  font-size: var(--font-size-sm);
}

.preview-detail-body {
  padding: var(--spacing-lg);
}

.preview-description {
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
}

.preview-meta-list {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--spacing-xs) var(--spacing-md);
  margin: 0 0 var(--spacing-md);
  font-size: var(--font-size-sm);
}

.preview-meta-list dt {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  white-space: nowrap;
}

.preview-meta-list dd {
  margin: 0;
  color: var(--color-text-secondary);
}

.invite-badge,
.members-badge {
  display: inline-block;
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.invite-badge { background: var(--color-error-light); color: var(--color-error); }
.members-badge { background: var(--color-primary); color: var(--color-text-on-primary); opacity: 0.85; }

/* ============================================
   SURVEYJS THEME OVERRIDES
   ============================================ */

.submissions :deep(.sv-root) {
  background-color: transparent;
  color: var(--color-text-primary);
  font-family: var(--font-family-base);
}

.submissions :deep(.sv-title) {
  color: var(--color-text-primary);
  font-family: var(--font-family-heading);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-lg);
}

.submissions :deep(.sv-question__title) {
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-md);
}

.submissions :deep(.sv-question__description) {
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  margin-bottom: var(--spacing-sm);
}

.submissions :deep(.sv-input),
.submissions :deep(.sv-text),
.submissions :deep(.sv-dropdown),
.submissions :deep(.sv-comment),
.submissions :deep(.sv-date),
.submissions :deep(.sv-time) {
  background-color: var(--color-bg-surface);
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  padding: var(--spacing-sm) var(--spacing-md);
  min-height: var(--button-height-md);
  box-shadow: var(--shadow-input);
  transition: all var(--transition-base);
}

.submissions :deep(.sv-input:focus),
.submissions :deep(.sv-text:focus),
.submissions :deep(.sv-dropdown:focus),
.submissions :deep(.sv-comment:focus) {
  outline: none;
  box-shadow: var(--shadow-input-focus);
}

.submissions :deep(.sv-btn) {
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
  border: none;
  border-radius: var(--radius-full);
  padding: var(--spacing-sm) var(--spacing-lg);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  min-height: var(--button-height-md);
  cursor: pointer;
  transition: all var(--transition-base);
  font-family: var(--font-family-base);
}

.submissions :deep(.sv-btn:hover) {
  background-color: var(--color-primary-hover);
}

.submissions :deep(.sv-progress) {
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-full);
  height: 8px;
  margin-bottom: var(--spacing-xl);
}

.submissions :deep(.sv-progress__bar) {
  background-color: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width var(--transition-base);
}

.submissions :deep(.sv-question__erbox) {
  background-color: var(--color-error-light);
  border-radius: var(--radius-md);
  color: var(--color-error);
  padding: var(--spacing-sm) var(--spacing-md);
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-sm);
}

.submissions :deep(.sv-panel) {
  background-color: transparent;
  border: none;
  padding: 0;
}

.submissions :deep(.sv-page) {
  background-color: transparent;
}

:root[data-theme="dark"] .submissions :deep(.sv-root),
:root[data-theme="dark"] .submissions :deep(.sv-page),
:root[data-theme="dark"] .submissions :deep(.sv-panel) {
  background-color: transparent;
  color: var(--color-text-primary);
}

:root[data-theme="dark"] .submissions :deep(.sv-input),
:root[data-theme="dark"] .submissions :deep(.sv-text),
:root[data-theme="dark"] .submissions :deep(.sv-dropdown),
:root[data-theme="dark"] .submissions :deep(.sv-comment) {
  background-color: var(--color-bg-surface);
  box-shadow: var(--shadow-input);
  color: var(--color-text-primary);
}
</style>
