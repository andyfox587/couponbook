<!-- src/views/CouponSubmissions.vue -->
<template>
  <div class="coupon-submissions">
    <!-- NOT AUTHENTICATED -->
    <section v-if="!isAuthenticated" class="section-card signin-card">
      <h1>{{ editMode ? 'Edit Pending Coupon Submission' : 'Submit a New Coupon' }}</h1>
      <p class="muted">
        You need to be signed in as a merchant or super admin to submit coupons.
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
      <h1>{{ editMode ? 'Edit Pending Coupon Submission' : 'Submit a New Coupon' }}</h1>
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

    <!-- AUTHORIZED BUT NO MERCHANTS (foodie_group_admin with 0 restaurants) -->
    <section v-else-if="noMerchants" class="section-card empty-state-card">
      <h1>No Restaurants Linked</h1>
      <p class="muted">
        You don't have any restaurants linked to your account yet.
        To submit coupons, you need to own at least one restaurant.
      </p>
      <button class="btn primary" @click="$router.push('/profile')">
        <i class="pi pi-arrow-left icon-spacing-sm"></i>Back to Profile
      </button>
      <p class="muted tiny">
        Contact support if you believe this is an error.
      </p>
    </section>

    <!-- AUTHENTICATED + AUTHORIZED: SHOW SURVEY OR SUCCESS -->
    <template v-else>
      <!-- SUCCESS STATE -->
      <section v-if="submissionSuccess" class="section-card success-card">
        <div class="success-content">
          <div class="success-icon">
            <i class="pi pi-check-circle"></i>
          </div>
          <h1>{{ editMode ? 'Submission Updated!' : 'Coupon Submitted Successfully!' }}</h1>
          <p class="success-message">
            {{ editMode
              ? 'Your pending coupon submission has been updated successfully. The Foodie Group will review the latest version.'
              : "Your coupon has been sent for approval. You'll see it live once your Foodie Group accepts it."
            }}
          </p>
          <div class="success-actions">
            <button class="btn primary" @click="$router.push('/profile')">
              <i class="pi pi-arrow-left icon-spacing-sm"></i>Back to Profile
            </button>
            <button v-if="!editMode" class="btn secondary" @click="submitAnother">
              <i class="pi pi-plus icon-spacing-sm"></i>Submit Another Coupon
            </button>
          </div>
        </div>
      </section>

      <!-- LOADING EXISTING SUBMISSION -->
      <section v-else-if="loadingSubmission" class="section-card access-check-card">
        <h1>Edit Pending Coupon Submission</h1>
        <p class="subtitle">Loading submission…</p>
      </section>

      <!-- SURVEY FORM -->
      <div v-else class="submissions">
        <h1>{{ editMode ? 'Edit Pending Coupon Submission' : 'Submit a New Coupon' }}</h1>
        <p v-if="editMode" class="edit-hint">You can edit this submission until it is reviewed by the Foodie Group admin.</p>
        <survey-component :model="survey" />
      </div>
    </template>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'
import { Model } from 'survey-core'
import { SurveyComponent } from 'survey-vue3-ui'
import { couponSurveyJson } from '@/data/couponSurvey.js'
import { getAccessToken, signIn } from '@/services/authService'

const API_BASE = '/api/v1'
const WEBHOOK_URL = 'https://n8n.vivaspot.com/webhook/7d15576d-01a3-49c8-b0f4-6c490e54baa7'

// Roles allowed to access this page
const ALLOWED_ROLES = ['super_admin', 'merchant', 'foodie_group_admin']

