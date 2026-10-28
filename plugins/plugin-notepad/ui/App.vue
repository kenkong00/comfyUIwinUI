<template>
  <div class="tx-host">
    <!-- 顶部：文件名（可直接改名）+ 保存 / 另存到… -->
    <div class="tx-bar">
      <span class="tx-ico" v-html="icon('notepad')" />
      <input
        v-model="fileName"
        class="tx-name"
        :readonly="readOnly"
        spellcheck="false"
        placeholder="未命名文本文档"
        @keydown.enter.prevent="save"
      />
      <span class="tx-spacer" />
      <button class="tx-btn primary" :disabled="readOnly || saving" @click="save">
        {{ fileId ? '保存' : '保存到…' }} <span class="tx-k">Ctrl+S</span>
      </button>
      <button v-if="fileId" class="tx-btn" :disabled="saving" @click="saveAsNew">另存为…</button>
    </div>

    <!-- 正文 -->
    <div class="tx-body">
      <textarea
        ref="taEl"
        v-model="text"
        class="tx-editor"
        :readonly="readOnly"
        spellcheck="false"
        placeholder="在此输入提示词规则 / 提示词内容 / 小说正文…"
        @keydown.ctrl.s.prevent="save"
        @select="onSelect"
        @keyup="onSelect"
        @click="onSelect"
      />
    </div>

    <!-- 底部：保存位置 + 统计（字符 = 不含空格换行的文字/标点数量） -->
    <div class="tx-foot">
      <span class="tx-loc" :title="locTitle">位置：{{ locText }}</span>
      <span class="tx-spacer" />
      <span v-if="dirty" class="tx-dirty">● 未保存</span>
      <span class="tx-stat" title="字符：不含空格与换行的字符数（含标点）">{{ charCount }} 字符</span>
      <span class="tx-dot">·</span>
      <span class="tx-stat">{{ lineCount }} 行</span>
      <span class="tx-dot">·</span>
      <span class="tx-stat">{{ selectedCount }} 字选中</span>
    </div>

    <!-- 保存位置选择（新建文档保存时弹出，像 Windows 另存为） -->
    <div v-if="saveToOpen" class="tx-mask" @click.self="saveToOpen = false">
      <div class="tx-dlg">
        <div class="tx-dlg-title">{{ fileId && !asNew ? '保存到' : '另存为' }}</div>
        <label class="tx-field">
          <span>文件名</span>
          <input v-model="fileName" class="tx-inp" spellcheck="false" placeholder="未命名文本文档" />
        </label>
        <label class="tx-field">
          <span>保存到</span>
          <select v-model="saveCatId" class="tx-inp" @change="onCatChange">
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label class="tx-field">
          <span>文件夹</span>
          <select v-model="saveFolderId" class="tx-inp">
            <option :value="null">（盘符根目录）</option>
            <option v-for="f in foldersInCat" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
        </label>
        <div class="tx-dlg-foot">
          <button class="tx-btn" @click="saveToOpen = false">取消</button>
          <button class="tx-btn primary" :disabled="saving" @click="doSaveTo">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { apiClient } from '@/services/api'
import { useToast } from '@/shell/toast'
import { icon } from '@/shell/icons'

const props = defineProps({
  title: { type: String, default: '' },
  content: { type: String, default: '' },
  fileId: { type: [Number, String], default: null },
  fileType: { type: String, default: 'text' },
  readOnly: { type: Boolean, default: false },
  onSave: { type: Function, default: null },
})
const emit = defineEmits(['set-title'])

const toast = useToast()
const text = ref(props.content || '')
const fileName = ref(props.title || '未命名文本文档')
const fileId = ref(props.fileId ?? null)
const saving = ref(false)
const dirty = ref(false)
const saveToOpen = ref(false)
const asNew = ref(false)
const taEl = ref(null)
const selectedCount = ref(0)

// 保存位置（新建文档用）
const categories = ref([])
const allFolders = ref([])
const saveCatId = ref(null)
const saveFolderId = ref(null)
const foldersInCat = computed(() =>
  allFolders.value.filter((f) => Number(f.category_id || 0) === Number(saveCatId.value || 0))
)

const charCount = computed(() => (text.value || '').replace(/\s/g, '').length)
const lineCount = computed(() => (text.value || '').split('\n').length)
const locText = computed(() => {
  if (fileId.value) return '已打开的文档'
  if (!saveCatId.value) return '未选择（点“保存到…”选择目录）'
  const c = categories.value.find((x) => x.id === saveCatId.value)
  const f = allFolders.value.find((x) => x.id === saveFolderId.value)
  return [c ? c.name : '', f ? f.name : ''].filter(Boolean).join(' / ')
})
const locTitle = computed(() => locText.value)

watch(text, () => { dirty.value = true })
watch(fileName, (v) => { if (v) emit('set-title', v + (dirty.value ? ' *' : '')) })

onMounted(async () => {
  emit('set-title', fileName.value)
  try {
    categories.value = await apiClient.getFileLibraryCategories() || []
    allFolders.value = await apiClient.getFileLibraryFolders({ parent_id: 'all' }) || []
    if (!saveCatId.value && categories.value.length) saveCatId.value = categories.value[0].id
  } catch (e) { /* 列表加载失败不影响编辑 */ }
})

function onCatChange() { saveFolderId.value = null }

function onSelect() {
  const el = taEl.value
  if (!el) return
  selectedCount.value = (el.selectionEnd || 0) - (el.selectionStart || 0)
}

