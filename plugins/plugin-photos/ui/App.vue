<template>
  <div ref="rootEl" class="pv-root" @wheel.prevent="onWheel" @click="onRootClick">
    <!-- ===== 顶部工具栏 ===== -->
    <div class="pv-toolbar">
      <span class="pv-fname" :title="curName">{{ curName }}</span>
      <div class="pv-tools">
        <!-- 编辑 -->
        <div class="pv-menu-wrap">
          <button class="pv-tbtn" :class="{ on: menu === 'edit' }" @click.stop="toggleMenu('edit')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 20h16M6 16l10.5-10.5a2.1 2.1 0 0 1 3 3L9 19l-4 1z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            编辑<i class="pv-caret" />
          </button>
          <div v-if="menu === 'edit'" class="pv-pop">
            <button class="pv-pop-item" @click.stop="actCopyImage">复制图片到剪贴板</button>
            <button v-if="curPrompt" class="pv-pop-item" @click.stop="actShowPrompt">查看提示词 (P)</button>
            <button class="pv-pop-item" @click.stop="actCopyPrompt" :disabled="!curPrompt">复制提示词</button>
          </div>
        </div>
        <!-- 转换 -->
        <div class="pv-menu-wrap">
          <button class="pv-tbtn" :class="{ on: menu === 'convert' }" @click.stop="toggleMenu('convert')">
            <svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            转换<i class="pv-caret" />
          </button>
          <div v-if="menu === 'convert'" class="pv-pop">
            <button class="pv-pop-item" @click.stop="actRotate(-90)">向左旋转 90°</button>
            <button class="pv-pop-item" @click.stop="actRotate(90)">向右旋转 90°</button>
            <button class="pv-pop-item" @click.stop="actFlip">水平镜像</button>
            <button class="pv-pop-item" @click.stop="actReset">重置视图</button>
          </div>
        </div>
        <button class="pv-tbtn" @click.stop="actSoon('打印')">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M7 8V4h10v4M7 17H5a1.5 1.5 0 0 1-1.5-1.5v-6A1.5 1.5 0 0 1 5 8h14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 19 17h-2M7 14h10v6H7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          打印
        </button>
        <button class="pv-tbtn" @click.stop="actSoon('批量处理')">
          <svg viewBox="0 0 24 24" width="15" height="15"><rect x="4" y="4" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
          批量处理
        </button>
        <button class="pv-tbtn" @click.stop="actSoon('AI 工具箱')">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor" opacity=".8"/></svg>
          AI 工具箱
        </button>
      </div>
    </div>

    <!-- ===== 画布 ===== -->
    <div
      class="pv-stage"
      :class="{ pannable: scale > 1, panning: dragging }"
      @mousedown.prevent="onPanStart"
      @mousemove="onPanMove"
      @mouseup="onPanEnd"
      @mouseleave="onPanEnd"
    >
      <img
        v-if="src"
        :src="src"
        class="pv-img"
        :style="imgStyle"
        alt="预览"
        draggable="false"
        @load="onImgLoad"
      />
      <div v-else class="pv-empty">无图片</div>

      <!-- 上一张 / 下一张 -->
      <template v-if="canFlip">
        <button class="pv-flip prev" title="上一张 (←)" @click.stop="flip(-1)">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="pv-flip next" title="下一张 (→)" @click.stop="flip(1)">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </template>

      <!-- 提示词弹窗 -->
      <div v-if="curPrompt && promptOn" class="pv-prompt" @click.stop>
        <div class="pp-head">
          <span class="pp-label">提示词</span>
          <span v-if="copyState" class="pp-copied">{{ copyState }}</span>
          <button class="pp-btn" title="复制提示词" @click.stop="copyPrompt">
            <svg viewBox="0 0 24 24" width="14" height="14"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>
          </button>
          <button class="pp-btn pp-close" title="关闭 (P)" @click.stop="promptOn = false">✕</button>
        </div>
        <div class="pp-body">{{ curPrompt }}</div>
      </div>
    </div>

    <!-- ===== 底部状态栏 ===== -->
    <div class="pv-status">
      <div class="pv-meta">
        <span v-if="sizeText" class="pv-badge">{{ sizeText }}</span>
        <span v-if="dimText" class="pv-badge">{{ dimText }}</span>
        <span v-if="fmtText" class="pv-badge">{{ fmtText }}</span>
      </div>

      <div v-if="canFlip" class="pv-page">
        <button class="pv-sbtn" title="上一张" @click="flip(-1)">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <span class="pv-pagenum">{{ curIdx + 1 }} / {{ images.length }}</span>
        <button class="pv-sbtn" title="下一张" @click="flip(1)">
          <svg viewBox="0 0 24 24" width="15" height="15"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>

      <div class="pv-actions">
        <!-- 缩放比例下拉 -->
        <div class="pv-menu-wrap">
          <button class="pv-zoom" @click.stop="toggleMenu('zoom')">{{ zoomLabel }}<i class="pv-caret" /></button>
          <div v-if="menu === 'zoom'" class="pv-pop up">
            <button class="pv-pop-item" @click.stop="actFit">适应窗口</button>
            <button v-for="z in [50, 75, 100, 150, 200, 400]" :key="z" class="pv-pop-item" :class="{ on: zoomPct === z }" @click.stop="actZoom(z)">{{ z }}%</button>
          </div>
        </div>
        <button class="pv-sbtn" title="缩小 (-)" @click="zoom(-0.2)">
          <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.8 15.8 20 20M8.5 11h5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <button class="pv-sbtn" title="放大 (+)" @click="zoom(0.2)">
          <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.8 15.8 20 20M8.5 11h5M11 8.5v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <span class="pv-sep" />
        <button class="pv-sbtn" title="向右旋转 90° (R)" @click="actRotate(90)">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M20 12a8 8 0 1 1-2.34-5.66" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 3v4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="pv-sbtn" :class="{ on: flipH }" title="水平镜像" @click="actFlip">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3v18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="2.5 2.5"/><path d="M9 7 4 12l5 5V7zM15 7l5 5-5 5V7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
        </button>
        <button class="pv-sbtn" title="在文件库中删除" @click="actSoon('删除（请到资源管理器中操作）')">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 7h14M10 7V5h4v2M8 7l.7 13h6.6L16 7M10.5 10.5v6M13.5 10.5v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button v-if="curPrompt" class="pv-sbtn" :class="{ on: promptOn }" title="提示词 (P)" @click="promptOn = !promptOn">
          <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5M12 7.6v.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <button class="pv-sbtn" :title="isFs ? '退出全屏' : '全屏'" @click="toggleFs">
          <svg v-if="!isFs" viewBox="0 0 24 24" width="16" height="16"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { apiClient } from '@/services/api'
