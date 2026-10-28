<template>
  <div class="json-pad">
    <div class="json-bar">
      <button class="jb-btn" @click="copy">{{ copied ? '✓ 已复制' : '复制 JSON' }}</button>
      <span class="jb-spacer" />
      <span class="jb-stat" v-if="valid === false">⚠ 校验失败</span>
      <span class="jb-stat ok" v-else>✓ 有效 JSON</span>
    </div>
    <div v-if="tree" class="json-tree">
      <JsonNode :node="tree" :name="null" :depth="0" :isRoot="true" />
    </div>
    <pre v-if="parseError" class="json-err">{{ parseError }}</pre>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import JsonNode from './JsonNode.vue'

const props = defineProps({
  json: { type: [String, Object, Array], default: '' },
  title: { type: String, default: 'workflow.json' },
})

const copied = ref(false)
const tree = computed(() => {
  try {
    return typeof props.json === 'string' ? JSON.parse(props.json) : props.json
  } catch (e) {
    return null
  }
})
const valid = computed(() => tree.value !== null)
const parseError = computed(() => (tree.value === null ? String(props.json).slice(0, 400) : ''))

function copy() {
  const text = typeof props.json === 'string' ? props.json : JSON.stringify(props.json, null, 2)
  navigator.clipboard?.writeText(text)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<style scoped>
.json-pad { display: flex; flex-direction: column; height: 100%; background: var(--bg-surface, #fff); }
.json-bar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb); background: var(--bg-secondary, #f3f4f6); flex-shrink: 0; }
.jb-btn { border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff); border-radius: 5px; padding: 5px 10px; font-size: 12.5px; cursor: pointer; color: var(--text-primary, #1f2937); }
.jb-btn:hover { background: rgba(0,103,192,.08); }
.jb-spacer { flex: 1; }
.jb-stat { font-size: 11px; color: #d97706; }
.jb-stat.ok { color: #16a34a; }
.json-tree { flex: 1; min-height: 0; overflow: auto; padding: 10px 14px; font-family: Consolas, 'Microsoft YaHei', monospace; font-size: 13px; line-height: 1.7; }
.json-err { color: #b91c1c; padding: 12px; white-space: pre-wrap; }
</style>
