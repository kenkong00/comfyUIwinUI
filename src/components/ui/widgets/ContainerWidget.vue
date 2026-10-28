<template>
  <div class="container-widget" :style="containerStyle" @click.stop="$emit('click')">
    <UIRenderer
      v-if="node.children && node.children.length > 0"
      :nodes="node.children"
      :is-editor="isEditor"
      @select="(id) => $emit('select', id)"
      @mousedown-node="(id, e) => $emit('mousedown-node', id, e)"
      @event="(id, type) => $emit('event', id, type)"
    />
    <div
      v-if="(!node.children || node.children.length === 0) && !isEditor"
      class="empty-container"
    >
      空容器
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import UIRenderer from '../UIRenderer.vue'

const props = defineProps({
  node: Object,
  isEditor: Boolean
})

defineEmits({ click: [], select: [String], 'mousedown-node': [String, Object], event: [String, String] })

const containerStyle = computed(() => {
  const p = props.node.props
  const style = {
    position: 'relative',
  }
  // 背景色和透明度由父级 UIRenderer 的 getNodeStyle 统一处理（透明度只作用于背景，不影响子控件）
  // 这里不再设置 backgroundColor，避免覆盖父级的半透明 rgba 背景
  if (p.clip) style.overflow = 'hidden'
  return style
})
</script>

<style scoped>
.container-widget {
  width: 100%;
  height: 100%;
}
.empty-container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(156, 163, 175, 1);
  font-size: 12px;
}
</style>
