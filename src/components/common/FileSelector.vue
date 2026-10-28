<template>
  <div
    class="file-selector"
    :class="{ disabled, 'drag-over': isOver && isAcceptable, 'drag-forbidden': isOver && !isAcceptable }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDropEvent"
  >
    <div class="selected-area">
      <!-- 多选模式：chips -->
      <template v-if="mode === 'multiple'">
        <div class="selected-chips" v-if="selectedFiles.length > 0">
          <div
            v-for="file in selectedFiles"
            :key="file.id"
            class="chip"
          >
            <span class="chip-name">{{ file.name || '未命名' }}</span>
            <button
              v-if="!disabled"
              type="button"
              class="chip-remove"
              @click.stop="removeFile(file.id)"
              title="移除"
            >×</button>
          </div>
        </div>
        <span v-else class="empty-hint">{{ placeholder || '未选择文件' }}</span>
      </template>

      <!-- 单选模式：显示选中名称 -->
      <template v-else>
        <span v-if="selectedSingle" class="single-name">{{ selectedSingle.name || '未命名' }}</span>
        <span v-else class="empty-hint">{{ placeholder || '未选择文件' }}</span>
      </template>

      <button
        v-if="!disabled"
        type="button"
        class="add-btn"
        @click.stop="showPicker = !showPicker"
      >
        {{ showPicker ? '收起' : `+ 添加${typeLabel}` }}
      </button>
    </div>

    <div v-if="showPicker && !disabled" class="picker-panel" @click.stop>
      <div class="picker-header">
        <span class="picker-title">选择{{ typeLabel }}（仅显示可调用文件夹）</span>
        <button type="button" class="picker-close" @click="showPicker = false">×</button>
      </div>

      <div class="picker-search">
        <input
          type="text"
          v-model="searchQuery"
          :placeholder="`搜索${typeLabel}名称...`"
          class="search-input"
        />
      </div>

      <div class="file-list" v-if="filteredFiles.length > 0">
        <label
          v-for="file in filteredFiles"
          :key="file.id"
          class="file-item"
          :class="{ checked: isSelected(file.id), single: mode === 'single' }"
          @click="toggleFile(file.id)"
        >
          <input
            v-if="mode === 'multiple'"
            type="checkbox"
            :checked="isSelected(file.id)"
            @change.stop="toggleFile(file.id)"
            @click.stop
          />
          <div v-else :class="['radio', { checked: isSelected(file.id) }]"></div>
          <div class="file-info">
            <div class="file-name">{{ file.name || '未命名' }}</div>
            <div class="file-meta" v-if="file.folder_path">
              <span class="folder-path">{{ file.folder_path }}</span>
            </div>
          </div>
        </label>
      </div>
      <div v-else class="picker-empty">
        <p>暂无{{ typeLabel }}</p>
        <small>请在文件库中将对应文件夹设为"可调用"并放入{{ typeLabel }}文件</small>
      </div>

      <div class="picker-footer">
        <span class="selected-count" v-if="mode === 'multiple'">已选 {{ modelValue.length }} 个</span>
        <span class="selected-count" v-else>{{ selectedSingle ? '已选 1 个' : '未选择' }}</span>
        <button type="button" class="confirm-btn" @click="showPicker = false">确定</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { apiClient } from '@/services/api'
import { FILE_TYPES } from '@/stores/fileLibrary'
import { useDropTarget } from '@/composables/useDragDrop'

