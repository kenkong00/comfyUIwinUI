<template>
  <FloatingWindow v-model:open="openProxy" title="裁切图片" size="large">
    <div class="ic-crop-area">
      <img ref="cropperImg" :src="imageSrc" />
    </div>
    <div class="ic-hint" v-if="aspect">
      <small>裁切比例：{{ formatAspect(aspect) }}</small>
    </div>
    <template #footer>
      <button class="ic-btn ic-btn-default" @click="onCancel">取消</button>
      <button
        class="ic-btn ic-btn-primary"
        @click="onConfirm"
        :disabled="!cropperInstance"
      >确认裁切</button>
    </template>
  </FloatingWindow>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  imageSrc: { type: String, default: '' },
  aspect: { type: Number, default: null } // 1 为正方形，null 为自由
})

const emit = defineEmits(['confirm', 'cancel'])

const cropperImg = ref(null)
const cropperInstance = ref(null)

// FloatingWindow open 代理：关闭时（X 按钮）触发 cancel，清理 cropper 并通知父级
const openProxy = computed({
  get: () => props.visible,
  set: (v) => { if (!v) onCancel() }
})

watch(
  () => props.visible,
  async (val) => {
    if (val) {
      await nextTick()
      if (cropperImg.value) {
        cropperInstance.value = new Cropper(cropperImg.value, {
          aspectRatio: props.aspect || NaN,
          viewMode: 1,
          autoCropArea: 0.9,
          responsive: true,
          background: false
        })
      }
    } else {
      cleanupCropper()
    }
  }
)

function onConfirm() {
  if (!cropperInstance.value) return
  const canvas = cropperInstance.value.getCroppedCanvas({
    maxWidth: 2048,
    maxHeight: 2048,
    imageSmoothingQuality: 'high'
  })
  const base64 = canvas.toDataURL('image/png')
  cleanupCropper()
  emit('confirm', base64)
}

function onCancel() {
  cleanupCropper()
  emit('cancel')
}

function cleanupCropper() {
  if (cropperInstance.value) {
    cropperInstance.value.destroy()
    cropperInstance.value = null
  }
}

function formatAspect(a) {
  if (a === 1) return '1:1 正方形'
  if (a === 4 / 3) return '4:3'
  if (a === 16 / 9) return '16:9'
  return a.toString()
}

onBeforeUnmount(() => {
  cleanupCropper()
})
</script>

<style scoped>
/* 使用 ic- 前缀避免与 cropperjs 全局 CSS 中的 .cropper-modal (opacity:0.5) 冲突 */
.ic-crop-area {
  width: 100%;
  height: 50vh;
  max-height: 480px;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
}

.ic-crop-area img {
  display: block;
  max-width: 100%;
}

.ic-hint {
  margin-bottom: 12px;
  color: var(--text-secondary);
  font-size: 12px;
}

.ic-btn {
  padding: 8px 16px;
  font-size: 13px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: var(--input-shadow);
}

.ic-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ic-btn-default {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.ic-btn-primary {
  background: var(--accent-color);
  color: var(--accent-text);
}
</style>
