<template>
  <Teleport to="body">
    <div v-if="menu.items" ref="box" class="ctx-menu" :style="pos" @contextmenu.prevent>
      <template v-for="(it, i) in menu.items" :key="i">
        <div v-if="it.sep" class="ctx-sep" />
        <div
          v-else
          class="ctx-item"
          :class="{ 'ctx-disabled': it.disabled, 'ctx-hassub': it.sub && it.sub.length }"
          @mouseenter="hovered = it.sub ? i : -1"
          @mouseleave="it.sub ? (hovered = -1) : null"
          @click="onClickItem(it)"
        >
          <span class="ctx-ico" v-if="it.icon" v-html="icon(it.icon)" />
          <span class="ctx-ico" v-else />
          <span class="ctx-label">{{ it.label }}</span>
          <span class="ctx-short" v-if="it.shortcut">{{ it.shortcut }}</span>
          <span class="ctx-arrow" v-if="it.sub && it.sub.length" v-html="icon('chevron')" />
          <div
            v-if="it.sub && it.sub.length && hovered === i"
            class="ctx-sub"
            @click.stop
          >
            <template v-for="(s, j) in it.sub" :key="j">
              <div v-if="s.sep" class="ctx-sep" />
              <div
                v-else
                class="ctx-item"
                :class="{ 'ctx-disabled': s.disabled }"
                @click="onClickItem(s)"
              >
                <span class="ctx-ico" v-if="s.icon" v-html="icon(s.icon)" />
                <span class="ctx-ico" v-else />
                <span class="ctx-label">{{ s.label }}</span>
                <span class="ctx-short" v-if="s.shortcut">{{ s.shortcut }}</span>
              </div>
            </template>
          </div>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useCtxMenu } from '@/shell/ctxmenu'
import { icon } from '@/shell/icons'

const menu = useCtxMenu()
const box = ref(null)
const hovered = ref(-1)
const pos = ref({ left: '0px', top: '0px' })

function reposition() {
  if (!menu.items || !box.value) return
  const w = box.value.offsetWidth || 200
  const h = box.value.offsetHeight || 200
  let x = menu.x
  let y = menu.y
  if (x + w > window.innerWidth - 4) x = window.innerWidth - w - 4
  if (y + h > window.innerHeight - 4) y = window.innerHeight - h - 4
  pos.value = { left: Math.max(4, x) + 'px', top: Math.max(4, y) + 'px' }
}

function onClickItem(it) {
  if (it.disabled) return
  if (it.sub && it.sub.length) return // 仅展开子菜单
  if (typeof it.onClick === 'function') it.onClick(menu.ctx)
  menu.close()
}

function onDocClick() { menu.close() }
function onKey(e) { if (e.key === 'Escape') menu.close() }

watch(() => menu.items, () => { hovered.value = -1; nextTick(reposition) })
onMounted(() => {
  document.addEventListener('click', onDocClick)
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', onDocClick)
  window.addEventListener('blur', onDocClick)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onDocClick)
  window.removeEventListener('blur', onDocClick)
})
</script>

<style scoped>
.ctx-menu {
  position: fixed;
  min-width: 200px;
  max-width: 320px;
  background: var(--ctx-bg, rgba(249,249,249,.92));
  backdrop-filter: blur(30px) saturate(1.6);
  -webkit-backdrop-filter: blur(30px) saturate(1.6);
  border: 1px solid var(--border-color, #d8d8d8);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,.32);
  padding: 6px;
  z-index: 98000;
  font-size: 13px;
  color: var(--text-primary, #1f2937);
  user-select: none;
}
[data-theme='dark'] .ctx-menu { --ctx-bg: rgba(40,40,44,.94); color: #e8e8e8; border-color: #3a3a3e; }
.ctx-item {
  position: relative;
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 5px; cursor: pointer;
}
.ctx-item:hover:not(.ctx-disabled) { background: var(--accent-soft, rgba(0,103,192,.12)); }
.ctx-disabled { color: var(--text-muted, #aaa); cursor: default; }
.ctx-ico { width: 16px; height: 16px; display: flex; flex-shrink: 0; }
.ctx-ico :deep(svg) { width: 16px; height: 16px; }
.ctx-label { flex: 1; min-width: 0; }
.ctx-short { color: var(--text-muted, #999); font-size: 11px; }
.ctx-arrow { width: 14px; height: 14px; display: flex; color: var(--text-muted, #999); }
.ctx-arrow :deep(svg) { width: 14px; height: 14px; }
.ctx-sep { height: 1px; background: var(--border-color, #e0e0e0); margin: 5px 6px; }
.ctx-sub {
  position: absolute; left: 100%; top: -6px; margin-left: 2px;
  min-width: 190px; background: var(--ctx-bg, rgba(249,249,249,.96));
  backdrop-filter: blur(30px) saturate(1.6);
  border: 1px solid var(--border-color, #d8d8d8); border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,.32); padding: 6px; z-index: 98001;
}
[data-theme='dark'] .ctx-sub { --ctx-bg: rgba(40,40,44,.96); border-color: #3a3a3e; }
</style>
