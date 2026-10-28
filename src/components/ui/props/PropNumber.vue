<template>
  <div class="ui-prop-row">
    <label class="ui-prop-label">{{ label }}</label>
    <input
      type="number"
      :value="value"
      :min="min"
      :max="max"
      :step="step"
      @input="onInput($event.target.value)"
      class="ui-prop-input"
    />
  </div>
</template>

<script setup>
const props = defineProps({
  label: String,
  value: Number,
  min: Number,
  max: Number,
  step: Number
})
const emit = defineEmits({ 'update:value': [Number] })

function onInput(raw) {
  let v = parseFloat(raw)
  if (isNaN(v)) v = 0
  // 强制限制在 min/max 范围内
  if (props.min != null && v < props.min) v = props.min
  if (props.max != null && v > props.max) v = props.max
  emit('update:value', v)
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
