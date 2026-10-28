<template>
  <div class="tooltip-wrapper" @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave" @mousemove="handleMouseMove">
    <slot></slot>
    <Teleport to="body">
      <div 
        v-if="isVisible && text"
        class="tooltip"
        :style="tooltipStyle"
      >
        {{ text }}
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  text: {
    type: String,
    required: true
  }
})

const isVisible = ref(false)
const mouseX = ref(0)
const mouseY = ref(0)
let showTimeout = null

const handleMouseEnter = () => {
  showTimeout = setTimeout(() => {
    isVisible.value = true
  }, 300)
}

const handleMouseMove = (e) => {
  mouseX.value = e.clientX
  mouseY.value = e.clientY
}

const handleMouseLeave = () => {
  if (showTimeout) {
    clearTimeout(showTimeout)
    showTimeout = null
  }
  isVisible.value = false
}

const tooltipStyle = computed(() => {
  const padding = 15
  const tooltipWidth = Math.min(props.text.length * 8 + 24, 300)
  let left = mouseX.value + padding
  if (left + tooltipWidth > window.innerWidth - 10) {
    left = mouseX.value - tooltipWidth - padding
  }
  return {
    top: mouseY.value + padding + 'px',
    left: left + 'px',
    maxWidth: '300px'
  }
})
</script>

<style scoped>
.tooltip-wrapper {
  position: relative;
  display: inline-block;
}
</style>

<style>
.tooltip {
  position: fixed;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  white-space: normal;
  word-break: break-word;
  z-index: 99999;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  animation: tooltip-fade-in 0.15s ease;
}

@keyframes tooltip-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
