<template>
  <div
    ref="rootEl"
    class="mp-root"
    :class="{ idle: controlsHidden, audio: !isVideo }"
    @mousemove="onActivity"
    @mousedown="onActivity"
  >
    <!-- 舞台 -->
    <div class="mp-stage" @click="togglePlay" @dblclick.stop="toggleFs">
      <video
        v-if="isVideo && src"
        ref="el"
        class="mp-video"
        :src="src"
        :poster="curThumb || undefined"
        playsinline
        @play="playing = true"
        @pause="playing = false"
        @ended="onEnded"
        @timeupdate="onTime"
        @durationchange="onMeta"
        @loadedmetadata="onMeta"
        @progress="onProgress"
        @canplay="onCanPlay"
        @error="err = '无法播放该文件（格式不受支持或文件不可读）'"
      />
      <!-- 音频模式：唱片风 -->
      <div v-if="!isVideo && src" class="mp-audio">
        <div class="mp-disc" :class="{ spin: playing }">
          <svg viewBox="0 0 24 24" width="46%" height="46%"><path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="18" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
        </div>
        <div class="mp-aname">{{ title }}</div>
      </div>
      <div v-if="!src" class="mp-empty">
        <svg viewBox="0 0 24 24" width="42" height="42"><path d="M4 5h16v14H4z M4 15l4-4 3 3 4-5 5 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>无媒体源</span>
      </div>
      <div v-if="err" class="mp-err">{{ err }}</div>

      <!-- 中央播放按钮 -->
      <transition name="mp-fade">
        <button v-if="showBigPlay" class="mp-bigplay" title="播放 (空格)" @click.stop="togglePlay">
          <svg viewBox="0 0 24 24" width="34" height="34"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>
        </button>
      </transition>

      <!-- 翻页 -->
      <template v-if="canFlip">
        <button class="mp-flip prev" title="上一个 (←)" @click.stop="flip(-1)">
          <svg viewBox="0 0 24 24" width="26" height="26"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="mp-flip next" title="下一个 (→)" @click.stop="flip(1)">
          <svg viewBox="0 0 24 24" width="26" height="26"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="mp-pos">{{ curIdx + 1 }} / {{ medias.length }}</div>
      </template>
    </div>

    <!-- 控制栏 -->
    <div class="mp-controls" @click.stop @dblclick.stop>
      <!-- 进度条 -->
      <div
        ref="seekEl"
        class="mp-seek"
        :class="{ seeking: draggingSeek }"
        @pointerdown="onSeekDown"
        @pointermove="onSeekMove"
        @pointerup="onSeekUp"
        @pointercancel="onSeekUp"
      >
        <div class="mp-track">
          <div class="mp-buffered" :style="{ width: bufferedPct + '%' }" />
          <div class="mp-played" :style="{ width: playedPct + '%' }" />
        </div>
        <div class="mp-thumb" :style="{ left: playedPct + '%' }" />
        <div v-if="draggingSeek" class="mp-tip" :style="{ left: playedPct + '%' }">{{ fmt(previewTime) }}</div>
      </div>

      <div class="mp-row">
        <button class="mp-btn accent" :title="playing ? '暂停 (空格)' : '播放 (空格)'" @click="togglePlay">
          <svg v-if="!playing" viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>
          <svg v-else viewBox="0 0 24 24" width="22" height="22"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill="currentColor"/></svg>
        </button>

        <template v-if="canFlip">
          <button class="mp-btn" title="上一个" @click="flip(-1)">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="mp-btn" title="下一个" @click="flip(1)">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </template>

        <span class="mp-time">{{ fmt(cur) }} <i>/</i> {{ fmt(dur) }}</span>

        <span class="mp-spacer" />

        <!-- 倍速 -->
        <div class="mp-pop-wrap">
          <button class="mp-btn txt" title="播放速度">{{ rateLabel }}</button>
          <div v-if="menu === 'rate'" class="mp-pop">
            <button
              v-for="r in RATES"
              :key="r"
              class="mp-pop-item"
              :class="{ on: rate === r }"
              @click="setRate(r)"
            >{{ r === 1 ? '正常' : r + 'x' }}</button>
          </div>
        </div>

        <!-- 音量 -->
        <div class="mp-vol" @mouseenter="volOpen = true" @mouseleave="volOpen = false">
          <button class="mp-btn" :title="muted ? '取消静音' : '静音'" @click="toggleMute">
            <svg v-if="muted || vol === 0" viewBox="0 0 24 24" width="19" height="19"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <svg v-else viewBox="0 0 24 24" width="19" height="19"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M18.8 6a8.2 8.2 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
          <input
            v-show="volOpen || menu === 'vol'"
            class="mp-vol-range"
            type="range" min="0" max="1" step="0.02"
            :value="muted ? 0 : vol"
            @input="setVol($event.target.value)"
          />
        </div>

        <button class="mp-btn" :class="{ on: loop }" title="单曲循环" @click="loop = !loop">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M17 4l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 7H8a4 4 0 0 0-4 4v1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7 20l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17h12a4 4 0 0 0 4-4v-1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>

        <button class="mp-btn" :title="isFs ? '退出全屏' : '全屏'" @click="toggleFs">
          <svg v-if="!isFs" viewBox="0 0 24 24" width="18" height="18"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <svg v-else viewBox="0 0 24 24" width="18" height="18"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { apiClient } from '@/services/api'

