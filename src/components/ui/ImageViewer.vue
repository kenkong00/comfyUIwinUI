<template>
  <Teleport to="body">
    <div v-if="visible" class="image-viewer-overlay" @mousedown.self="close">
      <div class="image-viewer-toolbar">
        <span class="viewer-info">{{ isVideo ? '视频' : Math.round(scale * 100) + '%' }}</span>
        <template v-if="!isVideo">
          <button class="viewer-btn" @click="zoomIn" title="放大">+</button>
          <button class="viewer-btn" @click="zoomOut" title="缩小">−</button>
          <button class="viewer-btn" @click="reset" title="重置">R</button>
          <button
            v-if="hasPrompts"
            class="viewer-btn viewer-prompt-btn"
            :class="{ active: showPrompt }"
            @click="togglePrompt"
            title="显示/隐藏提示词"
          >prompts</button>
        </template>
        <button class="viewer-btn viewer-close" @click="close" title="关闭">×</button>
      </div>
      <!-- 提示词字幕层 -->
      <div v-if="showPrompt && currentPrompt" class="viewer-prompt-overlay">
        <p class="viewer-prompt-text">{{ currentPrompt }}</p>
        <button
          class="viewer-prompt-copy"
          :class="{ copied: promptCopyStatus === '已复制', failed: promptCopyStatus === '失败' }"
          @click.stop="copyCurrentPrompt"
        >{{ promptCopyStatus || '复制' }}</button>
      </div>
      <!-- 上一张/下一张导航按钮 -->
      <template v-if="hasNavigation">
        <button class="viewer-nav viewer-nav-prev" @click="goPrev" title="上一张">‹</button>
        <button class="viewer-nav viewer-nav-next" @click="goNext" title="下一张">›</button>
        <div class="viewer-counter">{{ navIndex + 1 }} / {{ navTotal }}</div>
      </template>
      <div
        class="image-viewer-container"
        :class="{ 'is-video': isVideo }"
        @wheel.prevent="onWheel"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
      >
        <video
          v-if="isVideo"
          ref="videoRef"
          :src="src"
          class="viewer-video"
          controls
          autoplay
          @dragstart.prevent
        ></video>
        <img
          v-else
          ref="imgRef"
          :src="src"
          class="viewer-image"
          :style="{
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            cursor: isDragging ? 'grabbing' : 'grab'
          }"
          @load="onImageLoad"
          @dragstart.prevent
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  src: { type: String, default: '' },
  // 图片列表（用于上一张/下一张导航），数组长度决定是否显示导航按钮
  images: { type: Array, default: () => [] },
  // 当前图片在列表中的索引
  currentIndex: { type: Number, default: -1 },
  // 与 images 顺序对应的提示词列表（可选）
  prompts: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:visible', 'prev', 'next'])

const imgRef = ref(null)
const videoRef = ref(null)
const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const startTranslateX = ref(0)
const startTranslateY = ref(0)
// 提示词字幕显示状态（切换图片时保持，仅按钮控制开关）
const showPrompt = ref(false)
// 提示词复制状态反馈：'' | '已复制' | '失败'
const promptCopyStatus = ref('')
let promptCopyTimer = null

// 导航相关计算
const navTotal = computed(() => (props.images ? props.images.length : 0))
const navIndex = computed(() => props.currentIndex)
const hasNavigation = computed(() => !isVideo.value && navTotal.value > 1 && navIndex.value >= 0)

// 是否有可用的提示词数据
const hasPrompts = computed(() => Array.isArray(props.prompts) && props.prompts.length > 0)

// 当前图片对应的提示词
const currentPrompt = computed(() => {
  if (!hasPrompts.value || navIndex.value < 0 || navIndex.value >= props.prompts.length) return ''
  return props.prompts[navIndex.value] || ''
})

const togglePrompt = () => {
  showPrompt.value = !showPrompt.value
}

const copyCurrentPrompt = async () => {
  if (promptCopyTimer) {
    clearTimeout(promptCopyTimer)
    promptCopyTimer = null
  }
  try {
    await navigator.clipboard.writeText(currentPrompt.value || '')
    promptCopyStatus.value = '已复制'
  } catch (e) {
    promptCopyStatus.value = '失败'
  }
  promptCopyTimer = setTimeout(() => {
    promptCopyStatus.value = ''
    promptCopyTimer = null
  }, 2000)
}

// 判断 src 是否为视频（按 URL 后缀）
const isVideo = computed(() => {
  const u = props.src || ''
  const lower = u.split('?')[0].toLowerCase()
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.webp') || lower.endsWith('.gif') || lower.endsWith('.mov')
})

const MIN_SCALE = 0.2
const MAX_SCALE = 10

const close = () => {
  emit('update:visible', false)
}

