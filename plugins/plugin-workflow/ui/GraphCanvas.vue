<template>
  <div class="gc" ref="rootEl" @mousedown="onBgDown" @wheel.prevent="onWheel">
    <div class="gc-canvas" :style="canvasStyle">
      <svg class="gc-svg" :width="CANVAS_W" :height="CANVAS_H">
        <path
          v-for="l in linkPaths"
          :key="l.id"
          :d="l.d"
          class="gc-link"
          :class="{ hot: l.hot }"
        />
      </svg>

      <div
        v-for="n in nodes"
        :key="n.id"
        class="gc-node"
        :class="[catOf(n), { sel: n.id === selectedId, hot: hotId === n.id }]"
        :style="nodeStyle(n)"
        @mousedown.stop="onNodeDown(n, $event)"
        @mouseenter="hotId = n.id"
        @mouseleave="hotId = ''"
      >
        <div class="gc-head">
          <span class="gc-title">{{ n.title || n.type }}</span>
          <span v-if="n.title && n.title !== n.type" class="gc-type">{{ n.type }}</span>
          <span class="gc-id">#{{ n.id }}</span>
        </div>
        <div class="gc-rows">
          <div v-for="(li, i) in n.linksIn" :key="'i' + i" class="gc-row in">
            <i class="gc-dot" />
            <span class="gc-port">{{ li.name }}</span>
            <span class="gc-from" :title="fromLabel(li)">{{ fromLabel(li) }}</span>
          </div>
          <div v-for="(o, j) in n.linksOut" :key="'o' + j" class="gc-row out">
            <span class="gc-port">{{ o.name || '输出 ' + (j + 1) }}</span>
            <i class="gc-dot" />
          </div>
          <div v-if="!n.linksIn.length && !n.linksOut.length" class="gc-row muted">（无连接）</div>
        </div>
      </div>
    </div>

    <div class="gc-tools">
      <button title="放大" @mousedown.stop @click="zoom(1.2)">＋</button>
      <button title="缩小" @mousedown.stop @click="zoom(1 / 1.2)">－</button>
      <button title="适应窗口" @mousedown.stop @click="fit">⤢</button>
      <button title="实际大小" @mousedown.stop @click="reset">1:1</button>
      <span class="gc-zoom">{{ Math.round(scale * 100) }}%</span>
    </div>
    <div v-if="!nodes.length" class="gc-empty">没有可显示的节点</div>
  </div>
</template>

<script setup>
// 节点图画布：SVG 连线 + DOM 节点卡。
// 只负责"看"：拖动节点 / 平移 / 缩放都在内存层，不写回 JSON（避免污染提交给 ComfyUI 的数据）。
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { portPos, bezier, categoryOf } from './comfy.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
})
const emit = defineEmits(['select', 'move'])

const CANVAS_W = 9000
const CANVAS_H = 6000

const rootEl = ref(null)
const scale = ref(1)
const tx = ref(40)
const ty = ref(30)
const hotId = ref('')

const canvasStyle = computed(() => ({
  transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
}))

function nodeStyle(n) {
  return {
    left: `${n.pos?.x || 0}px`,
    top: `${n.pos?.y || 0}px`,
    width: `${n.size?.w || 210}px`,
    minHeight: `${n.size?.h || 60}px`,
  }
}
function catOf(n) {
  return 'c-' + categoryOf(n.type, n.title)
}

// ---- 连线几何 ----
const nodeMap = computed(() => {
  const m = new Map()
  for (const n of props.nodes) m.set(String(n.id), n)
  return m
})

const linkPaths = computed(() => {
  const out = []
  for (const l of props.links) {
    const src = nodeMap.value.get(String(l.from))
    const dst = nodeMap.value.get(String(l.to))
    if (!src || !dst) continue
    const inIdx = Math.max(0, (dst.linksIn || []).findIndex((x) => String(x.from) === String(l.from) && Number(x.fromSlot) === Number(l.fromSlot)))
    const a = portPos(src, 'out', (src.linksIn?.length || 0) + (Number(l.fromSlot) || 0))
    const b = portPos(dst, 'in', inIdx)
    out.push({
      id: l.id,
      d: bezier(a, b),
      hot: String(l.from) === props.selectedId || String(l.to) === props.selectedId || hotId.value === String(l.from) || hotId.value === String(l.to),
    })
  }
  return out
})

function fromLabel(li) {
  const s = nodeMap.value.get(String(li.from))
  if (!s) return ''
  return '← ' + (s.title || s.type)
}

