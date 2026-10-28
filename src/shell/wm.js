// src/shell/wm.js
// 窗口管理器 Pinia store：负责窗口列表、焦点、z-index、最小/最大/关闭。
import { defineStore } from 'pinia'
import { getApp } from '@/shell/apps'

let _z = 10000
const Z_MAX = 90000

export const useWm = defineStore('wm', {
  state: () => ({
    windows: [],          // { id, appId, title, props, x,y,w,h, state:'normal'|'max'|'min', zIndex, prevRect }
    focusedId: null,
    nextId: 1,
    startMenuOpen: false,
    actionCenterOpen: false,
    searchOpen: false,
    classicMode: false,   // 经典管理界面兜底开关
  }),
  getters: {
    runningGroups(state) {
      const map = {}
      for (const w of state.windows) {
        if (w.state === 'min') continue
        ;(map[w.appId] ||= []).push(w)
      }
      return map
    },
    visibleWindows(state) {
      return state.windows.filter((w) => w.state !== 'min')
    },
  },
  actions: {
    claimZ() {
      _z = _z >= Z_MAX ? 10000 : _z + 1
      return _z
    },
    open(appId, props = {}, opts = {}) {
      const singleton = !!opts.singleton
      if (singleton) {
        const exist = this.windows.find((w) => w.appId === appId)
        if (exist) {
          this.restore(exist.id)
          return exist.id
        }
      }
      const id = 'w' + this.nextId++
      const n = this.windows.length
      const w = {
        id,
        appId,
        props: props || {},
        // 标题优先级：显式 opts.title > props.title（双击文件打开时把文件名放 props.title，
        // 这样窗口标题就是"工具打开的文档名"，而不是应用名）> 应用名
        // 标题优先级：显式 opts.title > props.title（双击文件打开时把文件名放 props.title）> 应用中文名 > appId
        title: opts.title || (props && props.title) || getApp(appId)?.name || appId,
        x: 90 + (n % 8) * 26,
        y: 60 + (n % 8) * 26,
        w: opts.w || 960,
        h: opts.h || 640,
        state: 'normal',
        zIndex: this.claimZ(),
        prevRect: null,
      }
      this.windows.push(w)
      this.focusedId = id
      this.startMenuOpen = false
      this.actionCenterOpen = false
      this.searchOpen = false
      return id
    },
    close(id) {
      const i = this.windows.findIndex((w) => w.id === id)
      if (i < 0) return
      const wasFocused = this.windows[i].id === this.focusedId
      this.windows.splice(i, 1)
      if (wasFocused) {
        const top = this.windows.slice().sort((a, b) => b.zIndex - a.zIndex)[0]
        this.focusedId = top ? top.id : null
      }
    },
    focus(id) {
      const w = this.windows.find((x) => x.id === id)
      if (w) {
        w.zIndex = this.claimZ()
        this.focusedId = id
        if (w.state === 'min') {
          w.state = w.prevRect ? 'max' : 'normal'
          w.prevRect = null
        }
      }
    },
    minimize(id) {
      const w = this.windows.find((x) => x.id === id)
      if (!w) return
      w.state = 'min'
      if (this.focusedId === id) {
        const top = this.windows.filter((x) => x.state !== 'min').sort((a, b) => b.zIndex - a.zIndex)[0]
        this.focusedId = top ? top.id : null
      }
    },
    toggleMax(id) {
      const w = this.windows.find((x) => x.id === id)
      if (!w) return
      if (w.state === 'max') {
        if (w.prevRect) Object.assign(w, w.prevRect)
        w.state = 'normal'
        w.prevRect = null
      } else {
        w.prevRect = { x: w.x, y: w.y, w: w.w, h: w.h }
        w.state = 'max'
        w.x = 0; w.y = 0
        w.w = window.innerWidth
        w.h = window.innerHeight - 48 // 减去任务栏
      }
      this.focus(id)
    },
    setTitle(id, title) {
      const w = this.windows.find((x) => x.id === id)
      if (w) w.title = title
    },
    // 贴靠（Windows 11 Snap）：pos ∈ 'left' | 'right' | 'max'
    snap(id, pos) {
      const w = this.windows.find((x) => x.id === id)
      if (!w) return
      if (w.state === 'max') {
        if (w.prevRect) Object.assign(w, w.prevRect)
        w.state = 'normal'
        w.prevRect = null
      }
      const W = window.innerWidth
      const H = window.innerHeight - 48 // 减去任务栏
      if (pos === 'max') {
        w.prevRect = { x: w.x, y: w.y, w: w.w, h: w.h }
        w.state = 'max'
        w.x = 0; w.y = 0; w.w = W; w.h = H
      } else if (pos === 'left') {
        w.state = 'normal'; w.x = 0; w.y = 0; w.w = Math.floor(W / 2); w.h = H
      } else if (pos === 'right') {
        w.state = 'normal'; w.x = Math.floor(W / 2); w.y = 0; w.w = Math.ceil(W / 2); w.h = H
      }
      this.focus(id)
    },
    setRect(id, rect) {
      const w = this.windows.find((x) => x.id === id)
      if (w && w.state === 'normal') Object.assign(w, rect)
    },
    toggleStart() {
      this.startMenuOpen = !this.startMenuOpen
      this.actionCenterOpen = false
      this.searchOpen = false
    },
    toggleActionCenter() {
      this.actionCenterOpen = !this.actionCenterOpen
      this.startMenuOpen = false
    },
    toggleSearch() {
      this.searchOpen = !this.searchOpen
      this.startMenuOpen = false
    },
  },
})