const props = defineProps({
  modelValue: {
    type: [Array, Number],
    default: () => []
  },
  // 文件类型：image/video/audio/prompt/json/workflow/rule
  fileType: {
    type: String,
    required: true
  },
  // 额外接受的文件类型数组（如 ['rule'] 表示同时接受 rule 类型）
  acceptTypes: {
    type: Array,
    default: () => []
  },
  // 选择模式：multiple=多选 single=单选
  mode: {
    type: String,
    default: 'multiple'
  },
  placeholder: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const showPicker = ref(false)
const searchQuery = ref('')
const allFiles = ref([])

const typeLabel = computed(() => {
  const main = FILE_TYPES[props.fileType]?.label || '文件'
  if (props.acceptTypes.length === 0) return main
  const extras = props.acceptTypes.map(t => FILE_TYPES[t]?.label || t)
  return [main, ...extras].join('/')
})

// 所有可接受的类型列表（fileType + acceptTypes）
const allAcceptTypes = computed(() => {
  const list = [props.fileType]
  for (const t of props.acceptTypes) {
    if (!list.includes(t)) list.push(t)
  }
  // 提示词兼容：资源管理器里新建/导入的提示词文件多为 text 类型
  // （新建文本文档 .txt / 导入文本），插入提示词时应同样可见、可拖入。
  if (props.fileType === 'prompt' && !list.includes('text')) list.push('text')
  return list
})

// 拖拽接收：接受与 fileType 或 acceptTypes 匹配的内部文件
const { isOver, isAcceptable, onDragOver, onDragLeave, onDropEvent } = useDropTarget(
  (types) => allAcceptTypes.value.some(ft => types.includes(`application/x-rfp-type-${ft}`)),
  (item) => {
    if (!item || props.disabled) return
    // 将拖入的文件对象加入 allFiles（若不存在），以便芯片/名称能正确显示
    if (item._kind === 'file' && !allFiles.value.find(f => f.id === item.id)) {
      allFiles.value.push(item)
    }
    if (props.mode === 'multiple') {
      const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
      if (!current.includes(item.id)) {
        current.push(item.id)
        emit('update:modelValue', current)
      }
    } else {
      emit('update:modelValue', item.id)
    }
  }
)

// 已选文件对象列表（多选）
const selectedFiles = computed(() => {
  if (props.mode !== 'multiple') return []
  if (!Array.isArray(props.modelValue) || props.modelValue.length === 0) return []
  return props.modelValue
    .map(id => allFiles.value.find(f => f.id === id))
    .filter(Boolean)
})

// 已选单个文件对象（单选）
const selectedSingle = computed(() => {
  if (props.mode !== 'single') return null
  if (!props.modelValue) return null
  return allFiles.value.find(f => f.id === props.modelValue) || null
})

const filteredFiles = computed(() => {
  let list = allFiles.value
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(f =>
      (f.name || '').toLowerCase().includes(q) ||
      (f.folder_path || '').toLowerCase().includes(q)
    )
  }
  return list
})

function isSelected(id) {
  if (props.mode === 'multiple') {
    return Array.isArray(props.modelValue) && props.modelValue.includes(id)
  }
  return props.modelValue === id
}

function toggleFile(id) {
  if (props.mode === 'multiple') {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const idx = current.indexOf(id)
    if (idx > -1) current.splice(idx, 1)
    else current.push(id)
    emit('update:modelValue', current)
  } else {
    // 单选
    if (props.modelValue === id) {
      emit('update:modelValue', null)
    } else {
      emit('update:modelValue', id)
    }
  }
}

function removeFile(id) {
  if (props.mode !== 'multiple') return
  const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
  const idx = current.indexOf(id)
  if (idx > -1) {
    current.splice(idx, 1)
    emit('update:modelValue', current)
  }
}

async function loadFiles() {
  try {
    // 加载所有可接受类型的文件并合并
    const results = await Promise.all(
      allAcceptTypes.value.map(ft => apiClient.getCallableFiles(ft))
    )
    // 合并去重
    const merged = new Map()
    for (const list of results) {
      if (Array.isArray(list)) {
        for (const f of list) merged.set(f.id, f)
      }
    }
    // 同时补齐 modelValue 中引用但不在可调用列表里的文件（拖入的非可调用文件）
    const referencedIds = props.mode === 'multiple'
      ? (Array.isArray(props.modelValue) ? props.modelValue : [])
      : (props.modelValue ? [props.modelValue] : [])
    const missingIds = referencedIds.filter(id => !merged.has(id))
    if (missingIds.length > 0) {
      try {
        const fetched = await Promise.all(
          missingIds.map(id => apiClient.getFileLibraryFileById(id).catch(() => null))
        )
        for (const f of fetched) {
          if (f && f.id) merged.set(f.id, f)
        }
      } catch (e) {
        // 忽略单个文件获取失败
      }
    }
    // 保留 allFiles 中已存在但本次未加载的项（避免拖入的文件被覆盖丢失）
    for (const existing of allFiles.value) {
      if (!merged.has(existing.id)) {
        // 如果是 modelValue 引用的，保留
        if (referencedIds.includes(existing.id)) {
          merged.set(existing.id, existing)
        }
      }
    }
    allFiles.value = [...merged.values()]
  } catch (e) {
    console.error(`加载可调用${props.fileType}文件失败:`, e)
    allFiles.value = []
  }
}

watch(() => props.fileType, () => {
  loadFiles()
})

// 用 JSON 字符串对比，避免 :accept-types="['rule']" 字面量数组每次渲染产生新引用导致重复加载
let lastAcceptTypesKey = JSON.stringify(props.acceptTypes || [])
watch(() => props.acceptTypes, (newVal) => {
  const key = JSON.stringify(newVal || [])
  if (key === lastAcceptTypesKey) return
  lastAcceptTypesKey = key
  loadFiles()
}, { deep: true })

// 当 modelValue 变化时，补齐 allFiles 中缺失的文件（防止拖入的非可调用文件丢失）
watch(() => props.modelValue, async (newVal) => {
  const ids = props.mode === 'multiple'
    ? (Array.isArray(newVal) ? newVal : [])
    : (newVal ? [newVal] : [])
  const missing = ids.filter(id => !allFiles.value.find(f => f.id === id))
  if (missing.length > 0) {
    try {
      const fetched = await Promise.all(
        missing.map(id => apiClient.getFileLibraryFileById(id).catch(() => null))
      )
      for (const f of fetched) {
        if (f && f.id && !allFiles.value.find(x => x.id === f.id)) {
          allFiles.value.push(f)
        }
      }
    } catch (e) {
      // 忽略
    }
  }
}, { deep: true })

onMounted(() => {
  loadFiles()
})

// 暴露给父组件用于刷新
defineExpose({ loadFiles, allFiles })
</script>

<style scoped>
.file-selector {
  position: relative;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-surface, #fff);
  padding: 8px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.file-selector.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.file-selector.drag-over {
  outline: 2px dashed var(--accent-color, #4a9eff);
  outline-offset: -2px;
  background: rgba(74, 158, 255, 0.08);
}

.file-selector.drag-over.drag-forbidden {
  outline-color: #ef4444;
  cursor: not-allowed;
}

.file-selector:focus-within {
  border-color: var(--accent-color, #4a9eff);
}

.selected-area {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 32px;
}

.selected-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.empty-hint {
  color: var(--text-secondary, #9ca3af);
  font-size: 13px;
  line-height: 28px;
  flex: 1;
}

.single-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #374151);
  line-height: 28px;
  flex: 1;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--accent-color, #4a9eff);
  color: var(--accent-text, #fff);
  border-radius: 14px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.chip-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-remove {
  background: transparent !important;
  border: none !important;
  color: inherit !important;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  padding: 0 !important;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.15s ease;
  box-shadow: none !important;
}

.chip-remove:hover {
  background: rgba(255, 255, 255, 0.25);
}

.add-btn {
  padding: 4px 12px !important;
  background: var(--bg-secondary, #f3f4f6) !important;
  color: var(--text-primary, #374151) !important;
  border: 1px dashed var(--border-color, #d1d5db) !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  box-shadow: none !important;
}

.add-btn:hover {
  border-color: var(--accent-color, #4a9eff) !important;
  color: var(--accent-color, #4a9eff) !important;
}

.picker-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 1000;
  background: var(--bg-surface, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  max-height: 400px;
  overflow: hidden;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  flex-shrink: 0;
}

.picker-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #374151);
}

.picker-close {
  width: 24px;
  height: 24px;
  background: transparent !important;
  border: none !important;
  color: var(--text-secondary, #6b7280) !important;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  border-radius: 4px;
  padding: 0 !important;
  box-shadow: none !important;
}

.picker-close:hover {
  background: var(--bg-secondary, #f3f4f6) !important;
}

.picker-search {
  padding: 8px 14px;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
  padding: 6px 10px !important;
  font-size: 13px !important;
  background: var(--bg-secondary, #f3f4f6) !important;
  color: var(--text-primary, #374151) !important;
  border: 1px solid var(--border-color, #e5e7eb) !important;
  border-radius: 6px !important;
  outline: none !important;
  box-shadow: none !important;
  box-sizing: border-box;
}

.search-input:focus {
  border-color: var(--accent-color, #4a9eff) !important;
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px;
}

.file-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
  margin-bottom: 2px;
}

.file-item:hover {
  background: var(--bg-secondary, #f3f4f6);
}

.file-item.checked {
  background: rgba(74, 158, 255, 0.08);
}

.file-item input[type="checkbox"] {
  margin-top: 2px;
  cursor: pointer;
  flex-shrink: 0;
}

.radio {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color, #d1d5db);
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 2px;
  position: relative;
  transition: all 0.15s ease;
}

.radio.checked {
  border-color: var(--accent-color, #4a9eff);
}

.radio.checked::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 6px;
  height: 6px;
  background: var(--accent-color, #4a9eff);
  border-radius: 50%;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #374151);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta {
  margin-top: 2px;
}

.folder-path {
  font-size: 11px;
  color: var(--text-secondary, #9ca3af);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-empty {
  padding: 32px 14px;
  text-align: center;
  color: var(--text-secondary, #9ca3af);
}

.picker-empty p {
  font-size: 14px;
  margin: 0 0 4px 0;
}

.picker-empty small {
  font-size: 12px;
  display: block;
  margin-top: 4px;
  opacity: 0.8;
}

.picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid var(--border-color, #e5e7eb);
  flex-shrink: 0;
}

.selected-count {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}

.confirm-btn {
  padding: 6px 16px !important;
  background: var(--accent-color, #4a9eff) !important;
  color: var(--accent-text, #fff) !important;
  border: none !important;
  border-radius: 6px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  cursor: pointer;
  box-shadow: none !important;
}

.confirm-btn:hover {
  opacity: 0.85;
}
</style>
