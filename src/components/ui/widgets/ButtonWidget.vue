<template>
  <div
    class="button-widget"
    @click.stop="$emit('click')"
    @mouseenter="hover = true"
    @mouseleave="hover = false"
    @mousedown="pressed = true"
    @mouseup="pressed = false"
  >
    <img
      v-if="currentAssetUrl"
      :src="currentAssetUrl"
      class="btn-img"
      draggable="false"
    />
    <div
      v-else
      class="btn-default"
      :class="stateClass"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="8" width="20" height="8" rx="4"/>
        <circle cx="8" cy="12" r="1.5" fill="currentColor"/>
      </svg>
      <span class="btn-label">{{ node.name || '按钮' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { getAssetFileUrl } from '@/services/uiApi'

const props = defineProps({
  node: Object
})

defineEmits({ click: [] })

const hover = ref(false)
const pressed = ref(false)

const currentAssetUrl = computed(() => {
  const p = props.node.props
  if (p.disabled) return p.disabledAssetId ? getAssetFileUrl(p.disabledAssetId) : ''
  if (pressed.value && p.pressedAssetId) return getAssetFileUrl(p.pressedAssetId)
  if (hover.value && p.hoverAssetId) return getAssetFileUrl(p.hoverAssetId)
  return p.normalAssetId ? getAssetFileUrl(p.normalAssetId) : ''
})

const stateClass = computed(() => {
  if (props.node.props.disabled) return 'state-disabled'
  if (pressed.value) return 'state-pressed'
  if (hover.value) return 'state-hover'
  return 'state-normal'
})
</script>

<style scoped>
.button-widget {
  width: 100%;
  height: 100%;
  position: relative;
}
.btn-img {
  width: 100%;
  height: 100%;
  object-fit: fill;
  display: block;
}
.btn-default {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px dashed rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  color: #fff;
}
.btn-label {
  font-size: 14px;
  color: #fff;
}
.state-disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #6b7280;
}
.state-pressed {
  background: #1e40af;
}
.state-hover {
  background: #2563eb;
}
.state-normal {
  background: #3b82f6;
  cursor: pointer;
}
</style>
