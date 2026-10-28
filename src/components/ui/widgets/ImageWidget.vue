<template>
  <div class="image-widget" @click.stop="$emit('click')">
    <!-- 九宫格裁切渲染：4角不缩放，中间平铺 -->
    <div
      v-if="imageUrl && nineSliceEnabled"
      class="img-nine-slice"
      :style="nineSliceStyle"
    ></div>
    <img
      v-else-if="imageUrl"
      :src="imageUrl"
      :style="fillStyle"
      class="img-fill"
      draggable="false"
    />
    <div v-else class="img-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
      <span>图片</span>
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

const imageUrl = computed(() => {
  const assetId = props.node.props.assetId
  if (!assetId) return ''
  return getAssetFileUrl(assetId)
})

const nineSliceEnabled = computed(() => !!props.node.props.nineSliceEnabled)

// 九宫格裁切样式：用 border-image 实现，4角固定不缩放，中间 round 平铺
const nineSliceStyle = computed(() => {
  const p = props.node.props
  const top = p.sliceTop || 0
  const right = p.sliceRight || 0
  const bottom = p.sliceBottom || 0
  const left = p.sliceLeft || 0
  return {
    borderStyle: 'solid',
    borderWidth: `${top}px ${right}px ${bottom}px ${left}px`,
    borderImageSource: `url(${imageUrl.value})`,
    borderImageSlice: `${top} ${right} ${bottom} ${left} fill`,
    borderImageRepeat: 'round',
    boxSizing: 'border-box'
  }
})

const fillStyle = computed(() => {
  const mode = props.node.props.fillMode || 'contain'
  return {
    objectFit: mode,
    width: mode === 'fill' ? '100%' : 'auto',
    height: mode === 'fill' ? '100%' : 'auto',
  }
})
</script>

<style scoped>
.image-widget {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.img-fill {
  max-width: 100%;
  max-height: 100%;
  display: block;
}
.img-nine-slice {
  width: 100%;
  height: 100%;
}
.img-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(55, 65, 81, 0.5);
  color: rgba(209, 213, 219, 1);
  font-size: 14px;
  border: 1px dashed rgba(107, 114, 128, 1);
  gap: 4px;
}
.img-placeholder svg {
  color: rgba(156, 163, 175, 1);
}
</style>
