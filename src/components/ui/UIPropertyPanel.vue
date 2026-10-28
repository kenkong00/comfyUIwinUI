<template>
  <!-- 多选基础属性面板 -->
  <div class="ui-property-panel" v-if="store.selectedNodeIds.length >= 2">
    <Section title="多选编辑">
      <div class="multi-info">已选 {{ store.selectedNodeIds.length }} 个控件，修改基础属性将批量应用</div>
      <div class="ui-grid-2">
        <PropNumber label="宽度" :value="commonProp('width')" @update:value="updateMultiProp('width', $event)" min="1" />
        <PropNumber label="高度" :value="commonProp('height')" @update:value="updateMultiProp('height', $event)" min="1" />
      </div>
      <div class="ui-grid-2">
        <PropNumber label="X" :value="commonProp('x')" @update:value="updateMultiProp('x', $event)" />
        <PropNumber label="Y" :value="commonProp('y')" @update:value="updateMultiProp('y', $event)" />
      </div>
      <div class="ui-grid-2">
        <PropNumber label="透明度" :value="commonProp('opacity')" @update:value="updateMultiProp('opacity', $event)" min="0" max="1" step="0.1" />
      </div>
    </Section>
  </div>
  <!-- 单选属性面板 -->
  <div class="ui-property-panel" v-else-if="node">
    <!-- 根节点专属属性面板 -->
    <template v-if="node.type === 'root'">
      <!-- 显示/锁定/预览 操作行（位于属性顶部） -->
      <Section title="操作">
        <div class="op-row">
          <button
            class="op-btn"
            :class="{ 'is-active': node.props.visible !== false }"
            :title="node.props.visible !== false ? '隐藏' : '显示'"
            @click="updateProp('visible', !(node.props.visible !== false))"
          >
            <svg v-if="node.props.visible !== false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>{{ node.props.visible !== false ? '显示中' : '已隐藏' }}</span>
          </button>
          <button
            class="op-btn"
            :class="{ 'is-locked': node.props.locked }"
            :title="node.props.locked ? '解锁' : '锁定'"
            @click="updateProp('locked', !node.props.locked)"
          >
            <svg v-if="node.props.locked" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
            </svg>
            <span>{{ node.props.locked ? '已锁定' : '未锁定' }}</span>
          </button>
          <button
            class="op-btn preview-btn"
            title="预览此根节点"
            @click="openPreview"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
              <polygon points="10 8 16 10 10 12 10 8" fill="currentColor"/>
            </svg>
            <span>预览</span>
          </button>
        </div>
      </Section>

      <Section title="根节点属性">
        <PropInput label="名称" :value="node.name" @update:value="store.updateNodeName(node.id, $event)" />
        <div class="ui-grid-2">
          <PropNumber label="宽度" :value="node.props.width" @update:value="updateProp('width', $event)" min="1" />
          <PropNumber label="高度" :value="node.props.height" @update:value="updateProp('height', $event)" min="1" />
        </div>
        <ColorInput label="背景色" :value="node.props.backgroundColor" @update:value="updateProp('backgroundColor', $event)" />
      </Section>

      <Section title="画布分辨率预设">
        <PropSelect
          label="分辨率"
          :value="currentPresetValue"
          :options="canvasPresetOptions"
          @update:value="onPresetChange"
        />
        <div class="preset-info">根节点是整个视窗，不可移动、不可旋转，默认为最底层。</div>
      </Section>
    </template>

    <!-- 普通控件属性面板 -->
    <template v-else>
    <!-- 显示/锁定 操作行（位于基础属性之上） -->
    <Section title="操作">
      <div class="op-row">
        <button
          class="op-btn"
          :class="{ 'is-active': node.props.visible !== false }"
          :title="node.props.visible !== false ? '隐藏' : '显示'"
          @click="updateProp('visible', !(node.props.visible !== false))"
        >
          <svg v-if="node.props.visible !== false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          <span>{{ node.props.visible !== false ? '显示中' : '已隐藏' }}</span>
        </button>
        <button
          class="op-btn"
          :class="{ 'is-locked': node.props.locked }"
          :title="node.props.locked ? '解锁' : '锁定'"
          @click="updateProp('locked', !node.props.locked)"
        >
          <svg v-if="node.props.locked" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
          </svg>
          <span>{{ node.props.locked ? '已锁定' : '未锁定' }}</span>
        </button>
      </div>
    </Section>

    <!-- 基础属性 -->
    <Section title="基础属性">
      <PropInput label="名称" :value="node.name" @update:value="store.updateNodeName(node.id, $event)" />
      <div class="ui-grid-2">
        <PropNumber label="X" :value="node.props.x" @update:value="updateProp('x', $event)" />
        <PropNumber label="Y" :value="node.props.y" @update:value="updateProp('y', $event)" />
        <PropNumber label="宽度" :value="node.props.width" @update:value="updateProp('width', $event)" min="1" />
        <PropNumber label="高度" :value="node.props.height" @update:value="updateProp('height', $event)" min="1" />
      </div>
      <div class="ui-grid-2">
        <PropNumber label="透明度" :value="node.props.opacity ?? 1" @update:value="updateProp('opacity', $event)" min="0" max="1" step="0.1" />
        <PropNumber label="旋转" :value="node.props.rotation ?? 0" @update:value="updateProp('rotation', $event)" />
      </div>
      <div class="ui-grid-2">
        <PropNumber label="Z-Index" :value="node.props.zIndex ?? 20" @update:value="updateProp('zIndex', $event)" step="1" min="0" />
      </div>
    </Section>

    <!-- 控件专属属性 -->
    <Section v-if="node.type === 'image'" title="图片属性">
      <AssetSelector label="素材" :assetId="node.props.assetId" @update:assetId="updateProp('assetId', $event)" />
      <PropSelect label="填充模式" :value="node.props.fillMode || 'contain'" :options="fillModeOptions" @update:value="updateProp('fillMode', $event)" />
      <PropToggle label="九宫格裁切" :value="!!node.props.nineSliceEnabled" @update:value="updateProp('nineSliceEnabled', $event)" />
      <template v-if="node.props.nineSliceEnabled">
        <div class="ns-tip">4条分割线切为9块，角不缩放，中间平铺</div>
        <div class="ui-grid-2">
          <PropNumber label="左边距" :value="node.props.sliceLeft ?? 0" @update:value="updateProp('sliceLeft', $event)" min="0" />
          <PropNumber label="右边距" :value="node.props.sliceRight ?? 0" @update:value="updateProp('sliceRight', $event)" min="0" />
        </div>
        <div class="ui-grid-2">
          <PropNumber label="上边距" :value="node.props.sliceTop ?? 0" @update:value="updateProp('sliceTop', $event)" min="0" />
          <PropNumber label="下边距" :value="node.props.sliceBottom ?? 0" @update:value="updateProp('sliceBottom', $event)" min="0" />
        </div>
      </template>
    </Section>

    <Section v-if="node.type === 'text'" title="文本属性">
      <PropTextarea label="内容" :value="node.props.content" @update:value="updateProp('content', $event)" />
      <div class="ui-grid-2">
        <PropNumber label="字号" :value="node.props.fontSize" @update:value="updateProp('fontSize', $event)" min="8" max="200" />
        <PropNumber label="行高" :value="node.props.lineHeight || 1.5" @update:value="updateProp('lineHeight', $event)" min="0.5" max="5" step="0.1" />
      </div>
      <div class="ui-grid-2">
        <ColorInput label="颜色" :value="node.props.color" @update:value="updateProp('color', $event)" />
        <ColorInput label="描边色" :value="node.props.strokeColor" @update:value="updateProp('strokeColor', $event)" />
      </div>
      <div class="ui-grid-2">
        <PropSelect label="对齐" :value="node.props.textAlign || 'left'" :options="alignOptions" @update:value="updateProp('textAlign', $event)" />
        <PropNumber label="描边宽" :value="node.props.strokeWidth || 0" @update:value="updateProp('strokeWidth', $event)" min="0" />
      </div>
    </Section>

    <Section v-if="node.type === 'container'" title="容器属性">
      <ColorInput label="背景色" :value="node.props.backgroundColor" @update:value="updateProp('backgroundColor', $event)" />
      <PropToggle label="裁剪溢出" :value="!!node.props.clip" @update:value="updateProp('clip', $event)" />
    </Section>

    <!-- 容器子控件管理 -->
    <Section v-if="node.type === 'container'" title="子控件管理">
      <div v-if="node.children.length > 0" class="sub-section">
        <div class="sub-section-label">容器内控件（点击移除）：</div>
        <div class="sub-list">
          <div
            v-for="child in node.children"
            :key="child.id"
            class="sub-item"
            @click="removeFromContainer(child.id)"
          >
            <span class="sub-minus">−</span>
            <span class="sub-name">{{ child.name }}</span>
            <span class="sub-type">({{ child.type }})</span>
          </div>
        </div>
      </div>
      <div v-else class="sub-empty">容器为空</div>
      <div class="sub-section-label">从根容器选择控件加入此容器：</div>
      <div class="sub-list-scroll">
        <div
          v-for="candidate in availableChildren"
          :key="candidate.id"
          class="sub-item"
          @click="addToContainer(candidate.id)"
        >
          <span class="sub-plus">+</span>
          <span class="sub-name">{{ candidate.name }}</span>
          <span class="sub-type">({{ candidate.type }})</span>
        </div>
        <div v-if="availableChildren.length === 0" class="sub-empty">根容器中没有其他控件可添加</div>
      </div>
      <div class="sub-count">当前子控件数: {{ node.children.length }}</div>
    </Section>

    <Section v-if="node.type === 'button'" title="按钮属性">
      <AssetSelector label="常态素材" :assetId="node.props.normalAssetId" @update:assetId="updateProp('normalAssetId', $event)" />
      <AssetSelector label="悬浮素材" :assetId="node.props.hoverAssetId" @update:assetId="updateProp('hoverAssetId', $event)" />
      <AssetSelector label="按下素材" :assetId="node.props.pressedAssetId" @update:assetId="updateProp('pressedAssetId', $event)" />
      <AssetSelector label="禁用素材" :assetId="node.props.disabledAssetId" @update:assetId="updateProp('disabledAssetId', $event)" />
      <PropToggle label="禁用状态" :value="!!node.props.disabled" @update:value="updateProp('disabled', $event)" />
    </Section>

    <Section v-if="node.type === 'progress'" title="进度条属性">
      <AssetSelector label="背景素材" :assetId="node.props.bgAssetId" @update:assetId="updateProp('bgAssetId', $event)" />
      <AssetSelector label="填充素材" :assetId="node.props.fillAssetId" @update:assetId="updateProp('fillAssetId', $event)" />
      <div class="ui-grid-2">
        <PropNumber label="当前值" :value="node.props.currentValue" @update:value="updateProp('currentValue', $event)" min="0" />
        <PropNumber label="最大值" :value="node.props.maxValue" @update:value="updateProp('maxValue', $event)" min="1" />
      </div>
      <PropSelect label="填充方向" :value="node.props.fillDirection || 'left-to-right'" :options="directionOptions" @update:value="updateProp('fillDirection', $event)" />
    </Section>

    <!-- 事件绑定 -->
    <Section title="事件绑定" v-if="node.type !== 'container'">
      <div v-for="(event, idx) in node.events" :key="idx" class="event-card">
        <div class="event-header">
          <PropSelect :value="event.trigger" :options="triggerOptions" @update:value="updateEventTrigger(idx, $event)" />
          <button class="event-del" @click="store.removeEvent(node.id, idx)">删除</button>
        </div>
        <div class="event-action-label">动作({{ event.actions.length }})</div>
        <div v-for="(action, ai) in event.actions" :key="ai" class="event-action">
          <span class="action-type">{{ action.type }}</span>
          <span class="action-arrow">→</span>
          <span class="action-target">{{ getNodeName(action.targetId) }}</span>
        </div>
        <button class="event-add-action" @click="addAction(idx)">+ 添加动作</button>
      </div>
      <button
        v-if="node.events.length < 4"
        class="event-add"
        @click="addEvent"
      >+ 添加事件</button>
    </Section>
    </template>
  </div>
  <div v-else class="ui-prop-empty">
    选中一个控件以编辑属性
  </div>

  <!-- 提示弹窗 -->
  <FloatingWindow v-model:open="tipOpen" :title="tipTitle" size="confirm">
    <p class="fw-tip-msg">{{ tipMessage }}</p>
    <template #footer>
      <button class="btn-fw-tip" @click="tipOpen = false">确定</button>
    </template>
  </FloatingWindow>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useUiEditorStore, CANVAS_PRESETS } from '@/stores/uiEditor'
