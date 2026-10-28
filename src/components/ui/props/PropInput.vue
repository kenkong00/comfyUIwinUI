<template>
  <div class="ui-prop-row">
    <label class="ui-prop-label">{{ label }}</label>
    <input
      :value="modelValue ?? value"
      @input="$emit('update:value', $event.target.value)"
      class="ui-prop-input"
    />
  </div>
</template>

<script setup>
defineProps({ label: String, value: [String, Number], modelValue: [String, Number] })
defineEmits({ 'update:value': [String, Number] })
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
.ui-prop-input {
  flex: 1;
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
