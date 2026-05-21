<!-- src/views/EventDetail.vue -->
<template>
  <div class="event-detail">
    <div v-if="loading" class="state-card">
      <p class="muted">Loading event…</p>
    </div>

    <div v-else-if="error" class="state-card error-card">
      <p>{{ error }}</p>
      <button class="btn primary" @click="$router.push('/events')">Back to Events</button>
    </div>

    <template v-else-if="evt">
      <!-- Hero -->
      <div
        class="hero"
        :style="evt.bannerImageUrl ? `background-image: url('${evt.bannerImageUrl}')` : ''"
        :class="{ 'hero-no-image': !evt.bannerImageUrl }"
      >
        <div class="hero-overlay">
          <h1>{{ evt.name }}</h1>
          <p class="merchant-name" v-if="evt.merchantName">by {{ evt.merchantName }}</p>
        </div>
      </div>

      <!-- Details -->
      <div class="detail-body">
        <div class="detail-main">
          <p class="description">{{ evt.description }}</p>

          <dl class="meta-list">
            <template v-if="evt.location">
              <dt><i class="pi pi-map-marker"></i> Location</dt>
              <dd>{{ evt.location }}</dd>
            </template>
            <dt><i class="pi pi-calendar"></i> Starts</dt>
            <dd>{{ formatDate(evt.startDatetime) }}</dd>
            <template v-if="evt.endDatetime">
              <dt><i class="pi pi-calendar"></i> Ends</dt>
              <dd>{{ formatDate(evt.endDatetime) }}</dd>
            </template>
            <dt><i class="pi pi-users"></i> Capacity</dt>
            <dd>{{ evt.capacity > 0 ? evt.capacity + ' spots' : 'Unlimited' }}</dd>
            <dt><i class="pi pi-tag"></i> Price</dt>
            <dd>
              {{ priceLabel }}
              <span v-if="memberPriceLabel" class="member-price">
                (Members: {{ memberPriceLabel }})
              </span>
            </dd>
          </dl>

          <div v-if="evt.capacity > 0" class="capacity-section">
            <div class="capacity-bar">
              <div class="capacity-bar-fill" :style="{ width: capacityPercent + '%' }"></div>
            </div>
            <span class="capacity-label">{{ confirmedCount }} / {{ evt.capacity }} spots filled</span>
            <span class="capacity-sub-label">{{ capacityStateLabel }}</span>
          </div>

          <div v-if="hasConfirmedRsvp" class="calendar-row">
            <button
              type="button"
              class="btn secondary calendar-btn"
              :disabled="calendarDownloading"
              @click="downloadCalendarInvite"
            >
              <i class="pi pi-calendar-plus icon-spacing-sm"></i>
              {{ calendarDownloading ? 'Preparing…' : 'Add to Calendar' }}
            </button>
            <span class="calendar-hint">Opens in Google, Apple, or Outlook calendar.</span>
            <span v-if="calendarError" class="calendar-error">{{ calendarError }}</span>
          </div>

          <div v-if="evt.inviteOnly" class="invite-badge">Invite Only</div>
          <div v-else-if="evt.visibility === 'members_only'" class="members-badge">Members Only</div>
          <div v-if="evt.status === 'cancelled'" class="alert alert-warning cancelled-alert">
            This event has been cancelled. Existing paid RSVPs are eligible for a full refund.
          </div>
        </div>

        <!-- RSVP Panel -->
        <div class="rsvp-panel" v-if="!evt.inviteOnly && evt.status !== 'cancelled'">
          <div v-if="checkoutBanner" class="checkout-banner" :class="`checkout-banner-${checkoutBanner.kind}`">
            {{ checkoutBanner.message }}
          </div>
          <EventRSVP
            :event="evt"
            :is-authenticated="isAuthenticated"
            :has-membership="hasMembership"
            :existing-rsvp="myRsvp"
            :rsvp-loading="myRsvpLoading"
            :user-profile="userProfile"
            @rsvp-submitted="onRsvpSubmitted"
            @rsvp-cancelled="onRsvpCancelled"
            @login-requested="onLoginRequested"
          />
        </div>
      </div>

      <!-- Back -->
      <div class="back-row">
        <button class="btn secondary" @click="$router.push('/events')">
          <i class="pi pi-arrow-left icon-spacing-sm"></i>All Events
        </button>
      </div>
    </template>
  </div>
</template>

<script>
import EventRSVP from '@/components/Events/EventRSVP.vue'
import { getEvent, getEventBySlug, getMyRsvpForEvent } from '@/services/eventService'
import { getAccessToken } from '@/services/authService'

