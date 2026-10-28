// plugins/plugin-storyboard/ui/index.js
// 插件 UI 入口：默认导出一个 Vue 组件（appId = "storyboard"）。
// 本插件是「设置面板 → 分镜生成」选项卡的独立窗口形态；
// 双击分镜文件时 vfs 会传 { fileId, fileName, fileContent } 进入编辑器模式。
export { default } from './App.vue'