export default {
  name: 'CouponSubmissions',

  components: {
    SurveyComponent,
  },

  props: {
    id: { type: String, default: null },
  },

  data() {
    return {
      // Auth / gating state
      user: null,
      merchants: [],
      authChecked: false,
      notAuthorized: false,
      notAuthorizedMessage: 'You are not authorized to submit coupons.',

      // Survey
      survey: null,
      
      // Submission state
      submissionSuccess: false,

      // Edit mode state
      existingSubmission: null,
      loadingSubmission: false,
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
      // Show empty state if user is foodie_group_admin with no merchants
      // (super admin and merchant roles always have access regardless of merchants)
      if (this.role === 'foodie_group_admin' && this.merchants.length === 0) {
        return true
      }
      return false
    },
  },

  async created() {
    // If not logged in, let the sign-in gate render; do not hit the API.
    if (!this.isAuthenticated) {
      this.authChecked = true
      return
    }

    try {
      await this.loadCurrentUser()

      // If loadCurrentUser() decided we're not authorized, bail early.
      if (this.notAuthorized) return

      // If user has no merchants and is foodie_group_admin, bail (noMerchants will show)
      if (this.noMerchants) return

      // In edit mode, load the existing submission first
      if (this.editMode) {
        this.loadingSubmission = true
        const loaded = await this.loadExistingSubmission()
        this.loadingSubmission = false
        if (!loaded) return
      }

      // Initialize survey and load dropdown choices
      await this.initializeSurvey()

      // In edit mode, preload the submission data into the survey fields
      if (this.editMode && this.existingSubmission) {
        this.preloadSurveyData()
      }
    } finally {
      this.authChecked = true
    }
  },

  methods: {
    signInNow() {
      signIn()
    },

    markNotAuthorized(customMsg) {
      this.notAuthorized = true
      if (customMsg) {
        this.notAuthorizedMessage = customMsg
      }
    },

    async loadCurrentUser() {
      try {
        const token = await getAccessToken()
        if (!token) {
          this.markNotAuthorized(
            'Your session does not have a valid access token. Please sign in again.'
          )
          return
        }

        const res = await fetch(`${API_BASE}/users/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (res.status === 401) {
          this.markNotAuthorized(
            'You are not signed in with a valid session. Please sign in again.'
          )
          return
        }

        if (!res.ok) {
          console.error('[CouponSubmissions] Failed to load /api/v1/users/me', res.status)
          this.markNotAuthorized(
            'Unable to verify your account at this time. Please try again later.'
          )
          return
        }

        const data = await res.json()
        this.user = {
          id: data.id,
          email: data.email,
          name: data.name,
          role: data.role,
        }
        this.merchants = data.merchants || []

        // Role check: only allowed roles can access
        if (!ALLOWED_ROLES.includes(this.user.role)) {
          this.markNotAuthorized(
            'You are signed in, but you do not have permission to submit coupons. Only merchants and admins can submit coupons.'
          )
        }
      } catch (err) {
        console.error('[CouponSubmissions] loadCurrentUser error', err)
        this.markNotAuthorized(
          'Unable to verify your permissions at this time.'
        )
      }
    },

    async loadExistingSubmission() {
      try {
        const token = await getAccessToken()
        if (!token) {
          this.markNotAuthorized('Your session does not have a valid access token.')
          return false
        }

        const res = await fetch(`${API_BASE}/coupon-submissions/${this.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          this.markNotAuthorized('Unable to load the submission. It may not exist or you may not have access.')
          return false
        }

        const sub = await res.json()

        if (sub.state !== 'pending') {
          this.markNotAuthorized(
            `This submission has already been ${sub.state}. Only pending submissions can be edited.`
          )
          return false
        }

        this.existingSubmission = sub
        return true
      } catch (err) {
        console.error('[CouponSubmissions] loadExistingSubmission error', err)
        this.markNotAuthorized('Unable to load the submission at this time.')
        return false
      }
    },

    preloadSurveyData() {
      if (!this.survey || !this.existingSubmission) return
      const sd = this.existingSubmission.submissionData || this.existingSubmission.submission_data
      if (!sd) return

      const fieldMap = {
        group_id: this.existingSubmission.groupId || this.existingSubmission.group_id,
        merchant_id: this.existingSubmission.merchantId || this.existingSubmission.merchant_id,
        title: sd.title,
        description: sd.description,
        coupon_type: sd.coupon_type,
        discount_value: sd.discount_value,
        valid_from: sd.valid_from,
        expires_at: sd.expires_at,
        qr_code_url: sd.qr_code_url,
        locked: sd.locked,
        cuisine_type: sd.cuisine_type,
      }

      for (const [key, value] of Object.entries(fieldMap)) {
        if (value !== undefined && value !== null) {
          this.survey.setValue(key, value)
        }
      }
    },

    async initializeSurvey() {
      // Create survey model
      this.survey = new Model(couponSurveyJson)

      // Hide the default completion page - we'll show our own success message
      this.survey.showCompletedPage = false

      // Load dropdown choices
      await Promise.all([
        this.loadChoices('group_id', 'groups'),
        this.loadChoices('merchant_id', 'merchants/mine', { authRequired: true }),
      ])

      // Register the completion handler
      this.survey.onComplete.add(this.handleSubmit)
    },

    async loadChoices(questionName, endpoint, { authRequired = false } = {}) {
      try {
        const headers = {}
        if (authRequired) {
          const token = await getAccessToken()
          if (!token) {
            throw new Error('You must be signed in to load this data')
          }
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

    async handleSubmit(sender) {
      const d = sender.data

      const submissionData = {
        title: d.title,
        description: d.description,
        coupon_type: d.coupon_type,
        discount_value: parseFloat(d.discount_value) || 0,
        valid_from: d.valid_from,
        expires_at: d.expires_at,
        qr_code_url: d.qr_code_url,
        locked: d.locked,
        cuisine_type: d.cuisine_type,
      }

      try {
        const token = await getAccessToken()
        if (!token) {
          throw new Error('You must be signed in to submit a coupon')
        }

        if (this.editMode) {
          // PATCH existing pending submission
          const res = await fetch(`${API_BASE}/coupon-submissions/${this.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ submission_data: submissionData }),
          })
          if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.error || `Status ${res.status}`)
          }
          const updated = await res.json()
          console.log('🗂 Updated submission:', updated)
        } else {
          // POST new submission
          const res = await fetch(`${API_BASE}/coupon-submissions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              group_id: d.group_id,
              merchant_id: d.merchant_id,
              submission_data: submissionData,
            }),
          })
          if (!res.ok) throw new Error(`Status ${res.status}`)
          const saved = await res.json()
          console.log('🗂 Saved submission:', saved)

          // Fire n8n webhook only for new submissions
          const userEmail = this.user?.email || ''
          await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userEmail,
              groupId: d.group_id,
              merchantId: d.merchant_id,
              submission_data: submissionData,
            }),
          })
        }

        this.submissionSuccess = true
      } catch (err) {
        console.error('❌ Submission error:', err)
        alert(`⚠️ ${this.editMode ? 'Update' : 'Coupon creation'} failed: ${err.message}`)
      }
    },

    goToCouponBook() {
      this.$router.push({ name: 'CouponBook' })
    },

    submitAnother() {
      this.submissionSuccess = false
      // Reinitialize the survey to allow another submission
      this.initializeSurvey()
    },
  },
}
</script>

