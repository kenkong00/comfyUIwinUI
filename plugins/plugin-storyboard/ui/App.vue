<template>
  <div class="sb-host">
    <SettingsPanel
      :initial-tab="'parser'"
      :standalone="true"
      :file-id="fileId"
      :file-name="fileName"
      :file-content="fileContent"
      @saved="onFileSaved"
    />
  </div>
</template>

<script setup>
// 分镜生成：把设置面板中的"分镜生成"选项卡抽成独立应用（独立窗口使用）。
// 双击 Json 分镜文件时，wm.open('storyboard', { fileId, fileName, fileContent })
// 会把这些参数作为 props 传进来 —— 此时是"编辑器"模式，保存直接回写原文件。
// 像 Windows 一样：窗口标题 = 打开的文件名；保存改名后标题同步更新。
import { onMounted } from 'vue'
import SettingsPanel from '@/components/settings/SettingsPanel.vue'

const props = defineProps({
  fileId: { type: [Number, String], default: null },
  fileName: { type: String, default: '' },
  fileContent: { type: String, default: '' }
})

// WindowFrame 监听 set-title 事件来设置窗口标题
const emit = defineEmits(['set-title'])

onMounted(() => {
  emit('set-title', props.fileName || 'Json 分镜')
})

// 文件编辑模式下保存成功（可能改了名）→ 同步窗口标题
function onFileSaved(payload) {
  const n = (payload && payload.name) || props.fileName
  if (n) emit('set-title', n)
}
</script>

<style scoped>
.sb-host {
  height: 100%;
  overflow: auto;
  background: var(--bg-surface, #fff);
}
.sb-host :deep(.settings-panel) {
  border: none;
  border-radius: 0;
  height: 100%;
}
.storyboard-save-ok { color: #16a085; font-size: 13px; align-self: center; }
.storyboard-save-err { color: #e74c3c; font-size: 13px; align-self: center; }
</style>
