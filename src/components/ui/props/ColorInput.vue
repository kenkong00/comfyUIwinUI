<template>
  <div class="ui-prop-row">
    <label class="ui-prop-label">{{ label }}</label>
    <div class="ui-color-input-group">
      <input
        type="color"
        :value="hexColor"
        @input="onColorChange"
        class="ui-color-picker"
      />
      <input
        :value="value"
        @input="$emit('update:value', $event.target.value)"
        placeholder="#ffffff"
        class="ui-prop-input ui-color-text"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ label: String, value: String })
const emit = defineEmits({ 'update:value': [String] })

const hexColor = computed(() => {
  if (!props.value || props.value === 'transparent') return '#ffffff'
  if (props.value.startsWith('rgba') || props.value.startsWith('rgb')) return '#ffffff'
  return props.value
})

function onColorChange(e) {
  emit('update:value', e.target.value)
}
</script>

<style scoped>
.ui-prop-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.ui-prop-label {
  font-size: 11px;
  color: var(--text-secondary);
  width: 56px;
  flex-shrink: 0;
}
.ui-color-input-group {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.ui-color-picker {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  padding: 0;
  background: none;
  flex-shrink: 0;
}
.ui-color-text {
  flex: 1;
  font-family: monospace;
}
.ui-prop-input {
  padding: 3px 6px;
  font-size: 11px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  outline: none;
  min-width: 0;
}
.ui-prop-input:focus {
  border-color: var(--focus-blue, #3b82f6);
}
</style>
