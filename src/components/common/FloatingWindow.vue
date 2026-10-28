<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fw-window"
      :class="[`fw-size-${size}`, { 'is-focused': isFocused, 'fw-no-drag': !draggable }, attrs.class]"
      :style="windowStyle"
      @mousedown="onFocus"
    >
      <div
        class="fw-header"
        @mousedown="startDrag"
        @dblclick="center"
      >
        <slot name="header">
          <span class="fw-title">{{ title }}</span>
        </slot>
        <button
          v-if="closable"
          type="button"
          class="fw-close"
          @click.stop="close"
          title="关闭"
        >×</button>
      </div>
      <div class="fw-body">
        <slot />
      </div>
      <div v-if="$slots.footer" class="fw-footer">
        <slot name="footer" />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, useId, onBeforeUnmount, useAttrs } from 'vue'
import { useWindowManager } from '@/stores/windowManager'

// FloatingWindow 以 <Teleport> 为模板根节点，Vue 默认的 attrs 透传会把
// 调用方传入的 class 应用到 Teleport（不渲染 DOM 元素），导致 class 丢失。
// 因此显式关闭 inheritAttrs，并把传入的 class 绑定到内部 div.fw-window 上。
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  size: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'large', 'xlarge', 'confirm'].includes(v)
  },
  draggable: { type: Boolean, default: true },
  initialX: { type: Number, default: null },
  initialY: { type: Number, default: null },
  closable: { type: Boolean, default: true },
  closeOnOutsideClick: { type: Boolean, default: false }
})

const emit = defineEmits(['update:open', 'close', 'focus'])

const windowManager = useWindowManager()
const windowId = useId()

const x = ref(0)
const y = ref(0)
const zIndex = ref(windowManager.claimZ())
const isFocused = ref(false)
const hasPositioned = ref(false)

const windowStyle = computed(() => ({
  left: x.value + 'px',
  top: y.value + 'px',
  zIndex: zIndex.value
}))

function onFocus() {
  zIndex.value = windowManager.claimZ()
  windowManager.focus(windowId)
  isFocused.value = true
  emit('focus')
}

function close() {
  emit('update:open', false)
  emit('close')
}

function center() {
  const w = window.innerWidth
  const h = window.innerHeight
  const el = document.querySelector(`[data-fw-id="${windowId}"]`)
  let width = 600, height = 400
  if (el) {
    const rect = el.getBoundingClientRect()
    width = rect.width
    height = rect.height
  }
  x.value = Math.max(0, (w - width) / 2)
  y.value = Math.max(0, (h - height) / 2)
}

function startPositioning() {
  if (hasPositioned.value) return
  hasPositioned.value = true
  if (props.initialX !== null && props.initialY !== null) {
    x.value = props.initialX
    y.value = props.initialY
    return
  }
  // 居中 + 多窗口偏移
  const offset = (windowManager.focusedId ? 30 : 0) % 200
  const w = window.innerWidth
  const h = window.innerHeight
  const sizeMap = { default: 480, large: 800, xlarge: 1100, confirm: 360 }
  const width = sizeMap[props.size] || 480
  const height = props.size === 'confirm' ? 180 : 500
  x.value = Math.max(8, (w - width) / 2 + offset)
  y.value = Math.max(8, (h - height) / 2 + offset)
}

let dragState = null

function startDrag(e) {
  if (!props.draggable) return
  // 不在交互子元素上启动拖动
  if (e.target.closest('.fw-close, button, input, select, textarea')) return
  e.preventDefault()
  onFocus()
  dragState = {
    startX: e.clientX,
    startY: e.clientY,
    origX: x.value,
    origY: y.value
  }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  document.body.style.userSelect = 'none'
}

function onDragMove(e) {
  if (!dragState) return
  const dx = e.clientX - dragState.startX
  const dy = e.clientY - dragState.startY
  let nx = dragState.origX + dx
  let ny = dragState.origY + dy
  // clamp 到 viewport，确保标题栏始终可见
  const headerHeight = 40
  const margin = 4
  nx = Math.max(margin - 200, Math.min(window.innerWidth - margin, nx))
  ny = Math.max(margin, Math.min(window.innerHeight - headerHeight, ny))
  x.value = nx
  y.value = ny
}

function onDragEnd() {
  dragState = null
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.body.style.userSelect = ''
}

watch(() => props.open, (v) => {
  if (v) {
    startPositioning()
    onFocus()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})

defineExpose({ close, focus: onFocus, center })
</script>

<style scoped>
.fw-window {
  position: fixed;
  background: var(--bg-surface, #fff);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border-color, #e5e7eb);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow: hidden;
  min-width: 280px;
  transition: box-shadow 0.15s ease;
}

.fw-window.is-focused {
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.34), 0 4px 12px rgba(0, 0, 0, 0.18);
}

.fw-size-default { width: 480px; }
.fw-size-large { width: 800px; max-width: 95vw; }
.fw-size-xlarge { width: 1100px; max-width: 96vw; }
.fw-size-confirm { width: 360px; }

.fw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--bg-secondary, #f3f4f6);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  cursor: move;
  user-select: none;
  flex-shrink: 0;
  border-radius: 12px 12px 0 0;
}

.fw-window.fw-no-drag .fw-header {
  cursor: default;
}

.fw-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1f2937);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fw-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent !important;
  border: none !important;
  color: var(--text-secondary, #6b7280) !important;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  border-radius: 6px;
  padding: 0 !important;
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
  box-shadow: none !important;
}

.fw-close:hover {
  background: rgba(239, 68, 68, 0.12) !important;
  color: #ef4444 !important;
}

.fw-body {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.fw-size-confirm .fw-body {
  padding: 18px 20px;
}

.fw-footer {
  padding: 10px 14px;
  border-top: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-secondary, #f9fafb);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
  border-radius: 0 0 12px 12px;
}

.fw-window ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.fw-window ::-webkit-scrollbar-thumb {
  background: var(--border-color, #d1d5db);
  border-radius: 4px;
}
.fw-window ::-webkit-scrollbar-track {
  background: transparent;
}

/* 全局：FloatingWindow 中嵌入的内容仍可使用 .form-group, .btn 等，
   父组件 scoped 样式在 slot 内仍然生效 */
</style>