const goPrev = () => {
  if (navIndex.value > 0) emit('prev', navIndex.value - 1)
}

const goNext = () => {
  if (navIndex.value < navTotal.value - 1) emit('next', navIndex.value + 1)
}

const reset = () => {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
}

const zoomIn = () => {
  scale.value = Math.min(MAX_SCALE, scale.value * 1.2)
}

const zoomOut = () => {
  scale.value = Math.max(MIN_SCALE, scale.value / 1.2)
}

const onWheel = (e) => {
  const delta = e.deltaY
  if (delta < 0) {
    scale.value = Math.min(MAX_SCALE, scale.value * 1.1)
  } else {
    scale.value = Math.max(MIN_SCALE, scale.value / 1.1)
  }
}

const onMouseDown = (e) => {
  isDragging.value = true
  dragStartX.value = e.clientX
  dragStartY.value = e.clientY
  startTranslateX.value = translateX.value
  startTranslateY.value = translateY.value
}

const onMouseMove = (e) => {
  if (!isDragging.value) return
  translateX.value = startTranslateX.value + (e.clientX - dragStartX.value)
  translateY.value = startTranslateY.value + (e.clientY - dragStartY.value)
}

const onMouseUp = () => {
  isDragging.value = false
}

const onImageLoad = () => {
  reset()
}

// 键盘左右箭头切换
const onKeydown = (e) => {
  if (!props.visible) return
  if (e.key === 'ArrowLeft' && hasNavigation.value) {
    e.preventDefault()
    goPrev()
  } else if (e.key === 'ArrowRight' && hasNavigation.value) {
    e.preventDefault()
    goNext()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

watch(() => props.visible, (val) => {
  if (val) {
    reset()
  }
})
</script>

<style scoped>
.image-viewer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-viewer-toolbar {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 10px;
  backdrop-filter: blur(8px);
  z-index: 100000;
}

.viewer-info {
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  min-width: 48px;
  text-align: center;
}

.viewer-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  font-weight: 600;
  transition: background 0.15s ease;
}

.viewer-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.viewer-close {
  font-size: 22px;
}

/* prompts 切换按钮 */
.viewer-prompt-btn {
  width: auto;
  min-width: 36px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.viewer-prompt-btn.active {
  background: rgba(80, 160, 255, 0.85);
  color: #fff;
}

.viewer-prompt-btn.active:hover {
  background: rgba(80, 160, 255, 1);
}

/* 提示词字幕层（面板靠右，文字左对齐） */
.viewer-prompt-overlay {
  position: fixed;
  right: 32px;
  bottom: 12vh;
  width: auto;
  max-width: 42vw;
  z-index: 100001;
  pointer-events: none;
  text-align: left;
  padding: 0 12px;
}

.viewer-prompt-text {
  margin: 0;
  color: #ffffff;
  font-size: 16px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-wrap: break-word;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.95), 0 0 4px rgba(0, 0, 0, 0.95);
  border: none;
  background: transparent;
  text-align: left;
  display: block;
}

/* 字幕下方复制按钮 */
.viewer-prompt-copy {
  pointer-events: auto;
  margin-top: 10px;
  padding: 4px 14px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 14px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  backdrop-filter: blur(6px);
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  user-select: none;
}

.viewer-prompt-copy:hover {
  background: rgba(0, 0, 0, 0.75);
  border-color: rgba(255, 255, 255, 0.6);
}

.viewer-prompt-copy:active {
  transform: scale(0.94);
}

.viewer-prompt-copy.copied {
  background: rgba(76, 175, 80, 0.9);
  border-color: rgba(255, 255, 255, 0.85);
  color: #fff;
}

.viewer-prompt-copy.failed {
  background: rgba(220, 38, 38, 0.85);
  border-color: rgba(255, 255, 255, 0.85);
  color: #fff;
}

/* 上一张/下一张导航按钮 */
.viewer-nav {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 36px;
  font-weight: 300;
  line-height: 1;
  z-index: 100000;
  transition: background 0.15s ease;
  user-select: none;
}

.viewer-nav:hover {
  background: rgba(0, 0, 0, 0.75);
}

.viewer-nav:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.viewer-nav-prev {
  left: 24px;
}

.viewer-nav-next {
  right: 24px;
}

.viewer-counter {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 16px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  border-radius: 20px;
  z-index: 100000;
  backdrop-filter: blur(8px);
}

.image-viewer-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.viewer-image {
  max-width: 90vw;
  max-height: 90vh;
  user-select: none;
  -webkit-user-drag: none;
  transition: transform 0.05s ease-out;
  will-change: transform;
}

.image-viewer-container.is-video {
  cursor: default;
}

.viewer-video {
  max-width: 92vw;
  max-height: 88vh;
  border-radius: 6px;
  background: #000;
}
</style>
