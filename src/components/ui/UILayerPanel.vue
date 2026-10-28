<template>
  <div class="ui-layer-panel">
    <div class="layer-header" v-if="!hideHeader">
      <span class="layer-title">图层</span>
      <span class="layer-count">{{ totalCount }}</span>
    </div>
    <div class="layer-list">
      <!-- 遍历所有根节点 -->
      <template v-for="root in store.allRootNodes" :key="root.id">
        <!-- 根节点条目（含可见/锁定/收起按钮） -->
        <div
          class="layer-row root-row"
          :class="{ 'is-selected': root.id === store.selectedNodeId }"
          @click="store.selectNode(root.id)"
        >
          <button
            class="icon-btn"
            :class="{ 'is-active': root.props.visible !== false }"
            :title="root.props.visible !== false ? '隐藏' : '显示'"
            @click.stop="store.updateNodeProps(root.id, { visible: !(root.props.visible !== false) })"
          >
            <svg v-if="root.props.visible !== false" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
          <button
            class="icon-btn"
            :class="{ 'is-locked': root.props.locked }"
            :title="root.props.locked ? '解锁' : '锁定'"
            @click.stop="store.updateNodeProps(root.id, { locked: !root.props.locked })"
          >
            <svg v-if="root.props.locked" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            </svg>
          </button>
          <span class="layer-type root-type">根</span>
          <span class="layer-name root-name" :title="root.name">{{ root.name }}</span>
          <!-- 根节点的删除按钮（主根节点不可删除） -->
          <button
            v-if="root.id !== store.rootNode.id"
            class="action-btn root-del-btn"
            title="删除此根节点"
            @click.stop="onDeleteRoot(root.id)"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          <!-- 根节点收起/展开按钮（与容器一致，始终可见） -->
          <button
            v-if="root.children && root.children.length > 0"
            class="action-btn toggle-btn"
            :title="isCollapsed(root.id) ? '展开子控件' : '收起子控件'"
            @click.stop="toggleCollapse(root.id)"
          >
            <svg v-if="isCollapsed(root.id)" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
        </div>
        <!-- 根节点的子节点（按根节点收起状态显示） -->
        <div
          v-for="node in getRootDisplayNodes(root)"
          :key="node.id"
          class="layer-row"
          :class="{ 'is-selected': node.id === store.selectedNodeId }"
          :style="{ paddingLeft: `${getDepth(node.id) * 14 + 8}px` }"
          @click="store.selectNode(node.id)"
        >
          <button
            class="icon-btn"
            :class="{ 'is-active': node.props.visible !== false }"
            :title="node.props.visible !== false ? '隐藏' : '显示'"
            @click.stop="store.updateNodeProps(node.id, { visible: !(node.props.visible !== false) })"
          >
            <svg v-if="node.props.visible !== false" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          </button>
          <button
            class="icon-btn"
            :class="{ 'is-locked': node.props.locked }"
            :title="node.props.locked ? '解锁' : '锁定'"
            @click.stop="store.updateNodeProps(node.id, { locked: !node.props.locked })"
          >
            <svg v-if="node.props.locked" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            </svg>
          </button>
          <span class="layer-type">{{ getTypeLabel(node.type) }}</span>
          <span class="layer-name" :title="node.name">{{ node.name }}</span>
          <div class="layer-actions">
            <button class="action-btn" title="上移一层" @click.stop="store.setLayer(node.id, 'up')">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </button>
            <button class="action-btn" title="下移一层" @click.stop="store.setLayer(node.id, 'down')">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>
          <!-- 容器展开/收起按钮（放最后，始终可见不隐藏） -->
          <button
            v-if="node.type === 'container' && node.children && node.children.length > 0"
            class="action-btn toggle-btn"
            :title="isCollapsed(node.id) ? '展开子控件' : '收起子控件'"
            @click.stop="toggleCollapse(node.id)"
          >
            <svg v-if="isCollapsed(node.id)" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
        </div>
      </template>
      <div v-if="totalCount === 0" class="empty-tip">
        暂无图层，点击左侧控件按钮添加
      </div>
    </div>
    <!-- 删除根节点确认弹窗 -->
    <FloatingWindow v-model:open="deleteRootConfirmOpen" title="确认删除根节点" size="confirm">
      <p class="fw-tip-msg">确定要删除此根节点及其所有子控件吗？此操作不可撤销。</p>
      <template #footer>
        <button class="btn-fw-cancel" @click="deleteRootConfirmOpen = false">取消</button>
        <button class="btn-fw-danger" @click="confirmDeleteRoot">删除</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useUiEditorStore } from '@/stores/uiEditor'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const store = useUiEditorStore()

const props = defineProps({
  hideHeader: { type: Boolean, default: false }
})

