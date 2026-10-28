<template>
  <div class="progress-widget" @click.stop="$emit('click')">
    <img
      v-if="bgUrl"
      :src="bgUrl"
      class="prog-bg"
      draggable="false"
    />
    <div
      class="prog-fill-container"
      :style="fillContainerStyle"
    >
      <img
        v-if="fillUrl"
        :src="fillUrl"
        class="prog-fill-img"
        draggable="false"
        :style="fillClipStyle"
      />
    </div>
    <div v-if="!bgUrl && !fillUrl" class="prog-default">
      <div class="prog-default-bar" :style="{ width: `${percent}%` }"></div>
      <span class="prog-default-text">{{ node.props.currentValue }}/{{ node.props.maxValue }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { getAssetFileUrl } from '@/services/uiApi'

const props = defineProps({
  node: Object
})

defineEmits({ click: [] })

const p = computed(() => props.node.props)
const percent = computed(() => {
  const max = p.value.maxValue || 100
  const cur = p.value.currentValue || 0
  return Math.min(100, Math.max(0, (cur / max) * 100))
})

const bgUrl = computed(() => p.value.bgAssetId ? getAssetFileUrl(p.value.bgAssetId) : '')
const fillUrl = computed(() => p.value.fillAssetId ? getAssetFileUrl(p.value.fillAssetId) : '')

const fillContainerStyle = computed(() => {
  const dir = p.value.fillDirection || 'left-to-right'
  switch (dir) {
    case 'right-to-left': return { width: `${percent.value}%`, right: '0', left: 'auto' }
    case 'top-to-bottom': return { height: `${percent.value}%`, top: '0' }
    case 'bottom-to-top': return { height: `${percent.value}%`, bottom: '0' }
    default: return { width: `${percent.value}%` }
  }
})

const fillClipStyle = computed(() => {
  const dir = p.value.fillDirection || 'left-to-right'
  switch (dir) {
    case 'right-to-left': return { objectPosition: 'right center' }
    case 'top-to-bottom': return { objectPosition: 'center top' }
    case 'bottom-to-top': return { objectPosition: 'center bottom' }
    default: return { objectPosition: 'left center' }
  }
})
</script>

<style scoped>
.progress-widget {
  width: 100%;
  height: 100%;
  position: relative;
}
.prog-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  display: block;
}
.prog-fill-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.prog-fill-img {
  width: 100%;
  height: 100%;
  object-fit: fill;
  display: block;
}
.prog-default {
  position: absolute;
  inset: 0;
  background: #374151;
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.prog-default-bar {
  height: 100%;
  background: #22c55e;
  border-radius: 4px;
  transition: width 0.3s ease;
}
.prog-default-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #fff;
}
</style>