<style scoped>
.coupon-submissions {
  padding: var(--spacing-2xl);
  max-width: var(--container-xl);
  margin: 0 auto;
}

@media (max-width: 768px) {
  .coupon-submissions {
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

/* ============================================
   SURVEYJS THEME OVERRIDES
   ============================================ */

/* SurveyJS Container */
.submissions :deep(.sv-root) {
  background-color: transparent;
  color: var(--color-text-primary);
  font-family: var(--font-family-base);
}

/* SurveyJS Title */
.submissions :deep(.sv-title) {
  color: var(--color-text-primary);
  font-family: var(--font-family-heading);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-lg);
}

/* SurveyJS Question Titles */
.submissions :deep(.sv-question__title) {
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-md);
}

/* SurveyJS Question Descriptions */
.submissions :deep(.sv-question__description) {
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  margin-bottom: var(--spacing-sm);
}

/* SurveyJS Input Fields */
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
.submissions :deep(.sv-comment:focus),
.submissions :deep(.sv-date:focus),
.submissions :deep(.sv-time:focus) {
  outline: none;
  box-shadow: var(--shadow-input-focus);
}

.submissions :deep(.sv-input:hover),
.submissions :deep(.sv-text:hover),
.submissions :deep(.sv-dropdown:hover),
.submissions :deep(.sv-comment:hover) {
  box-shadow: var(--shadow-sm);
}

/* SurveyJS Dropdown */
.submissions :deep(.sv-dropdown) {
  cursor: pointer;
}

