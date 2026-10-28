<template>
  <div class="ui-top-toolbar">
    <!-- 方案名称 -->
    <input
      :value="store.schemeName"
      @input="onNameInput"
      class="scheme-name-input"
      placeholder="方案名称"
    />

    <div class="divider" />

    <!-- 保存按钮（图标样式，保存后变灰，编辑后亮起） -->
    <button
      class="icon-only-btn save-btn"
      :class="{ 'is-saved': !store.isModified }"
      :disabled="store.isSaving || !store.isModified"
      @click="onSave"
      :title="store.isModified ? '保存' : '已保存'"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
    </button>

    <div class="divider" />

    <!-- 撤销/重做 -->
    <button
      class="icon-only-btn"
      :disabled="store.undoStack.length === 0"
      @click="store.undo()"
      title="撤销 (Ctrl+Z)"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="1 4 1 10 7 10"/>
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
      </svg>
    </button>
    <button
      class="icon-only-btn"
      :disabled="store.redoStack.length === 0"
      @click="store.redo()"
      title="重做 (Ctrl+Shift+Z)"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
    </button>

    <div class="divider" />

    <!-- 删除按钮（单选/多选均可删除） -->
    <button
      class="icon-only-btn delete-btn"
      :disabled="store.selectedNodeIds.length === 0"
      @click="onDelete"
      title="删除选中控件"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </button>

    <!-- 对齐工具 -->
    <div class="align-group">
      <button
        v-for="tool in alignTools"
        :key="tool.type"
        class="icon-only-btn"
        :title="tool.label"
        :disabled="store.selectedNodeIds.length < tool.minCount"
        @click="tool.isDistribute ? store.distributeNodes(store.selectedNodeIds, tool.type) : store.alignNodes(store.selectedNodeIds, tool.type)"
      >
        <span v-html="tool.icon"></span>
      </button>
    </div>

    <!-- 选中数量 -->
    <span v-if="store.selectedNodeIds.length >= 2" class="selected-count">
      已选 {{ store.selectedNodeIds.length }}
    </span>

    <div class="spacer" />

    <!-- 画布缩放（百分比直接显示，加减以5%步进） -->
    <div class="zoom-group">
      <button class="zoom-btn" @click="zoomBy(-5)" title="缩小 (-5%)">−</button>
      <span class="zoom-display" title="缩放比例">{{ Math.round(store.scale * 100) }}%</span>
      <button class="zoom-btn" @click="zoomBy(5)" title="放大 (+5%)">+</button>
    </div>

    <!-- 关闭按钮 -->
    <button class="icon-only-btn close-btn" @click="onClose" title="关闭编辑器">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>

    <!-- 提示弹窗（替代alert） -->
    <FloatingWindow v-model:open="tipOpen" :title="tipTitle" size="confirm">
      <p class="fw-tip-msg">{{ tipMessage }}</p>
      <template #footer>
        <button class="btn-fw-tip" @click="tipOpen = false">确定</button>
      </template>
    </FloatingWindow>

    <!-- 删除确认弹窗 -->
    <FloatingWindow v-model:open="deleteConfirmOpen" title="确认删除" size="confirm">
      <p class="fw-tip-msg">确定要删除选中的 {{ store.selectedNodeIds.length }} 个控件吗？</p>
      <template #footer>
        <button class="btn-fw-cancel" @click="deleteConfirmOpen = false">取消</button>
        <button class="btn-fw-danger" @click="confirmDelete">删除</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useUiEditorStore } from '@/stores/uiEditor'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const store = useUiEditorStore()
const emit = defineEmits(['close'])

// 提示弹窗状态
const tipOpen = ref(false)
const tipTitle = ref('提示')
const tipMessage = ref('')

// 删除确认弹窗状态
const deleteConfirmOpen = ref(false)

function showTip(title, msg) {
  tipTitle.value = title
  tipMessage.value = msg
  tipOpen.value = true
}

// 删除：弹出确认
function onDelete() {
  if (store.selectedNodeIds.length === 0) return
  // 如果只选中了主根节点，不能删除
  if (store.selectedNodeIds.length === 1 && store.selectedNodeIds.includes(store.rootNode.id)) {
    showTip('无法删除', '主根节点不能删除')
    return
  }
  deleteConfirmOpen.value = true
}

// 确认删除
function confirmDelete() {
  store.deleteSelectedNodes()
  deleteConfirmOpen.value = false
}

