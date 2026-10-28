<template>
  <div class="jn" :style="{ paddingLeft: (isRoot ? 0 : 14) + 'px' }">
    <template v-if="isObject || isArray">
      <div class="jn-row" @click="open = !open">
        <span class="jn-caret">{{ open ? '▾' : '▸' }}</span>
        <span v-if="name !== null" class="jn-key">{{ name }}</span>
        <span class="jn-brace">{{ isArray ? '[' : '{' }}</span>
        <span class="jn-collapsed" v-if="!open">{{ preview }}{{ isArray ? ']' : '}' }}</span>
      </div>
      <div v-if="open" class="jn-children">
        <JsonNode
          v-for="(pair, idx) in entries"
          :key="idx"
          :node="pair[1]"
          :name="isArray ? null : pair[0]"
          :depth="depth + 1"
        />
        <div class="jn-row jn-close">{{ isArray ? ']' : '}' }}</div>
      </div>
    </template>
    <div v-else class="jn-row">
      <span v-if="name !== null" class="jn-key">{{ name }}</span>
      <span class="jn-val" :class="valClass">{{ display }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  node: { default: null },
  name: { default: null },
  depth: { type: Number, default: 0 },
  isRoot: { type: Boolean, default: false },
})

const open = ref(props.depth < 2)

const isObject = computed(() => props.node && typeof props.node === 'object' && !Array.isArray(props.node))
const isArray = computed(() => Array.isArray(props.node))
const entries = computed(() =>
  isObject.value
    ? Object.entries(props.node)
    : props.node.map((v, i) => [i, v])
)

const preview = computed(() => {
  const n = isArray.value ? props.node.length : Object.keys(props.node).length
  return ` ${n} 项 `
})
const display = computed(() => {
  if (props.node === null) return 'null'
  if (typeof props.node === 'string') return '"' + props.node + '"'
  return String(props.node)
})
const valClass = computed(() => {
  const t = typeof props.node
  return { string: 'v-string', number: 'v-number', boolean: 'v-bool', null: 'v-null' }[t] || ''
})
</script>

<style scoped>
.jn-row { display: flex; align-items: center; gap: 4px; cursor: default; }
.jn-row[style] { }
.jn-caret { color: var(--text-muted, #999); width: 12px; cursor: pointer; user-select: none; }
.jn-key { color: #2563eb; }
.jn-brace { color: var(--text-secondary, #6b7280); }
.jn-collapsed { color: var(--text-muted, #999); font-style: italic; }
.jn-close { color: var(--text-secondary, #6b7280); padding-left: 0; }
.jn-children { border-left: 1px dashed var(--border-color, #e5e7eb); margin-left: 5px; }
.v-string { color: #16a34a; }
.v-number { color: #c2410c; }
.v-bool { color: #7c3aed; }
.v-null { color: #9ca3af; }
</style>