import { useToast } from '@/shell/toast'

const props = defineProps({
  src: { type: String, default: '' },
  title: { type: String, default: '图片' },
  prompt: { type: String, default: '' },
  fileId: { type: [Number, String], default: 0 },
  // 同目录图片列表 [{ fileId, name, thumb, prompt }]，传入后支持上一张/下一张
  images: { type: Array, default: null },
  index: { type: Number, default: 0 },
})

const toast = useToast()

const scale = ref(1)
const rot = ref(0)
const flipH = ref(false)
const panX = ref(0)
const panY = ref(0)
const dragging = ref(false)
const promptOn = ref(false)
const copyState = ref('')
const curIdx = ref(props.index || 0)
const src = ref(props.src || '')
const menu = ref('')
const isFs = ref(false)

// 状态栏元数据
const sizeText = ref('')
const dimW = ref(0)
const dimH = ref(0)
const fmtText = ref('')

let dragStart = null // { mx, my, panX, panY }

const canFlip = computed(() => Array.isArray(props.images) && props.images.length > 1)
const zoomPct = computed(() => Math.round(scale.value * 100))
const zoomLabel = computed(() => zoomPct.value + '%')

const imgStyle = computed(() => ({
  transform: `translate(calc(-50% + ${panX.value}px), calc(-50% + ${panY.value}px)) scale(${scale.value}) rotate(${rot.value}deg) scaleX(${flipH.value ? -1 : 1})`,
}))

// 目录列表是 light 模式拉的，条目上没有 description，因此翻页时要按 fileId 现取一次并缓存。
// （历史 bug：列表项 prompt 为空时回退到 props.prompt，导致翻到哪张都显示"第一次打开那张"的提示词）
const extraPrompts = ref({})
const promptLoading = ref('')

const curItem = computed(() => {
  if (canFlip.value) return props.images[curIdx.value] || null
  if (props.fileId) return { fileId: props.fileId, thumb: props.src, prompt: props.prompt }
  return null
})

const curPrompt = computed(() => {
  const im = curItem.value
  if (im && im.fileId) {
    if (im.prompt) return im.prompt
    const got = extraPrompts.value[String(im.fileId)]
    return typeof got === 'string' ? got : ''
  }
  // 没有翻页列表（单张打开）时才用打开时传入的 prompt
  return props.prompt || ''
})
const curName = computed(() => (canFlip.value && curItem.value ? curItem.value.name : props.title))

