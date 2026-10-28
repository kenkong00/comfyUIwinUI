<template>
  <div
    class="nav-folder"
    :class="{ 'drag-over': dragOver }"
    @dragover.prevent="onOver"
    @dragleave="onLeave"
    @drop="onDrop"
  >
    <div class="nav-node" @click="$emit('open', node)">
      <span class="nav-tw" @click.stop="$emit('expand', node)" v-html="expanded.has(node.id) ? icon('chevronDown') : icon('chevron')" />
      <span class="nav-ico" v-html="icon('folder')" />
      <span class="nav-label">{{ node.name }}</span>
    </div>
    <div v-if="expanded.has(node.id)" class="nav-children">
      <NavFolder
        v-for="c in children"
        :key="c.id"
        :node="c"
        :depth="depth + 1"
        :expanded="expanded"
        :children-of="childrenOf"
        @expand="(n) => $emit('expand', n)"
        @open="(f) => $emit('open', f)"
        @drop="(id, e) => $emit('drop', id, e)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { icon } from '@/shell/icons'

const props = defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 1 },
  expanded: { type: Object, required: true },
  childrenOf: { type: Object, required: true },
})
const emit = defineEmits(['expand', 'open', 'drop'])

const dragOver = ref(false)
const children = computed(() => props.childrenOf[props.node.id] || [])

function onOver() { dragOver.value = true }
function onLeave() { dragOver.value = false }
function onDrop(e) {
  dragOver.value = false
  emit('drop', props.node.folderId, e)
}
</script>

<style scoped>
.nav-folder.drag-over > .nav-node { background: rgba(0,103,192,.18); outline: 1px dashed rgba(0,103,192,.5); }
.nav-children { margin-left: 14px; }
.nav-node { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 5px; cursor: pointer; user-select: none; }
.nav-node:hover { background: rgba(0,0,0,.06); }
.nav-ico, .nav-tw { width: 16px; height: 16px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.nav-tw :deep(svg) { width: 12px; height: 12px; }
.nav-ico :deep(svg) { width: 16px; height: 16px; }
.nav-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; }
</style>