import PropInput from './props/PropInput.vue'
import PropNumber from './props/PropNumber.vue'
import PropSelect from './props/PropSelect.vue'
import PropToggle from './props/PropToggle.vue'
import PropTextarea from './props/PropTextarea.vue'
import ColorInput from './props/ColorInput.vue'
import AssetSelector from './props/AssetSelector.vue'
import Section from './props/Section.vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const store = useUiEditorStore()
const node = computed(() => store.selectedNode)

// 提示弹窗状态
const tipOpen = ref(false)
const tipTitle = ref('提示')
const tipMessage = ref('')

function showTip(title, msg) {
  tipTitle.value = title
  tipMessage.value = msg
  tipOpen.value = true
}

// 预览当前根节点
async function openPreview() {
  if (!node.value || node.value.type !== 'root') return
  try {
    if (store.isModified) {
      await store.saveScheme()
    }
    if (store.currentSchemeId) {
      // 传递 rootId 参数，预览指定根节点
      const url = `/preview.html?id=${store.currentSchemeId}&rootId=${node.value.id}`
      window.open(url, '_blank')
    } else {
      showTip('无法预览', '方案尚未保存，请先点击保存按钮保存方案。')
    }
  } catch (e) {
    showTip('预览失败', '保存方案失败，无法预览。\n\n错误信息: ' + (e.message || e))
  }
}

