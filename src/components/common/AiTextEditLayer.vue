<template>
  <div class="ai-text-edit-layer">
    <!-- 幽灵预览提示条 -->
    <Teleport to="body">
      <div v-if="preview.active" class="aite-ghost-tip">
        <template v-if="preview.streaming">
          <span class="aite-spin" />
          <span class="aite-ghost-mark">AI 输出中（{{ (preview.text || '').length }} 字）</span>
          <span class="aite-sep">·</span>
          <span class="aite-kbd">{{ acceptLabel }}</span>
          <span>采纳已输出部分</span>
          <span class="aite-sep">·</span>
          <span class="aite-kbd">{{ cancelLabel }}</span>
          <span>打断</span>
        </template>
        <template v-else>
          <span class="aite-ghost-mark">灰色预览中</span>
          <span class="aite-kbd">{{ acceptLabel }}</span>
          <span>采纳</span>
          <span class="aite-sep">·</span>
          <span class="aite-kbd">{{ cancelLabel }}</span>
          <span>取消</span>
        </template>
      </div>
    </Teleport>

    <!-- 功能选择（多个已激活功能且未指定默认时弹出） -->
    <Teleport to="body">
      <div
        v-if="picker.open"
        class="aite-picker"
        :style="{ left: picker.x + 'px', top: picker.y + 'px' }"
      >
        <div class="aite-picker-h">选择文字编辑功能</div>
        <div
          v-for="(f, i) in store.activeFunctions"
          :key="f.id"
          class="aite-picker-row"
          :class="{ active: i === picker.index }"
          @mouseenter="picker.index = i"
          @click="pickFn(f)"
        >{{ f.name }}</div>
        <div class="aite-picker-foot">↑↓ 选择 · Enter 确认 · Esc 取消</div>
      </div>
    </Teleport>

    <!-- 结果弹窗：右键入口即弹窗，流式输出 + 可打断 -->
    <FloatingWindow v-model:open="dlg.open" :title="dlgTitle" size="large">
      <div class="aite-dlg">
        <div class="aite-row">
          <label>原文（{{ dlg.mode === 'expand' ? '将被替换的选中内容' : '光标处上下文' }}）</label>
          <div class="aite-src">{{ dlg.source || '（无选中内容，AI 将根据光标前后文续写）' }}</div>
        </div>
        <div class="aite-row aite-grow">
          <label>
            AI 生成内容
            <span v-if="dlg.loading" class="aite-loading">
              <span class="aite-spin aite-spin-dark" />流式输出中…（{{ (dlg.text || '').length }} 字）
            </span>
            <span v-else class="aite-hint">可直接修改后再应用</span>
          </label>
          <textarea
            v-model="dlg.text"
            class="aite-out"
            :class="{ 'aite-out-streaming': dlg.loading }"
            spellcheck="false"
            :readonly="dlg.loading"
          />
        </div>
        <div v-if="dlg.error" class="aite-err">{{ dlg.error }}</div>
      </div>
      <template #footer>
        <button class="btn" @click="dlg.open = false">取消</button>
        <button v-if="dlg.loading" class="btn btn-danger" @click="stopDialogStream">■ 打断</button>
        <button v-else class="btn" :disabled="!dlg.text" @click="doCopy">复制</button>
        <button v-if="!dlg.loading" class="btn" @click="doRegen">重新生成</button>
        <template v-if="!dlg.loading">
          <button
            v-if="dlg.mode === 'expand'"
            class="btn btn-primary"
            :disabled="!dlg.text"
            @click="applyResult('insert')"
          >插入到后面</button>
          <button
            class="btn btn-primary"
            :disabled="!dlg.text"
            @click="applyResult('replace')"
          >{{ dlg.mode === 'expand' ? '替换选中' : '插入到光标' }}</button>
        </template>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
