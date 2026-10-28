<template>
  <div class="text-widget" :style="textStyle" @click.stop="$emit('click')">
    <div v-if="node.props.content" ref="textContent" class="text-content" :style="contentStyle">{{ node.props.content }}</div>
    <div v-else ref="textContent" class="text-content text-placeholder" :style="contentStyle">文本</div>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  node: Object
})

const emit = defineEmits({ click: [], resize: [Number] })

const textContent = ref(null)
let resizeObserver = null

const textStyle = computed(() => {
  const p = props.node.props
  const style = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'flex-start',
    overflow: 'hidden',
  }
  if (p.backgroundColor) style.backgroundColor = p.backgroundColor
  return style
})

const contentStyle = computed(() => {
  const p = props.node.props
  const style = {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    width: '100%',
  }
  if (p.fontSize) style.fontSize = `${p.fontSize}px`
  if (p.color) style.color = p.color
  if (p.fontFamily) style.fontFamily = p.fontFamily
  if (p.textAlign) style.textAlign = p.textAlign
  if (p.lineHeight) style.lineHeight = String(p.lineHeight)
  if (p.strokeColor && p.strokeWidth) {
    style.textShadow = `0 0 ${p.strokeWidth}px ${p.strokeColor}, 0 0 ${p.strokeWidth}px ${p.strokeColor}`
  }
  return style
})

watch(() => props.node.props.content, () => {
  nextTick(measureHeight)
})

function measureHeight() {
  if (textContent.value) {
    const contentHeight = textContent.value.scrollHeight
    if (contentHeight > 0 && contentHeight !== props.node.props.height) {
      emit('resize', contentHeight)
    }
  }
}

onMounted(() => {
  if (textContent.value) {
    resizeObserver = new ResizeObserver(() => {
      measureHeight()
    })
    resizeObserver.observe(textContent.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<style scoped>
.text-widget {
  /* 动态样式 */
}
.text-content {
  /* 动态样式 */
}
.text-placeholder {
  color: rgba(156, 163, 175, 1);
}
</style>
