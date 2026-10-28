// src/utils/textField.js
// 把「输入框 / 文本域 / contenteditable」三种可编辑目标抽象成同一套读写接口，
// 供 AI 文字编辑功能在任意可输入文字的地方取上下文、插入预览、替换正文。
// 之所以单独成文件：这些逻辑纯 DOM、无 Vue 依赖，方便结果弹窗与快捷键两条链路共用。

const FIELD_TYPES = ['text', 'search', 'url', 'tel', 'password', 'email', 'number']

/** 判断元素是否是可输入文字的目标 */
export function isTextField(el) {
  if (!el || el.nodeType !== 1) return false
  if (el.isContentEditable) return true
  const tag = (el.tagName || '').toUpperCase()
  if (tag === 'TEXTAREA') return true
  if (tag === 'INPUT') {
    const t = (el.type || 'text').toLowerCase()
    return FIELD_TYPES.includes(t)
  }
  return false
}

/** 'field' = input/textarea；'editable' = contenteditable */
export function fieldKind(el) {
  return el && el.isContentEditable ? 'editable' : 'field'
}

function currentRange(el) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return null
  const r = sel.getRangeAt(0)
  if (!r || !el.contains(r.startContainer)) return null
  return r
}

/** 取一个落在 el 内的 range；选区不在 el 里时退化为 el 末尾（相当于在最后续写） */
function resolveRange(el) {
  const r = currentRange(el)
  if (r) return r
  try {
    const fallback = document.createRange()
    fallback.selectNodeContents(el)
    fallback.collapse(false)
    return fallback
  } catch { return null }
}

/**
 * 读取目标当前的选区与上下文。
 * @returns {{kind:string, selected:string, before:string, after:string, start:number, end:number, range:Range|null}}
 */
export function readField(el) {
  const kind = fieldKind(el)
  if (kind === 'editable') {
    const r = resolveRange(el)
    const selected = r ? String(r.toString()) : ''
    let before = ''
    let after = ''
    if (r) {
      try {
        const rb = document.createRange()
        rb.setStart(el, 0)
        rb.setEnd(r.startContainer, r.startOffset)
        before = String(rb.toString())
      } catch { before = '' }
      try {
        const ra = document.createRange()
        ra.setStart(r.endContainer, r.endOffset)
        ra.setEnd(el, el.childNodes.length)
        after = String(ra.toString())
      } catch { after = '' }
    }
    return { kind, selected, before, after, start: 0, end: 0, range: r ? r.cloneRange() : null }
  }
  const v = el.value || ''
  const s = el.selectionStart == null ? v.length : el.selectionStart
  const e = el.selectionEnd == null ? s : el.selectionEnd
  return {
    kind,
    selected: v.slice(s, e),
    before: v.slice(0, s),
    after: v.slice(e),
    start: s,
    end: e,
    range: null,
  }
}

export function getSelectedText(el) {
  if (!el) return ''
  return readField(el).selected || ''
}

