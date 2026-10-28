<template>
  <section class="generation-progress">
    <div class="container-toggle" @click="showProgressPanel = !showProgressPanel">
      <span class="toggle-icon">{{ showProgressPanel ? '▼' : '▶' }}</span>
      <span class="toggle-text">生成进度</span>
      <span v-if="generationStore.results.length > 0" class="results-badge">{{ generationStore.results.length }}</span>
      <div class="progress-bar-wrapper" @click.stop>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" :class="{ 'is-idle': generationStore.progress === 0, 'is-complete': generationStore.progress === 100 }" :style="{ width: (generationStore.progress || 0) + '%' }"></div>
        </div>
        <span v-if="generationStore.progress === 0" class="progress-text idle-text">待命</span>
        <span v-else-if="generationStore.progress < 100" class="progress-text">{{ Math.round(generationStore.progress) }}%</span>
        <span v-else class="progress-text complete-text">✅ 完成</span>
      </div>
    </div>

    <div class="container" v-show="showProgressPanel">
      <div v-if="generationStore.error" class="error">
        <h3>错误</h3>
        <p>{{ generationStore.error }}</p>
      </div>

      <div v-if="generationStore.results.length > 0" class="result-grid">
        <div v-for="(result, index) in reversedResults" :key="generationStore.results.length - 1 - index" class="result-item">
          <div class="result-media-wrap" @click="openViewer(result.url)">
            <video
              v-if="result.isVideo"
              :src="result.url"
              preload="metadata"
              muted
              class="result-media result-media-video"
            ></video>
            <img
              v-else
              :src="result.thumbUrl || result.url"
              :alt="`生成图片 ${index + 1}`"
              class="result-media"
              loading="lazy"
            />
            <div v-if="result.isVideo" class="play-icon-overlay">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="rgba(255,255,255,0.9)"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <div class="result-overlay">
              <button v-if="result.isVideo" @click.stop.prevent="openViewer(result.url)" class="overlay-btn" title="播放">▶ 播放</button>
              <button @click.stop.prevent="showImageInfo(index)" class="overlay-btn">信息</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <FloatingWindow v-model:open="infoOpen" title="图片信息" size="large">
      <template v-if="activeInfoResult">
        <div class="info-modal-header">
          <h4>{{ activeInfoResult.filename || activeInfoResult.url.split('/').pop() }}</h4>
        </div>
        <div class="info-modal-content">
          <div class="info-item">
            <strong>提示词:</strong>
            <div class="prompt-content">
              <textarea readonly :value="activeInfoResult.prompt || '无提示词'"></textarea>
            </div>
            <div class="copy-btn-container">
              <button @click.prevent="generationStore.copyPrompt(activeInfoResult.prompt, activeInfoIndex)" class="copy-btn">
                {{ generationStore.copyStatus[activeInfoIndex] || '复制' }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </FloatingWindow>

    <ImageViewer v-model:visible="viewerVisible" :src="viewerSrc" :images="viewerImages" :prompts="viewerPrompts" :currentIndex="viewerCurrentIndex" @prev="onViewerPrev" @next="onViewerNext" />
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useGenerationStore } from '@/stores/generation'
import FloatingWindow from '@/components/common/FloatingWindow.vue'
import ImageViewer from '@/components/ui/ImageViewer.vue'

const generationStore = useGenerationStore()

const showProgressPanel = ref(false)
const viewerVisible = ref(false)
const viewerSrc = ref('')
const viewerCurrentIndex = ref(-1)
const activeInfoIndex = ref(-1)
const infoOpen = ref(false)

const activeInfoResult = computed(() => {
  if (activeInfoIndex.value < 0) return null
  return generationStore.results[activeInfoIndex.value] || null
})

// 最新生成的图片显示在最前面
const reversedResults = computed(() => [...generationStore.results].reverse())

// 可导航的图片列表（倒序，与显示顺序一致，排除视频）
const viewerImages = computed(() =>
  reversedResults.value.filter(r => !r.isVideo).map(r => r.url)
)

// 与 viewerImages 顺序对应的提示词列表
const viewerPrompts = computed(() =>
  reversedResults.value.filter(r => !r.isVideo).map(r => r.prompt || '')
)