// 多选：获取所有选中节点的公共属性值（值相同则返回，不同则返回 undefined）
function commonProp(key) {
  const ids = store.selectedNodeIds
  if (ids.length < 2) return undefined
  const nodes = ids.map(id => store.getNodeById(id)).filter(Boolean)
  if (nodes.length === 0) return undefined
  const first = nodes[0].props[key]
  for (const n of nodes) {
    if (n.props[key] !== first) return undefined
  }
  return first
}

// 多选：批量修改基础属性（排除根节点）
function updateMultiProp(key, value) {
  const ids = store.selectedNodeIds.filter(id => id !== store.rootNode.id)
  if (ids.length > 0) {
    store.updateMultipleNodesProps(ids, { [key]: value })
  }
}

// 画布分辨率预设选项
const canvasPresetOptions = computed(() => {
  const opts = [{ value: 'custom', label: '自定义' }]
  CANVAS_PRESETS.forEach(p => {
    opts.push({ value: `${p.width}x${p.height}`, label: `${p.label} (${p.width}×${p.height})` })
  })
  return opts
})

// 当前选中的分辨率预设值
const currentPresetValue = computed(() => {
  if (!node.value) return 'custom'
  const w = node.value.props.width
  const h = node.value.props.height
  const match = CANVAS_PRESETS.find(p => p.width === w && p.height === h)
  return match ? `${match.width}x${match.height}` : 'custom'
})

