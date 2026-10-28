<template>
  <div class="ui-section">
    <div class="ui-section-title">{{ title }}</div>
    <div class="ui-section-content">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({ title: String })
</script>

<style scoped>
.ui-section {
  margin-bottom: 10px;
}
.ui-section-title {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  margin-bottom: 6px;
  padding-bottom: 3px;
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.15));
}
.ui-section-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* 统一子元素间距：覆盖各属性组件自身的 margin-bottom */
.ui-section-content :deep(.ui-prop-row),
.ui-section-content :deep(.ui-prop-toggle-row),
.ui-section-content :deep(.ui-prop-textarea-row),
.ui-section-content :deep(.asset-selector-row) {
  margin-bottom: 0;
}
</style>