const props = defineProps({
  src: { type: String, default: '' },
  title: { type: String, default: '媒体' },
  type: { type: String, default: '' }, // 'video' | 'audio' | ''
  // 同目录同类型媒体列表 [{ fileId, name, thumb }]，传入后支持上一个/下一个
  medias: { type: Array, default: null },
  index: { type: Number, default: 0 },
})

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

const el = ref(null)
const rootEl = ref(null)
const seekEl = ref(null)
const src = ref(props.src || '')
const curIdx = ref(props.index || 0)

const playing = ref(false)
const cur = ref(0)
const dur = ref(0)
const bufferedPct = ref(0)
const vol = ref(1)
const muted = ref(false)
const rate = ref(1)
const loop = ref(false)
const err = ref('')
const menu = ref('')
const volOpen = ref(false)
const isFs = ref(false)
const draggingSeek = ref(false)
const previewTime = ref(0)

let idleTimer = null
let wasPlayingBeforeSeek = false

const isVideo = computed(() => {
  if (props.type === 'audio') return false
  if (props.type === 'video') return true
  return !/\.(mp3|wav|ogg|m4a|flac)$/i.test(props.src || '')
})

const canFlip = computed(() => Array.isArray(props.medias) && props.medias.length > 1)
const curItem = computed(() => (canFlip.value ? props.medias[curIdx.value] || null : null))
const curThumb = computed(() => (curItem.value && curItem.value.thumb) || '')

const playedPct = computed(() => (dur.value > 0 ? Math.min(100, (cur.value / dur.value) * 100) : 0))
const rateLabel = computed(() => (rate.value === 1 ? '倍速' : rate.value + 'x'))
const showBigPlay = computed(() => !!src.value && !playing.value && !err.value && (isVideo.value || true))

const controlsHidden = computed(() => isVideo.value && playing.value && !draggingSeek.value && menu.value === '' && !volOpen.value)

// ===== 播放控制 =====
function tryPlay() {
  if (!el.value) return
  el.value.play().then(() => { playing.value = true }).catch(() => { playing.value = false })
}
function togglePlay() {
  if (!el.value) return
  if (el.value.paused) tryPlay()
  else el.value.pause()
}
function onCanPlay() { err.value = ''; if (!playing.value) tryPlay() }
function onEnded() { playing.value = false }
function onTime() { if (!draggingSeek.value && el.value) cur.value = el.value.currentTime || 0 }
function onMeta() {
  if (!el.value) return
  dur.value = Number.isFinite(el.value.duration) ? el.value.duration : 0
  el.value.playbackRate = rate.value
}
function onProgress() {
  if (!el.value || !el.value.buffered || !dur.value) return
  try {
    const end = el.value.buffered.end(el.value.buffered.length - 1)
    bufferedPct.value = Math.min(100, (end / dur.value) * 100)
  } catch { /* ignore */ }
}
function setRate(r) {
  rate.value = r
  if (el.value) el.value.playbackRate = r
  menu.value = ''
}
function setVol(v) {
  const n = Math.min(1, Math.max(0, Number(v) || 0))
  vol.value = n
  muted.value = n === 0
  if (el.value) { el.value.volume = n; el.value.muted = n === 0 }
}
function toggleMute() {
  muted.value = !muted.value
  if (el.value) el.value.muted = muted.value
}