// 切换分辨率预设
function onPresetChange(value) {
  if (value === 'custom') return
  const [w, h] = value.split('x').map(Number)
  if (w && h) {
    store.setCanvasSize(w, h)
  }
}

const availableChildren = computed(() => {
  if (!node.value) return []
  // 找到容器所属的根节点，从该根节点的子控件中选择候选
  const root = store.findRootOf(node.value.id)
  if (!root) return []
  const rootChildren = root.children
  const containerId = node.value.id
  return rootChildren.filter(n => n.id !== containerId && !isAlreadyInContainer(n.id, containerId))
})

function isAlreadyInContainer(nodeId, containerId) {
  const container = store.getNodeById(containerId)
  if (!container) return false
  return container.children.some(c => c.id === nodeId)
}

function addToContainer(childId) {
  if (!node.value) return
  store.moveToContainer(childId, node.value.id)
}

function removeFromContainer(childId) {
  if (!node.value) return
  store.removeFromContainer(childId, node.value.id)
}

const fillModeOptions = [
  { value: 'contain', label: '适应' },
  { value: 'cover', label: '填充' },
  { value: 'fill', label: '拉伸' },
]

const alignOptions = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
]

const directionOptions = [
  { value: 'left-to-right', label: '从左到右' },
  { value: 'right-to-left', label: '从右到左' },
  { value: 'top-to-bottom', label: '从上到下' },
  { value: 'bottom-to-top', label: '从下到上' },
]

const triggerOptions = [
  { value: 'click', label: '点击' },
  { value: 'mouseEnter', label: '鼠标移入' },
  { value: 'mouseLeave', label: '鼠标移出' },
  { value: 'mounted', label: '加载完成' },
]

function updateProp(key, value) {
  if (node.value) {
    store.updateNodeProps(node.value.id, { [key]: value })
  }
}

function getNodeName(id) {
  const n = store.getNodeById(id)
  return n ? n.name : id
}

function addEvent() {
  if (!node.value) return
  store.addEvent(node.value.id, {
    trigger: 'click',
    actions: [{ type: 'toggle', targetId: '' }]
  })
}

