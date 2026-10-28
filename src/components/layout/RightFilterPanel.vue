<template>
  <aside :class="['sidebar right-sidebar', { collapsed: isCollapsed }]" @dragend="onDragEnd">
    <button class="toggle-sidebar-btn right-toggle" @click.prevent="toggle" title="展开/收起文件库">
      <svg v-if="isCollapsed" class="gear-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"></rect>
        <line x1="15" y1="3" x2="15" y2="21"></line>
        <polyline points="10 8 7 12 10 16"></polyline>
      </svg>
      <svg v-else class="gear-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"></rect>
        <line x1="15" y1="3" x2="15" y2="21"></line>
      </svg>
    </button>

    <div class="sidebar-content" v-show="!isCollapsed">
      <!-- 选项卡切换：文件库 / 属性面板 -->
      <div class="rfp-tabs">
        <button
          :class="['rfp-tab', { active: activeTab === 'filter' }]"
          @click="setActiveTab('filter')"
        >文件库</button>
        <button
          :class="['rfp-tab', { active: activeTab === 'properties' }]"
          @click="setActiveTab('properties')"
        >属性面板</button>
      </div>

      <!-- 文件库内容 -->
      <div v-show="activeTab === 'filter'" class="rfp-tab-pane">
        <!-- 顶部筛选区：分类+类型+标签+刷新 同一行 -->
        <div class="rfp-filter-bar">
          <div class="rfp-filter-row">
            <select v-model="categoryProxy" class="rfp-select rfp-category-select" @change="onCategoryChange" title="文件库分类">
              <option v-for="cat in fileLibraryStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
            </select>
            <select v-model="filterTypeProxy" class="rfp-select rfp-type-select" @change="fileLibraryStore.panelRefresh()" title="类型分类">
              <option value="all">全部类型</option>
              <option v-for="t in filterableTypes" :key="t" :value="t">{{ typeLabel(t) }}</option>
            </select>
            <select v-model="tagFilterProxy" class="rfp-select rfp-tag-select" @change="fileLibraryStore.panelRefresh()" title="全部标签">
              <option :value="null">全部标签</option>
              <option v-for="tag in fileLibraryStore.tags" :key="tag.id" :value="tag.id">{{ tag.name }}</option>
            </select>
            <button class="rfp-refresh-btn" @click="fileLibraryStore.panelRefresh()" title="刷新">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
            </button>
          </div>
          <!-- 搜索 -->
          <input
            v-model="searchProxy"
            placeholder="搜索..."
            class="rfp-search"
          />
        </div>

        <!-- 面包屑 -->
        <div class="rfp-breadcrumb" v-if="fileLibraryStore.panelBreadcrumb.length > 0">
          <span
            v-for="(item, i) in fileLibraryStore.panelBreadcrumb"
            :key="`${item.type}-${item.id}`"
            :class="['rfp-crumb', { last: i === fileLibraryStore.panelBreadcrumb.length - 1 }]"
            @click="fileLibraryStore.panelNavigateToBreadcrumb(i)"
            :title="item.name"
          >
            {{ truncatePath(item.name) }}
            <span v-if="i < fileLibraryStore.panelBreadcrumb.length - 1" class="rfp-crumb-sep">/</span>
          </span>
        </div>

        <!-- 图标网格（Windows 大图标样式） -->
        <div class="rfp-grid" v-if="fileLibraryStore.panelDisplayItems.length > 0">
          <div
            v-for="item in fileLibraryStore.panelDisplayItems"
            :key="`${item._kind}-${item.id}`"
            :class="['rfp-item', `rfp-${item._kind}`]"
            draggable="true"
            @dragstart="onDragStart($event, item)"
            @dblclick="onItemDblClick(item)"
            @click="onItemClick(item)"
            @mouseenter="onItemMouseEnter($event, item)"
            @mouseleave="onItemMouseLeave"
            @mousemove="onItemMouseMove"
          >
            <div class="rfp-icon" :class="{ 'rfp-media-wrap': item._kind === 'file' && (item.file_type === 'image' || item.file_type === 'video') }">
              <!-- 文件夹 -->
              <span v-if="item._kind === 'folder'" class="rfp-icon-emoji">📁</span>
              <!-- 图片缩略图 -->
              <img
                v-else-if="item.file_type === 'image' && item.thumbnail_data"
                :src="item.thumbnail_data"
                class="rfp-thumb"
                :alt="item.name"
              />
              <!-- 视频缩略图 -->
              <video
                v-else-if="item.file_type === 'video' && item.thumbnail_data"
                :src="item.thumbnail_data"
                class="rfp-thumb"
                muted
                preload="metadata"
              ></video>
              <!-- 其他类型图标 -->
              <span v-else class="rfp-icon-emoji">{{ fileLibraryStore.getFileTypeIcon(item.file_type) }}</span>
              <!-- 图片/视频信息按钮（hover显示） -->
              <div
                v-if="item._kind === 'file' && (item.file_type === 'image' || item.file_type === 'video')"
                class="rfp-result-overlay"
              >
                <button @click.stop.prevent="showMediaInfo(item)" class="rfp-overlay-btn">信息</button>
              </div>
            </div>
            <!-- 文件名 title 只放在名称上，避免与内容预览冲突 -->
            <div class="rfp-name" :title="item.name">{{ item.name || '未命名' }}</div>
          </div>
        </div>
        <div v-else-if="!fileLibraryStore.panelLoading" class="rfp-empty">
          <span class="rfp-empty-icon">📭</span>
          <p>空</p>
        </div>
        <div v-else class="rfp-loading">
          <span>加载中...</span>
        </div>
      </div>

      <!-- 属性面板内容 -->
      <div v-show="activeTab === 'properties'" class="rfp-tab-pane rfp-properties-pane">
        <UIPropertyPanel />
      </div>
    </div>

    <!-- 图片/视频预览器 -->
    <ImageViewer v-model:visible="viewerVisible" :src="viewerSrc" :images="viewerImages" :currentIndex="viewerCurrentIndex" @prev="onViewerPrev" @next="onViewerNext" />

    <!-- 图片/视频提示词信息弹窗 -->
    <FloatingWindow v-model:open="mediaInfoOpen" title="提示词信息" size="large">
      <template v-if="mediaInfoTarget">
        <div class="rfp-info-modal-header">
          <h4>{{ mediaInfoTarget.name || '未命名' }}</h4>
        </div>
        <div class="rfp-info-modal-content">
          <div class="rfp-info-item">
            <strong>提示词:</strong>
            <div class="rfp-prompt-content">
              <textarea readonly :value="mediaInfoPrompt || '无提示词'"></textarea>
            </div>
            <div class="rfp-copy-btn-container">
              <button @click.prevent="copyMediaInfoPrompt" class="rfp-copy-btn">
                {{ mediaInfoCopyStatus }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </FloatingWindow>

    <!-- 文件内容预览 tooltip -->
    <Teleport to="body">
      <div
        v-if="contentTipVisible && contentTipText"
        class="rfp-content-tip"
        :style="contentTipStyle"
      >
        <pre class="rfp-content-text">{{ contentTipText }}</pre>
      </div>
    </Teleport>
  </aside>
</template>

<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import { useFileLibraryStore } from '@/stores/fileLibrary'
import { useUiEditorStore } from '@/stores/uiEditor'
import { useFileEditBus } from '@/utils/fileEditBus'
import { useDragSource } from '@/composables/useDragDrop'
import { apiClient } from '@/services/api'
import ImageViewer from '@/components/ui/ImageViewer.vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'
import UIPropertyPanel from '@/components/ui/UIPropertyPanel.vue'

const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:collapsed', 'navigate'])

const fileLibraryStore = useFileLibraryStore()
const uiEditorStore = useUiEditorStore()
const { emitEditFile } = useFileEditBus()
const { startDrag, endDrag } = useDragSource()

const isCollapsed = ref(props.collapsed)

watch(() => props.collapsed, (v) => {
  isCollapsed.value = v
})

// ============ 选项卡切换：筛选窗 / 属性面板 ============
// 从 uiEditor store 读取/写入 rightPanelTab，实现选中节点时自动切换到属性面板
const activeTab = computed({
  get: () => uiEditorStore.rightPanelTab || 'filter',
  set: (v) => { uiEditorStore.rightPanelTab = v }
})

function setActiveTab(tab) {
  uiEditorStore.rightPanelTab = tab
}

function toggle() {
  isCollapsed.value = !isCollapsed.value
  emit('update:collapsed', isCollapsed.value)
}

const filterableTypes = ['prompt', 'rule', 'json', 'workflow', 'image', 'video', 'audio']

function typeLabel(type) {
  const labels = {
    prompt: '提示词',
    rule: '规则',
    json: 'JSON',
    workflow: '工作流',
    image: '图片',
    video: '视频',
    audio: '音频'
  }
  return labels[type] || type
}

// 路径名称截断（最多显示 10 个字）
function truncatePath(name) {
  if (!name) return ''
  return name.length > 10 ? name.slice(0, 10) + '…' : name
}

// 代理 store 状态以支持 v-model
const filterTypeProxy = computed({
  get: () => fileLibraryStore.panelFilterType,
  set: (v) => { fileLibraryStore.panelFilterType = v }
})

const tagFilterProxy = computed({
  get: () => fileLibraryStore.panelTagFilter,
  set: (v) => { fileLibraryStore.panelTagFilter = v }
})

const searchProxy = computed({
  get: () => fileLibraryStore.panelSearch,
  set: (v) => { fileLibraryStore.panelSearch = v }
})

// 分类代理（双向绑定 store 的 panelCategoryId）
const categoryProxy = computed({
  get: () => fileLibraryStore.panelCategoryId,
  set: (v) => { fileLibraryStore.panelCategoryId = v }
})

// 分类切换
function onCategoryChange(e) {
  const catId = e.target.value ? Number(e.target.value) : null
  if (catId) {
    fileLibraryStore.panelNavigateToCategory(catId)
  } else {
    fileLibraryStore.panelNavigateToAll()
  }
}

// 图片/视频预览
const viewerVisible = ref(false)
const viewerSrc = ref('')
const viewerCurrentIndex = ref(-1)
// 当前面板目录下的图片文件列表（用于上一张/下一张导航）
const viewerImages = computed(() =>
  fileLibraryStore.panelFiles.filter(f => f.file_type === 'image')
)

async function openMediaPreview(item) {
  // 记录当前图片在图片列表中的索引（用于上一张/下一张导航）
  viewerCurrentIndex.value = viewerImages.value.findIndex(f => f.id === item.id)
  // 优先使用缩略图作为占位
  if (item.thumbnail_data) {
    viewerSrc.value = item.thumbnail_data
    viewerVisible.value = true
  }
  try {
    const blobUrl = await apiClient.getFileLibraryFileBlobUrl(item.id)
    if (blobUrl) {
      const old = viewerSrc.value
      viewerSrc.value = blobUrl
      if (old && old.startsWith('blob:')) URL.revokeObjectURL(old)
    }
  } catch (e) {
    // 获取原图失败，保持缩略图
  }
}

// 上一张/下一张导航
async function navigateViewerTo(newIndex) {
  const target = viewerImages.value[newIndex]
  if (!target) return
  viewerCurrentIndex.value = newIndex
  if (target.thumbnail_data) {
    viewerSrc.value = target.thumbnail_data
  }
  try {
    const blobUrl = await apiClient.getFileLibraryFileBlobUrl(target.id)
    if (blobUrl) {
      const old = viewerSrc.value
      viewerSrc.value = blobUrl
      if (old && old.startsWith('blob:')) URL.revokeObjectURL(old)
    }
  } catch (e) {
    // 获取原图失败，保持缩略图
  }
}

function onViewerPrev(newIndex) { navigateViewerTo(newIndex) }
function onViewerNext(newIndex) { navigateViewerTo(newIndex) }

// 单击：文件单击打开，文件夹不响应（文件夹双击进入）
function onItemClick(item) {
  if (item._kind === 'folder') return
  openItem(item)
}

// 双击：文件夹双击进入，文件双击也打开（兼容习惯）
function onItemDblClick(item) {
  if (item._kind === 'folder') {
    fileLibraryStore.panelNavigateToFolder(item.id)
  } else {
    openItem(item)
  }
}

// 打开文件：图片/视频用 ImageViewer，其他用 editFile 总线（不跳转页面）
function openItem(item) {
  if (item.file_type === 'image' || item.file_type === 'video') {
    openMediaPreview(item)
  } else {
    // 文本类文件通过总线打开编辑器，不跳转页面
    emitEditFile(item)
  }
}

function onDragStart(e, item) {
  startDrag(e, item)
}

function onDragEnd() {
  endDrag()
}

// ============ 文件内容 hover 预览（仅提示词和规则类型） ============
const contentTipVisible = ref(false)
const contentTipText = ref('')
const contentTipX = ref(0)
const contentTipY = ref(0)
let contentTipTimer = null
const TIP_TYPES = ['prompt', 'rule']
const MAX_CONTENT_CHARS = 500

function isTipable(item) {
  return item && item._kind === 'file' && TIP_TYPES.includes(item.file_type)
}

function truncateContent(text) {
  if (!text) return ''
  const t = String(text).replace(/\r/g, '').trim()
  return t.length > MAX_CONTENT_CHARS ? t.slice(0, MAX_CONTENT_CHARS) + '…' : t
}

async function onItemMouseEnter(e, item) {
  // 鼠标跟随 tooltip 仅作用于提示词和规则
  if (!isTipable(item)) return
  contentTipX.value = e.clientX
  contentTipY.value = e.clientY
  contentTipTimer = setTimeout(async () => {
    let content = ''
    if (typeof item.content === 'string' && item.content.trim()) {
      content = item.content
    } else {
      try {
        const full = await apiClient.getFileLibraryFileById(item.id)
        if (full && typeof full.content === 'string') content = full.content
      } catch (err) { /* ignore */ }
    }
    if (content) {
      contentTipText.value = truncateContent(content)
      contentTipVisible.value = true
    }
  }, 500)
}

// ============ 图片/视频信息弹窗（hover按钮 + 点击弹窗 + 复制） ============
const mediaInfoOpen = ref(false)
const mediaInfoTarget = ref(null)
const mediaInfoPrompt = ref('')
const mediaInfoCopyStatus = ref('复制')

async function showMediaInfo(item) {
  mediaInfoTarget.value = item
  mediaInfoPrompt.value = ''
  mediaInfoCopyStatus.value = '复制'
  mediaInfoOpen.value = true
  try {
    let prompt = ''
    if (typeof item.description === 'string' && item.description.trim()) {
      prompt = item.description
    } else {
      const full = await apiClient.getFileLibraryFileById(item.id)
      if (full && typeof full.description === 'string') prompt = full.description
    }
    mediaInfoPrompt.value = prompt || ''
  } catch (err) {
    mediaInfoPrompt.value = '加载失败：' + (err.message || err)
  }
}

async function copyMediaInfoPrompt() {
  const text = mediaInfoPrompt.value || ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    mediaInfoCopyStatus.value = '已复制'
    setTimeout(() => { mediaInfoCopyStatus.value = '复制' }, 2000)
  } catch (e) {
    mediaInfoCopyStatus.value = '复制失败'
    setTimeout(() => { mediaInfoCopyStatus.value = '复制' }, 2000)
  }
}

