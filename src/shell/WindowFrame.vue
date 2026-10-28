<template>
  <div
    class="win"
    :class="{ 'win-max': win.state === 'max', 'win-focused': isFocused }"
    :style="winStyle"
    @mousedown="onFocus"
  >
    <div class="win-titlebar" @mousedown="startDrag" @dblclick="onDblTitle">
      <span class="wt-ico" v-html="appIcon" />
      <span class="wt-title">{{ win.title }}</span>
      <span class="wt-spacer" />
      <button class="wt-btn" title="最小化" @click.stop="min"><span v-html="iMin" /></button>
      <button class="wt-btn" :title="win.state === 'max' ? '向下还原' : '最大化'" @click.stop="max">
        <span v-html="win.state === 'max' ? iRestore : iMax" />
      </button>
      <button class="wt-btn wt-close" title="关闭" @click.stop="close"><span v-html="iClose" /></button>
    </div>

    <div class="win-content-root">
      <component :is="app.component" v-bind="boundProps" @set-title="(t) => wm.setTitle(win.id, t)" />
    </div>

    <!-- 8 向缩放手柄 -->
    <template v-if="win.state === 'normal'">
      <span v-for="d in dirs" :key="d" class="win-rs" :class="'rs-' + d" @mousedown.stop="startResize(d, $event)" />
    </template>

    <!-- 贴靠（Snap）预览 -->
    <Teleport to="body">
      <div v-if="snapZone" class="snap-overlay" :class="'snap-' + snapZone">
        <span class="snap-glyph" v-html="snapGlyph" />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useWm } from '@/shell/wm'
import { useSession } from '@/shell/session'
import { getApp } from '@/shell/apps'
import { icon } from '@/shell/icons'

const props = defineProps({
  win: { type: Object, required: true },
})

const wm = useWm()
const session = useSession()
const app = computed(() => getApp(props.win.appId) || { name: props.win.appId, icon: 'file', component: 'div' })
const appIcon = computed(() => icon(app.value.icon))
const isFocused = computed(() => wm.focusedId === props.win.id)

const iMin = icon('minimize')
const iMax = icon('maximize')
const iRestore = icon('restore')
const iClose = icon('close')

const snapGlyph = computed(() => {
  if (snapZone.value === 'left') return icon('snapLeft')
  if (snapZone.value === 'right') return icon('snapRight')
  if (snapZone.value === 'max') return icon('snapMax')
  return ''
})

const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

const winStyle = computed(() => {
  const w = props.win
  if (w.state === 'max') {
    return { left: '0px', top: '0px', width: '100vw', height: 'calc(100vh - 48px)', zIndex: w.zIndex }
  }
  return { left: w.x + 'px', top: w.y + 'px', width: w.w + 'px', height: w.h + 'px', zIndex: w.zIndex }
})

const boundProps = computed(() => {
  const p = { ...props.win.props }
  if (props.win.appId === 'profile' && session.user) p.user = session.user
  return p
})

function onFocus() {
  wm.focus(props.win.id)
}

let drag = null
const snapZone = ref(null) // 'left' | 'right' | 'max' | null
function startDrag(e) {
  if (e.target.closest('.wt-btn')) return
  if (e.button !== 0) return
  onFocus()
  const w = props.win
  let startX = e.clientX, startY = e.clientY
  let ox = w.x, oy = w.y
  // 最大化状态下拖动 → 先还原
  if (w.state === 'max') {
    const ratio = (e.clientX - 0) / window.innerWidth
    wm.toggleMax(w.id)
    const nr = w.prevRect || { w: 880, h: 600 }
    ox = Math.round(ratio * (window.innerWidth - nr.w))
    oy = 0
    w.x = ox; w.y = oy; w.w = nr.w; w.h = nr.h
    startX = e.clientX; startY = e.clientY
  }
  drag = { startX, startY, ox, oy }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  document.body.style.userSelect = 'none'
}
function computeSnapZone(e) {
  const W = window.innerWidth
  if (e.clientY <= 6) return 'max'
  if (e.clientX <= 6) return 'left'
  if (e.clientX >= W - 6) return 'right'
  return null
}
function onMove(e) {
  if (!drag) return
  snapZone.value = computeSnapZone(e)
  if (snapZone.value) return // 贴靠预览期间不移动窗口
  const dx = e.clientX - drag.startX
  const dy = e.clientY - drag.startY
  let nx = drag.ox + dx
  let ny = Math.max(0, drag.oy + dy)
  nx = Math.max(-(props.win.w - 160), Math.min(window.innerWidth - 160, nx))
  props.win.x = nx
  props.win.y = ny
}
function onUp() {
  if (drag && snapZone.value) {
    wm.snap(props.win.id, snapZone.value)
  }
  snapZone.value = null
  drag = null
  document.removeEventListener('mousemove', onMove)
  document.removeEventListener('mouseup', onUp)
  document.body.style.userSelect = ''
}