function updateEventTrigger(idx, trigger) {
  if (!node.value) return
  const ev = { ...node.value.events[idx], trigger: trigger }
  store.updateEvent(node.value.id, idx, ev)
}

function addAction(eventIdx) {
  if (!node.value) return
  const ev = { ...node.value.events[eventIdx] }
  ev.actions = [...ev.actions, { type: 'toggle', targetId: '' }]
  store.updateEvent(node.value.id, eventIdx, ev)
}
</script>

<style scoped>
.ui-property-panel {
  padding: 8px;
  font-size: 12px;
}
.multi-info {
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-bottom: 8px;
  padding: 6px 8px;
  background: var(--bg-secondary, #2a2a2a);
  border-radius: 4px;
  line-height: 1.5;
}
.preset-info {
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-top: 6px;
  line-height: 1.5;
  padding: 4px 6px;
  background: var(--bg-secondary, #2a2a2a);
  border-radius: 4px;
}
.ui-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.ui-prop-empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 12px;
}
.ui-prop-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.ui-prop-label {
  font-size: 11px;
  color: var(--text-secondary);
  width: 56px;
  flex-shrink: 0;
}
.ui-prop-input.is-readonly {
  flex: 1;
  padding: 3px 6px;
  font-size: 11px;
  background: var(--bg-tertiary, #2a2a2a);
  color: var(--text-muted, #777);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  outline: none;
  min-width: 0;
  cursor: not-allowed;
  opacity: 0.7;
}
.ns-tip {
  font-size: 11px;
  color: var(--text-muted, #888);
  margin: 4px 0;
  padding: 4px 6px;
  background: var(--bg-secondary, #2a2a2a);
  border-radius: 4px;
  line-height: 1.5;
}
.sub-section {
  margin-bottom: 6px;
}
.sub-section-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.sub-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sub-list-scroll {
  max-height: 140px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sub-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border-radius: 4px;
  background: var(--bg-secondary);
  cursor: pointer;
  font-size: 11px;
  transition: background 0.15s ease;
}
.sub-item:hover {
  background: var(--bg-primary);
}
.sub-minus {
  color: #ef4444;
  width: 12px;
  flex-shrink: 0;
}
.sub-plus {
  color: #3b82f6;
  width: 12px;
  flex-shrink: 0;
}
.sub-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}
.sub-type {
  color: var(--text-muted);
  flex-shrink: 0;
}
.sub-empty {
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
  margin-bottom: 6px;
  padding: 0 4px;
}
.sub-count {
  font-size: 11px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.event-card {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 6px;
  margin-bottom: 6px;
}
.event-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
  gap: 4px;
}
.event-del {
  border: none;
  background: none;
  color: #ef4444;
  font-size: 11px;
  cursor: pointer;
}
.event-del:hover {
  color: #dc2626;
}
.event-action-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 2px;
}
.event-action {
  font-size: 11px;
  background: var(--bg-secondary);
  border-radius: 3px;
  padding: 2px 4px;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.action-type {
  color: #3b82f6;
}
.action-arrow {
  color: var(--text-muted);
}
.action-target {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.event-add-action {
  border: none;
  background: none;
  color: #3b82f6;
  font-size: 11px;
  cursor: pointer;
  margin-top: 2px;
}
.event-add-action:hover {
  color: #2563eb;
}
.event-add {
  width: 100%;
  padding: 4px;
  font-size: 11px;
  color: #3b82f6;
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}
.event-add:hover {
  background: var(--bg-secondary);
}

/* 操作行（显示/锁定/预览） */
.op-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.op-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  font-size: 11px;
  color: var(--text-secondary, #999);
  background: var(--bg-secondary, #2a2a2a);
  border: 1px solid var(--border-color, #333);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  flex: 1;
  justify-content: center;
  min-width: 0;
}
.op-btn:hover {
  background: var(--bg-tertiary, #333);
  color: var(--text-primary, #fff);
}
.op-btn.is-active {
  color: var(--text-primary, #ccc);
}
.op-btn.is-locked {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.4);
}
.op-btn.preview-btn {
  color: #60a5fa;
  border-color: rgba(96, 165, 250, 0.4);
}
.op-btn.preview-btn:hover {
  background: rgba(96, 165, 250, 0.15);
  color: #93c5fd;
}

/* FloatingWindow 弹窗样式 */
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