// 列表项自带 prompt 或已缓存则跳过；否则拉一次详情补上
async function ensurePrompt() {
  const im = curItem.value
  if (!im || !im.fileId) return
  if (im.prompt) return
  const key = String(im.fileId)
  if (promptLoading.value === key) return
  if (typeof extraPrompts.value[key] === 'string') return
  promptLoading.value = key
  let text = ''
  try {
    const d = await apiClient.getFileLibraryFileById(im.fileId)
    text = (d && (d.description || d.prompt || '')) || ''
  } catch { text = '' }
  extraPrompts.value = { ...extraPrompts.value, [key]: text }
  promptLoading.value = ''
}

function fmtBytes(b) {
  if (!Number.isFinite(b) || b <= 0) return ''
  if (b >= 1048576) return (b / 1048576).toFixed(2) + 'M'
  if (b >= 1024) return (b / 1024).toFixed(1) + 'K'
  return b + 'B'
}

// 从 blob 地址取文件大小与格式（blob:/data: 地址都可以 fetch）
async function probeMeta(url) {
  try {
    const r = await fetch(url)
    const blob = await r.blob()
    sizeText.value = fmtBytes(blob.size)
    if (blob.type && blob.type.startsWith('image/')) {
      fmtText.value = blob.type.split('/')[1].replace('jpeg', 'JPG').replace('svg+xml', 'SVG').toUpperCase()
    }
  } catch { sizeText.value = '' }
}

async function load() {
  const im = curItem.value
  if (!im || !im.fileId) {
    src.value = props.src || ''
    if (src.value) probeMeta(src.value)
    return
  }
  // 先用缩略图占位，再加载原图
  src.value = im.thumb || ''
  sizeText.value = ''; dimW.value = 0; dimH.value = 0
  const myId = im.fileId
  try {
    const url = await apiClient.getFileLibraryFileBlobUrl(myId)
    if (url && curItem.value && String(curItem.value.fileId) === String(myId)) {
      src.value = url
      probeMeta(url)
    }
  } catch { /* 保持缩略图 */ }
  // 格式兜底：从文件名扩展名推断
  const name = (canFlip.value && im.name) || props.title || ''
  const m = /\.([a-z0-9]{2,5})$/i.exec(name)
  if (m && !fmtText.value) fmtText.value = m[1].toUpperCase()
}

function onImgLoad(e) {
  dimW.value = e.target.naturalWidth || 0
  dimH.value = e.target.naturalHeight || 0
}
const dimText = computed(() => (dimW.value ? `${dimW.value}*${dimH.value}像素` : ''))

function flip(d) {
  if (!canFlip.value) return
  const n = props.images.length
  curIdx.value = (curIdx.value + d + n) % n
  resetView()
}

// 打开时传入的 prompt 直接入缓存，省掉首图的额外请求
if (props.fileId && props.prompt) extraPrompts.value = { [String(props.fileId)]: props.prompt }

watch([curIdx, () => props.images, () => props.fileId], () => { load(); ensurePrompt() }, { immediate: true })

function zoom(d) {
  scale.value = Math.min(5, Math.max(0.1, +(scale.value + d).toFixed(2)))
  // 缩小回 100% 及以下时复位平移
  if (scale.value <= 1) { panX.value = 0; panY.value = 0 }
}
function resetView() {
  scale.value = 1
  rot.value = 0
  flipH.value = false
  panX.value = 0
  panY.value = 0
}

// ===== 拖拽平移（放大后按住鼠标拖动） =====
function onPanStart(e) {
  if (scale.value <= 1) return
  dragging.value = true
  dragStart = { mx: e.clientX, my: e.clientY, px: panX.value, py: panY.value }
}
function onPanMove(e) {
  if (!dragging.value || !dragStart) return
  panX.value = dragStart.px + (e.clientX - dragStart.mx)
  panY.value = dragStart.py + (e.clientY - dragStart.my)
}
function onPanEnd() {
  dragging.value = false
  dragStart = null
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(curPrompt.value || '')
    copyState.value = '已复制 ✓'
  } catch {
    copyState.value = '复制失败'
  }
  setTimeout(() => { copyState.value = '' }, 1800)
}

function onWheel(e) {
  zoom(e.deltaY < 0 ? 0.15 : -0.15)
}