function onDblTitle(e) {
  if (e.target.closest('.wt-btn')) return
  max()
}

let resize = null
function startResize(dir, e) {
  onFocus()
  const w = props.win
  resize = { dir, sx: e.clientX, sy: e.clientY, x: w.x, y: w.y, w: w.w, h: w.h }
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', onResizeUp)
  document.body.style.userSelect = 'none'
}
function onResize(e) {
  if (!resize) return
  const w = props.win
  const dx = e.clientX - resize.sx
  const dy = e.clientY - resize.sy
  const MINW = 300, MINH = 200
  if (resize.dir.includes('e')) w.w = Math.max(MINW, resize.w + dx)
  if (resize.dir.includes('s')) w.h = Math.max(MINH, resize.h + dy)
  if (resize.dir.includes('w')) {
    const nw = Math.max(MINW, resize.w - dx)
    w.x = resize.x + (resize.w - nw)
    w.w = nw
  }
  if (resize.dir.includes('n')) {
    const nh = Math.max(MINH, resize.h - dy)
    w.y = resize.y + (resize.h - nh)
    w.h = nh
  }
}
function onResizeUp() {
  resize = null
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', onResizeUp)
  document.body.style.userSelect = ''
}

function min() { wm.minimize(props.win.id) }
function max() { wm.toggleMax(props.win.id) }
function close() { wm.close(props.win.id) }
</script>

<style scoped>
.win {
  position: absolute;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface, #fff);
  border-radius: 8px;
  border: 1px solid var(--win-border, rgba(255,255,255,.5));
  box-shadow: 0 18px 50px rgba(0,0,0,.42);
  overflow: hidden;
  min-width: 300px;
  min-height: 200px;
}
.win-max { border-radius: 0; box-shadow: 0 8px 30px rgba(0,0,0,.3); }
.win-focused { border-color: rgba(0,103,192,.35); }

.win-titlebar {
  height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 12px;
  background: linear-gradient(180deg, var(--titlebar-grad1, #fafafa), var(--titlebar-grad2, #f0f0f0));
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  cursor: default;
  user-select: none;
  flex-shrink: 0;
}
[data-theme='dark'] .win-titlebar { background: linear-gradient(180deg, #2b2b2f, #252528); }
.wt-ico { width: 18px; height: 18px; flex-shrink: 0; display: flex; }
.wt-title { font-size: 13px; color: var(--text-primary, #1f2937); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wt-spacer { flex: 1; }
.wt-btn {
  width: 34px; height: 30px; border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center; border-radius: 5px; color: var(--text-secondary, #555);
}
.wt-btn :deep(svg) { width: 14px; height: 14px; }
.wt-btn:hover { background: rgba(128,128,128,.16); }
.wt-close:hover { background: #e81123; color: #fff; }

.win-content-root {
  flex: 1; min-height: 0; position: relative;
  overflow: hidden;
  overflow-y: auto;   /* 内容超高时可滚动（任务中心/功能库等长列表不被截断） */
  display: flex; flex-direction: column;
  background: var(--bg-surface, #fff);
}

.win-rs { position: absolute; z-index: 5; }
.rs-n { top: -3px; left: 6px; right: 6px; height: 6px; cursor: ns-resize; }
.rs-s { bottom: -3px; left: 6px; right: 6px; height: 6px; cursor: ns-resize; }
.rs-e { right: -3px; top: 6px; bottom: 6px; width: 6px; cursor: ew-resize; }
.rs-w { left: -3px; top: 6px; bottom: 6px; width: 6px; cursor: ew-resize; }
.rs-ne { top: -3px; right: -3px; width: 10px; height: 10px; cursor: nesw-resize; }
.rs-nw { top: -3px; left: -3px; width: 10px; height: 10px; cursor: nwse-resize; }
.rs-se { bottom: -3px; right: -3px; width: 10px; height: 10px; cursor: nwse-resize; }
.rs-sw { bottom: -3px; left: -3px; width: 10px; height: 10px; cursor: nesw-resize; }

/* 贴靠（Snap）预览 */
.snap-overlay {
  position: fixed; z-index: 99990; pointer-events: none;
  background: rgba(0,103,192,.28); border: 2px solid rgba(0,103,192,.7);
  border-radius: 10px; display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(1px);
}
.snap-left { left: 0; top: 0; width: 50vw; height: calc(100vh - 48px); }
.snap-right { right: 0; top: 0; width: 50vw; height: calc(100vh - 48px); }
.snap-max { left: 0; top: 0; width: 100vw; height: calc(100vh - 48px); }
.snap-glyph :deep(svg) { width: 56px; height: 56px; color: #fff; opacity: .85; }
</style>