// src/components/common/AiTextEditLayer.vue
// 全局「AI 文字编辑」交互层（在 Desktop 挂载一次）：
//   ① 任意文本域右键 → 菜单列出所有已激活的文字编辑功能 → **立即弹窗，流式输出**，可打断 / 重新生成
//   ② 按住自定义修饰键达到设定时长 → 在光标处生成灰色预览（同样流式逐字出现，Tab 采纳 / Esc 打断）
//   ③ 两种入口都能落到同一个结果弹窗，由用户决定替换 / 插入 / 取消
import { reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useTextEditStore } from '@/stores/textEdit'
import { useConfigStore } from '@/stores/config'
import { useToast } from '@/shell/toast'
import { openContextMenu } from '@/shell/ctxmenu'
import FloatingWindow from '@/components/common/FloatingWindow.vue'
import {
  isTextField,
  readField,
  caretRect,
  insertIntoRange,
  unwrapNode,
  replaceNodeWithText,
  writeToField,
  setFieldSelection,
  notifyEditableChanged,
  createGhostOverlay,
  updateGhostOverlay,
  removeGhostOverlay,
} from '@/utils/textField'

const store = useTextEditStore()
const configStore = useConfigStore()
const toast = useToast()
// 大模型 API 是否连通（由连接 store 周期性探测并写回 configStore.isAIOnline）
const aiOnline = computed(() => !!configStore.isAIOnline)

// ---------- 幽灵预览状态 ----------
const preview = reactive({
  active: false,
  streaming: false,    // 正在流式输出
  el: null,
  kind: '',            // 'field' | 'editable'
  start: 0,            // field：AI 文本将写入的区间（选区或光标点）
  end: 0,
  origStart: 0,        // 原选区（取消时恢复用）
  origEnd: 0,
  original: '',        // 原选中文本
  span: null,          // editable：包裹预览文本的元素
  text: '',            // 当前已流式输出的 AI 文本（采纳时写回正文）
  beforeText: '',      // field：光标前正文（悬浮层隐形占位用）
  strikeText: '',      // field：扩写模式下被替换的原文（悬浮层画删除线）
})
let ghostCtl = null    // 幽灵流式的 AbortController

// ---------- 结果弹窗 ----------
const dlg = reactive({
  open: false,
  fn: null,
  mode: 'continue',    // 'continue' | 'expand'
  source: '',
  text: '',
  error: '',
  loading: false,
  ctl: null,           // 流式 AbortController
  el: null,
  start: 0,
  end: 0,
  range: null,
  st: null,
})
const dlgTitle = computed(() => (dlg.fn ? `AI 文字编辑 — ${dlg.fn.name}` : 'AI 文字编辑'))
// 关窗即打断（含右上角 × 与「取消」按钮）
watch(() => dlg.open, (v) => {
  if (!v && dlg.ctl) {
    dlg.ctl.abort()
    dlg.ctl = null
    dlg.loading = false
  }
})

// ---------- 功能选择浮层 ----------
const picker = reactive({ open: false, x: 0, y: 0, index: 0, el: null, st: null })

// 功能较多时，键盘移动的高亮项自动滚进可视区
watch(() => picker.index, () => {
  nextTick(() => {
    const row = document.querySelector('.aite-picker .aite-picker-row.active')
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' })
  })
})

const MOD_KEYS = { ctrl: 'Control', alt: 'Alt', shift: 'Shift' }
const acceptLabel = computed(() => (store.settings.acceptKey === ' ' ? '空格' : store.settings.acceptKey))
const cancelLabel = computed(() => store.settings.cancelKey)

function tail(s, n) {
  const v = String(s || '')
  return v.length > n ? v.slice(-n) : v
}
function head(s, n) {
  const v = String(s || '')
  return v.length > n ? v.slice(0, n) : v
}
function buildPayload(st, mode) {
  const ctx = Number(store.settings.contextChars) || 500
  return {
    mode,
    selectedText: st.selected,
    beforeText: tail(st.before, ctx),
    afterText: head(st.after, ctx),
  }
}

// ==================== 核心：调用某个功能 ====================
// useGhost 显式指定：右键入口恒为 false（要求"先弹窗看内容再决定"），
// 快捷键入口才跟随设置里的「先出灰色预览」。
async function runFor(fn, el, st, useGhost = null) {
  if (!fn) return
  if (dlg.loading || preview.streaming) {
    toast.show('已有文字编辑任务在生成中，请先处理', 'info')
    return
  }
  const mode = st.selected && st.selected.trim() ? 'expand' : 'continue'
  const ghost = useGhost == null ? !!store.settings.ghostEnabled : !!useGhost
  if (ghost) startGhostStream(fn, el, st, mode)
  else {
    openDialog(fn, el, st, mode, '')
    streamDialog()
  }
}