export default {
  name: 'EventDetail',
  components: { EventRSVP },

  props: {
    id:   { type: String, default: null },
    slug: { type: String, default: null },
  },

  data() {
    return {
      evt: null,
      loading: true,
      error: null,
      hasMembership: false,
      myRsvp: null,
      myRsvpLoading: false,
      checkoutBanner: null,
      checkoutPollTimer: null,
      calendarDownloading: false,
      calendarError: null,
    }
  },

  computed: {
    isAuthenticated() {
      return this.$store?.getters['auth/isAuthenticated'] ?? false
    },

    userProfile() {
      const p = this.$store?.getters?.['auth/profile']
      if (!p) return null
      return { name: p.name || '', email: p.email || '' }
    },

    confirmedCount() {
      return Number(this.evt?.confirmedCount) || 0
    },

    capacityPercent() {
      if (!this.evt?.capacity || this.evt.capacity <= 0) return 0
      return Math.min(100, Math.round((this.confirmedCount / this.evt.capacity) * 100))
    },

    remainingSpots() {
      if (!this.evt?.capacity || this.evt.capacity <= 0) return null
      return Math.max(0, this.evt.capacity - this.confirmedCount)
    },

    capacityStateLabel() {
      if (this.remainingSpots === null) return ''
      if (this.remainingSpots === 0) return 'Event is at capacity. New RSVPs will join waitlist.'
      if (this.remainingSpots === 1) return '1 seat remaining.'
      return `${this.remainingSpots} seats remaining.`
    },

    priceLabel() {
      if (!this.evt) return ''
      if (this.evt.isFree) return 'Free'
      if (this.evt.priceCents) return `$${(this.evt.priceCents / 100).toFixed(2)}`
      return 'See details'
    },

    memberPriceLabel() {
      if (!this.evt?.membersOnlyPriceCents) return null
      return `$${(this.evt.membersOnlyPriceCents / 100).toFixed(2)}`
    },

    hasConfirmedRsvp() {
      const status = this.myRsvp?.status
      return Boolean(this.myRsvp?.id && this.evt?.id && (status === 'going' || status === 'checked_in'))
    },
  },

  async created() {
    await this.load()
    this.handleCheckoutReturn()
  },

  beforeUnmount() {
    this.stopCheckoutPolling()
  },

  watch: {
    id() {
      this.load()
    },
    slug() {
      this.load()
    },
    '$route.query.member_token'() {
      this.load()
    },
    '$route.query.token'() {
      this.load()
    },
    '$route.query.checkout'() {
      this.handleCheckoutReturn()
    },
    isAuthenticated(val) {
      if (val) {
        this.fetchMembership()
        this.fetchMyRsvp()
      } else {
        this.hasMembership = false
        this.myRsvp = null
      }
    },
  },

  methods: {
    async load() {
      this.loading = true
      this.error = null
      try {
        const memberToken = this.$route.query.member_token || this.$route.query.token || null
        if (this.slug) {
          this.evt = await getEventBySlug(this.slug, memberToken)
        } else if (this.id) {
          this.evt = await getEvent(this.id, memberToken)
        } else {
          this.error = 'No event identifier provided.'
        }
        await this.fetchMembership()
        await this.fetchMyRsvp()
      } catch (err) {
        console.error('[EventDetail] failed to load event', err)
        this.error = 'Event not found or unavailable.'
      } finally {
        this.loading = false
      }
    },

    formatDate(dt) {
      if (!dt) return ''
      return new Date(dt).toLocaleString(undefined, {
        weekday: 'short', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    },

    async fetchMembership() {
      this.hasMembership = false
      if (!this.evt?.groupId || this.evt.visibility !== 'members_only') return
      try {
        const token = await getAccessToken()
        if (!token) return
        const res = await fetch(`/api/v1/groups/${this.evt.groupId}/access`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          this.hasMembership = !!data.hasAccess
        }
      } catch (e) {
        console.error('[EventDetail] membership check failed', e)
      }
    },

    async fetchMyRsvp() {
      this.myRsvp = null
      this.myRsvpLoading = true
      if (!this.isAuthenticated || !this.evt?.id) {
        this.myRsvpLoading = false
        return
      }
      try {
        this.myRsvp = await getMyRsvpForEvent(this.evt.id)
      } catch (err) {
        console.error('[EventDetail] failed to load current RSVP', err)
      } finally {
        this.myRsvpLoading = false
      }
    },

    onRsvpSubmitted() {
      this.load()
    },

    handleCheckoutReturn() {
      const checkout = this.$route.query.checkout
      if (!checkout) return

      if (checkout === 'success') {
        this.checkoutBanner = {
          kind: 'success',
          message: 'Payment received. Your RSVP will appear here shortly.',
        }
        this.startCheckoutPolling()
      } else if (checkout === 'canceled' || checkout === 'cancelled') {
        this.checkoutBanner = {
          kind: 'info',
          message: 'Payment canceled. You can try again whenever you are ready.',
        }
      }

      const { checkout: _c, session_id: _s, ...rest } = this.$route.query
      void _c; void _s;
      this.$router.replace({ query: rest }).catch(() => {})
    },

    startCheckoutPolling() {
      this.stopCheckoutPolling()
      let attempts = 0
      const maxAttempts = 4
      const reload = async () => {
        attempts += 1
        await this.load()
        if (this.myRsvp || attempts >= maxAttempts) {
          this.stopCheckoutPolling()
          return
        }
        this.checkoutPollTimer = setTimeout(reload, 3000)
      }
      this.checkoutPollTimer = setTimeout(reload, 2500)
    },

    stopCheckoutPolling() {
      if (this.checkoutPollTimer) {
        clearTimeout(this.checkoutPollTimer)
        this.checkoutPollTimer = null
      }
    },

    onRsvpCancelled() {
      this.load()
    },

    onLoginRequested() {
      this.$store?.dispatch('auth/login')
    },

    async downloadCalendarInvite() {
      if (!this.hasConfirmedRsvp || this.calendarDownloading) return
      this.calendarDownloading = true
      this.calendarError = null
      try {
        const token = await getAccessToken()
        const url = `/api/v1/events/${this.evt.id}/rsvp/${this.myRsvp.id}/calendar.ics`
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new Error(`Calendar download failed (${res.status})`)
        const blob = await res.blob()
        const filename = `vivaspot-${this.evt.slug || this.evt.id}.ics`
        const objectUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = objectUrl
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      } catch (err) {
        console.error('[EventDetail] calendar download failed', err)
        this.calendarError = 'Could not download calendar invite. Please try again.'
      } finally {
        this.calendarDownloading = false
      }
    },
  },
}
</script>

<style scoped>
.event-detail {
  max-width: 900px;
  margin: 0 auto;
  color: var(--color-text-primary);
}

.state-card {
  padding: var(--spacing-3xl);
  text-align: center;
  color: var(--color-text-secondary);
}

.error-card { color: var(--color-error); }
.muted { color: var(--color-text-muted); }

.hero {
  height: 280px;
  background-size: cover;
  background-position: center;
  border-radius: var(--radius-xl);
  overflow: hidden;
  position: relative;
  margin-bottom: var(--spacing-2xl);
}

.hero-no-image {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
}

.hero-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: var(--spacing-2xl);
  color: #fff;
}

.hero-overlay h1 { margin: 0; font-size: var(--font-size-3xl); }
.merchant-name { margin: var(--spacing-xs) 0 0; opacity: 0.85; }

.detail-body {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: var(--spacing-2xl);
  padding: 0 var(--spacing-xl);
  margin-bottom: var(--spacing-2xl);
}

@media (max-width: 700px) {
  .detail-body { grid-template-columns: 1fr; }
}

.description {
  font-size: var(--font-size-lg);
  line-height: var(--line-height-relaxed);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-xl);
}