// ===== 进度条拖拽 =====
function ratioFromEvent(e) {
  const r = seekEl.value.getBoundingClientRect()
  return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
}
function onSeekDown(e) {
  if (!dur.value) return
  draggingSeek.value = true
  wasPlayingBeforeSeek = playing.value
  try { seekEl.value.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  const t = ratioFromEvent(e) * dur.value
  previewTime.value = t
  cur.value = t
  if (el.value) el.value.currentTime = t
}
function onSeekMove(e) {
  if (!draggingSeek.value || !dur.value) return
  const t = ratioFromEvent(e) * dur.value
  previewTime.value = t
  cur.value = t
  if (el.value) el.value.currentTime = t
}
function onSeekUp() {
  if (!draggingSeek.value) return
  draggingSeek.value = false
  if (wasPlayingBeforeSeek) tryPlay()
}

// ===== 翻页 =====
async function flip(d) {
  if (!canFlip.value) return
  const n = props.medias.length
  const next = props.medias[(curIdx.value + d + n) % n]
  curIdx.value = (curIdx.value + d + n) % n
  err.value = ''
  cur.value = 0; dur.value = 0; bufferedPct.value = 0
  if (!next || !next.fileId) return
  try {
    const url = await apiClient.getFileLibraryFileBlobUrl(next.fileId)
    if (curItem.value && String(curItem.value.fileId) === String(next.fileId)) {
      src.value = url || ''
      await nextTick()
      tryPlay()
    }
  } catch { err.value = '加载失败' }
}

// ===== 全屏 =====
function toggleFs() {
  if (document.fullscreenElement) document.exitFullscreen()
  else if (rootEl.value) rootEl.value.requestFullscreen?.()
}
function onFsChange() { isFs.value = !!document.fullscreenElement }

// ===== 控制栏自动隐藏 =====
function onActivity() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => { idleTimer = null }, 2600)
}