// ==================== 结果弹窗：流式生成 ====================
async function streamDialog() {
  if (!dlg.fn || !dlg.st) return
  dlg.loading = true
  dlg.error = ''
  dlg.text = ''
  const ctl = new AbortController()
  dlg.ctl = ctl
  try {
    const text = await store.runFunctionStream(dlg.fn, buildPayload(dlg.st, dlg.mode), {
      signal: ctl.signal,
      onDelta: (full) => { dlg.text = full },
    })
    dlg.text = text || dlg.text
    if (!dlg.text) dlg.error = 'AI 未返回任何内容，可点击「重新生成」重试'
  } catch (e) {
    if (dlg.text) {
      // 打断后仍有部分内容，保留给用户处理
      dlg.error = '已打断，保留已生成的部分内容'
    } else {
      dlg.error = '生成失败：' + (e?.message || e)
    }
  } finally {
    dlg.loading = false
    dlg.ctl = null
  }
}

function stopDialogStream() {
  if (dlg.ctl) dlg.ctl.abort()
}

async function doRegen() {
  if (!dlg.fn || !dlg.st || dlg.loading) return
  await streamDialog()
}

// ==================== 幽灵预览：流式生成 ====================
async function startGhostStream(fn, el, st, mode) {
  try { el.focus() } catch { /* ignore */ }
  insertGhost(el, st, '')
  preview.streaming = true
  const ctl = new AbortController()
  ghostCtl = ctl

  let raf = 0
  let pending = ''
  const flush = () => {
    raf = 0
    if (preview.active && pending != null) updateGhostText(pending)
  }
  try {
    const text = await store.runFunctionStream(fn, buildPayload(st, mode), {
      signal: ctl.signal,
      onDelta: (full) => {
        pending = full
        if (!raf) raf = requestAnimationFrame(flush)
      },
    })
    if (raf) cancelAnimationFrame(raf)
    if (text && preview.active) {
      updateGhostText(text)
      preview.streaming = false
    } else if (!text && preview.active) {
      cancelPreview()
      toast.show('AI 未返回内容', 'error')
    }
    // text 有值且 preview.active：保持预览，等用户 Tab 采纳 / Esc 取消
  } catch (e) {
    if (raf) cancelAnimationFrame(raf)
    cancelPreview()
    toast.show('AI 文字编辑失败：' + (e?.message || e), 'error')
  } finally {
    preview.streaming = false
    ghostCtl = null
  }
}

// 把流式累积文本刷新进灰色预览（不重建节点，只改内容）
function updateGhostText(text) {
  if (!preview.active || !preview.el) return
  preview.text = text
  const el = preview.el
  if (preview.kind === 'editable') {
    if (preview.span) {
      preview.span.textContent = text
      notifyEditableChanged(el)
    }
  } else {
    // textarea/input：正文不动，刷新悬浮镜像层（顺带跟随滚动与窗口变化）
    updateGhostOverlay({
      beforeText: preview.beforeText,
      strikeText: preview.strikeText,
      ghostText: text,
    })
  }
}