// ===== 全屏 =====
function toggleFs() {
  if (document.fullscreenElement) document.exitFullscreen()
  else if (rootEl.value) rootEl.value.requestFullscreen?.()
}
function onFsChange() { isFs.value = !!document.fullscreenElement }

// ===== 菜单与工具动作 =====
function toggleMenu(m) { menu.value = menu.value === m ? '' : m }
function onRootClick() { if (menu.value) menu.value = '' }
function actSoon(name) { menu.value = ''; toast.show(`「${name}」功能开发中`, 'info') }

async function actCopyImage() {
  menu.value = ''
  try {
    let url = src.value
    if (curItem.value && curItem.value.fileId) {
      url = await apiClient.getFileLibraryFileBlobUrl(curItem.value.fileId) || src.value
    }
    if (!url) throw new Error('无图片数据')
    const blob = await (await fetch(url)).blob()
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
    toast.show('图片已复制到剪贴板', 'success')
  } catch (e) {
    toast.show('复制失败：' + (e.message || e), 'error')
  }
}
function actShowPrompt() { menu.value = ''; promptOn.value = true }
async function actCopyPrompt() {
  menu.value = ''
  try {
    await navigator.clipboard.writeText(curPrompt.value || '')
    toast.show('提示词已复制到剪贴板', 'success')
  } catch { toast.show('复制失败', 'error') }
}
function actRotate(d) { menu.value = ''; rot.value = (rot.value + d + 360) % 360 }
function actFlip() { menu.value = ''; flipH.value = !flipH.value }
function actReset() { menu.value = ''; resetView() }
function actFit() { menu.value = ''; scale.value = 1; panX.value = 0; panY.value = 0 }
function actZoom(z) { menu.value = ''; scale.value = z / 100; if (scale.value <= 1) { panX.value = 0; panY.value = 0 } }

function onKey(e) {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return
  if (e.key === '+' || e.key === '=') zoom(0.2)
  else if (e.key === '-') zoom(-0.2)
  else if (e.key === '0') resetView()
  else if (e.key === 'r') rot.value += 90
  else if (e.key === 'p' && curPrompt.value) promptOn.value = !promptOn.value
  else if (e.key === 'f') toggleFs()
  else if (e.key === 'Escape' && menu.value) menu.value = ''
  else if (e.key === 'ArrowLeft') flip(-1)
  else if (e.key === 'ArrowRight') flip(1)
}
onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.addEventListener('fullscreenchange', onFsChange)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('fullscreenchange', onFsChange)
})
</script>

<style scoped>
.pv-root {
  display: flex; flex-direction: column; height: 100%; background: #0e0e10; color: #e4e4ea;
  --pv-bar: #1d1e23; --pv-line: #2c2d34; --pv-hover: #34353d; --pv-acc: #4f8cff;
}