function showImageInfo(reversedIndex) {
  // reversedResults 是倒序的，需要换算回 generationStore.results 的原始索引
  const originalIndex = generationStore.results.length - 1 - reversedIndex
  activeInfoIndex.value = originalIndex
  infoOpen.value = true
}

function openViewer(src) {
  viewerSrc.value = src
  viewerCurrentIndex.value = viewerImages.value.indexOf(src)
  viewerVisible.value = true
}

function onViewerPrev(newIndex) {
  const url = viewerImages.value[newIndex]
  if (url) {
    viewerSrc.value = url
    viewerCurrentIndex.value = newIndex
  }
}

function onViewerNext(newIndex) {
  const url = viewerImages.value[newIndex]
  if (url) {
    viewerSrc.value = url
    viewerCurrentIndex.value = newIndex
  }
}
</script>

<style scoped>
.generation-progress {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  padding: 0;
  background: var(--bg-sidebar);
}

/* 覆盖全局 .container 的 max-width: 800px 限制 */
.generation-progress .container {
  max-width: none;
  width: 100%;
  margin: 0;
  padding: 0.2rem;
}

.container-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-sidebar);
  border-radius: 0;
  cursor: pointer;
  margin-bottom: 0;
  box-shadow: none;
  border: none;
  transition: background 0.15s ease;
  user-select: none;
  position: relative;
}

.container-toggle:hover {
  background: var(--bg-secondary);
}

.toggle-icon {
  font-size: 12px;
  color: var(--text-secondary);
  transition: transform 0.2s ease;
}

.toggle-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.results-badge {
  align-self: flex-start;
  padding: 2px 8px;
  background: var(--accent-color);
  color: var(--accent-text);
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.progress-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.progress-bar-track {
  flex: 1;
  height: 2px;
  background: var(--bg-secondary);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50, #8BC34A, #CDDC39);
  border-radius: 3px;
  transition: width 0.5s ease-out, background 0.3s ease;
  position: relative;
  min-width: 0;
}

.progress-bar-fill.is-idle {
  background: var(--bg-tertiary, rgba(128, 128, 128, 0.2));
  min-width: 100%;
}

.progress-bar-fill.is-idle::after {
  display: none;
}

.progress-bar-fill.is-complete {
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
}

.progress-bar-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%);
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.progress-text {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  white-space: nowrap;
  min-width: 32px;
  text-align: right;
  transition: color 0.3s ease;
}

.progress-text.idle-text {
  color: #999;
}

.progress-text.complete-text {
  color: #4CAF50;
}

.error {
  padding: 16px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 12px;
  margin-bottom: 16px;
}

.error h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #dc2626;
}

.error p {
  margin: 0;
  font-size: 14px;
  color: #991b1b;
}

/* 缩略图网格 */
.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 4px;
  width: 100%;
  margin-top: 8px;
}

.result-item {
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border-radius: 0;
  border: none;
  overflow: hidden;
  box-shadow: none;
  transition: transform 0.15s ease;
}

.result-item:hover {
  transform: translateY(-2px);
  box-shadow: none;
}

.result-media-wrap {
  position: relative;
  background: var(--bg-secondary);
  line-height: 0;
  overflow: hidden;
  aspect-ratio: 1 / 1;
}

.result-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  cursor: zoom-in;
}

.result-overlay {
  position: absolute;
  top: 3px;
  right: 3px;
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.result-media-wrap:hover .result-overlay {
  opacity: 1;
}

.play-icon-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.play-icon-overlay svg {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
}

.overlay-btn {
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: background 0.15s ease;
  backdrop-filter: blur(4px);
}

.overlay-btn:hover {
  background: rgba(0, 0, 0, 0.85);
}

/* 图片信息 FloatingWindow 内部样式 */
.info-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
  gap: 12px;
}

.info-modal-header h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  flex: 1;
  word-break: break-all;
}

.info-modal-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.info-item {
  display: flex;
  flex-direction: column;
}

.info-item strong {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.prompt-content {
  flex: 1;
  display: flex;
}

.prompt-content textarea {
  width: 100%;
  padding: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  resize: vertical;
  min-height: 200px;
  font-size: 14px;
  line-height: 1.6;
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  box-shadow: var(--input-shadow);
}

.copy-btn-container {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.copy-btn {
  padding: 8px 24px;
  background: var(--accent-color);
  color: var(--accent-text);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}

.copy-btn:hover {
  opacity: 0.9;
}
</style>