// ---------- 内联灰色预览 ----------
// field（input/textarea）：正文完全不动，AI 文本画在悬浮镜像层里（灰色斜体），
//   原生光标保持在原位闪烁，用户始终看得到光标在哪。
// editable（contenteditable）：在光标处插灰色 span（该 DOM 本就允许运行时节点）。
function insertGhost(el, st, text) {
  try { el.focus() } catch { /* ignore */ }
  if (st.kind === 'editable') {
    const sel = window.getSelection()
    if (!sel) return
    if (st.range) {
      sel.removeAllRanges()
      sel.addRange(st.range)
    }
    if (!sel.rangeCount) return
    const r = sel.getRangeAt(0)
    // 扩写：先吃掉选区，预览文本整体替代它
    if (!r.collapsed) r.deleteContents()
    const span = document.createElement('span')
    span.className = 'ai-ghost'
    span.setAttribute('data-ai-ghost', '1')
    insertIntoRange(r, text, span)
    const s2 = window.getSelection()
    const rr = document.createRange()
    rr.setStartAfter(span)
    rr.collapse(true)
    s2.removeAllRanges()
    s2.addRange(rr)
    notifyEditableChanged(el)
    preview.active = true
    preview.el = el
    preview.kind = 'editable'
    preview.span = span
    preview.original = st.selected || ''
    preview.text = text
  } else {
    createGhostOverlay(el)
    preview.active = true
    preview.el = el
    preview.kind = 'field'
    preview.start = st.start
    preview.end = st.end
    preview.origStart = st.start
    preview.origEnd = st.end
    preview.original = st.selected || ''
    preview.beforeText = (el.value || '').slice(0, st.start)
    preview.strikeText = st.selected || '' // 扩写模式：悬浮层把原文画删除线
    preview.text = text
    updateGhostOverlay({
      beforeText: preview.beforeText,
      strikeText: preview.strikeText,
      ghostText: text,
    })
  }
}

function acceptPreview() {
  if (!preview.active) return false
  if (ghostCtl) { ghostCtl.abort(); ghostCtl = null }   // 打断流式，采纳已输出部分
  const el = preview.el
  const text = preview.text || ''
  if (!el) { clearPreview(); return false }
  if (preview.kind === 'editable') {
    const last = unwrapNode(preview.span)
    if (last) {
      const r = document.createRange()
      r.setStartAfter(last)
      r.collapse(true)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
    }
    notifyEditableChanged(el)
  } else {
    // 此时才第一次把 AI 文本写进正文，光标落在采纳内容的末尾
    if (text) {
      const { end } = writeToField(el, preview.start, preview.end, text, 'replace')
      setFieldSelection(el, end, end)
    }
  }
  clearPreview()
  return true
}

function cancelPreview() {
  if (!preview.active) return false
  if (ghostCtl) { ghostCtl.abort(); ghostCtl = null }
  const el = preview.el
  if (!el) { clearPreview(); return false }
  if (preview.kind === 'editable') {
    // 扩写模式下原文已被删除，取消要把原文放回去
    replaceNodeWithText(preview.span, preview.original || '')
    notifyEditableChanged(el)
  }
  // field：正文从未被改动，无需恢复，摘掉悬浮层即可
  clearPreview()
  return true
}

function clearPreview() {
  preview.active = false
  preview.streaming = false
  preview.el = null
  preview.kind = ''
  preview.span = null
  preview.original = ''
  preview.text = ''
  preview.beforeText = ''
  preview.strikeText = ''
  removeGhostOverlay()
}

// ==================== 结果弹窗 ====================
function openDialog(fn, el, st, mode, text) {
  dlg.fn = fn
  dlg.mode = mode
  dlg.source = st.selected || ''
  dlg.text = text || ''
  dlg.error = ''
  dlg.el = el
  dlg.start = st.start
  dlg.end = st.end
  dlg.range = st.range
  dlg.st = st
  dlg.open = true
}

async function doCopy() {
  try {
    await navigator.clipboard.writeText(dlg.text || '')
    toast.show('已复制到剪贴板', 'success')
  } catch {
    toast.show('复制失败，请手动选中复制', 'error')
  }
}

function applyResult(how) {
  if (dlg.loading) return
  const el = dlg.el
  const text = dlg.text || ''
  if (!el || !document.contains(el)) {
    toast.show('原编辑位置已失效，请重新操作', 'error')
    dlg.open = false
    return
  }
  try { el.focus() } catch { /* ignore */ }
  if (dlg.range) {
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(dlg.range)
    const r = sel.getRangeAt(0)
    if (how === 'replace') {
      if (!r.collapsed) r.deleteContents()
    } else {
      r.collapse(false)
    }
    const last = insertIntoRange(r, text)
    if (last) {
      const rr = document.createRange()
      rr.setStartAfter(last)
      rr.collapse(true)
      sel.removeAllRanges()
      sel.addRange(rr)
    }
    notifyEditableChanged(el)
  } else {
    const { end } = writeToField(el, dlg.start, dlg.end, text, how === 'replace' ? 'replace' : 'insert')
    setFieldSelection(el, end, end)
  }
  dlg.open = false
  toast.show(how === 'replace' ? '已替换选中内容' : '已插入到光标处', 'success')
}