function onItemMouseMove(e) {
  contentTipX.value = e.clientX
  contentTipY.value = e.clientY
}

function onItemMouseLeave() {
  if (contentTipTimer) {
    clearTimeout(contentTipTimer)
    contentTipTimer = null
  }
  contentTipVisible.value = false
  contentTipText.value = ''
}

const contentTipStyle = computed(() => {
  const padding = 15
  const tipWidth = 500
  let left = contentTipX.value + padding
  if (left + tipWidth > window.innerWidth - 10) {
    left = contentTipX.value - tipWidth - padding
    if (left < 10) left = 10
  }
  let top = contentTipY.value + padding
  if (top + 300 > window.innerHeight) {
    top = window.innerHeight - 310
    if (top < 10) top = 10
  }
  return { top: top + 'px', left: left + 'px', width: tipWidth + 'px' }
})

onMounted(() => {
  fileLibraryStore.panelLoadAll()
})
</script>

<style scoped>
.sidebar {
  position: relative;
  height: 100vh;
  background: var(--bg-sidebar);
  z-index: 1000;
  transition: width 0.3s ease;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-shadow: var(--shadow-contact) 0px 1px 5px -4px, var(--shadow-ring) 0px 0px 0px 1px, var(--shadow-soft) 0px 4px 8px 0px;
}