// 保存：已打开文档 → 回写原文件（可同时改名）；新文档 → 弹出"保存到…"
async function save() {
  if (props.readOnly) return
  if (!fileId.value || asNew.value) { await openSaveTo(asNew.value); return }
  await writeBack()
}
async function writeBack() {
  if (!fileName.value.trim()) { toast.show('文件名不能为空', 'error'); return }
  saving.value = true
  try {
    const r = await apiClient.updateFileLibraryFile(Number(fileId.value), {
      name: fileName.value.trim(),
      content: text.value,
    })
    if (!r) throw new Error('后端未返回数据')
    dirty.value = false
    emit('set-title', fileName.value.trim())
    toast.show('已保存', 'success')
  } catch (e) {
    toast.show('保存失败：' + (e.message || e), 'error')
  } finally {
    saving.value = false
  }
}
async function openSaveTo(isAsNew = false) {
  asNew.value = isAsNew
  if (!categories.value.length) {
    try { categories.value = await apiClient.getFileLibraryCategories() || [] } catch (e) { /* ignore */ }
  }
  if (!allFolders.value.length) {
    try { allFolders.value = await apiClient.getFileLibraryFolders({ parent_id: 'all' }) || [] } catch (e) { /* ignore */ }
  }
  saveToOpen.value = true
}
async function doSaveTo() {
  if (!fileName.value.trim()) { toast.show('请填写文件名', 'error'); return }
  saving.value = true
  try {
    const r = await apiClient.createFileLibraryFile({
      name: fileName.value.trim(),
      content: text.value,
      file_type: props.fileType || 'text',
      category_id: Number(saveCatId.value) || 0,
      folder_id: saveFolderId.value ?? null,
    })
    if (!r || !r.id) throw new Error('后端未返回新建文件')
    fileId.value = r.id
    asNew.value = false
    dirty.value = false
    saveToOpen.value = false
    emit('set-title', fileName.value.trim())
    toast.show(`已保存到 ${locText.value}`, 'success')
  } catch (e) {
    toast.show('保存失败：' + (e.message || e), 'error')
  } finally {
    saving.value = false
  }
}
function saveAsNew() { openSaveTo(true) }
</script>

<style scoped>
.tx-host { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-secondary, #f3f4f6); }
/* 顶部条 */
.tx-bar {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
  padding: 8px 10px; border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-surface, #fff);
}
.tx-ico { width: 20px; height: 20px; flex-shrink: 0; }
.tx-ico :deep(svg) { width: 20px; height: 20px; }
.tx-name {
  flex: 1; min-width: 0; max-width: 340px;
  font-size: 13px; padding: 5px 9px; border-radius: 6px;
  border: 1px solid transparent; background: transparent;
  color: var(--text-primary, #1f2937); font-weight: 600;
}
.tx-name:hover { border-color: var(--border-color, #d1d5db); }
.tx-name:focus { outline: none; border-color: var(--accent-color, #0067c0); background: var(--bg-surface, #fff); }
.tx-spacer { flex: 1; }
.tx-btn {
  border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff);
  border-radius: 6px; padding: 5px 11px; font-size: 12.5px; cursor: pointer;
  color: var(--text-primary, #1f2937); white-space: nowrap;
}
.tx-btn:hover:not(:disabled) { background: rgba(0,103,192,.08); }
.tx-btn.primary { background: var(--accent-color, #0067c0); border-color: var(--accent-color, #0067c0); color: #fff; }
.tx-btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
.tx-btn:disabled { opacity: .5; cursor: default; }
.tx-k { font-size: 10px; opacity: .75; margin-left: 4px; }

/* 正文：内缩卡片式编辑区，焦点高亮在卡片内部，不会溢出窗口 */
.tx-body { flex: 1; min-height: 0; padding: 10px; box-sizing: border-box; }
.tx-editor {
  width: 100%; height: 100%; box-sizing: border-box; resize: none;
  border: 1px solid var(--border-color, #dfe3e8); border-radius: 8px;
  padding: 12px 14px; font-size: 13.5px; line-height: 1.75;
  font-family: 'Cascadia Code', Consolas, 'Microsoft YaHei', monospace;
  color: var(--text-primary, #1f2937); background: var(--bg-surface, #fff);
  outline: none; transition: border-color .15s ease, box-shadow .15s ease;
}
.tx-editor:focus {
  border-color: var(--accent-color, #0067c0);
  box-shadow: inset 0 0 0 1px rgba(0,103,192,.35);
}

/* 底部状态栏 */
.tx-foot {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0;
  padding: 5px 12px; border-top: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-surface, #fff); font-size: 11.5px; color: var(--text-muted, #888);
}
.tx-loc { max-width: 46%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tx-stat { white-space: nowrap; }
.tx-dot { opacity: .5; }
.tx-dirty { color: #d97706; font-size: 11.5px; }

/* 另存为弹窗 */
.tx-mask { position: absolute; inset: 0; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; z-index: 20; }
.tx-dlg {
  width: 380px; max-width: 92%; background: var(--bg-surface, #fff);
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0,0,0,.25); padding: 14px 16px;
}
.tx-dlg-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--text-primary, #1f2937); }
.tx-field { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12.5px; color: var(--text-primary, #1f2937); }
.tx-field > span { width: 56px; flex-shrink: 0; color: var(--text-muted, #888); }
.tx-inp {
  flex: 1; min-width: 0; font-size: 12.5px; padding: 6px 8px; border-radius: 6px;
  border: 1px solid var(--border-color, #d1d5db); background: var(--bg-surface, #fff);
  color: var(--text-primary, #1f2937);
}
.tx-inp:focus { outline: none; border-color: var(--accent-color, #0067c0); }
.tx-dlg-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
</style>