// ==================== 快捷键触发 ====================
let holdTimer = null
function startHold() {
  if (holdTimer) return
  const ms = Number(store.settings.holdMs) || 600
  holdTimer = setTimeout(() => {
    holdTimer = null
    triggerByHotkey()
  }, ms)
}
function cancelHold() {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
  }
}

async function triggerByHotkey() {
  if (preview.active) return
  // 未连接大模型 API：快捷键不弹出任何功能（与右键菜单一致）
  if (!aiOnline.value) {
    toast.show('未连接大模型 API，无法使用文字编辑（请在「设置」中连接）', 'info')
    return
  }
  const el = document.activeElement
  if (!isTextField(el)) return
  const fn = store.defaultFunction
  const st = readField(el)
  if (!fn) {
    if (!store.activeFunctions.length) {
      toast.show('功能库里还没有已激活的「文字编辑」功能', 'info')
      return
    }
    openPicker(el, st)
    return
  }
  await runFor(fn, el, st)
}

function openPicker(el, st) {
  const p = caretRect(el)
  const n = store.activeFunctions.length
  // 浮层实际高度：标题 + n 行 + 底部提示 + 内边距
  const h = 20 + n * 30 + 26 + 12
  const w = 240
  // 优先弹在光标下方，下方放不下就翻到光标上方
  let top = p.bottom + 6
  if (top + h > window.innerHeight - 8) top = Math.max(8, p.top - h - 6)
  picker.el = el
  picker.st = st
  picker.index = 0
  picker.x = Math.min(Math.max(8, p.left - 4), Math.max(8, window.innerWidth - w - 8))
  picker.y = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - h - 8))
  picker.open = true
}
function pickFn(fn) {
  picker.open = false
  const el = picker.el
  const st = picker.st
  picker.el = null
  picker.st = null
  if (!el || !st) return
  runFor(fn, el, st)
}
function closePicker() {
  picker.open = false
  picker.el = null
  picker.st = null
  picker.index = 0
}
// 键盘上下选择 + 回车确认（页面级捕获，避免按键落到输入框里）
function onPickerKey(e) {
  const n = store.activeFunctions.length
  if (!n) return false
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    const step = e.key === 'ArrowDown' ? 1 : -1
    picker.index = (picker.index + step + n) % n
    return true
  }
  if (e.key === 'Home') {
    e.preventDefault(); e.stopPropagation(); picker.index = 0; return true
  }
  if (e.key === 'End') {
    e.preventDefault(); e.stopPropagation(); picker.index = n - 1; return true
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    e.stopPropagation()
    pickFn(store.activeFunctions[picker.index])
    return true
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closePicker()
    return true
  }
  return false
}

function isPrintable(e) {
  return e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
}

function onKeyDown(e) {
  const st = store.settings
  if (!st.enabled) return

  // 0) 功能选择浮层打开时：↑↓ 选择 / Enter 确认 / Esc 取消
  if (picker.open && onPickerKey(e)) return

  // 1) 幽灵预览期间：采纳 / 打断取消 / 继续输入
  if (preview.active) {
    if (e.key === st.acceptKey) {
      e.preventDefault()
      e.stopPropagation()
      acceptPreview()
      return
    }
    if (e.key === st.cancelKey) {
      e.preventDefault()
      e.stopPropagation()
      cancelPreview()
      return
    }
    if (isPrintable(e) || e.key === 'Enter' || e.key === 'Backspace') {
      // 用户直接开始输入：打断流式并保留已生成的内容，按"采纳"处理
      acceptPreview()
    }
    return
  }

  // 2) 按住触发
  if (!st.holdEnabled) return
  const wantKey = MOD_KEYS[st.holdKey] || 'Control'
  if (e.key === wantKey) {
    if (e.repeat) return
    const loc = e.location // 1=左 2=右
    const ok =
      st.holdSide === 'either' ||
      (st.holdSide === 'left' && loc === 1) ||
      (st.holdSide === 'right' && loc === 2)
    if (ok) startHold()
    return
  }
  // 组合键（Ctrl+C 之类）不触发
  cancelHold()
}