// ---- 交互：拖节点 / 平移 / 缩放 ----
let drag = null
function onNodeDown(n, e) {
  emit('select', String(n.id))
  drag = {
    kind: 'node', id: String(n.id),
    sx: e.clientX, sy: e.clientY,
    ox: n.pos?.x || 0, oy: n.pos?.y || 0,
    moved: false,
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
function onBgDown(e) {
  drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: tx.value, ty: ty.value }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
function onMove(e) {
  if (!drag) return
  const dx = (e.clientX - drag.sx) / scale.value
  const dy = (e.clientY - drag.sy) / scale.value
  if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.moved = true
  if (drag.kind === 'node') {
    emit('move', { id: drag.id, x: Math.round(drag.ox + dx), y: Math.round(drag.oy + dy) })
  } else {
    tx.value = drag.tx + (e.clientX - drag.sx)
    ty.value = drag.ty + (e.clientY - drag.sy)
  }
}
function onUp() {
  drag = null
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('mouseup', onUp)
}

function onWheel(e) {
  const el = rootEl.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const mx = e.clientX - r.left
  const my = e.clientY - r.top
  const old = scale.value
  const next = Math.min(2.5, Math.max(0.2, old * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
  // 以鼠标位置为锚点缩放
  tx.value = mx - ((mx - tx.value) * next) / old
  ty.value = my - ((my - ty.value) * next) / old
  scale.value = next
}
function zoom(f) {
  const el = rootEl.value
  const r = el ? el.getBoundingClientRect() : { width: 800, height: 600 }
  const mx = r.width / 2
  const my = r.height / 2
  const old = scale.value
  const next = Math.min(2.5, Math.max(0.2, old * f))
  tx.value = mx - ((mx - tx.value) * next) / old
  ty.value = my - ((my - ty.value) * next) / old
  scale.value = next
}
function reset() {
  scale.value = 1
  tx.value = 40
  ty.value = 30
}
function fit() {
  const ns = props.nodes
  if (!ns.length) return
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of ns) {
    x0 = Math.min(x0, n.pos?.x || 0)
    y0 = Math.min(y0, n.pos?.y || 0)
    x1 = Math.max(x1, (n.pos?.x || 0) + (n.size?.w || 210))
    y1 = Math.max(y1, (n.pos?.y || 0) + (n.size?.h || 80))
  }
  const el = rootEl.value
  const W = el ? el.clientWidth : 800
  const H = el ? el.clientHeight : 600
  const pad = 28
  const s = Math.min((W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0), 1.6)
  scale.value = Math.max(0.2, s)
  tx.value = pad - x0 * scale.value + Math.max(0, (W - pad * 2 - (x1 - x0) * scale.value) / 2)
  ty.value = pad - y0 * scale.value + Math.max(0, (H - pad * 2 - (y1 - y0) * scale.value) / 2)
}

// 首次加载与节点集变化时自动适应窗口
let autoFitDone = false
watch(
  () => props.nodes.map((n) => n.id).join(','),
  async () => {
    await nextTick()
    if (!autoFitDone && props.nodes.length) {
      fit()
      autoFitDone = true
    }
  }
)
onMounted(async () => {
  await nextTick()
  if (props.nodes.length) fit()
  autoFitDone = true
})

defineExpose({ fit })
</script>

<style scoped>
.gc {
  position: relative; flex: 1; min-height: 0; overflow: hidden;
  background:
    linear-gradient(90deg, rgba(127,127,127,.09) 1px, transparent 1px) 0 0 / 22px 22px,
    linear-gradient(0deg, rgba(127,127,127,.09) 1px, transparent 1px) 0 0 / 22px 22px,
    var(--bg-secondary, #f6f7f9);
  cursor: grab;
}
.gc-canvas { position: absolute; left: 0; top: 0; transform-origin: 0 0; width: 0; height: 0; }
.gc-svg { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.gc-link {
  fill: none; stroke: rgba(110,120,140,.7); stroke-width: 2;
  transition: stroke .12s, stroke-width .12s;
}
.gc-link.hot { stroke: var(--accent-color, #0067c0); stroke-width: 3; }

.gc-node {
  position: absolute; box-sizing: border-box; cursor: pointer;
  background: var(--bg-surface, #fff); color: var(--text-primary, #1f2937);
  border: 1px solid var(--border-color, #d8dce2);
  border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,.14);
  font-size: 12px; overflow: hidden; user-select: none;
}
.gc-node:hover { box-shadow: 0 3px 10px rgba(0,0,0,.2); }
.gc-node.sel { outline: 2px solid var(--accent-color, #0067c0); outline-offset: 1px; }

.gc-head {
  display: flex; align-items: center; gap: 6px; padding: 5px 8px; color: #fff;
  background: #64748b;
}
.c-load .gc-head { background: #2563eb; }
.c-encode .gc-head { background: #7c3aed; }
.c-sample .gc-head { background: #ea580c; }
.c-latent .gc-head { background: #0891b2; }
.c-image .gc-head { background: #16a34a; }
.c-model .gc-head { background: #db2777; }
.c-util .gc-head { background: #b45309; }

.gc-title { font-weight: 600; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gc-type { font-size: 10.5px; opacity: .82; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gc-id { margin-left: auto; font-size: 10px; opacity: .7; flex: 0 0 auto; }

.gc-rows { padding: 4px 0 6px; }
.gc-row {
  display: flex; align-items: center; gap: 6px; height: 18px; padding: 0 8px;
  font-size: 11px; color: var(--text-secondary, #555);
}
.gc-row.out { justify-content: flex-end; }
.gc-row.muted { color: var(--text-muted, #999); font-style: italic; }
.gc-dot {
  width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%;
  background: var(--bg-surface, #fff); border: 1.5px solid rgba(110,120,140,.85);
}
.gc-row.out .gc-dot { border-color: #16a34a; }
.gc-port { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gc-from {
  margin-left: auto; font-size: 10px; color: var(--text-muted, #999);
  max-width: 74px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.gc-tools {
  position: absolute; right: 10px; bottom: 10px; display: flex; align-items: center; gap: 4px;
  background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #d8dce2);
  border-radius: 8px; padding: 3px 6px; box-shadow: 0 2px 8px rgba(0,0,0,.14);
}
.gc-tools button {
  border: none; background: transparent; cursor: pointer; font-size: 13px; line-height: 1;
  padding: 3px 6px; border-radius: 5px; color: var(--text-primary, #1f2937);
}
.gc-tools button:hover { background: rgba(0,103,192,.12); }
.gc-zoom { font-size: 11px; color: var(--text-muted, #888); min-width: 34px; text-align: center; }
.gc-empty {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: var(--text-muted, #999); font-size: 13px;
}
</style>
