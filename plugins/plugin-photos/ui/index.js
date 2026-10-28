// plugins/plugin-photos/ui/index.js
// 插件 UI 入口：默认导出一个 Vue 组件（appId = "photos"）。
// 内核在启动时 import 本文件并注册；双击图片文件时由 vfs 唤起 wm.open('photos', { src, title })。
export { default } from './App.vue'
