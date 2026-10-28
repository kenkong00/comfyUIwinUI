import { defineStore } from 'pinia'
import { ref } from 'vue'

// 高于 Sidebar(1000) 和 RightFilterPanel(1000)
// 低于 ImageViewer(99999)，保证全屏图片查看器永远盖住浮动窗口
const BASE_Z = 10000
const CEILING = 90000

export const useWindowManager = defineStore('windowManager', () => {
  const nextZ = ref(BASE_Z + 1)
  const focusedId = ref(null)

  function claimZ() {
    const z = nextZ.value
    nextZ.value = z + 1 > CEILING ? BASE_Z + 1 : z + 1
    return z
  }

  function focus(id) {
    focusedId.value = id
  }

  return { claimZ, focus, focusedId, BASE_Z, CEILING }
})
