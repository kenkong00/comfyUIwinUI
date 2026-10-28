// plugins/plugin-workflow/ui/index.js
// 插件 UI 入口：默认导出一个 Vue 组件（appId = "workflow"）。
// 双击工作流文件时由 vfs 唤起 wm.open('workflow', { json, fileId, workflowId, title })。
export { default } from './App.vue'
