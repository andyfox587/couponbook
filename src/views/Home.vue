<!-- src/views/Home.vue -->
<template>
  <div class="home">
    <!-- Hero Section -->
    <section class="hero">
      <div class="hero-overlay">
        <h1>Welcome to VivaSpot Coupon Book</h1>
        <p>Your digital catalog to exclusive local restaurant deals & events</p>
        <div class="cta-buttons">
          <router-link class="btn primary" to="/coupon-book">Browse Coupons</router-link>
          <router-link class="btn tertiary" to="/events">Browse Events</router-link>
          <router-link class="btn secondary" to="/foodie-groups">Join Foodie Groups</router-link>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="features">
      <h2>Discover Local Deals & Experiences</h2>
      <div class="feature-cards">
        <div class="card">
          <h3>Exclusive Coupons</h3>
          <p>Access special discounts from top local restaurants.</p>
        </div>
        <div class="card">
          <h3>Seamless Redemption</h3>
          <p>Redeem offers easily using QR codes.</p>
        </div>
        <div class="card">
          <h3>Exciting Events</h3>
          <p v-if="!eventsEnabled" class="coming-soon-text">Coming soon — RSVP for curated events and add them to your calendar.</p>
          <p v-else>RSVP for curated events and add them to your calendar.</p>
        </div>
      </div>
    </section>

  </div>
</template>

<script>
import { FEATURES } from '@/config/features'

export default {
  name: 'AppHome',
  data() {
    return {
      eventsEnabled: FEATURES.EVENTS_ENABLED,
    }
  },
}
</script>

<style scoped>
/* General */
.home {
  font-family: var(--font-family-base);
  line-height: var(--line-height-normal);
  color: var(--color-text-primary);
}

/* Hero Section */
.hero {
  position: relative;
  background-image: url("../assets/homepageBackground.jpg");
  background-size: cover;
  background-position: center;
  height: 80vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-overlay {
  background: rgba(0, 0, 0, 0.65);
  padding: var(--spacing-2xl);
  border-radius: var(--radius-lg);
  text-align: center;
  max-width: 90%;
  color: #FFFFFF;
}

.hero h1 {
  font-size: var(--font-size-6xl);
  margin-bottom: var(--spacing-lg);
  color: #FFFFFF;
}

.hero p {
  font-size: var(--font-size-2xl);
  margin-bottom: var(--spacing-2xl);
  color: #FFFFFF;
  opacity: 0.95;
}

.cta-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-lg);
}

.btn {
  padding: var(--spacing-md) var(--spacing-xl);
  text-decoration: none;
  border-radius: var(--radius-md);
  font-weight: var(--font-weight-semibold);
  transition: all var(--transition-base);
  min-height: var(--button-height-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.btn.primary {
  background-color: var(--color-secondary);
  color: var(--color-text-on-secondary);
}

.btn.primary:hover {
  background-color: var(--color-secondary-hover);
  color: var(--color-text-on-secondary);
}

.btn.secondary {
  background-color: var(--color-success);
  color: var(--color-text-on-success);
}

.btn.secondary:hover {
  background-color: var(--color-success-hover);
  color: var(--color-text-on-success);
}

.btn.tertiary {
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
}

.btn.tertiary:hover {
  background-color: var(--color-primary-hover);
}

/* Features Section */
.features {
  background-color: var(--surface-2);
  padding: var(--spacing-2xl);
  text-align: center;
  color: var(--color-text-primary);
}

.features h2 {
  color: var(--color-text-primary);
  font-size: var(--font-size-4xl);
  margin-bottom: var(--spacing-xl);
}

.features p {
  color: var(--color-text-secondary);
}

.feature-cards {
  display: grid;
  gap: var(--spacing-xl);
  max-width: var(--container-lg);
  margin: 0 auto;
}

.feature-cards .card {
  background-color: var(--surface-1);
  padding: var(--spacing-xl);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  color: var(--color-text-primary);
}

.feature-cards .card h3 {
  margin-bottom: var(--spacing-lg);
  font-size: var(--font-size-2xl);
  color: var(--color-text-primary);
}

.feature-cards .card p {
  color: var(--color-text-secondary);
  margin: 0;
}

.feature-cards .card p.coming-soon-text {
  font-style: italic;
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

/* Responsive Adjustments */
@media (max-width: 768px) {
  .hero h1 {
    font-size: var(--font-size-5xl);
  }

  .hero p {
    font-size: var(--font-size-xl);
  }

  .features h2 {
    font-size: var(--font-size-4xl);
  }

  .hero-overlay {
    padding: var(--spacing-xl);
  }
}
</style>