// 对齐图标使用内联SVG字符串
const alignTools = [
  {
    type: 'left',
    label: '左对齐',
    minCount: 2,
    isDistribute: false,
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="3" y2="21"/><rect x="7" y="4" width="14" height="6" rx="1"/><rect x="7" y="14" width="10" height="6" rx="1"/></svg>'
  },
  {
    type: 'center',
    label: '水平居中',
    minCount: 2,
    isDistribute: false,
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="3" x2="12" y2="21"/><rect x="6" y="4" width="12" height="6" rx="1"/><rect x="8" y="14" width="8" height="6" rx="1"/></svg>'
  },
  {
    type: 'right',
    label: '右对齐',
    minCount: 2,
    isDistribute: false,
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="3" x2="21" y2="21"/><rect x="3" y="4" width="14" height="6" rx="1"/><rect x="7" y="14" width="10" height="6" rx="1"/></svg>'
  },
  {
    type: 'top',
    label: '顶对齐',
    minCount: 2,
    isDistribute: false,
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="21" y2="3"/><rect x="4" y="7" width="6" height="14" rx="1"/><rect x="14" y="7" width="6" height="10" rx="1"/></svg>'
  },
  {
    type: 'middle',
    label: '垂直居中',
    minCount: 2,
    isDistribute: false,
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><rect x="4" y="6" width="6" height="12" rx="1"/><rect x="14" y="8" width="6" height="8" rx="1"/></svg>'
  },
  {
    type: 'bottom',
    label: '底对齐',
    minCount: 2,
    isDistribute: false,
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="21" x2="21" y2="21"/><rect x="4" y="3" width="6" height="14" rx="1"/><rect x="14" y="7" width="6" height="10" rx="1"/></svg>'
  },
  {
    type: 'distributeHorizontal',
    label: '水平分布',
    minCount: 3,
    isDistribute: true,
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="9" width="4" height="6" rx="1"/><rect x="10" y="9" width="4" height="6" rx="1"/><rect x="18" y="9" width="4" height="6" rx="1"/></svg>'
  },
  {
    type: 'distributeVertical',
    label: '垂直分布',
    minCount: 3,
    isDistribute: true,
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><rect x="9" y="10" width="6" height="4" rx="1"/><rect x="9" y="18" width="6" height="4" rx="1"/></svg>'
  }
]

// 缩放：以5%步进增减
function zoomBy(delta) {
  const newPercent = Math.round(store.scale * 100) + delta
  store.scale = Math.max(10, Math.min(300, newPercent)) / 100
}

// 名称输入：标记为已修改
function onNameInput(e) {
  store.schemeName = e.target.value
  store.isModified = true
}

// 保存：保存到数据库，保存后按钮变灰
async function onSave() {
  try {
    await store.saveScheme()
  } catch (e) {
    showTip('保存失败', '无法连接到后端服务，请确保后端服务已启动（端口3007）。\n\n错误信息: ' + (e.message || e))
  }
}

// 关闭：触发父组件弹窗确认
function onClose() {
  emit('close')
}
</script>

<style scoped>
.ui-top-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-secondary, #1f1f1f);
  border-bottom: 1px solid var(--border-color, #333);
  color: var(--text-primary, #fff);
  font-size: 12px;
  height: 44px;
  flex-shrink: 0;
}

.scheme-name-input {
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  color: var(--text-primary, #fff);
  font-size: 13px;
  font-weight: 500;
  padding: 4px 6px;
  outline: none;
  width: 160px;
  transition: border-color 0.15s;
}

.scheme-name-input::placeholder {
  color: var(--text-muted, #888);
}

.scheme-name-input:hover {
  border-bottom-color: var(--text-tertiary, #555);
}

.scheme-name-input:focus {
  border-bottom-color: #3b82f6;
}

.divider {
  width: 1px;
  height: 22px;
  background: var(--border-color, #333);
  margin: 0 4px;
  flex-shrink: 0;
}

.icon-only-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #ccc);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.icon-only-btn:hover:not(:disabled) {
  background: var(--bg-surface, #333);
  color: var(--text-primary, #fff);
}

.icon-only-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* 保存按钮：已保存状态变灰 */
.save-btn.is-saved:not(:disabled) {
  opacity: 0.4;
  color: var(--text-muted, #888);
}

.save-btn.is-saved:not(:disabled):hover {
  background: transparent;
}

.align-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.selected-count {
  color: #60a5fa;
  font-size: 11px;
  margin-left: 4px;
  flex-shrink: 0;
}

.spacer {
  flex: 1;
}

/* 缩放控件：使用已定义的CSS变量适配浅色/深色主题 */
.zoom-group {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.zoom-btn {
  width: 20px;
  height: 22px;
  border: 1px solid var(--border-color-strong, rgba(128, 128, 128, 0.3));
  background: var(--bg-surface, #1c1c1c);
  color: var(--text-primary, #fff);
  cursor: pointer;
  border-radius: 3px;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  transition: background 0.15s;
}

.zoom-btn:hover {
  background: var(--bg-secondary, #2a2a2a);
}

.zoom-display {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface, #1c1c1c);
  color: var(--text-primary, #fff);
  border: 1px solid var(--border-color-strong, rgba(128, 128, 128, 0.3));
  border-radius: 3px;
  padding: 0 4px;
  font-size: 11px;
  height: 22px;
  min-width: 46px;
  cursor: default;
  user-select: none;
}

/* 关闭按钮 */
.close-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* 删除按钮 */
.delete-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* 提示弹窗内容 */
.fw-tip-msg {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-line;
  line-height: 1.6;
}

.btn-fw-tip {
  padding: 8px 20px;
  font-size: 13px;
  background: var(--accent-color, #242424);
  color: var(--accent-text, #fff);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-fw-tip:hover {
  opacity: 0.9;
}

.btn-fw-cancel {
  padding: 8px 20px;
  font-size: 13px;
  background: var(--bg-surface, #2a2a2a);
  color: var(--text-primary, #fff);
  border: 1px solid var(--border-color, #444);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-fw-cancel:hover {
  background: var(--bg-tertiary, #333);
}

.btn-fw-danger {
  padding: 8px 20px;
  font-size: 13px;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-left: 8px;
}

.btn-fw-danger:hover {
  background: #dc2626;
}
</style>
