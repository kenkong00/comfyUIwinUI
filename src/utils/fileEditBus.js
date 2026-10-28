import { ref } from 'vue'

const listeners = new Set()
const lastEvent = ref(null)

export function emitEditFile(file) {
  lastEvent.value = { file, ts: Date.now() }
  listeners.forEach((fn) => {
    try {
      fn(file)
    } catch (e) {
      console.error('[fileEditBus] listener error:', e)
    }
  })
}

export function onEditFile(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function useFileEditBus() {
  return { emitEditFile, onEditFile, lastEvent }
}

