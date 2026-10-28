<template>
  <div class="ui-prop-textarea-row">
    <label class="ui-prop-label">{{ label }}</label>
    <textarea
      :value="value"
      @input="$emit('update:value', $event.target.value)"
      rows="3"
      class="ui-prop-textarea"
    ></textarea>
  </div>
</template>

<script setup>
defineProps({ label: String, value: [String, Number] })
defineEmits({ 'update:value': [String, Number] })
</script>

<style scoped>
.ui-prop-textarea-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 4px;
}
.ui-prop-label {
  font-size: 11px;
  color: var(--text-secondary);
  width: 56px;
  flex-shrink: 0;
  padding-top: 3px;
}
.ui-prop-textarea {
  flex: 1;
  padding: 4px 6px;
  font-size: 11px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  outline: none;
  resize: vertical;
  min-width: 0;
  font-family: inherit;
}
.ui-prop-textarea:focus {
  border-color: var(--focus-blue, #3b82f6);
}
</style>