.meta-list {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--spacing-sm) var(--spacing-lg);
  margin: 0 0 var(--spacing-xl);
}

.meta-list dt {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  white-space: nowrap;
}

.meta-list dd { margin: 0; color: var(--color-text-secondary); }

.member-price {
  color: var(--color-success);
  font-weight: var(--font-weight-medium);
}

.capacity-section {
  margin-bottom: var(--spacing-xl);
}

.capacity-bar {
  height: 8px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--spacing-xs);
}

.capacity-bar-fill {
  height: 100%;
  background: var(--color-secondary);
  border-radius: var(--radius-full);
  transition: width var(--transition-base);
}

.capacity-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.capacity-sub-label {
  display: block;
  margin-top: var(--spacing-xs);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.invite-badge, .members-badge {
  display: inline-block;
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.calendar-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin: var(--spacing-lg) 0;
  flex-wrap: wrap;
}

.calendar-btn {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

.calendar-hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.calendar-error {
  font-size: var(--font-size-sm);
  color: var(--color-error);
}

.invite-badge { background: var(--color-error-light); color: var(--color-error); }
.members-badge { background: var(--color-primary); color: var(--color-text-on-primary); opacity: 0.85; }
.cancelled-alert { margin-top: var(--spacing-lg); }

.rsvp-panel {
  position: sticky;
  top: var(--spacing-xl);
  align-self: start;
}

.checkout-banner {
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-md);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
}

.checkout-banner-success {
  background: var(--color-success-light, #e6f4ea);
  color: var(--color-success, #1f7a3c);
}

.checkout-banner-info {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.back-row {
  padding: var(--spacing-xl);
}

.btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-full);
  border: none;
  cursor: pointer;
  font-size: var(--font-size-base);
  font-family: var(--font-family-base);
  transition: all var(--transition-base);
  min-height: var(--button-height-md);
  font-weight: var(--font-weight-medium);
}

.btn.primary { background: var(--color-primary); color: var(--color-text-on-primary); }
.btn.primary:hover { background: var(--color-primary-hover); }
.btn.secondary { background: var(--color-bg-secondary); color: var(--color-text-primary); }
.btn.secondary:hover { background: var(--color-border-light); }
</style>