.submissions :deep(.sv-dropdown__option) {
  background-color: var(--color-bg-surface);
  color: var(--color-text-primary);
  padding: var(--spacing-sm) var(--spacing-md);
}

.submissions :deep(.sv-dropdown__option:hover) {
  background-color: var(--color-bg-secondary);
}

/* SurveyJS Textarea/Comment */
.submissions :deep(.sv-comment) {
  min-height: 100px;
  resize: vertical;
}

/* SurveyJS Buttons */
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

.submissions :deep(.sv-btn:active) {
  transform: translateY(1px);
}

.submissions :deep(.sv-btn:disabled) {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

/* SurveyJS Navigation Buttons */
.submissions :deep(.sv-nav-btn) {
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
}

.submissions :deep(.sv-nav-btn:hover) {
  background-color: var(--color-primary-hover);
}

/* SurveyJS Progress Bar */
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

/* SurveyJS Error Messages */
.submissions :deep(.sv-question__erbox) {
  background-color: var(--color-error-light);
  border-radius: var(--radius-md);
  color: var(--color-error);
  padding: var(--spacing-sm) var(--spacing-md);
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-sm);
  box-shadow: 0 4px 12px rgba(176, 0, 32, 0.15);
}

/* SurveyJS Required Indicator */
.submissions :deep(.sv-question__required-text) {
  color: var(--color-error);
}

/* SurveyJS Help Text */
.submissions :deep(.sv-question__description) {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

/* SurveyJS Panel */
.submissions :deep(.sv-panel) {
  background-color: transparent;
  border: none;
  padding: 0;
}

/* SurveyJS Page */
.submissions :deep(.sv-page) {
  background-color: transparent;
}

/* SurveyJS Radio/Checkbox */
.submissions :deep(.sv-radio),
.submissions :deep(.sv-checkbox) {
  accent-color: var(--color-primary);
}

.submissions :deep(.sv-radio__label),
.submissions :deep(.sv-checkbox__label) {
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
}

/* SurveyJS Select Base (for dropdowns) */
.submissions :deep(.sv-selectbase) {
  margin-top: var(--spacing-sm);
}

/* SurveyJS Select Base Item */
.submissions :deep(.sv-selectbase__item) {
  padding: var(--spacing-sm) 0;
}

/* SurveyJS Item Value (for radio/checkbox items) */
.submissions :deep(.sv-item__control-label) {
  color: var(--color-text-primary);
}

/* SurveyJS Item Hover */
.submissions :deep(.sv-item:hover) {
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

/* Dark Mode Support */
:root[data-theme="dark"] .submissions :deep(.sv-root),
:root[data-theme="dark"] .submissions :deep(.sv-page),
:root[data-theme="dark"] .submissions :deep(.sv-panel) {
  background-color: transparent;
  color: var(--color-text-primary);
}

:root[data-theme="dark"] .submissions :deep(.sv-input),
:root[data-theme="dark"] .submissions :deep(.sv-text),
:root[data-theme="dark"] .submissions :deep(.sv-dropdown),
:root[data-theme="dark"] .submissions :deep(.sv-comment),
:root[data-theme="dark"] .submissions :deep(.sv-date),
:root[data-theme="dark"] .submissions :deep(.sv-time) {
  background-color: var(--color-bg-surface);
  box-shadow: var(--shadow-input);
  color: var(--color-text-primary);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .submissions :deep(.sv-root),
  :root:not([data-theme="light"]) .submissions :deep(.sv-page),
  :root:not([data-theme="light"]) .submissions :deep(.sv-panel) {
    background-color: transparent;
    color: var(--color-text-primary);
  }

  :root:not([data-theme="light"]) .submissions :deep(.sv-input),
  :root:not([data-theme="light"]) .submissions :deep(.sv-text),
  :root:not([data-theme="light"]) .submissions :deep(.sv-dropdown),
  :root:not([data-theme="light"]) .submissions :deep(.sv-comment),
  :root:not([data-theme="light"]) .submissions :deep(.sv-date),
  :root:not([data-theme="light"]) .submissions :deep(.sv-time) {
    background-color: var(--color-bg-surface);
    box-shadow: var(--shadow-input);
    color: var(--color-text-primary);
  }
}
</style>
