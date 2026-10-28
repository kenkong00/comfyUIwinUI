<template>
  <div
    class="ui-editor-canvas"
    ref="canvasRef"
    @mousedown="onCanvasMouseDown"
    @mousemove="onCanvasMouseMove"
    @mouseup="onCanvasMouseUp"
    @mouseleave="onCanvasMouseUp"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <!-- 网格背景 -->
    <div class="grid-bg" :style="gridStyle"></div>

    <!-- 画布内容区域 -->
    <div class="canvas-content" :style="canvasContentStyle">
      <!-- 画布区域（宽度自适应所有根节点并排） -->
      <div class="canvas-area" :style="canvasAreaStyle">
        <!-- 多根节点渲染：每个根节点用独立的 wrapper 定位并排显示 -->
        <div
          v-for="root in store.allRootNodes"
          :key="'root-wrap-' + root.id"
          class="root-wrapper"
          :class="{ 'is-active': store.activeRootId === root.id, 'is-selected': store.selectedNodeId === root.id }"
          :style="getRootWrapperStyle(root)"
        >
          <UIRenderer
            :key="'render-' + root.id + '-' + store.renderVersion"
            :nodes="[root]"
            :is-editor="true"
            @select="onSelectNode"
            @mousedown-node="onNodeMouseDown"
            @event="onNodeEvent"
          />
          <!-- 根节点标签（画布上方显示名称） -->
          <div class="root-label" @click.stop="store.selectNode(root.id)">
            <span class="root-label-text">{{ root.name }}</span>
            <span class="root-label-badge" v-if="store.allRootNodes.length > 1">{{ getRootIndex(root.id) + 1 }}</span>
          </div>
        </div>

        <!-- 选中框（排除根节点） -->
        <template v-for="nid in store.selectedNodeIds" :key="'sel-' + nid + '-' + store.renderVersion">
          <div
            v-if="!isRootNode(nid) && getNodeById(nid)"
            class="selection-box"
            :class="{ 'is-primary': nid === store.selectedNodeId }"
            :style="getSelectionStyle(nid)"
          >
            <template v-if="nid === store.selectedNodeId">
              <div
                v-for="(handle, idx) in resizeHandles"
                :key="idx"
                class="resize-handle"
                :style="handleStyle(handle)"
                @mousedown.stop="startResize($event, handle)"
              ></div>
            </template>
          </div>
        </template>
      </div>
    </div>

    <!-- 缩放和坐标信息 -->
    <div class="canvas-info">
      <span>{{ Math.round(store.scale * 100) }}%</span>
      <span>{{ Math.round(store.panX) }}, {{ Math.round(store.panY) }}</span>
    </div>

    <!-- Ctrl+容器交互提示：跟随鼠标显示 +/- 号 -->
    <div
      v-if="ctrlHint.show"
      class="ctrl-hint"
      :class="ctrlHint.type"
      :style="{ left: ctrlHint.x + 'px', top: ctrlHint.y + 'px' }"
    >
      <span>{{ ctrlHint.type === 'remove' ? '−' : '+' }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useUiEditorStore, ROOT_GAP } from '@/stores/uiEditor'
import { useFileLibraryStore } from '@/stores/fileLibrary'
import UIRenderer from './UIRenderer.vue'
import { v4 as uuidv4 } from 'uuid'

const store = useUiEditorStore()
const fileStore = useFileLibraryStore()
const canvasRef = ref(null)

const shiftKey = ref(false)
const ctrlKey = ref(false)
// Ctrl+容器交互跟随鼠标的 +/- 提示
const ctrlHint = reactive({ show: false, type: '', x: 0, y: 0 })

function getNodeById(id) {
  return store.getNodeById(id)
}

// 判断节点是否是根节点（任意一个根节点）
function isRootNode(id) {
  return store.allRootNodes.some(r => r.id === id)
}

// 获取根节点的索引
function getRootIndex(rootId) {
  return store.allRootNodes.findIndex(r => r.id === rootId)
}

// 根节点 wrapper 样式：并排定位
function getRootWrapperStyle(root) {
  return {
    position: 'absolute',
    left: `${store.getRootOffsetX(root.id)}px`,
    top: '0px',
    width: `${root.props.width}px`,
    height: `${root.props.height}px`
  }
}

