<template>
  <div class="nl">
    <div class="nl-top">
      <input v-model="q" class="nl-search" placeholder="搜索节点 / 类型 / 标题" />
      <span class="nl-count">{{ filtered.length }}/{{ nodes.length }}</span>
    </div>
    <div class="nl-list">
      <template v-for="g in groups" :key="g.key">
        <div v-if="g.items.length" class="nl-group">
          <div class="nl-gt">
            <i class="nl-dot" :class="'c-' + g.key" />
            {{ g.label }}
            <span class="nl-gn">{{ g.items.length }}</span>
          </div>
          <div
            v-for="n in g.items"
            :key="n.id"
            class="nl-item"
            :class="{ on: n.id === selectedId }"
            :title="`${n.type}  #${n.id}`"
            @click="emit('select', n.id)"
          >
            <span class="nl-id">#{{ n.id }}</span>
            <span class="nl-name">{{ n.title || n.type }}</span>
            <span v-if="n.title && n.title !== n.type" class="nl-type">{{ n.type }}</span>
          </div>
        </div>
      </template>
      <div v-if="!filtered.length" class="nl-empty">没有匹配的节点</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { categoryOf, CATEGORY_LABEL } from './comfy.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
})
const emit = defineEmits(['select'])

const q = ref('')

const filtered = computed(() => {
  const t = q.value.trim().toLowerCase()
  if (!t) return props.nodes
  return props.nodes.filter((n) =>
    `${n.id} ${n.type} ${n.title || ''}`.toLowerCase().includes(t)
  )
})

const ORDER = ['load', 'encode', 'sample', 'latent', 'model', 'image', 'util', 'other']
const groups = computed(() => {
  const m = new Map(ORDER.map((k) => [k, []]))
  for (const n of filtered.value) {
    const c = categoryOf(n.type, n.title)
    ;(m.get(c) || m.get('other')).push(n)
  }
  return ORDER.map((k) => ({ key: k, label: CATEGORY_LABEL[k] || k, items: m.get(k) || [] }))
})
</script>

<style scoped>
.nl { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.nl-top { display: flex; align-items: center; gap: 6px; padding: 7px 8px; flex-shrink: 0; }
.nl-search {
  flex: 1; min-width: 0; border: 1px solid var(--border-color, #d1d5db); border-radius: 5px;
  padding: 4px 8px; font-size: 12.5px; background: var(--bg-surface, #fff);
  color: var(--text-primary, #1f2937); outline: none;
}
.nl-count { font-size: 11px; color: var(--text-muted, #999); flex: 0 0 auto; }
.nl-list { flex: 1; overflow: auto; padding: 0 6px 12px; }
.nl-group { margin-top: 6px; }
.nl-gt {
  display: flex; align-items: center; gap: 5px; padding: 4px 6px;
  font-size: 10.5px; color: var(--text-muted, #888); letter-spacing: .3px;
}
.nl-gn { margin-left: auto; font-size: 10px; opacity: .8; }
.nl-dot { width: 7px; height: 7px; border-radius: 50%; background: #64748b; flex: 0 0 7px; }
.nl-dot.c-load { background: #2563eb; }
.nl-dot.c-encode { background: #7c3aed; }
.nl-dot.c-sample { background: #ea580c; }
.nl-dot.c-latent { background: #0891b2; }
.nl-dot.c-image { background: #16a34a; }
.nl-dot.c-model { background: #db2777; }
.nl-dot.c-util { background: #b45309; }

.nl-item {
  display: flex; align-items: center; gap: 6px; padding: 4px 7px; border-radius: 5px;
  cursor: pointer; font-size: 12px; color: var(--text-primary, #1f2937);
}
.nl-item:hover { background: rgba(0,0,0,.06); }
.nl-item.on { background: rgba(0,103,192,.16); }
.nl-id { font-size: 10.5px; color: var(--text-muted, #aaa); flex: 0 0 auto; min-width: 22px; }
.nl-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nl-type {
  margin-left: auto; font-size: 10px; color: var(--text-muted, #999);
  max-width: 46%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nl-empty { padding: 14px 8px; font-size: 12px; color: var(--text-muted, #999); }
</style>
