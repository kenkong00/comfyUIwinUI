<template>
  <div class="ui-widget-bar">
    <!-- 根节点按钮（在所有控件按钮之前） -->
    <div class="widget-section">
      <button
        class="widget-btn root-btn"
        title="新建根节点（页面根节点，并排显示在画布上）"
        @click="onAddRoot"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <path d="M9 9h6v6H9z" fill="currentColor" fill-opacity="0.3"/>
          <line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="2 2"/>
        </svg>
        <span class="widget-label">根节点</span>
      </button>
    </div>

    <div class="bar-divider"></div>

    <!-- 控件按钮 -->
    <div class="widget-section">
      <button
        v-for="widget in widgetTypes"
        :key="widget.type"
        class="widget-btn"
        :title="widget.label"
        draggable="true"
        @dragstart="onDragStart($event, widget.type)"
        @click="store.addWidget(widget.type)"
      >
        <span v-html="widget.icon"></span>
        <span class="widget-label">{{ widget.label }}</span>
      </button>
    </div>

    <div class="bar-divider"></div>

    <!-- 模板按钮（如果有模板） -->
    <div class="widget-section" v-if="templates.length > 0">
      <div class="section-title">模板</div>
      <button
        v-for="tpl in templates"
        :key="tpl.id"
        class="widget-btn template"
        :title="tpl.name"
        draggable="true"
        @dragstart="onTemplateDragStart($event, tpl)"
        @click="addTemplateInstance(tpl)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
        <span class="widget-label">{{ tpl.name }}</span>
      </button>
    </div>

    <div class="bar-divider" v-if="templates.length > 0"></div>

    <!-- 图层切换按钮 -->
    <button
      class="widget-btn"
      :class="{ 'is-active': showLayers }"
      title="图层"
      @click="showLayers = !showLayers"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
      <span class="widget-label">图层</span>
    </button>

    <!-- 图层弹窗（悬浮可拖动） -->
    <FloatingWindow v-model:open="showLayers" title="图层" size="default" :draggable="true" class="layer-fw">
      <div class="layer-popup-body">
        <UILayerPanel hide-header />
      </div>
    </FloatingWindow>

    <!-- 提示弹窗 -->
    <FloatingWindow v-model:open="tipOpen" :title="tipTitle" size="confirm">
      <p class="fw-tip-msg">{{ tipMessage }}</p>
      <template #footer>
        <button class="btn-fw-tip" @click="tipOpen = false">确定</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { useUiEditorStore } from '@/stores/uiEditor'
import { useUiTemplateStore } from '@/stores/uiTemplates'
import FloatingWindow from '@/components/common/FloatingWindow.vue'
import UILayerPanel from './UILayerPanel.vue'

const store = useUiEditorStore()
const templateStore = useUiTemplateStore()

const showLayers = ref(false)

// 提示弹窗状态
const tipOpen = ref(false)
const tipTitle = ref('提示')
const tipMessage = ref('')

function showTip(title, msg) {
  tipTitle.value = title
  tipMessage.value = msg
  tipOpen.value = true
}

// 新建根节点
function onAddRoot() {
  const rootCount = store.allRootNodes.length
  const newRoot = store.addRootNode(`根节点 ${rootCount + 1}`)
  if (newRoot) {
    showTip('已创建根节点', `已在画布上新建根节点「${newRoot.name}」，新控件将添加到此根节点。`)
  }
}

const widgetTypes = [
  {
    type: 'image',
    label: '图片',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
  },
  {
    type: 'text',
    label: '文本',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>'
  },
  {
    type: 'container',
    label: '容器',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>'
  },
  {
    type: 'button',
    label: '按钮',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="8" width="20" height="8" rx="4"/><circle cx="8" cy="12" r="1.5" fill="currentColor"/></svg>'
  },
  {
    type: 'progress',
    label: '进度条',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="9" width="20" height="6" rx="2"/><line x1="6" y1="9" x2="6" y2="15"/><line x1="10" y1="9" x2="10" y2="15"/><line x1="14" y1="9" x2="14" y2="15"/><line x1="18" y1="9" x2="18" y2="15"/></svg>'
  }
]

const templates = computed(() => templateStore.templates)

function onDragStart(e, type) {
  e.dataTransfer?.setData('text/plain', `widget:${type}`)
}

function onTemplateDragStart(e, tpl) {
  e.dataTransfer?.setData('text/plain', `template:${tpl.id}`)
}

function addTemplateInstance(tpl) {
  try {
    const nodeData = typeof tpl.nodeData === 'string' ? JSON.parse(tpl.nodeData) : tpl.nodeData
    const cloned = JSON.parse(JSON.stringify(nodeData))
    reassignIds(cloned)
    const activeRoot = store.getActiveRoot()
    cloned.props.x = activeRoot.children.length * 20 + 50
    cloned.props.y = activeRoot.children.length * 20 + 50
    cloned.name = tpl.name
    store.pushUndo()
    activeRoot.children.push(cloned)
    store.selectNode(cloned.id)
    store.isModified = true
  } catch (err) {
    console.error('Failed to add template:', err)
  }
}

function reassignIds(node) {
  node.id = uuidv4()
  node.children.forEach(reassignIds)
}

onMounted(() => {
  templateStore.fetchTemplates().catch(() => {})
})
</script>

<style scoped>
.ui-widget-bar {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg-secondary, #1f1f1f);
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.widget-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-title {
  font-size: 10px;
  color: var(--text-tertiary, #777);
  padding: 4px 4px 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.widget-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #ccc);
  cursor: grab;
  border-radius: 5px;
  font-size: 12px;
  width: 100%;
  justify-content: flex-start;
  text-align: left;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.widget-btn:hover {
  background: var(--bg-tertiary, #2a2a2a);
  color: var(--text-primary, #fff);
}

.widget-btn:active {
  cursor: grabbing;
}

.widget-btn.is-active {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}

.widget-btn.template svg {
  color: #22c55e;
}

/* 根节点按钮：使用蓝色高亮区分 */
.widget-btn.root-btn {
  color: #60a5fa;
}
.widget-btn.root-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
}

.widget-label {
  font-size: 12px;
}

.bar-divider {
  height: 1px;
  background: var(--border-color, #333);
  margin: 4px 0;
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
</style>

<!-- 全局样式：FloatingWindow 通过 Teleport 渲染到 body，需用非 scoped 样式覆盖宽度 -->
<style>
.layer-fw.fw-window {
  width: 260px !important;
  min-width: 260px !important;
  max-width: 90vw;
}
.layer-fw .fw-body {
  padding: 0;
}
.layer-popup-body {
  max-height: 60vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
