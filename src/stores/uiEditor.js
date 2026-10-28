import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { schemeApi } from '@/services/uiApi'

// 画布分辨率预设（手机和PC）
export const CANVAS_PRESETS = [
  { label: '手机 - iPhone 15 Pro', width: 393, height: 852 },
  { label: '手机 - iPhone 14', width: 390, height: 844 },
  { label: '手机 - Android 标准', width: 360, height: 800 },
  { label: '手机 - iPhone SE', width: 375, height: 667 },
  { label: '平板 - iPad', width: 768, height: 1024 },
  { label: 'PC - 1080P', width: 1920, height: 1080 },
  { label: 'PC - 2K', width: 2560, height: 1440 },
  { label: 'PC - 4K', width: 3840, height: 2160 }
]

// 根节点之间的水平间距（画布上并排显示）
export const ROOT_GAP = 80
// 控件默认 Z-Index（避免负值导致无法选中）
export const DEFAULT_Z_INDEX = 20

// 生成根节点（页面根节点，是整个视窗区域）
function createRootNode(canvasWidth, canvasHeight, name) {
  return {
    id: uuidv4(),
    type: 'root',
    name: name || '根节点',
    isRoot: true,
    isPageRoot: true,
    props: {
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      visible: true,
      locked: false,
      backgroundColor: '#4d4d4d',
      zIndex: 0
    },
    children: [],
    events: []
  }
}

// 控件默认属性工厂
export function createWidget(type, overrides) {
  const base = {
    id: uuidv4(),
    type: type,
    name: getDefaultName(type),
    props: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      visible: true,
      locked: false,
      rotation: 0,
      opacity: 1,
      zIndex: DEFAULT_Z_INDEX
    },
    children: [],
    events: []
  }
  switch (type) {
    case 'image':
      base.props.assetId = ''
      base.props.fillMode = 'contain'
      // 九宫格裁切：4条分割线（左、右、上、下像素边距），角不缩放，中间平铺
      base.props.nineSliceEnabled = false
      base.props.sliceLeft = 0
      base.props.sliceRight = 0
      base.props.sliceTop = 0
      base.props.sliceBottom = 0
      break
    case 'text':
      base.props.content = '文本'
      base.props.fontSize = 24
      base.props.color = '#ffffff'
      base.props.fontFamily = 'sans-serif'
      base.props.textAlign = 'left'
      base.props.lineHeight = 1.5
      base.props.strokeColor = ''
      base.props.strokeWidth = 0
      base.props.height = 40
      break
    case 'container':
      base.props.clip = false
      base.props.backgroundColor = '#aed0ea'
      base.props.opacity = 0.4
      break
    case 'button':
      base.props.normalAssetId = ''
      base.props.hoverAssetId = ''
      base.props.pressedAssetId = ''
      base.props.disabledAssetId = ''
      base.props.disabled = false
      break
    case 'progress':
      base.props.bgAssetId = ''
      base.props.fillAssetId = ''
      base.props.currentValue = 50
      base.props.maxValue = 100
      base.props.fillDirection = 'left-to-right'
      break
  }
  if (overrides) {
    Object.assign(base, overrides)
    if (overrides.props) Object.assign(base.props, overrides.props)
  }
  return base
}

function getDefaultName(type) {
  const names = {
    image: '图片',
    text: '文本',
    container: '容器',
    button: '按钮',
    progress: '进度条'
  }
  return names[type] || type
}