// 折叠的节点 ID 集合（包含根节点和容器）
const collapsedIds = ref(new Set())

// 删除根节点确认弹窗
const deleteRootConfirmOpen = ref(false)
const pendingDeleteRootId = ref(null)

function isCollapsed(id) {
  return collapsedIds.value.has(id)
}

function toggleCollapse(id) {
  const s = new Set(collapsedIds.value)
  if (s.has(id)) {
    s.delete(id)
  } else {
    s.add(id)
  }
  collapsedIds.value = s
}

// 删除根节点（弹出确认）
function onDeleteRoot(rootId) {
  pendingDeleteRootId.value = rootId
  deleteRootConfirmOpen.value = true
}

function confirmDeleteRoot() {
  if (pendingDeleteRootId.value) {
    store.deleteRootNode(pendingDeleteRootId.value)
    pendingDeleteRootId.value = null
  }
  deleteRootConfirmOpen.value = false
}

// 获取指定根节点的展示子节点（跳过折叠状态）
function getRootDisplayNodes(root) {
  // 根节点被折叠时，不展示任何子节点
  if (collapsedIds.value.has(root.id)) return []
  const result = []
  const reversed = [...root.children].reverse()
  for (const child of reversed) {
    flattenWithChildren(child, result)
  }
  return result
}

function flattenWithChildren(node, result) {
  result.push(node)
  // 如果该容器被折叠，不展示其子节点
  if (collapsedIds.value.has(node.id)) return
  const reversed = [...node.children].reverse()
  for (const child of reversed) {
    flattenWithChildren(child, result)
  }
}

// 总节点数（所有根节点 + 子节点）
const totalCount = computed(() => {
  let count = 0
  for (const root of store.allRootNodes) {
    count += 1 + countDescendants(root)
  }
  return count
})

function countDescendants(node) {
  if (!node.children) return 0
  let count = node.children.length
  for (const child of node.children) {
    count += countDescendants(child)
  }
  return count
}

// 获取节点深度（基于所属根节点）
function getDepth(nodeId) {
  let depth = 0
  let current = nodeId
  // 在所有根节点中查找父节点
  while (current) {
    const parent = store.findParentById(current)
    if (!parent) break
    depth++
    current = parent.id
    // 到达根节点停止
    if (store.allRootNodes.some(r => r.id === current)) break
  }
  return depth
}

function getTypeLabel(type) {
  const labels = {
    image: '图',
    text: '文',
    container: '容',
    button: '按',
    progress: '进'
  }
  return labels[type] || type.substring(0, 1)
}
</script>

<style scoped>
.ui-layer-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg-primary, #1e1e1e);
  color: var(--text-primary, #fff);
  font-size: 12px;
}

.layer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color, #333);
  font-weight: 600;
  flex-shrink: 0;
}

.layer-count {
  background: var(--bg-tertiary, #333);
  color: var(--text-secondary, #999);
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: normal;
}

.layer-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
  min-height: 0;
}

.layer-row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 4px;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background 0.15s;
}

.layer-row:hover {
  background: var(--bg-secondary, #2a2a2a);
}

.layer-row.is-selected {
  background: rgba(59, 130, 246, 0.2);
  border-left-color: #3b82f6;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #888);
  cursor: pointer;
  border-radius: 3px;
  padding: 0;
  flex-shrink: 0;
}

.icon-btn:hover {
  background: var(--bg-tertiary, #333);
  color: var(--text-primary, #fff);
}

.icon-btn.is-active {
  color: var(--text-primary, #ccc);
}

.icon-btn.is-locked {
  color: #fbbf24;
}

.layer-type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  background: var(--bg-tertiary, #333);
  color: var(--text-secondary, #999);
  border-radius: 2px;
  font-size: 9px;
  flex-shrink: 0;
}

.layer-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  font-size: 11px;
}

.layer-actions {
  display: none;
  gap: 1px;
  flex-shrink: 0;
}

.layer-row:hover .layer-actions {
  display: flex;
}

/* 展开收起按钮始终显示（不依赖hover） */
.action-btn.toggle-btn {
  display: inline-flex;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #888);
  cursor: pointer;
  border-radius: 3px;
  padding: 0;
}

.action-btn:hover {
  background: var(--bg-tertiary, #444);
  color: var(--text-primary, #fff);
}

.empty-tip {
  padding: 20px 10px;
  text-align: center;
  color: var(--text-tertiary, #666);
  font-size: 11px;
}

/* 根节点删除按钮 */
.root-del-btn {
  display: inline-flex;
  color: var(--text-muted, #888);
}
.root-del-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* FloatingWindow 弹窗按钮样式 */
.fw-tip-msg {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-line;
  line-height: 1.6;
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
