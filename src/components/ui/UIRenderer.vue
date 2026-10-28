<template>
  <div class="ui-renderer" :style="rendererStyle">
    <template v-for="node in nodes" :key="node.id">
      <div
        v-if="node.props.visible"
        :style="getNodeStyle(node)"
        class="ui-node"
        :data-node-id="node.id"
        @click.stop="handleClick(node.id)"
        @mousedown.stop="handleNodeMouseDown(node.id, $event)"
      >
        <ImageWidget v-if="node.type === 'image'" :node="node" @click="handleClick(node.id)" />
        <TextWidget v-else-if="node.type === 'text'" :node="node" @click="handleClick(node.id)" @resize="(h) => emit('event', node.id, 'resize', h)" />
        <ContainerWidget
          v-else-if="node.type === 'container' || node.type === 'root'"
          :node="node"
          :is-editor="isEditor"
          @click="handleClick(node.id)"
          @select="(id) => emit('select', id)"
          @mousedown-node="(id, e) => emit('mousedown-node', id, e)"
          @event="(id, type) => emit('event', id, type)"
        />
        <ButtonWidget v-else-if="node.type === 'button'" :node="node" @click="handleClick(node.id)" />
        <ProgressWidget v-else-if="node.type === 'progress'" :node="node" @click="handleClick(node.id)" />
      </div>
    </template>
  </div>
</template>

<script setup>
import ImageWidget from './widgets/ImageWidget.vue'
import TextWidget from './widgets/TextWidget.vue'
import ContainerWidget from './widgets/ContainerWidget.vue'
import ButtonWidget from './widgets/ButtonWidget.vue'
import ProgressWidget from './widgets/ProgressWidget.vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  isEditor: { type: Boolean, default: false }
})

const emit = defineEmits({
  select: [String],
  event: [String, String],
  'mousedown-node': [String, Object]
})

// 将颜色和透明度合并为 rgba 字符串（透明度只作用于背景，不影响子控件）
function applyAlphaToColor(color, alpha) {
  if (!color || color === 'transparent') return 'transparent'
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

function getNodeStyle(node) {
  const p = node.props
  const style = {
    position: 'absolute',
    left: `${p.x}px`,
    top: `${p.y}px`,
    width: `${p.width}px`,
    height: `${p.height}px`,
    transform: p.rotation ? `rotate(${p.rotation}deg)` : 'none',
    cursor: node.type === 'container' ? 'default' : 'pointer',
    pointerEvents: p.locked ? 'none' : 'auto',
    zIndex: p.zIndex != null ? String(p.zIndex) : 'auto',
  }
  // 根节点特殊处理：zIndex 0 + isolation 创建独立 stacking context，
  // 根节点背景作为画布最底层，子控件在其内部按各自 zIndex 正常叠放与交互。
  // 控件默认 zIndex 为 20（避免负值导致不可选中），根节点 zIndex 固定为 0。
  if (node.type === 'root') {
    style.zIndex = '0'
    style.isolation = 'isolate'
    style.backgroundColor = p.backgroundColor || '#4d4d4d'
    style.cursor = 'default'
  } else if (node.type === 'container') {
    // 容器强制创建独立 stacking context（isolation: isolate），
    // 使负 z-index 子控件被"关"在容器内部、画在容器背景之上，不会穿透到上层把容器背景盖住导致不可操作
    style.isolation = 'isolate'
    // 容器：透明度只作用于背景色，不影响子控件；预览时不显示容器背景
    if (props.isEditor && p.backgroundColor) {
      const alpha = p.opacity != null ? p.opacity : 1
      style.backgroundColor = applyAlphaToColor(p.backgroundColor, alpha)
    } else {
      style.backgroundColor = 'transparent'
    }
  } else {
    style.opacity = String(p.opacity ?? 1)
  }
  if (p.visible === false) {
    style.display = 'none'
  }
  return style
}

const rendererStyle = {
  position: 'relative',
  width: '100%',
  height: '100%',
  overflow: 'hidden',
}

function handleClick(nodeId) {
  emit('select', nodeId)
}

function handleNodeMouseDown(nodeId, e) {
  emit('mousedown-node', nodeId, e)
}
</script>

<style scoped>
.ui-node {
  transition: box-shadow 0.15s ease;
}
</style>
