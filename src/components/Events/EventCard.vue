<template>
  <div class="event-card">
    <div
      class="card-image"
      :style="imageStyle"
      :class="{ 'card-image-placeholder': !cardImage }"
    >
      <span v-if="event.status === 'cancelled'" class="status-badge status-cancelled">Cancelled</span>
    </div>

    <div class="card-body">
      <div class="merchant-row" v-if="event.merchantName">
        <img
          v-if="event.merchantLogoUrl"
          class="merchant-logo"
          :src="event.merchantLogoUrl"
          :alt="`Logo of ${event.merchantName}`"
        />
        <span class="merchant-name">{{ event.merchantName }}</span>
      </div>

      <h2 class="event-name">{{ event.name }}</h2>

      <p class="event-desc">{{ event.description }}</p>

      <div class="event-meta">
        <span v-if="event.location" class="meta-item">
          <i class="pi pi-map-marker"></i> {{ event.location }}
        </span>
        <span class="meta-item">
          <i class="pi pi-calendar"></i> {{ formatDate(event.startDatetime) }}
        </span>
        <span class="meta-item price-tag">
          <i class="pi pi-tag"></i> {{ priceLabel }}
        </span>
      </div>

      <div v-if="event.capacity > 0" class="capacity-bar-wrapper">
        <div class="capacity-bar">
          <div class="capacity-bar-fill" :style="{ width: capacityPercent + '%' }"></div>
        </div>
        <span class="capacity-label">{{ confirmedCount }} / {{ event.capacity }} spots filled</span>
      </div>

      <div class="card-actions">
        <router-link
          :to="event.slug ? `/e/${event.slug}` : `/events/${event.id}`"
          class="btn primary"
        >
          View Details
        </router-link>
        <button
          v-if="!event.inviteOnly"
          class="btn secondary"
          @click="$emit('rsvp', event)"
        >
          RSVP
        </button>
        <span v-else class="invite-badge">Invite Only</span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'EventCard',

  props: {
    event: { type: Object, required: true },
  },

  emits: ['rsvp'],

  computed: {
    cardImage() {
      return this.event.bannerImageUrl || this.event.coverImageUrl || null
    },

    imageStyle() {
      return this.cardImage ? { backgroundImage: `url('${this.cardImage}')` } : {}
    },

    confirmedCount() {
      return Number(this.event.confirmedCount) || 0
    },

    capacityPercent() {
      if (!this.event.capacity || this.event.capacity <= 0) return 0
      return Math.min(100, Math.round((this.confirmedCount / this.event.capacity) * 100))
    },

    priceLabel() {
      if (this.event.isFree) return 'Free'
      if (this.event.priceCents) return `$${(this.event.priceCents / 100).toFixed(2)}`
      return 'See details'
    },
  },

  methods: {
    formatDate(dt) {
      if (!dt) return ''
      return new Date(dt).toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    },
  },
}
</script>

<style scoped>
.event-card {
  display: flex;
  flex-direction: column;
  width: 300px;
  border-radius: var(--radius-lg);
  background: var(--color-bg-muted);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: box-shadow var(--transition-base);
}

.event-card:hover {
  box-shadow: var(--shadow-md);
}

.card-image {
  height: 160px;
  background-size: cover;
  background-position: center;
  position: relative;
}

.card-image-placeholder {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  opacity: 0.6;
}

.status-badge {
  position: absolute;
  top: var(--spacing-sm);
  right: var(--spacing-sm);
  padding: 2px var(--spacing-sm);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.status-cancelled {
  background: var(--color-error);
  color: var(--color-text-on-error, #fff);
}

.card-body {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-lg);
  flex: 1;
}

.merchant-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.merchant-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  border-radius: 50%;
  background: #fff;
  padding: 2px;
}

.merchant-name {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}

.event-name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-sm);
  min-height: 2.5em;
}

.event-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: var(--line-height-relaxed);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: var(--spacing-md);
}

.event-meta {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-lg);
}

.meta-item {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.price-tag { font-weight: var(--font-weight-medium); }

.capacity-bar-wrapper {
  margin-bottom: var(--spacing-md);
}

.capacity-bar {
  height: 6px;
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
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.card-actions {
  margin-top: auto;
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  align-items: center;
}

.btn {
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-full);
  border: none;
  cursor: pointer;
  font-size: var(--font-size-sm);
  font-family: var(--font-family-base);
  font-weight: var(--font-weight-medium);
  text-decoration: none;
  transition: all var(--transition-base);
  display: inline-flex;
  align-items: center;
  min-height: 36px;
}

.btn.primary { background: var(--color-primary); color: var(--color-text-on-primary); }
.btn.primary:hover { background: var(--color-primary-hover); }
.btn.secondary { background: var(--color-secondary); color: var(--color-text-on-secondary); }
.btn.secondary:hover { background: var(--color-secondary-hover); }

.invite-badge {
  font-size: var(--font-size-xs);
  background: var(--color-error-light);
  color: var(--color-error);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  font-weight: var(--font-weight-medium);
}
</style>