.right-sidebar {
  right: 0;
  width: 370px;
}

.right-sidebar.collapsed {
  width: 50px;
}

.toggle-sidebar-btn {
  position: absolute;
  top: 10px;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  transition: color 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-sidebar-btn:hover {
  color: var(--text-primary);
}

.right-toggle {
  left: 10px;
}

.gear-icon {
  width: 20px;
  height: 20px;
}

.sidebar-content {
  padding: 40px 8px 8px 8px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 选项卡 */
.rfp-tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-surface);
  border-radius: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.rfp-tab {
  flex: 1;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.rfp-tab:hover {
  color: var(--text-primary);
  background: var(--bg-secondary);
}

.rfp-tab.active {
  background: var(--accent-color, #4a9eff);
  color: var(--accent-text, #fff);
}

.rfp-tab-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.rfp-properties-pane {
  overflow-y: auto;
}

/* 筛选区 */
.rfp-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  background: var(--bg-surface);
  border-radius: 8px;
  box-shadow: var(--card-shadow);
  margin-bottom: 8px;
  flex-shrink: 0;
}

/* 分类+类型+标签+刷新 同一行 */
.rfp-filter-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.rfp-category-select {
  flex: 1;
  min-width: 0;
}

.rfp-type-select {
  flex: 1;
  min-width: 0;
}

.rfp-tag-select {
  flex: 1;
  min-width: 0;
}

.rfp-search {
  width: 100%;
}

.rfp-select,
.rfp-search {
  width: 100%;
  padding: 4px 8px !important;
  font-size: 12px !important;
  background: var(--bg-secondary) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color, #e5e7eb) !important;
  border-radius: 6px !important;
  outline: none !important;
  box-shadow: none !important;
  box-sizing: border-box;
}

.rfp-select:focus,
.rfp-search:focus {
  border-color: var(--accent-color, #4a9eff) !important;
}

.rfp-refresh-btn {
  padding: 4px 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  transition: background 0.15s ease;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rfp-refresh-btn:hover {
  background: var(--bg-primary);
}

/* 面包屑 */
.rfp-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px 6px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
  max-height: 40px;
  overflow-y: auto;
}

.rfp-crumb {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rfp-crumb:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.rfp-crumb.last {
  color: var(--text-primary);
  font-weight: 600;
  cursor: default;
}

.rfp-crumb.last:hover {
  background: transparent;
}

.rfp-crumb-sep {
  color: var(--text-muted);
  margin: 0 2px;
}

/* 图标网格 */
.rfp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 6px;
  padding: 4px;
  flex: 1;
  overflow-y: auto;
  align-content: start;
}

.rfp-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 2px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
  user-select: none;
}

.rfp-item:hover {
  background: var(--bg-secondary);
}

.rfp-item:active {
  background: var(--bg-primary);
}

.rfp-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 6px;
}

.rfp-icon-emoji {
  font-size: 40px;
  line-height: 1;
}

.rfp-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 4px;
  display: block;
}

/* 图片/视频信息按钮 overlay */
.rfp-media-wrap {
  position: relative;
}

.rfp-result-overlay {
  position: absolute;
  top: 3px;
  right: 3px;
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.rfp-media-wrap:hover .rfp-result-overlay {
  opacity: 1;
}

.rfp-overlay-btn {
  padding: 3px 8px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: background 0.15s ease;
  backdrop-filter: blur(4px);
}

.rfp-overlay-btn:hover {
  background: rgba(0, 0, 0, 0.85);
}

.rfp-name {
  font-size: 11px;
  text-align: center;
  color: var(--text-primary);
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 4px;
  line-height: 1.3;
}

.rfp-empty,
.rfp-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 8px;
  color: var(--text-secondary);
  text-align: center;
  flex: 1;
}

.rfp-empty-icon {
  font-size: 32px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.rfp-empty p {
  margin: 0;
  font-size: 12px;
}

@media (max-width: 768px) {
  .right-sidebar {
    width: 340px;
  }

  .right-sidebar.collapsed {
    width: 50px;
  }
}
</style>

<style>
.rfp-content-tip {
  position: fixed;
  background: rgba(20, 20, 20, 0.95);
  color: #f0f0f0;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 99999;
  pointer-events: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  animation: rcp-fade-in 0.15s ease;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.rfp-content-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
  color: #f0f0f0;
}

@keyframes rcp-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 图片/视频信息弹窗样式 */
.rfp-info-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
  gap: 12px;
}

.rfp-info-modal-header h4 {
  margin: 0;
  color: var(--text-primary, #f0f0f0);
  font-size: 16px;
  font-weight: 600;
  flex: 1;
  word-break: break-all;
}

.rfp-info-modal-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.rfp-info-item {
  display: flex;
  flex-direction: column;
}

.rfp-info-item strong {
  font-size: 14px;
  color: var(--text-secondary, #aaa);
  margin-bottom: 8px;
}

.rfp-prompt-content {
  flex: 1;
  display: flex;
}

.rfp-prompt-content textarea {
  width: 100%;
  padding: 12px;
  background: var(--bg-secondary, rgba(255,255,255,0.05));
  color: var(--text-primary, #f0f0f0);
  border: none;
  border-radius: 8px;
  resize: vertical;
  min-height: 200px;
  font-size: 14px;
  line-height: 1.6;
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.rfp-copy-btn-container {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}

.rfp-copy-btn {
  padding: 6px 16px;
  background: var(--accent-color, #4a9eff);
  color: var(--accent-text, #fff);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: opacity 0.15s ease;
}

.rfp-copy-btn:hover {
  opacity: 0.85;
}
</style>
