<template>
  <div class="md-editor">
    <div class="md-toolbar">
      <button :class="{ active: mode === 'edit' }" @click="mode = 'edit'">编辑</button>
      <button :class="{ active: mode === 'split' }" @click="mode = 'split'">分屏</button>
      <button :class="{ active: mode === 'preview' }" @click="mode = 'preview'">预览</button>
      <span class="md-hint">支持 Markdown 格式</span>
    </div>
    <div class="md-body" :class="mode">
      <textarea
        v-show="mode !== 'preview'"
        ref="textareaRef"
        class="md-textarea"
        :value="modelValue"
        :placeholder="placeholder"
        :rows="rows"
        @input="onInput"
        @keydown.tab="onTab"
      ></textarea>
      <div v-show="mode !== 'edit'" class="md-preview" v-html="previewHtml"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { marked } from 'marked'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '请输入内容，支持 Markdown 格式...' },
  rows: { type: Number, default: 12 }
})

const emit = defineEmits(['update:modelValue'])

const mode = ref('edit')
const textareaRef = ref(null)

marked.setOptions({ breaks: true, gfm: true })

const previewHtml = computed(() => {
  try {
    return marked.parse(props.modelValue || '')
  } catch {
    return props.modelValue || ''
  }
})

function onInput(e) {
  emit('update:modelValue', e.target.value)
}

// Tab 键缩进
function onTab(e) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const ta = e.target
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const value = ta.value
    const newValue = value.substring(0, start) + '  ' + value.substring(end)
    emit('update:modelValue', newValue)
    // 恢复光标位置
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + 2
    })
  }
}
</script>

<style scoped>
.md-editor {
  border: 1px solid var(--border-color, #ddd);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-surface, #fff);
}

.md-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--bg-main, #f5f5f5);
  border-bottom: 1px solid var(--border-color, #ddd);
}

.md-toolbar button {
  padding: 4px 12px;
  border: none;
  background: transparent;
  color: var(--text-secondary, #666);
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}

.md-toolbar button:hover {
  background: var(--bg-surface, #fff);
  color: var(--text-primary, #333);
}

.md-toolbar button.active {
  background: var(--accent-color, #4f46e5);
  color: var(--accent-text, #fff);
}

.md-hint {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary, #999);
}

.md-body {
  display: flex;
  min-height: 200px;
}

.md-body.edit .md-textarea {
  flex: 1;
  width: 100%;
}

.md-body.split .md-textarea,
.md-body.split .md-preview {
  flex: 1;
  width: 50%;
}

.md-body.preview .md-preview {
  flex: 1;
  width: 100%;
}

.md-textarea {
  resize: vertical;
  min-height: 200px;
  padding: 12px;
  border: none;
  outline: none;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  background: var(--bg-surface, #fff);
  color: var(--text-primary, #333);
}

.md-preview {
  padding: 12px 16px;
  overflow-y: auto;
  border-left: 1px solid var(--border-color, #eee);
  background: var(--bg-surface, #fff);
  color: var(--text-primary, #333);
  font-size: 14px;
  line-height: 1.7;
}

.md-body:not(.split) .md-preview {
  border-left: none;
}

.md-preview :deep(h1) { font-size: 1.6em; margin: 0.6em 0 0.4em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
.md-preview :deep(h2) { font-size: 1.4em; margin: 0.6em 0 0.4em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
.md-preview :deep(h3) { font-size: 1.2em; margin: 0.6em 0 0.4em; }
.md-preview :deep(h4) { font-size: 1em; margin: 0.6em 0 0.4em; }
.md-preview :deep(p) { margin: 0.5em 0; }
.md-preview :deep(ul), .md-preview :deep(ol) { padding-left: 1.5em; margin: 0.5em 0; }
.md-preview :deep(li) { margin: 0.25em 0; }
.md-preview :deep(code) { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
.md-preview :deep(pre) { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow-x: auto; margin: 0.5em 0; }
.md-preview :deep(pre code) { background: transparent; padding: 0; }
.md-preview :deep(blockquote) { border-left: 4px solid #ddd; padding-left: 12px; color: #666; margin: 0.5em 0; }
.md-preview :deep(strong) { font-weight: 600; }
.md-preview :deep(em) { font-style: italic; }
.md-preview :deep(a) { color: var(--accent-color, #4f46e5); text-decoration: none; }
.md-preview :deep(table) { border-collapse: collapse; margin: 0.5em 0; }
.md-preview :deep(th), .md-preview :deep(td) { border: 1px solid #ddd; padding: 6px 12px; }
.md-preview :deep(hr) { border: none; border-top: 1px solid #eee; margin: 1em 0; }
</style>