/** 写回值并触发 Vue / 原生监听（input + change 都发，兼容 v-model 与 .lazy） */
export function setFieldValue(el, val) {
  el.value = val
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function makeTextFragment(text, host) {
  const frag = document.createDocumentFragment()
  const lines = String(text).split(/\r?\n/)
  lines.forEach((ln, i) => {
    if (i > 0) frag.appendChild(document.createElement('br'))
    if (ln) frag.appendChild(document.createTextNode(ln))
  })
  return frag
}

function placeCaretAfter(node) {
  const sel = window.getSelection()
  if (!sel || !node) return
  const r = document.createRange()
  r.setStartAfter(node)
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
}

/**
 * 在 contenteditable 的指定 range 处插入文本。
 * @param {Range} range 会被就地修改
 * @param {string} text
 * @param {HTMLElement|null} wrapper 非空时把内容包进该元素（幽灵预览用）
 * @returns {Node|null} 最后插入的节点
 */
export function insertIntoRange(range, text, wrapper = null) {
  const frag = makeTextFragment(text)
  const nodes = Array.from(frag.childNodes)
  if (!nodes.length) return null
  let host = frag
  let inserted = nodes
  if (wrapper) {
    wrapper.appendChild(frag)
    host = wrapper
    inserted = [wrapper]
  }
  range.insertNode(host)
  return inserted[inserted.length - 1]
}

/** 把 wrapper 元素解包，保留其中的内容（采纳预览） */
export function unwrapNode(wrapper) {
  if (!wrapper || !wrapper.parentNode) return null
  const parent = wrapper.parentNode
  const nodes = Array.from(wrapper.childNodes)
  nodes.forEach((n) => parent.insertBefore(n, wrapper))
  parent.removeChild(wrapper)
  return nodes.length ? nodes[nodes.length - 1] : null
}

/**
 * 用一段文本整体替换某个节点（取消扩写预览时把原文放回去）。
 * text 为空则等同于删除节点。
 */
export function replaceNodeWithText(node, text) {
  if (!node || !node.parentNode) return null
  const parent = node.parentNode
  if (!String(text || '')) {
    removeNodeKeepCaret(node)
    return null
  }
  const frag = makeTextFragment(text)
  const nodes = Array.from(frag.childNodes)
  parent.insertBefore(frag, node)
  parent.removeChild(node)
  const last = nodes[nodes.length - 1]
  placeCaretAfter(last)
  return last
}

/** 删除节点并把光标放回它原来的位置（取消预览） */
export function removeNodeKeepCaret(node) {
  if (!node) return
  const parent = node.parentNode
  if (!parent) return
  const next = node.nextSibling
  parent.removeChild(node)
  const sel = window.getSelection()
  if (!sel) return
  const r = document.createRange()
  try {
    if (next) r.setStartBefore(next)
    else r.setStart(parent, parent.childNodes.length)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
  } catch { /* ignore */ }
}

/** 给 contenteditable 派发 input，触发应用自身的脏标记 / 自动保存 */
export function notifyEditableChanged(el) {
  if (!el) return
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * 在 input/textarea 的 [start,end] 处写入文本。
 * how='replace' 替换该区间；how='insert' 插入到区间末尾。
 * @returns {{start:number,end:number}} 写入文本所在区间
 */
export function writeToField(el, start, end, text, how = 'replace') {
  const v = el.value || ''
  let s = Math.max(0, Math.min(start, v.length))
  let e = Math.max(s, Math.min(end, v.length))
  if (how === 'insert') s = e
  const next = v.slice(0, s) + text + v.slice(e)
  setFieldValue(el, next)
  return { start: s, end: s + text.length }
}

export function setFieldSelection(el, start, end) {
  try { el.setSelectionRange(start, end) } catch { /* ignore */ }
  try { el.focus() } catch { /* ignore */ }
}

// ==================== 幽灵补全悬浮层（input/textarea 专用） ====================
// textarea 无法像 contenteditable 那样插灰色 span，直接改 value 又会把 AI 文本写进正文
// （自动保存可能把未确认内容存库）。所以用「覆盖镜像层」：正文不动，
// 在 textarea 正上方画一个同字体的镜像，光标前的原文隐形占位，AI 文本画成灰色斜体。

let ghostOverlay = null // { wrap, mirror, hidden, strike, ghost, el }

function ghostMirror(el) {
  const cs = window.getComputedStyle(el)
  const isTextarea = (el.tagName || '').toUpperCase() === 'TEXTAREA'
  const mirror = document.createElement('div')
  MIRROR_PROPS.forEach((p) => { mirror.style[p] = cs[p] })
  mirror.style.position = 'absolute'
  mirror.style.left = '0'
  mirror.style.top = '0'
  mirror.style.margin = '0'
  mirror.style.border = 'none'
  mirror.style.outline = 'none'
  mirror.style.background = 'transparent'
  mirror.style.color = 'transparent'
  mirror.style.whiteSpace = isTextarea ? 'pre-wrap' : 'pre'
  mirror.style.wordWrap = 'break-word'
  mirror.style.overflowWrap = 'break-word'
  mirror.style.width = cs.width
  mirror.style.height = 'auto'
  mirror.style.minHeight = '0'
  return { mirror, cs, isTextarea }
}

/**
 * 在 el（input/textarea）上方创建幽灵补全覆盖层。
 * @returns {Object} { ghost, strike } 两个 span，供后续 updateGhostOverlay 填内容
 */
export function createGhostOverlay(el) {
  removeGhostOverlay()
  const r = el.getBoundingClientRect()
  const wrap = document.createElement('div')
  wrap.className = 'aite-ghost-overlay'
  Object.assign(wrap.style, {
    position: 'fixed',
    left: r.left + 'px',
    top: r.top + 'px',
    width: r.width + 'px',
    height: r.height + 'px',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '98900',
  })
  const { mirror, cs } = ghostMirror(el)
  const hidden = document.createElement('span')
  hidden.style.visibility = 'hidden' // 隐形占位：把幽灵推到光标处
  const strike = document.createElement('span') // 扩写模式：被替换的原文画删除线
  strike.style.textDecoration = 'line-through'
  strike.style.opacity = '0.55'
  strike.style.background = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '#fff' // 盖住下面的蓝色选区
  const ghost = document.createElement('span')
  ghost.className = 'ai-ghost-inline'
  mirror.appendChild(hidden)
  mirror.appendChild(strike)
  mirror.appendChild(ghost)
  wrap.appendChild(mirror)
  document.body.appendChild(wrap)
  ghostOverlay = { wrap, mirror, hidden, strike, ghost, el }
  return ghostOverlay
}

/** 刷新悬浮层内容与位置（流式增量时反复调用；顺带跟随滚动/窗口变化） */
export function updateGhostOverlay({ beforeText = '', strikeText = '', ghostText = '' }) {
  if (!ghostOverlay) return
  const { wrap, mirror, hidden, strike, ghost, el } = ghostOverlay
  hidden.textContent = beforeText
  strike.textContent = strikeText || ''
  ghost.textContent = ghostText || ''
  // 跟随元素当前位置与内部滚动
  const r = el.getBoundingClientRect()
  wrap.style.left = r.left + 'px'
  wrap.style.top = r.top + 'px'
  mirror.style.transform = `translate(${-el.scrollLeft || 0}px, ${-el.scrollTop || 0}px)`
}

export function ghostOverlaySpan() {
  return ghostOverlay ? ghostOverlay.ghost : null
}

export function removeGhostOverlay() {
  if (ghostOverlay) {
    try { ghostOverlay.wrap.remove() } catch { /* ignore */ }
    ghostOverlay = null
  }
}

/**
 * 取光标/选区在屏幕上的位置（视口坐标），用于把功能选择框弹在光标处。
 * - contenteditable：直接用 Range 的矩形
 * - input/textarea：没有原生 API 拿光标坐标，用「镜像 div」复刻字体与换行规则后测量标记点偏移
 * @returns {{left:number, top:number, bottom:number}}
 */
// 复刻这些属性，镜像 div 的换行/缩进才和真实输入框一致
const MIRROR_PROPS = [
  'direction', 'boxSizing', 'width', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch',
  'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
  'textAlign', 'textTransform', 'textIndent', 'textDecoration',
  'letterSpacing', 'wordSpacing', 'tabSize',
  'whiteSpace', 'wordBreak', 'overflowWrap',
]

function mirrorCaret(el, pos) {
  const cs = window.getComputedStyle(el)
  const isTextarea = (el.tagName || '').toUpperCase() === 'TEXTAREA'
  const div = document.createElement('div')
  MIRROR_PROPS.forEach((p) => { div.style[p] = cs[p] })
  div.style.position = 'absolute'
  div.style.top = '0'
  div.style.left = '-9999px'
  div.style.visibility = 'hidden'
  div.style.height = 'auto'
  div.style.minHeight = '0'
  // 换行规则必须和真实控件一致：textarea 保留换行，input 不换行
  div.style.whiteSpace = isTextarea ? 'pre-wrap' : 'pre'
  div.style.wordWrap = 'break-word'
  div.style.overflowWrap = 'break-word'
  div.style.width = cs.width

  div.textContent = String(el.value || '').slice(0, pos)
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  div.appendChild(marker)
  document.body.appendChild(div)
  const relLeft = marker.offsetLeft
  const relTop = marker.offsetTop
  const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 20
  document.body.removeChild(div)

  const r = el.getBoundingClientRect()
  const left = r.left + relLeft - (el.scrollLeft || 0)
  const top = r.top + relTop - (el.scrollTop || 0)
  return { left, top, bottom: top + lineH }
}

export function caretRect(el) {
  if (!el) return { left: 200, top: 200, bottom: 220 }
  if (el.isContentEditable) {
    const r = currentRange(el)
    if (r) {
      const rect = r.getBoundingClientRect()
      if (rect && (rect.left || rect.top || rect.bottom)) {
        return { left: rect.left, top: rect.top, bottom: rect.bottom }
      }
      // 选区折叠时矩形可能是 0 尺寸，退化用起始节点插一个零宽标记再量
      const probe = document.createElement('span')
      probe.textContent = '\u200b'
      const rr = r.cloneRange()
      rr.insertNode(probe)
      const pr = probe.getBoundingClientRect()
      const last = probe.previousSibling || probe.parentNode
      probe.remove()
      try {
        rr.setStartAfter(last)
        rr.collapse(true)
      } catch { /* ignore */ }
      if (pr && (pr.left || pr.top)) return { left: pr.left, top: pr.top, bottom: pr.bottom }
    }
    const rect = el.getBoundingClientRect()
    return { left: rect.left, top: rect.top, bottom: rect.top + 22 }
  }
  const v = el.value || ''
  const pos = el.selectionStart == null ? v.length : el.selectionStart
  return mirrorCaret(el, pos)
}
