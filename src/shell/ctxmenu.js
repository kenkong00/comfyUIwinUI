// src/shell/ctxmenu.js
// 全局右键菜单 store：单例 ContextMenu 组件订阅它来渲染。
import { defineStore } from 'pinia'

export const useCtxMenu = defineStore('ctxmenu', {
  state: () => ({
    items: null,  // [{ label, icon, shortcut, disabled, sep, sub:[], onClick }]
    x: 0,
    y: 0,
    ctx: null,   // 调用方传入的上下文对象
  }),
  actions: {
    open(items, x, y, ctx = null) {
      this.items = items
      // 先记录，渲染后由组件自行做边缘翻转
      this.x = x
      this.y = y
      this.ctx = ctx
    },
    close() {
      this.items = null
      this.ctx = null
    },
  },
})

// 便捷函数：在鼠标事件处弹出菜单
export function openContextMenu(items, ev, ctx = null) {
  ev.preventDefault()
  ev.stopPropagation()
  const store = useCtxMenu()
  const x = ev.clientX
  const y = ev.clientY
  store.open(items, x, y, ctx)
}
