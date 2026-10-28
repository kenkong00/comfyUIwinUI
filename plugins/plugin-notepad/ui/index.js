// plugins/plugin-notepad/ui/index.js
// 插件 UI 入口：默认导出一个 Vue 组件。
// 内核（src/shell/pluginRegistry.js）会在启动时 import 本文件并注册为 appId = "notepad"。
//
// 约定：
//   - 这里只做「导出」，业务逻辑写在同目录的 .vue / .js 里
//   - 可以直接 import 内核能力：@/services/api、@/shell/toast、@/shell/icons、@/stores/*
//   - 不要 import 内核未暴露的内部文件，否则内核升级时会断
export { default } from './App.vue'
