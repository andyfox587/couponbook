<template>
  <div class="tool-panel">
    <div class="tool-panel-head">
      <h3 class="tool-panel-title">{{ title }}</h3>
      <button
        type="button"
        class="tool-panel-close"
        @click="$emit('close')"
        aria-label="Close"
        title="Close"
      >
        <i class="pi pi-times"></i>
      </button>
    </div>
    <div class="tool-panel-body">
      <slot />
    </div>
  </div>
</template>

<script>
// Small presentational wrapper for the inline "results" panels that open
// directly beneath a Merchant Tools task. Provides the title + an X the
// merchant can use to dismiss the panel (emits `close`). All results markup
// is passed in via the default slot so it stays in the parent's scope.
export default {
  name: 'MerchantToolPanel',
  props: {
    title: { type: String, default: '' },
  },
  emits: ['close'],
};
</script>

<style scoped>
.tool-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.tool-panel-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  margin: 0;
}

.tool-panel-close {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  line-height: 1;
  background: color-mix(in srgb, var(--surface-1) 74%, var(--surface-2));
  color: var(--color-text-primary);
  box-shadow: var(--shadow-xs);
  transition: background var(--transition-base);
}

.tool-panel-close:hover {
  background: var(--surface-2);
}

.tool-panel-close:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 22%, transparent);
}
</style>