function onKeyUp(e) {
  const wantKey = MOD_KEYS[store.settings.holdKey] || 'Control'
  if (e.key === wantKey) cancelHold()
}

// ==================== 右键菜单 ====================
function onDocContextMenu(e) {
  const st = store.settings
  if (!st.enabled || !st.ctxMenuEnabled) return
  const el = e.target
  if (!isTextField(el)) return
  if (document.activeElement !== el) {
    try { el.focus() } catch { /* ignore */ }
  }
  const fns = store.activeFunctions
  const hasSel = !!String(readField(el).selected || '').trim()
  let sub
  if (!aiOnline.value) {
    // 未连接大模型 API：菜单项置灰并提示，不可点击
    sub = [{ label: '需连接大模型 API 才能使用', disabled: true }]
  } else if (fns.length) {
    sub = fns.map((f) => ({
      label: f.name,
      shortcut: hasSel ? '改写选中' : '光标续写',
      onClick: () => {
        const state = readField(el)
        // 右键一律弹结果窗，由用户看完再决定替换 / 插入 / 取消
        runFor(f, el, state, false)
      },
    }))
  } else {
    sub = [{ label: '功能库暂无已激活的「文字编辑」功能', disabled: true }]
  }

  const items = [
    { label: aiOnline.value ? (hasSel ? 'AI 文字编辑（改写选中）' : 'AI 文字编辑（光标处续写）') : 'AI 文字编辑（未连接）', sub },
    { sep: true },
    { label: '撤销', shortcut: 'Ctrl+Z', onClick: () => execCmd('undo') },
    { label: '重做', shortcut: 'Ctrl+Y', onClick: () => execCmd('redo') },
    { sep: true },
    { label: '剪切', shortcut: 'Ctrl+X', onClick: () => execCmd('cut') },
    { label: '复制', shortcut: 'Ctrl+C', onClick: () => execCmd('copy') },
    { label: '粘贴', shortcut: 'Ctrl+V', onClick: () => execCmd('paste') },
    { label: '全选', shortcut: 'Ctrl+A', onClick: () => execCmd('selectAll') },
  ]
  e.preventDefault()
  e.stopPropagation()
  openContextMenu(items, e)
}

function execCmd(cmd) {
  try { document.execCommand(cmd) } catch { /* ignore */ }
}

function onDocMouseDown(e) {
  // 点功能选择浮层之外就关掉它
  if (picker.open && !(e.target && e.target.closest && e.target.closest('.aite-picker'))) closePicker()
  // 灰色预览未确认就点了别处：按"取消"处理（含打断流式），避免把未确认的 AI 内容留在正文里
  if (preview.active) cancelPreview()
}

function onWindowBlur() {
  cancelHold()
  closePicker()
}

// 悬浮层跟随滚动 / 窗口缩放（流式刷新本身也会重算位置，这里覆盖不输出的时刻）
function repositionGhost() {
  if (preview.active && preview.kind === 'field') {
    updateGhostOverlay({
      beforeText: preview.beforeText,
      strikeText: preview.strikeText,
      ghostText: preview.text,
    })
  }
}

function onRefresh() {
  store.loadSettings()
  store.loadFunctions()
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('contextmenu', onDocContextMenu, true)
  document.addEventListener('mousedown', onDocMouseDown, true)
  document.addEventListener('scroll', repositionGhost, true)
  window.addEventListener('resize', repositionGhost)
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('ai-textedit-refresh', onRefresh)
  store.loadSettings()
  store.loadFunctions()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('contextmenu', onDocContextMenu, true)
  document.removeEventListener('mousedown', onDocMouseDown, true)
  document.removeEventListener('scroll', repositionGhost, true)
  window.removeEventListener('resize', repositionGhost)
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('ai-textedit-refresh', onRefresh)
  cancelHold()
  if (ghostCtl) ghostCtl.abort()
  if (dlg.ctl) dlg.ctl.abort()
  removeGhostOverlay()
})
</script>