/* ===== 顶部工具栏 ===== */
.pv-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  height: 42px; padding: 0 12px; background: var(--pv-bar); border-bottom: 1px solid var(--pv-line);
  flex-shrink: 0;
}
.pv-fname { font-size: 13px; font-weight: 600; color: #f0f0f5; max-width: 42%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pv-tools { display: flex; align-items: center; gap: 2px; }
.pv-tbtn {
  display: flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px;
  border: none; border-radius: 7px; background: transparent; color: #c9c9d3;
  font-size: 12.5px; cursor: pointer; transition: background .12s ease, color .12s ease;
  white-space: nowrap;
}
.pv-tbtn:hover, .pv-tbtn.on { background: var(--pv-hover); color: #fff; }
.pv-caret {
  width: 0; height: 0; border-left: 3.5px solid transparent; border-right: 3.5px solid transparent;
  border-top: 4px solid currentColor; opacity: .7; margin-left: 1px;
}

/* 下拉菜单 */
.pv-menu-wrap { position: relative; }
.pv-pop {
  position: absolute; top: 34px; right: 0; z-index: 30; min-width: 158px;
  background: rgba(24, 25, 30, .97); border: 1px solid rgba(255,255,255,.12); border-radius: 9px;
  padding: 5px; box-shadow: 0 10px 32px rgba(0,0,0,.55); backdrop-filter: blur(8px);
}
.pv-pop.up { top: auto; bottom: 34px; }
.pv-pop-item {
  display: block; width: 100%; text-align: left; border: none; background: transparent;
  color: #d5d5df; font-size: 12.5px; padding: 7px 12px; border-radius: 6px; cursor: pointer;
  white-space: nowrap;
}
.pv-pop-item:hover { background: rgba(255,255,255,.12); color: #fff; }
.pv-pop-item.on { color: var(--pv-acc); font-weight: 700; }
.pv-pop-item:disabled { opacity: .4; cursor: default; }
.pv-pop-item:disabled:hover { background: transparent; }

/* ===== 画布 ===== */
.pv-stage { flex: 1; min-height: 0; position: relative; overflow: hidden; background:
  repeating-conic-gradient(#1a1a1d 0% 25%, #161618 0% 50%) 50% / 24px 24px; }
.pv-stage.pannable { cursor: grab; }
.pv-stage.panning { cursor: grabbing; }
.pv-img {
  position: absolute; left: 50%; top: 50%; max-width: 96%; max-height: 96%;
  transform-origin: center; transition: transform .08s ease; box-shadow: 0 8px 30px rgba(0,0,0,.5);
  border-radius: 2px; pointer-events: none; user-select: none;
}
.pv-stage.panning .pv-img { transition: none; }
.pv-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #888; }

/* 翻页箭头 */
.pv-flip {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 3;
  width: 40px; height: 72px; border: none; cursor: pointer;
  background: transparent; color: rgba(255,255,255,.85);
  display: flex; align-items: center; justify-content: center;
  transition: background .15s ease, color .15s ease;
}
.pv-flip:hover { background: rgba(20,20,26,.6); color: #fff; }
.pv-flip.prev { left: 4px; }
.pv-flip.next { right: 4px; }

/* 提示词弹窗 */
.pv-prompt {
  position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%);
  width: min(56%, 640px); max-height: 34%; display: flex; flex-direction: column;
  color: #fff; background: rgba(20,20,24,.88); border: 1px solid rgba(255,255,255,.12);
  border-radius: 8px; backdrop-filter: blur(6px); z-index: 4;
  box-shadow: 0 6px 24px rgba(0,0,0,.45);
}
.pp-head {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  border-bottom: 1px solid rgba(255,255,255,.1); flex-shrink: 0;
}
.pp-label { font-size: 12px; color: #9fd0ff; font-weight: 600; }
.pp-copied { font-size: 11.5px; color: #7ee787; }
.pp-btn {
  margin-left: auto; border: none; background: transparent; color: #ccc; cursor: pointer;
  width: 24px; height: 24px; border-radius: 5px; display: flex; align-items: center; justify-content: center;
  padding: 0;
}
.pp-btn:hover { background: rgba(255,255,255,.14); color: #fff; }
.pp-close { margin-left: 0; font-size: 13px; }
.pp-body {
  overflow: auto; padding: 10px 14px;
  font-size: 14px; line-height: 1.6; text-align: left;
  white-space: pre-wrap; word-break: break-word;
}

/* ===== 底部状态栏 ===== */
.pv-status {
  display: flex; align-items: center; gap: 12px; height: 42px; padding: 0 12px;
  background: var(--pv-bar); border-top: 1px solid var(--pv-line); flex-shrink: 0;
}
.pv-meta { display: flex; align-items: center; gap: 6px; min-width: 0; }
.pv-badge {
  font-size: 11px; color: #b9b9c4; background: #292a31; border: 1px solid #34353d;
  padding: 2.5px 8px; border-radius: 5px; white-space: nowrap;
  max-width: 180px; overflow: hidden; text-overflow: ellipsis;
}
.pv-page { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.pv-pagenum { font-size: 12.5px; color: #d5d5df; font-variant-numeric: tabular-nums; min-width: 52px; text-align: center; }
.pv-actions { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.pv-page + .pv-actions { margin-left: 8px; }
.pv-sbtn {
  width: 30px; height: 30px; border: none; border-radius: 6px; padding: 0; cursor: pointer;
  background: transparent; color: #c9c9d3; display: flex; align-items: center; justify-content: center;
  transition: background .12s ease, color .12s ease;
}
.pv-sbtn:hover { background: var(--pv-hover); color: #fff; }
.pv-sbtn.on { color: var(--pv-acc); }
.pv-zoom {
  display: flex; align-items: center; gap: 4px; height: 28px; padding: 0 9px;
  border: 1px solid #34353d; border-radius: 6px; background: #26272d; color: #d5d5df;
  font-size: 12px; cursor: pointer; font-variant-numeric: tabular-nums;
}
.pv-zoom:hover { background: var(--pv-hover); color: #fff; }
.pv-sep { width: 1px; height: 18px; background: #34353d; margin: 0 5px; }
</style>
