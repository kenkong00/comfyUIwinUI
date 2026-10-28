<template>
  <Teleport to="body">
    <div class="toast-host">
      <transition-group name="toast">
        <div v-for="t in toast.list" :key="t.id" class="toast" :class="'toast-' + t.type">
          <span class="toast-ico" v-html="ico(t.type)" />
          <span class="toast-msg">{{ t.msg }}</span>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<script setup>
import { useToast } from '@/shell/toast'
import { icon } from '@/shell/icons'

const toast = useToast()
function ico(type) {
  if (type === 'success') return icon('file')
  if (type === 'error') return icon('close')
  return icon('bell')
}
</script>

<style scoped>
.toast-host {
  position: fixed; right: 16px; bottom: 64px; z-index: 97000;
  display: flex; flex-direction: column; gap: 8px; pointer-events: none;
}
.toast {
  display: flex; align-items: center; gap: 10px;
  background: rgba(40,40,44,.92); color: #fff; backdrop-filter: blur(20px);
  padding: 10px 14px; border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,.35);
  font-size: 13px; min-width: 180px; max-width: 340px; pointer-events: auto;
}
.toast-success { background: rgba(22,163,74,.95); }
.toast-error { background: rgba(220,38,38,.95); }
.toast-ico { width: 16px; height: 16px; display: flex; }
.toast-ico :deep(svg) { width: 16px; height: 16px; }
.toast-enter-active, .toast-leave-active { transition: all .25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(20px); }
</style>