<style scoped>
.aite-dlg {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 320px;
}
.aite-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.aite-grow {
  flex: 1;
  min-height: 0;
}
.aite-row label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.aite-hint {
  font-weight: 400;
  font-size: 11px;
  color: var(--text-secondary);
}
.aite-loading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 400;
  font-size: 11px;
  color: var(--accent, #0067c0);
}
.aite-src {
  max-height: 110px;
  overflow: auto;
  padding: 8px 10px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.aite-out {
  flex: 1;
  min-height: 200px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.8;
  font-family: inherit;
  resize: none;
}
.aite-out-streaming {
  opacity: 0.85;
}
.aite-err {
  color: #ef4444;
  font-size: 12px;
}
.btn-danger {
  background: #ef4444;
  color: #fff;
  border-color: #ef4444;
}
.btn-danger:hover {
  background: #dc2626;
}
</style>

<!-- 幽灵预览与浮层是运行时插进别人 DOM 的，不能用 scoped -->
<style>
.ai-ghost {
  color: var(--text-secondary, #888);
  background: rgba(128, 128, 128, 0.12);
  border-radius: 3px;
  font-style: italic;
}
/* textarea/input 悬浮镜像层里的 AI 文本：灰色斜体 + 左侧竖线标记起点，与正文一眼区分 */
.ai-ghost-inline {
  color: #8a8f98;
  font-style: italic;
  background: rgba(0, 103, 192, 0.07);
  box-shadow: inset 2px 0 0 rgba(0, 103, 192, 0.45);
  padding-left: 2px;
}
[data-theme='dark'] .ai-ghost-inline {
  color: #9aa3ad;
  background: rgba(102, 170, 255, 0.10);
  box-shadow: inset 2px 0 0 rgba(102, 170, 255, 0.5);
}
.aite-spin {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: aite-rotate 0.8s linear infinite;
  display: inline-block;
  flex: none;
}
.aite-spin-dark {
  border-color: rgba(0, 103, 192, 0.25);
  border-top-color: var(--accent, #0067c0);
  width: 11px;
  height: 11px;
}
@keyframes aite-rotate {
  to { transform: rotate(360deg); }
}
.aite-ghost-tip {
  position: fixed;
  left: 50%;
  bottom: 64px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(32, 32, 36, 0.92);
  color: #fff;
  font-size: 11px;
  z-index: 99000;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}
.aite-ghost-mark { color: #ffd479; font-weight: 600; }
.aite-kbd {
  padding: 1px 6px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 4px;
  font-family: inherit;
}
.aite-sep { opacity: 0.5; }
.aite-picker {
  position: fixed;
  width: 240px;
  max-height: 340px;
  overflow-y: auto;
  background: var(--ctx-bg, rgba(249, 249, 249, 0.96));
  border: 1px solid var(--border-color, #d8d8d8);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
  padding: 6px;
  z-index: 98500;
  font-size: 13px;
  color: var(--text-primary, #1f2937);
}
[data-theme='dark'] .aite-picker {
  --ctx-bg: rgba(40, 40, 44, 0.96);
  color: #e8e8e8;
  border-color: #3a3a3e;
}
.aite-picker-h {
  padding: 4px 8px 6px;
  font-size: 11px;
  color: var(--text-secondary);
}
.aite-picker-row {
  padding: 7px 10px;
  border-radius: 5px;
  cursor: pointer;
}
.aite-picker-row:hover { background: var(--accent-soft, rgba(0, 103, 192, 0.12)); }
.aite-picker-row.active {
  background: var(--accent, #0067c0);
  color: #fff;
}
[data-theme='dark'] .aite-picker-row.active { color: #fff; }
.aite-picker-foot {
  padding: 6px 8px 2px;
  font-size: 10px;
  color: var(--text-secondary);
  border-top: 1px solid var(--border-color, #e0e0e0);
  margin-top: 4px;
}
</style>
