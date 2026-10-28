<template>
  <div class="ui-prop-toggle-row">
    <label class="ui-prop-toggle-label">{{ label }}</label>
    <button
      class="ui-toggle"
      :class="{ on: value }"
      @click="$emit('update:value', !value)"
    >
      <span class="ui-toggle-knob" :class="{ on: value }"></span>
    </button>
  </div>
</template>

<script setup>
defineProps({ label: String, value: Boolean })
defineEmits({ 'update:value': [Boolean] })
</script>

<style scoped>
.ui-prop-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.ui-prop-toggle-label {
  font-size: 11px;
  color: var(--text-secondary);
}
.ui-toggle {
  width: 30px;
  height: 16px;
  border-radius: 8px;
  border: none;
  background: #6b7280;
  position: relative;
  cursor: pointer;
  transition: background 0.15s ease;
  padding: 0;
}
.ui-toggle.on {
  background: #3b82f6;
}
.ui-toggle-knob {
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 50%;
  position: absolute;
  top: 2px;
  left: 2px;
  transition: transform 0.15s ease;
}
.ui-toggle-knob.on {
  transform: translateX(14px);
}
</style>