function fmt(s) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const p = (x) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`
}

function onKey(e) {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return
  if (e.code === 'Space') { e.preventDefault(); togglePlay() }
  else if (e.key === 'ArrowLeft' && canFlip.value) flip(-1)
  else if (e.key === 'ArrowRight' && canFlip.value) flip(1)
  else if (e.key === 'ArrowUp') { e.preventDefault(); setVol(vol.value + 0.1) }
  else if (e.key === 'ArrowDown') { e.preventDefault(); setVol(vol.value - 0.1) }
  else if (e.key === 'f') toggleFs()
  else if (e.key === 'm') toggleMute()
  // 点外部关闭倍速菜单
  if (menu.value && !e.target.closest?.('.mp-pop-wrap')) menu.value = ''
}

watch(() => props.src, (v) => {
  src.value = v || ''
  cur.value = 0; dur.value = 0; err.value = ''
  nextTick(() => { if (v) tryPlay() })
})

onMounted(() => {
  document.addEventListener('fullscreenchange', onFsChange)
  window.addEventListener('keydown', onKey)
  onActivity()
  if (src.value) nextTick(() => tryPlay())
})
onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFsChange)
  window.removeEventListener('keydown', onKey)
  if (idleTimer) clearTimeout(idleTimer)
})
</script>

<style scoped>
.mp-root {
  position: relative; display: flex; flex-direction: column; height: 100%;
  background: #0a0a0c; color: #e8e8ec; overflow: hidden;
  --mp-acc: #4f8cff;
}
.mp-stage { position: relative; flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; background: #000; }
.mp-video { width: 100%; height: 100%; object-fit: contain; background: #000; }

/* 音频模式 */
.mp-audio { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  width: 100%; height: 100%;
  background: radial-gradient(120% 90% at 50% 0%, #1c1f2b 0%, #0a0a0c 70%); }
.mp-disc { width: 130px; height: 130px; border-radius: 50%; color: #b9b9c6;
  background: conic-gradient(#23252f, #2e313e, #23252f, #2e313e, #23252f);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 10px 40px rgba(0,0,0,.6), inset 0 0 0 6px #0a0a0c; }
.mp-disc.spin { animation: mp-spin 5s linear infinite; }
@keyframes mp-spin { to { transform: rotate(360deg); } }
.mp-aname { font-size: 14px; color: #cfcfda; max-width: 80%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mp-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; color: #666; }
.mp-err { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); z-index: 5;
  background: rgba(120, 30, 30, .85); color: #ffd9d9; font-size: 12.5px; padding: 7px 14px; border-radius: 8px; }

/* 中央播放按钮 */
.mp-bigplay {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 4;
  width: 74px; height: 74px; border-radius: 50%; border: none; cursor: pointer;
  background: rgba(18, 18, 24, .72); color: #fff; display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(6px); box-shadow: 0 8px 30px rgba(0,0,0,.5), inset 0 0 0 1px rgba(255,255,255,.14);
  transition: transform .15s ease, background .15s ease;
}
.mp-bigplay:hover { transform: translate(-50%, -50%) scale(1.06); background: rgba(79, 140, 255, .85); }
.mp-bigplay svg { margin-left: 4px; }
.mp-fade-enter-active, .mp-fade-leave-active { transition: opacity .18s ease; }
.mp-fade-enter-from, .mp-fade-leave-to { opacity: 0; }

/* 翻页箭头 */
.mp-flip {
  position: absolute; top: 50%; transform: translateY(-50%); z-index: 4;
  width: 42px; height: 64px; border: none; border-radius: 10px; cursor: pointer;
  background: rgba(16,16,20,.5); color: #fff; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity .15s ease, background .15s ease; backdrop-filter: blur(4px);
}
.mp-root:hover .mp-flip { opacity: .9; }
.mp-flip:hover { background: var(--mp-acc); }
.mp-flip.prev { left: 12px; } .mp-flip.next { right: 12px; }
.mp-pos { position: absolute; top: 12px; right: 14px; z-index: 4; font-size: 12px; color: #fff;
  background: rgba(0,0,0,.5); padding: 3px 10px; border-radius: 10px; }

/* ===== 控制栏 ===== */
.mp-controls {
  flex-shrink: 0; padding: 0 14px 8px; background: linear-gradient(transparent, rgba(5,5,8,.88) 40%);
  position: relative; z-index: 6; margin-top: -74px;
}
.mp-root.idle .mp-controls { opacity: 0; pointer-events: none; transform: translateY(6px); }
.mp-controls { transition: opacity .22s ease, transform .22s ease; }
.mp-root.idle { cursor: none; }

.mp-seek { position: relative; height: 16px; display: flex; align-items: center; cursor: pointer; touch-action: none; }
.mp-track { position: relative; width: 100%; height: 4px; border-radius: 2px; background: rgba(255,255,255,.16); overflow: hidden; transition: height .12s ease; }
.mp-seek:hover .mp-track, .mp-seek.seeking .mp-track { height: 6px; }
.mp-buffered { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(255,255,255,.22); }
.mp-played { position: absolute; left: 0; top: 0; bottom: 0; background: var(--mp-acc); }
.mp-thumb {
  position: absolute; top: 50%; width: 13px; height: 13px; border-radius: 50%;
  background: #fff; transform: translate(-50%, -50%) scale(0);
  box-shadow: 0 1px 6px rgba(0,0,0,.6); transition: transform .12s ease; pointer-events: none;
}
.mp-seek:hover .mp-thumb, .mp-seek.seeking .mp-thumb { transform: translate(-50%, -50%) scale(1); }
.mp-tip {
  position: absolute; bottom: 20px; transform: translateX(-50%);
  background: rgba(10,10,14,.92); color: #fff; font-size: 11.5px; padding: 3px 8px; border-radius: 6px;
  pointer-events: none; white-space: nowrap;
}

.mp-row { display: flex; align-items: center; gap: 4px; height: 42px; }
.mp-btn {
  width: 34px; height: 34px; border: none; border-radius: 7px; padding: 0; cursor: pointer;
  background: transparent; color: #d8d8e2; display: flex; align-items: center; justify-content: center;
  transition: background .12s ease, color .12s ease;
}
.mp-btn:hover { background: rgba(255,255,255,.14); color: #fff; }
.mp-btn.on { color: var(--mp-acc); }
.mp-btn.accent { width: 40px; height: 40px; color: #fff; }
.mp-btn.accent:hover { background: rgba(79,140,255,.35); }
.mp-btn.txt { width: auto; padding: 0 10px; font-size: 12.5px; font-weight: 600; }
.mp-time { font-size: 12.5px; color: #c9c9d4; font-variant-numeric: tabular-nums; margin-left: 6px; }
.mp-time i { font-style: normal; color: #6c6c78; margin: 0 2px; }
.mp-spacer { flex: 1; }

/* 倍速弹出 */
.mp-pop-wrap { position: relative; }
.mp-pop {
  position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); z-index: 8;
  background: rgba(18,18,24,.96); border: 1px solid rgba(255,255,255,.12); border-radius: 9px;
  padding: 5px; min-width: 76px; box-shadow: 0 8px 26px rgba(0,0,0,.5); backdrop-filter: blur(8px);
}
.mp-pop-item {
  display: block; width: 100%; text-align: center; border: none; background: transparent; color: #d5d5df;
  font-size: 12.5px; padding: 6px 12px; border-radius: 6px; cursor: pointer;
}
.mp-pop-item:hover { background: rgba(255,255,255,.12); color: #fff; }
.mp-pop-item.on { color: var(--mp-acc); font-weight: 700; }

/* 音量 */
.mp-vol { display: flex; align-items: center; }
.mp-vol-range {
  width: 74px; height: 4px; margin-left: 4px; appearance: auto; accent-color: var(--mp-acc);
  cursor: pointer;
}
</style>