export const useUiEditorStore = defineStore('uiEditor', () => {
  const currentSchemeId = ref(null)
  const schemeName = ref('未命名方案')
  const schemeDescription = ref('')
  const canvasWidth = ref(1920)
  const canvasHeight = ref(1080)
  // 主根节点（第一个，兼容旧代码的 rootNode 引用）
  const rootNode = ref(createRootNode(1920, 1080))
  // 额外的根节点列表（多根节点支持）
  const extraRootNodes = ref([])
  // 当前激活的根节点 ID（新控件默认添加到此根节点）
  const activeRootId = ref(null)
  const selectedNodeId = ref(null)
  const selectedNodeIds = ref([])
  const scale = ref(0.5)
  const panX = ref(0)
  const panY = ref(0)
  const isSaving = ref(false)
  const isModified = ref(false)
  const renderVersion = ref(0)
  const undoStack = ref([])
  const redoStack = ref([])

  // 右侧面板选项卡状态: 'filter' | 'properties'
  const rightPanelTab = ref('filter')
  // 编辑器是否激活
  const isEditorActive = ref(false)

  // 所有根节点列表（主根节点 + 额外根节点）
  const allRootNodes = computed(() => [rootNode.value, ...extraRootNodes.value])

  // 初始化激活根节点
  if (!activeRootId.value) activeRootId.value = rootNode.value.id

  const selectedNode = computed(() => {
    if (!selectedNodeId.value) return null
    return findNodeById(selectedNodeId.value)
  })

  const flatNodes = computed(() => {
    const result = []
    for (const root of allRootNodes.value) {
      flattenNodes(root, result)
    }
    return result
  })

  // 在所有根节点中查找节点
  function findNode(node, id) {
    if (node.id === id) return node
    for (const child of node.children) {
      const found = findNode(child, id)
      if (found) return found
    }
    return null
  }

  // 通过 ID 在所有根节点中查找节点
  function findNodeById(id) {
    for (const root of allRootNodes.value) {
      const found = findNode(root, id)
      if (found) return found
    }
    return null
  }

  // 在所有根节点中查找父节点
  function findParent(node, targetId) {
    for (const child of node.children) {
      if (child.id === targetId) return node
      const found = findParent(child, targetId)
      if (found) return found
    }
    return null
  }

  // 通过 ID 在所有根节点中查找父节点
  function findParentById(targetId) {
    for (const root of allRootNodes.value) {
      const found = findParent(root, targetId)
      if (found) return found
    }
    return null
  }

  // 查找节点所属的根节点
  function findRootOf(nodeId) {
    for (const root of allRootNodes.value) {
      if (root.id === nodeId) return root
      if (isDescendant(root, nodeId)) return root
    }
    return null
  }

  function flattenNodes(node, result) {
    result.push(node)
    for (const child of node.children) {
      flattenNodes(child, result)
    }
  }

  // 递归修正节点树中的负 z-index（将负值改为 0，避免控件不可选中）
  function sanitizeZIndex(node) {
    if (!node || !node.props) return
    if (node.type !== 'root' && node.props.zIndex != null && node.props.zIndex < 0) {
      node.props.zIndex = 0
    }
    if (node.children) {
      for (const child of node.children) {
        sanitizeZIndex(child)
      }
    }
  }

  function removeNodeById(node, id) {
    const idx = node.children.findIndex(c => c.id === id)
    if (idx !== -1) {
      node.children.splice(idx, 1)
      return true
    }
    for (const child of node.children) {
      if (removeNodeById(child, id)) return true
    }
    return false
  }

  // 在所有根节点中删除节点
  function removeNodeByIdGlobal(id) {
    for (const root of allRootNodes.value) {
      if (removeNodeById(root, id)) return true
    }
    return false
  }

  // 获取根节点的水平排列偏移量（并排显示）
  function getRootOffsetX(rootId) {
    const roots = allRootNodes.value
    let offsetX = 0
    for (const root of roots) {
      if (root.id === rootId) return offsetX
      offsetX += root.props.width + ROOT_GAP
    }
    return 0
  }

  // 获取当前激活的根节点
  function getActiveRoot() {
    // 优先使用 activeRootId
    if (activeRootId.value) {
      const root = allRootNodes.value.find(r => r.id === activeRootId.value)
      if (root) return root
    }
    // 如果有选中节点，找到其所属根节点
    if (selectedNodeId.value) {
      const root = findRootOf(selectedNodeId.value)
      if (root) return root
    }
    // 默认返回第一个根节点
    return rootNode.value
  }

  // 添加新的根节点
  function addRootNode(name) {
    pushUndo()
    const root = createRootNode(canvasWidth.value, canvasHeight.value, name)
    extraRootNodes.value.push(root)
    activeRootId.value = root.id
    selectedNodeId.value = root.id
    selectedNodeIds.value = [root.id]
    isModified.value = true
    rightPanelTab.value = 'properties'
    return root
  }

  // 删除根节点（不能删除最后一个）
  function deleteRootNode(rootId) {
    if (allRootNodes.value.length <= 1) return false
    if (rootId === rootNode.value.id) {
      // 不能删除主根节点
      return false
    }
    pushUndo()
    const idx = extraRootNodes.value.findIndex(r => r.id === rootId)
    if (idx !== -1) {
      extraRootNodes.value.splice(idx, 1)
    }
    if (activeRootId.value === rootId) {
      activeRootId.value = rootNode.value.id
    }
    if (selectedNodeId.value === rootId) {
      selectedNodeId.value = null
      selectedNodeIds.value = []
    }
    isModified.value = true
    return true
  }

  function pushUndo() {
    // 快照所有根节点（含主根节点和额外根节点）
    undoStack.value.push(JSON.stringify({
      rootNode: rootNode.value,
      extraRootNodes: extraRootNodes.value
    }))
    redoStack.value = []
    renderVersion.value++
    if (undoStack.value.length > 50) undoStack.value.shift()
  }

  function selectNode(id) {
    selectedNodeId.value = id
    selectedNodeIds.value = id ? [id] : []
    if (id) {
      rightPanelTab.value = 'properties'
      // 如果选中了根节点，设为激活根节点
      const root = findRootOf(id)
      if (root && root.id === id) {
        activeRootId.value = id
      } else if (root) {
        // 选中根节点内的控件，激活该根节点
        activeRootId.value = root.id
      }
    }
  }

  function toggleSelectNode(id) {
    const idx = selectedNodeIds.value.indexOf(id)
    if (idx === -1) {
      selectedNodeIds.value.push(id)
    } else {
      selectedNodeIds.value.splice(idx, 1)
    }
    selectedNodeId.value = selectedNodeIds.value.length > 0
      ? selectedNodeIds.value[selectedNodeIds.value.length - 1]
      : null
    if (selectedNodeId.value) {
      rightPanelTab.value = 'properties'
      const root = findRootOf(selectedNodeId.value)
      if (root) activeRootId.value = root.id
    }
  }

  function setSelectedNodeIds(ids) {
    selectedNodeIds.value = ids
    selectedNodeId.value = ids.length > 0 ? ids[ids.length - 1] : null
  }

  function addWidget(type, parentId, x, y) {
    pushUndo()
    const widget = createWidget(type)
    // 确定父节点：指定 parentId 则用指定；否则用激活的根节点
    let parent
    if (parentId) {
      parent = findNodeById(parentId)
    } else {
      parent = getActiveRoot()
    }
    if (parent) {
      if (x !== undefined && y !== undefined) {
        // x/y 是相对于画布的坐标，需要转换为相对于根节点的坐标
        const root = findRootOf(parent.id) || parent
        if (root.id !== parent.id) {
          // 父节点是根节点内的子节点，x/y 已经是相对画布的，需要减去根节点偏移
          const rootOffsetX = getRootOffsetX(root.id)
          widget.props.x = x - rootOffsetX
          widget.props.y = y
        } else {
          // 父节点就是根节点
          const rootOffsetX = getRootOffsetX(root.id)
          widget.props.x = x - rootOffsetX
          widget.props.y = y
        }
      } else {
        widget.props.x = parent.children.length * 20 + 50
        widget.props.y = parent.children.length * 20 + 50
      }
      parent.children.push(widget)
      selectedNodeId.value = widget.id
      selectedNodeIds.value = [widget.id]
      isModified.value = true
      rightPanelTab.value = 'properties'
    }
  }

  function updateNodeProps(id, props) {
    pushUndo()
    const node = findNodeById(id)
    if (node) {
      // 防止非根节点设置负 z-index（会导致控件不可选中）
      if (node.type !== 'root' && props.zIndex != null && props.zIndex < 0) {
        props = { ...props, zIndex: 0 }
      }
      Object.assign(node.props, props)
      isModified.value = true
    }
  }

  function moveNodes(ids, dx, dy) {
    pushUndo()
    for (const id of ids) {
      const node = findNodeById(id)
      if (node) {
        node.props.x += dx
        node.props.y += dy
      }
    }
    isModified.value = true
  }

  function updateNodeName(id, name) {
    const node = findNodeById(id)
    if (node) {
      node.name = name
      isModified.value = true
    }
  }

  function deleteNode(id) {
    // 根节点通过 deleteRootNode 删除
    if (id === rootNode.value.id) return
    if (extraRootNodes.value.some(r => r.id === id)) {
      deleteRootNode(id)
      return
    }
    pushUndo()
    removeNodeByIdGlobal(id)
    selectedNodeId.value = null
    selectedNodeIds.value = selectedNodeIds.value.filter(nid => nid !== id)
    isModified.value = true
  }

  function deleteSelectedNodes() {
    if (selectedNodeIds.value.length === 0) return
    pushUndo()
    for (const id of [...selectedNodeIds.value]) {
      // 根节点不在此处删除（通过 deleteRootNode）
      if (id === rootNode.value.id) continue
      if (extraRootNodes.value.some(r => r.id === id)) {
        deleteRootNode(id)
        continue
      }
      removeNodeByIdGlobal(id)
    }
    selectedNodeId.value = null
    selectedNodeIds.value = []
    isModified.value = true
  }

  function moveNode(id, newParentId, index) {
    pushUndo()
    const node = findNodeById(id)
    if (!node) return
    removeNodeByIdGlobal(id)
    const newParent = findNodeById(newParentId)
    if (newParent) {
      if (index !== undefined) {
        newParent.children.splice(index, 0, node)
      } else {
        newParent.children.push(node)
      }
      isModified.value = true
    }
  }

  function reorderNode(parentId, fromIndex, toIndex) {
    pushUndo()
    const parent = findNodeById(parentId)
    if (parent) {
      const [moved] = parent.children.splice(fromIndex, 1)
      parent.children.splice(toIndex, 0, moved)
      isModified.value = true
    }
  }

  function setLayer(id, action) {
    pushUndo()
    const parent = findParentById(id)
    if (!parent) return
    const idx = parent.children.findIndex(c => c.id === id)
    if (idx === -1) return
    const [item] = parent.children.splice(idx, 1)
    switch (action) {
      case 'top':
        parent.children.push(item)
        break
      case 'bottom':
        parent.children.unshift(item)
        break
      case 'up':
        parent.children.splice(Math.min(idx + 1, parent.children.length), 0, item)
        break
      case 'down':
        parent.children.splice(Math.max(idx - 1, 0), 0, item)
        break
    }
    isModified.value = true
  }

  function addEvent(nodeId, event) {
    pushUndo()
    const node = findNodeById(nodeId)
    if (node) {
      node.events.push(event)
      isModified.value = true
    }
  }

  function updateEvent(nodeId, eventIndex, event) {
    pushUndo()
    const node = findNodeById(nodeId)
    if (node && node.events[eventIndex]) {
      node.events[eventIndex] = event
      isModified.value = true
    }
  }

  function removeEvent(nodeId, eventIndex) {
    pushUndo()
    const node = findNodeById(nodeId)
    if (node) {
      node.events.splice(eventIndex, 1)
      isModified.value = true
    }
  }

  function undo() {
    if (undoStack.value.length === 0) return
    redoStack.value.push(JSON.stringify({
      rootNode: rootNode.value,
      extraRootNodes: extraRootNodes.value
    }))
    const snap = JSON.parse(undoStack.value.pop())
    rootNode.value = snap.rootNode
    extraRootNodes.value = snap.extraRootNodes || []
    isModified.value = true
  }

  function redo() {
    if (redoStack.value.length === 0) return
    undoStack.value.push(JSON.stringify({
      rootNode: rootNode.value,
      extraRootNodes: extraRootNodes.value
    }))
    const snap = JSON.parse(redoStack.value.pop())
    rootNode.value = snap.rootNode
    extraRootNodes.value = snap.extraRootNodes || []
    isModified.value = true
  }

  async function saveScheme() {
    if (isSaving.value) return
    isSaving.value = true
    try {
      const payload = {
        name: schemeName.value,
        description: schemeDescription.value,
        canvasWidth: canvasWidth.value,
        canvasHeight: canvasHeight.value,
        rootNode: rootNode.value,
        extraRootNodes: extraRootNodes.value
      }
      if (currentSchemeId.value) {
        await schemeApi.update(currentSchemeId.value, payload)
      } else {
        const scheme = await schemeApi.create(payload)
        currentSchemeId.value = scheme.id
      }
      isModified.value = false
    } finally {
      isSaving.value = false
    }
  }

  async function autosave() {
    if (currentSchemeId.value && isModified.value) {
      try {
        await schemeApi.autosave(currentSchemeId.value, {
          rootNode: rootNode.value,
          extraRootNodes: extraRootNodes.value
        })
        isModified.value = false
      } catch (e) {
        console.error('Autosave failed:', e)
      }
    }
  }

  async function loadScheme(id) {
    const scheme = await schemeApi.get(id)
    currentSchemeId.value = scheme.id
    schemeName.value = scheme.name
    schemeDescription.value = scheme.description
    canvasWidth.value = scheme.canvasWidth
    canvasHeight.value = scheme.canvasHeight
    // 兼容旧数据：确保根节点是新格式
    const loadedRoot = scheme.rootNode
    if (loadedRoot) {
      loadedRoot.type = 'root'
      loadedRoot.name = loadedRoot.name || '根节点'
      loadedRoot.isRoot = true
      loadedRoot.isPageRoot = true
      if (!loadedRoot.props) loadedRoot.props = {}
      if (!loadedRoot.props.backgroundColor || loadedRoot.props.backgroundColor === 'transparent') {
        loadedRoot.props.backgroundColor = '#4d4d4d'
      }
      // 页面根节点 zIndex 设为 0（创建独立层叠上下文，不使用负值避免穿透）
      loadedRoot.props.zIndex = 0
      loadedRoot.props.x = 0
      loadedRoot.props.y = 0
    }
    rootNode.value = loadedRoot || createRootNode(scheme.canvasWidth, scheme.canvasHeight)
    // 加载额外根节点（兼容旧数据无此字段）
    const loadedExtra = scheme.extraRootNodes
    if (Array.isArray(loadedExtra)) {
      extraRootNodes.value = loadedExtra.map(r => {
        r.type = 'root'
        r.isRoot = true
        r.isPageRoot = true
        if (!r.props) r.props = {}
        if (!r.props.backgroundColor) r.props.backgroundColor = '#4d4d4d'
        r.props.zIndex = 0
        r.props.x = 0
        r.props.y = 0
        // 修正子控件的负 z-index（避免不可选中）
        sanitizeZIndex(r)
        return r
      })
    } else {
      extraRootNodes.value = []
    }
    // 修正主根节点子控件的负 z-index
    sanitizeZIndex(rootNode.value)
    activeRootId.value = rootNode.value.id
    selectedNodeId.value = null
    selectedNodeIds.value = []
    undoStack.value = []
    redoStack.value = []
    isModified.value = false
  }

  function newScheme() {
    currentSchemeId.value = null
    schemeName.value = '未命名方案'
    schemeDescription.value = ''
    canvasWidth.value = 1920
    canvasHeight.value = 1080
    rootNode.value = createRootNode(1920, 1080)
    extraRootNodes.value = []
    activeRootId.value = rootNode.value.id
    selectedNodeId.value = null
    selectedNodeIds.value = []
    undoStack.value = []
    redoStack.value = []
    isModified.value = true  // 新建方案默认需要保存
  }

  // 设置画布尺寸（同时更新所有根节点尺寸）
  function setCanvasSize(width, height) {
    pushUndo()
    canvasWidth.value = width
    canvasHeight.value = height
    rootNode.value.props.width = width
    rootNode.value.props.height = height
    // 同步更新所有额外根节点尺寸
    for (const root of extraRootNodes.value) {
      root.props.width = width
      root.props.height = height
    }
    isModified.value = true
  }

  // 退出编辑器
  function exitEditor() {
    isEditorActive.value = false
  }

  function getNodeById(id) {
    return findNodeById(id)
  }

  function bringToFront(id) {
    const parent = findParentById(id)
    if (!parent) return
    const idx = parent.children.findIndex(c => c.id === id)
    if (idx === -1 || idx === parent.children.length - 1) return
    const [item] = parent.children.splice(idx, 1)
    parent.children.push(item)
    isModified.value = true
  }

  function moveToContainer(nodeId, containerId) {
    pushUndo()
    const node = findNodeById(nodeId)
    const container = findNodeById(containerId)
    if (!node || !container || nodeId === containerId) return
    if (isDescendant(container, nodeId)) return
    const nodeAbs = getAbsolutePosition(nodeId)
    const containerAbs = getAbsolutePosition(containerId)
    node.props.x = nodeAbs.x - containerAbs.x
    node.props.y = nodeAbs.y - containerAbs.y
    removeNodeByIdGlobal(nodeId)
    container.children.push(node)
    isModified.value = true
  }

  function getAbsolutePosition(id) {
    let x = 0, y = 0
    let current = findNodeById(id)
    if (!current) return { x: 0, y: 0 }
    // 找到节点所属的根节点
    const root = findRootOf(id)
    if (root) {
      // 加上根节点在画布上的水平偏移
      x += getRootOffsetX(root.id)
    }
    // 从当前节点向上累加相对坐标，直到根节点
    while (current && current.id !== root?.id) {
      x += current.props.x
      y += current.props.y
      const parent = findParentById(current.id)
      current = parent
    }
    return { x, y }
  }

  function removeFromContainer(childId, containerId) {
    pushUndo()
    const container = findNodeById(containerId)
    const child = findNodeById(childId)
    if (!container || !child) return
    const idx = container.children.findIndex(c => c.id === childId)
    if (idx === -1) return
    container.children.splice(idx, 1)
    const containerAbs = getAbsolutePosition(containerId)
    // 找到容器所属根节点的偏移
    const root = findRootOf(containerId)
    const rootOffsetX = root ? getRootOffsetX(root.id) : 0
    child.props.x = child.props.x + (containerAbs.x - rootOffsetX)
    child.props.y = child.props.y + (containerAbs.y)
    // 将子控件移回其根节点
    if (root) {
      root.children.push(child)
    }
    isModified.value = true
  }

  function isDescendant(parent, targetId) {
    for (const child of parent.children) {
      if (child.id === targetId) return true
      if (isDescendant(child, targetId)) return true
    }
    return false
  }

  function alignNodes(ids, alignType) {
    if (ids.length < 2) return
    pushUndo()
    const nodes = ids.map(id => findNodeById(id)).filter(Boolean)
    if (nodes.length < 2) return

    const ref = nodes[0]
    switch (alignType) {
      case 'left':
        nodes.forEach(n => { n.props.x = ref.props.x })
        break
      case 'center':
        nodes.forEach(n => { n.props.x = ref.props.x + ref.props.width / 2 - n.props.width / 2 })
        break
      case 'right':
        nodes.forEach(n => { n.props.x = ref.props.x + ref.props.width - n.props.width })
        break
      case 'top':
        nodes.forEach(n => { n.props.y = ref.props.y })
        break
      case 'middle':
        nodes.forEach(n => { n.props.y = ref.props.y + ref.props.height / 2 - n.props.height / 2 })
        break
      case 'bottom':
        nodes.forEach(n => { n.props.y = ref.props.y + ref.props.height - n.props.height })
        break
    }
    isModified.value = true
  }

  // 分布（水平/垂直）：多选时平均排列
  function distributeNodes(ids, type) {
    if (ids.length < 3) return
    pushUndo()
    const nodes = ids.map(id => findNodeById(id)).filter(Boolean)
    if (nodes.length < 3) return
    if (type === 'distributeHorizontal') {
      nodes.sort((a, b) => a.props.x - b.props.x)
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const totalWidth = nodes.reduce((sum, n) => sum + (n.props.width || 0), 0)
      const totalSpace = (last.props.x + last.props.width) - first.props.x - totalWidth
      const gap = totalSpace / (nodes.length - 1)
      let currentX = first.props.x + first.props.width
      for (let i = 1; i < nodes.length - 1; i++) {
        nodes[i].props.x = Math.round(currentX + gap)
        currentX = nodes[i].props.x + nodes[i].props.width
      }
    } else if (type === 'distributeVertical') {
      nodes.sort((a, b) => a.props.y - b.props.y)
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const totalHeight = nodes.reduce((sum, n) => sum + (n.props.height || 0), 0)
      const totalSpace = (last.props.y + last.props.height) - first.props.y - totalHeight
      const gap = totalSpace / (nodes.length - 1)
      let currentY = first.props.y + first.props.height
      for (let i = 1; i < nodes.length - 1; i++) {
        nodes[i].props.y = Math.round(currentY + gap)
        currentY = nodes[i].props.y + nodes[i].props.height
      }
    }
    isModified.value = true
  }

  // 批量更新多个节点的属性（多选统一修改基础属性）
  function updateMultipleNodesProps(ids, props) {
    pushUndo()
    // 防止非根节点设置负 z-index
    let safeProps = props
    if (props.zIndex != null && props.zIndex < 0) {
      safeProps = { ...props, zIndex: 0 }
    }
    for (const id of ids) {
      const node = findNodeById(id)
      if (node) {
        Object.assign(node.props, safeProps)
      }
    }
    isModified.value = true
  }

  return {
    currentSchemeId, schemeName, schemeDescription,
    canvasWidth, canvasHeight, rootNode,
    extraRootNodes, allRootNodes, activeRootId,
    selectedNodeId, selectedNode, selectedNodeIds, flatNodes,
    scale, panX, panY, isSaving, isModified, renderVersion,
    undoStack, redoStack, rightPanelTab, isEditorActive,
    selectNode, toggleSelectNode, setSelectedNodeIds,
    addWidget, updateNodeProps, moveNodes, updateNodeName,
    deleteNode, deleteSelectedNodes, moveNode, reorderNode, setLayer,
    addEvent, updateEvent, removeEvent,
    undo, redo, saveScheme, autosave, loadScheme, newScheme,
    setCanvasSize, exitEditor,
    getNodeById, alignNodes, distributeNodes, bringToFront, moveToContainer, pushUndo, getAbsolutePosition, removeFromContainer, updateMultipleNodesProps,
    addRootNode, deleteRootNode, getRootOffsetX, getActiveRoot, findRootOf, findParentById, findNodeById
  }
})
