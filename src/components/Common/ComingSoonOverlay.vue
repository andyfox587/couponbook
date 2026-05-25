<template>
  <div class="coming-soon-wrapper">
    <div class="coming-soon-slot" aria-hidden="true">
      <slot />
    </div>
    <div class="coming-soon-overlay" role="status">
      <div class="coming-soon-label">
        <span class="coming-soon-heading">Coming Soon</span>
        <span class="coming-soon-tagline">Events are on their way</span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ComingSoonOverlay',
}
</script>

<style scoped>
.coming-soon-wrapper {
  position: relative;
  border-radius: inherit;
  overflow: hidden;
}

.coming-soon-slot {
  filter: blur(8px);
  pointer-events: none;
  user-select: none;
  opacity: 0.55;
  transform: scale(1.02);
}

.coming-soon-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.05) 0%,
    rgba(255, 255, 255, 0.15) 100%
  );
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 10;
  padding: var(--spacing-lg);
  text-align: center;
}

.coming-soon-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs, 4px);
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
}

.coming-soon-heading {
  font-size: clamp(1.5rem, 4vw, 2.25rem);
  font-weight: var(--font-weight-bold, 700);
  color: #ffffff;
  letter-spacing: 0.02em;
  line-height: 1.1;
}

.coming-soon-tagline {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: var(--font-weight-medium, 500);
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 0.02em;
}

:root[data-theme="dark"] .coming-soon-overlay {
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.15) 0%,
    rgba(0, 0, 0, 0.3) 100%
  );
}
</style>