// 画布区域尺寸：容纳所有根节点并排
const canvasAreaStyle = computed(() => {
  const roots = store.allRootNodes
  let totalWidth = 0
  let maxHeight = store.canvasHeight
  for (let i = 0; i < roots.length; i++) {
    totalWidth += roots[i].props.width
    if (i > 0) totalWidth += ROOT_GAP
    if (roots[i].props.height > maxHeight) maxHeight = roots[i].props.height
  }
  // 至少保证一个根节点的宽度
  if (totalWidth < store.canvasWidth) totalWidth = store.canvasWidth
  return {
    width: `${totalWidth}px`,
    height: `${maxHeight}px`
  }
})

const canvasContentStyle = computed(() => ({
  transform: `translate(${store.panX}px, ${store.panY}px) scale(${store.scale})`,
  transformOrigin: '0 0'
}))

const gridStyle = computed(() => ({
  backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)`,
  backgroundSize: `${20 * store.scale}px ${20 * store.scale}px`
}))

function getSelectionStyle(nid) {
  const node = store.getNodeById(nid)
  if (!node) return { display: 'none' }
  const p = node.props
  const absPos = store.getAbsolutePosition(nid)
  return {
    left: `${absPos.x}px`,
    top: `${absPos.y}px`,
    width: `${p.width}px`,
    height: `${p.height}px`
  }
}

const resizeHandles = [
  { cursor: 'nw-resize', x: -6, y: -6, alignX: 'left', alignY: 'top' },
  { cursor: 'n-resize',  x: '50%', y: -6, alignX: 'center', alignY: 'top' },
  { cursor: 'ne-resize', x: '100%', y: -6, alignX: 'right', alignY: 'top', xOff: 6 },
  { cursor: 'w-resize',  x: -6, y: '50%', alignX: 'left', alignY: 'center' },
  { cursor: 'e-resize',  x: '100%', y: '50%', alignX: 'right', alignY: 'center', xOff: 6 },
  { cursor: 'sw-resize', x: -6, y: '100%', alignX: 'left', alignY: 'bottom', yOff: 6 },
  { cursor: 's-resize',  x: '50%', y: '100%', alignX: 'center', alignY: 'bottom', yOff: 6 },
  { cursor: 'se-resize', x: '100%', y: '100%', alignX: 'right', alignY: 'bottom', xOff: 6, yOff: 6 }
]

function handleStyle(handle) {
  const style = { cursor: handle.cursor }
  const xOff = handle.xOff || 0
  const yOff = handle.yOff || 0
  if (handle.alignX === 'left') style.left = `${-6 + xOff}px`
  else if (handle.alignX === 'right') style.right = `${-6 - xOff}px`
  else style.left = `calc(50% - 6px + ${xOff}px)`
  if (handle.alignY === 'top') style.top = `${-6 + yOff}px`
  else if (handle.alignY === 'bottom') style.bottom = `${-6 - yOff}px`
  else style.top = `calc(50% - 6px + ${yOff}px)`
  return style
}

// ---- 拖拽状态 ----
let isPanning = false
let lastX = 0, lastY = 0
let isDraggingNode = false
let dragStartMouse = { x: 0, y: 0 }
let dragStartPositions = {}
let potentialDrag = false
let nodeJustSelected = false

function onCanvasMouseDown(e) {
  // 中键（滚轮键）平移画布，在任何位置都生效
  if (e.button === 1) {
    e.preventDefault()
    isPanning = true
    lastX = e.clientX
    lastY = e.clientY
    return
  }
  if (e.button !== 0) return
  const target = e.target
  if (target === canvasRef.value || target.classList.contains('ui-editor-canvas') || !target.closest('[data-node-id]')) {
    isPanning = true
    lastX = e.clientX
    lastY = e.clientY
    if (!shiftKey.value) {
      store.selectNode(null)
    }
    return
  }
}

function onNodeMouseDown(nodeId, e) {
  // 中键（滚轮键）平移画布，在节点上也生效
  if (e.button === 1) {
    e.preventDefault()
    isPanning = true
    lastX = e.clientX
    lastY = e.clientY
    return
  }
  if (e.button !== 0) return

  // Ctrl+容器交互：选中容器后按住 Ctrl，点击子控件移出，点击外部非容器控件加入
  if (ctrlKey.value && store.selectedNodeIds.length === 1) {
    const sel = store.selectedNode
    if (sel && sel.type === 'container' && nodeId !== sel.id && nodeId !== store.rootNode.id) {
      const targetNode = store.getNodeById(nodeId)
      if (targetNode) {
        if (isChildOf(nodeId, sel.id)) {
          // 子控件：移出容器
          store.removeFromContainer(nodeId, sel.id)
        } else if (targetNode.type !== 'container') {
          // 外部非容器控件：加入容器（规则：容器不能加容器）
          store.moveToContainer(nodeId, sel.id)
        }
      }
      e.preventDefault()
      e.stopPropagation()
      return
    }
  }

  const selectedIds = store.selectedNodeIds
  if (!selectedIds) return
  if (!selectedIds.includes(nodeId)) {
    if (shiftKey.value) {
      store.toggleSelectNode(nodeId)
    } else {
      store.selectNode(nodeId)
    }
    nodeJustSelected = true
  }
  // 所有根节点可以选中显示属性面板，但不能拖动
  if (isRootNode(nodeId)) {
    potentialDrag = false
    return
  }
  potentialDrag = true
  dragStartMouse = { x: e.clientX, y: e.clientY }
  dragStartPositions = {}
  const currentIds = store.selectedNodeIds
  if (!currentIds) return
  for (const id of currentIds) {
    const node = store.getNodeById(id)
    if (node) {
      dragStartPositions[id] = { x: node.props.x, y: node.props.y }
    }
  }
}

function onCanvasMouseMove(e) {
  // Ctrl+容器交互提示（无拖拽/平移/缩放时）
  updateCtrlHint(e)
  if (isPanning) {
    store.panX += (e.clientX - lastX)
    store.panY += (e.clientY - lastY)
    lastX = e.clientX
    lastY = e.clientY
    return
  }
  if (isResizing && store.selectedNode) {
    handleResize(e)
    return
  }
  if (potentialDrag && !isDraggingNode) {
    const dx = Math.abs(e.clientX - dragStartMouse.x)
    const dy = Math.abs(e.clientY - dragStartMouse.y)
    if (dx > 3 || dy > 3) {
      isDraggingNode = true
      store.pushUndo()
    }
  }
  if (isDraggingNode) {
    const dx = (e.clientX - dragStartMouse.x) / store.scale
    const dy = (e.clientY - dragStartMouse.y) / store.scale
    for (const id of store.selectedNodeIds) {
      const node = store.getNodeById(id)
      if (node && dragStartPositions[id]) {
        node.props.x = Math.round(dragStartPositions[id].x + dx)
        node.props.y = Math.round(dragStartPositions[id].y + dy)
      }
    }
    store.isModified = true
  }
}

function onCanvasMouseUp() {
  isPanning = false
  const wasDragging = isDraggingNode
  isDraggingNode = false
  potentialDrag = false
  isResizing = false
  dragStartPositions = {}
  if (wasDragging) {
    nodeJustSelected = true
  }
}

function onSelectNode(nodeId) {
  if (nodeJustSelected) {
    nodeJustSelected = false
    return
  }
  // 根节点可以选中，但不调用 bringToFront（根节点始终在最底层）
  if (!isRootNode(nodeId)) {
    store.bringToFront(nodeId)
  }
  if (shiftKey.value) {
    store.toggleSelectNode(nodeId)
  } else {
    store.selectNode(nodeId)
  }
}

function onNodeEvent(nodeId, eventType, payload) {
  if (eventType === 'resize' && payload) {
    store.updateNodeProps(nodeId, { height: payload })
  }
}

function handleWheel(e) {
  // 滚轮缩放（以鼠标为中心），不需要 ctrlKey
  e.preventDefault()
  const rect = canvasRef.value.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  // 缩放幅度：deltaY 正值=向下=缩小，负值=向上=放大
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  const oldScale = store.scale
  const newScale = Math.max(0.1, Math.min(3, oldScale + delta))
  if (newScale === oldScale) return
  // 鼠标在画布内容中的坐标（变换前）
  const canvasX = (mouseX - store.panX) / oldScale
  const canvasY = (mouseY - store.panY) / oldScale
  // 缩放后调整 pan 使鼠标位置对应同一画布点
  store.panX = mouseX - canvasX * newScale
  store.panY = mouseY - canvasY * newScale
  store.scale = newScale
}

function onKeyDown(e) {
  if (e.key === 'Shift') { shiftKey.value = true }
  if (e.key === 'Control') { ctrlKey.value = true }
}
function onKeyUp(e) {
  if (e.key === 'Shift') { shiftKey.value = false }
  if (e.key === 'Control') {
    ctrlKey.value = false
    ctrlHint.show = false
  }
}

// 判断 nodeId 是否是 containerId 的子孙节点
function isChildOf(nodeId, containerId) {
  const container = store.getNodeById(containerId)
  if (!container) return false
  function check(node) {
    for (const child of node.children || []) {
      if (child.id === nodeId) return true
      if (check(child)) return true
    }
    return false
  }
  return check(container)
}

// Ctrl+容器交互：更新跟随鼠标的 +/- 提示
// 选中容器且按住 Ctrl 时：hover 容器子控件显示 -（移出），hover 外部非容器控件显示 +（加入）
function updateCtrlHint(e) {
  if (!ctrlKey.value || isPanning || isDraggingNode || isResizing) {
    ctrlHint.show = false
    return
  }
  if (store.selectedNodeIds.length !== 1) { ctrlHint.show = false; return }
  const sel = store.selectedNode
  if (!sel || sel.type !== 'container') { ctrlHint.show = false; return }
  const el = e.target.closest('[data-node-id]')
  if (!el) { ctrlHint.show = false; return }
  const hoverId = el.dataset.nodeId
  if (!hoverId || hoverId === sel.id || hoverId === store.rootNode.id) {
    ctrlHint.show = false; return
  }
  const hoverNode = store.getNodeById(hoverId)
  if (!hoverNode) { ctrlHint.show = false; return }
  if (isChildOf(hoverId, sel.id)) {
    // 容器内子控件：移除
    ctrlHint.type = 'remove'
    ctrlHint.show = true
    ctrlHint.x = e.clientX
    ctrlHint.y = e.clientY
  } else if (hoverNode.type !== 'container') {
    // 容器外非容器控件：加入（规则：容器不能加容器）
    ctrlHint.type = 'add'
    ctrlHint.show = true
    ctrlHint.x = e.clientX
    ctrlHint.y = e.clientY
  } else {
    ctrlHint.show = false
  }
}

// 缩放手柄
let isResizing = false
let resizeHandleType = null
let resizeStartProps = null
let resizeStartMouse = { x: 0, y: 0 }

function startResize(e, handle) {
  isResizing = true
  resizeHandleType = handle
  resizeStartProps = { ...store.selectedNode?.props }
  resizeStartMouse = { x: e.clientX, y: e.clientY }
}

function handleResize(e) {
  if (!store.selectedNode || !resizeStartProps) return
  const dx = (e.clientX - resizeStartMouse.x) / store.scale
  const dy = (e.clientY - resizeStartMouse.y) / store.scale
  const p = resizeStartProps
  const newProps = {}
  const handle = resizeHandleType
  if (handle.alignY === 'top') {
    newProps.y = Math.round(p.y + dy)
    newProps.height = Math.round(p.height - dy)
  } else if (handle.alignY === 'bottom') {
    newProps.height = Math.round(p.height + dy)
  }
  if (handle.alignX === 'left') {
    newProps.x = Math.round(p.x + dx)
    newProps.width = Math.round(p.width - dx)
  } else if (handle.alignX === 'right') {
    newProps.width = Math.round(p.width + dx)
  }
  if (newProps.width && newProps.width < 10) newProps.width = 10
  if (newProps.height && newProps.height < 10) newProps.height = 10
  store.updateNodeProps(store.selectedNode.id, newProps)
}

// ---- 拖拽放置 ----
async function onDrop(e) {
  const canvasArea = canvasRef.value?.querySelector('.canvas-area')
  if (!canvasArea) return
  const areaRect = canvasArea.getBoundingClientRect()
  // 画布坐标（相对于画布区域）
  const canvasX = Math.round((e.clientX - areaRect.left) / store.scale)
  const canvasY = Math.round((e.clientY - areaRect.top) / store.scale)

  // 根据 drop 位置确定目标根节点
  const targetRoot = findRootByCanvasX(canvasX)
  if (targetRoot) {
    // 激活此根节点
    store.activeRootId = targetRoot.id
  }

  // 检测 drop 目标节点：若为图片控件，则拖入图片直接替换其 assetId
  const targetNodeEl = e.target.closest('[data-node-id]')
  const targetNodeId = targetNodeEl?.dataset.nodeId
  const targetNode = targetNodeId ? store.getNodeById(targetNodeId) : null
  const isImageTarget = targetNode && targetNode.type === 'image'

  // x/y 相对于画布，addWidget 内部会减去根节点偏移
  const x = Math.max(0, canvasX - 50)
  const y = Math.max(0, canvasY - 50)

  // 1) 文件库图片拖入
  const rfpJson = e.dataTransfer?.getData('application/x-rfp-file')
  if (rfpJson) {
    try {
      const item = JSON.parse(rfpJson)
      if (item._kind === 'file' && item.file_type === 'image') {
        await dropFileLibraryImage(item, x, y, isImageTarget ? targetNode : null)
        return
      }
    } catch (err) {
      console.error('[UIEditorCanvas] 解析文件库拖拽数据失败:', err)
    }
  }

  // 2) 外部图片文件拖入
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0]
    if (file.type && file.type.startsWith('image/')) {
      try {
        const fileId = await uploadToUiLibrary(file)
        if (fileId) {
          if (isImageTarget) {
            store.updateNodeProps(targetNode.id, { assetId: String(fileId) })
          } else {
            store.addWidget('image', undefined, x, y)
            const activeRoot = store.getActiveRoot()
            const lastChild = activeRoot.children[activeRoot.children.length - 1]
            if (lastChild) {
              store.updateNodeProps(lastChild.id, { assetId: String(fileId) })
            }
          }
        }
      } catch (err) {
        console.error('拖入外部图片失败:', err)
      }
      return
    }
  }

  // 3) 原有 text/plain 通道（widget:/template:/asset:）
  const data = e.dataTransfer?.getData('text/plain')
  if (!data) return

  if (data.startsWith('widget:')) {
    const type = data.substring(7)
    store.addWidget(type, undefined, x, y)
  } else if (data.startsWith('template:')) {
    const tplId = parseInt(data.substring(9))
    import('@/stores/uiTemplates').then(({ useUiTemplateStore }) => {
      const tplStore = useUiTemplateStore()
      const tpl = tplStore.templates.find(t => t.id === tplId)
      if (tpl) {
        try {
          const nodeData = typeof tpl.nodeData === 'string' ? JSON.parse(tpl.nodeData) : tpl.nodeData
          const cloned = JSON.parse(JSON.stringify(nodeData))
          reassignIds(cloned)
          // 计算相对于激活根节点的坐标
          const activeRoot = store.getActiveRoot()
          const rootOffsetX = store.getRootOffsetX(activeRoot.id)
          cloned.props.x = x - rootOffsetX
          cloned.props.y = y
          cloned.name = tpl.name
          store.pushUndo()
          activeRoot.children.push(cloned)
          store.selectNode(cloned.id)
          store.isModified = true
        } catch (err) {
          console.error('Failed to drop template:', err)
        }
      }
    })
  } else if (data.startsWith('asset:')) {
    const assetId = data.substring(6)
    if (isImageTarget) {
      store.updateNodeProps(targetNode.id, { assetId })
    } else {
      store.addWidget('image', undefined, x, y)
      const activeRoot = store.getActiveRoot()
      const lastChild = activeRoot.children[activeRoot.children.length - 1]
      if (lastChild) {
        store.updateNodeProps(lastChild.id, { assetId })
      }
    }
  }
}

// 根据画布 X 坐标找到对应的根节点
function findRootByCanvasX(canvasX) {
  const roots = store.allRootNodes
  let offsetX = 0
  for (const root of roots) {
    const rootEnd = offsetX + root.props.width
    if (canvasX >= offsetX && canvasX <= rootEnd) {
      return root
    }
    offsetX = rootEnd + ROOT_GAP
  }
  // 如果超出范围，返回最后一个根节点
  return roots[roots.length - 1]
}

// 从文件库拖入图片：直接使用其 fileId 作为 assetId（统一接口 /api/ui-library/:id/file 会从文件库读取）
// targetNode 可选：指定则替换该图片控件的 assetId，否则创建新图片控件
async function dropFileLibraryImage(item, x, y, targetNode) {
  let targetId = null
  if (targetNode) {
    targetId = targetNode.id
  } else {
    // 先创建图片控件（占位），再设置 assetId
    store.addWidget('image', undefined, x, y)
    const activeRoot = store.getActiveRoot()
    const lastChild = activeRoot.children[activeRoot.children.length - 1]
    if (!lastChild) return
    targetId = lastChild.id
  }
  // 直接使用文件库 fileId 作为 assetId，无需下载重传
  store.updateNodeProps(targetId, { assetId: String(item.id) })
}

// 上传外部图片到文件库"UI库"分类根目录，返回 fileId
async function uploadToUiLibrary(file) {
  try {
    // 确保"UI库"分类已加载
    if (!fileStore.categories.length) {
      await fileStore.loadCategories()
    }
    let uiLib = fileStore.categories.find(c => c.name === 'UI库' && c.is_system === 1)
    if (!uiLib) {
      // 分类会在后端 getAll 时自动创建，重新加载一次
      await fileStore.loadCategories()
      uiLib = fileStore.categories.find(c => c.name === 'UI库' && c.is_system === 1)
    }
    if (!uiLib) {
      console.error('未找到UI库分类')
      return null
    }
    const base64 = await fileStore.fileToBase64(file)
    const thumbnail = await fileStore.generateThumbnail(base64)
    const format = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    const fileName = file.name.replace(/\.[^.]+$/, '')
    const created = await fileStore.createFile({
      category_id: uiLib.id,
      folder_id: null,
      name: fileName,
      file_type: 'image',
      image_base64: base64,
      thumbnail_base64: thumbnail,
      format,
      file_size: file.size,
      filename: file.name
    })
    return created && created.id ? created.id : null
  } catch (err) {
    console.error('上传图片到UI库失败:', err)
    return null
  }
}

function reassignIds(node) {
  node.id = uuidv4()
  node.children.forEach(reassignIds)
}

onMounted(() => {
  const el = canvasRef.value
  if (el) {
    el.addEventListener('wheel', handleWheel, { passive: false })
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)
  }
})

onUnmounted(() => {
  const el = canvasRef.value
  if (el) {
    el.removeEventListener('wheel', handleWheel)
  }
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
})
</script>

<style scoped>
.ui-editor-canvas {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: var(--bg-tertiary, #1a1a1a);
  user-select: none;
  -webkit-user-select: none;
}

.grid-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.canvas-content {
  position: absolute;
  top: 0;
  left: 0;
}

.canvas-area {
  position: relative;
  background: var(--bg-primary, #0f0f0f);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

/* 根节点 wrapper：并排显示的根节点区域 */
.root-wrapper {
  position: absolute;
  top: 0;
}

/* 根节点激活态：蓝色虚线边框 */
.root-wrapper.is-active {
  outline: 2px dashed rgba(96, 165, 250, 0.4);
  outline-offset: -2px;
}

/* 根节点选中态：实线高亮边框 */
.root-wrapper.is-selected {
  outline: 2px solid #60a5fa;
  outline-offset: -2px;
}

/* 根节点标签（画布顶部显示名称） */
.root-label {
  position: absolute;
  top: -28px;
  left: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  background: var(--bg-secondary, #1f1f1f);
  border: 1px solid var(--border-color, #333);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary, #ccc);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  z-index: 10;
  transition: all 0.15s;
}

.root-wrapper.is-active .root-label {
  border-color: rgba(96, 165, 250, 0.6);
  color: #60a5fa;
}

.root-wrapper.is-selected .root-label {
  background: rgba(59, 130, 246, 0.2);
  border-color: #60a5fa;
  color: #93c5fd;
}

.root-label-text {
  font-weight: 500;
}

.root-label-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--bg-tertiary, #333);
  border-radius: 8px;
  font-size: 10px;
  color: var(--text-tertiary, #999);
}

.selection-box {
  position: absolute;
  pointer-events: none;
  border: 1px solid rgba(96, 165, 250, 0.5);
  box-sizing: border-box;
}

.selection-box.is-primary {
  border-color: #60a5fa;
  border-width: 2px;
}

.resize-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #fff;
  border: 2px solid #3b82f6;
  border-radius: 2px;
  pointer-events: auto;
  box-sizing: border-box;
}

.canvas-info {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  pointer-events: none;
}

/* Ctrl+容器交互跟随鼠标的 +/- 提示 */
.ctrl-hint {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  color: #fff;
  transform: translate(10px, 10px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  border: 2px solid rgba(255, 255, 255, 0.9);
}
.ctrl-hint.remove { background: #ef4444; }
.ctrl-hint.add { background: #22c55e; }
</style>
