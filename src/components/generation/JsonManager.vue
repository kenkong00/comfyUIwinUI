<template>
  <div class="card json-manager">
    <h2>JSON管理</h2>

    <!-- 上传区域：两个拖拽框（JSON / TXT，颜色区分） -->
    <div class="upload-row">
      <div
        class="upload-zone json-zone"
        :class="{ dragover: isDragOver }"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleDrop"
        @click="triggerFileInput"
      >
        <input
          type="file"
          ref="fileInput"
          multiple
          accept=".json"
          @change="handleFileSelect"
          style="display: none"
        />
        <div class="upload-text">
          <p class="zone-title json-title">上传 JSON 文件</p>
          <small>点击或拖拽 .json 文件到此处上传（支持多选）</small>
        </div>
      </div>
      <div
        class="upload-zone txt-zone"
        :class="{ dragover: isTxtDragOver }"
        @dragover.prevent="isTxtDragOver = true"
        @dragleave.prevent="isTxtDragOver = false"
        @drop.prevent="handleTxtDrop"
        @click="triggerTxtFileInput"
      >
        <input
          type="file"
          ref="txtFileInput"
          multiple
          accept=".txt"
          @change="handleTxtFileSelect"
          style="display: none"
        />
        <div class="upload-text">
          <p class="zone-title txt-title">上传 TXT 批量转换</p>
          <small>点击或拖拽 .txt 文件，自动解析分镜并转换为 JSON</small>
        </div>
      </div>
    </div>

    <!-- 转换进度区（TXT 转换记录，保留失败文件信息） -->
    <div v-if="convertProgress.length > 0" class="convert-progress">
      <div class="progress-header">
        <span class="progress-title">TXT 转换记录</span>
        <span class="progress-summary">
          成功 {{ txtSuccessCount }} / 失败 {{ txtFailCount }} / 共 {{ convertProgress.length }}
          <span v-if="isConverting" class="converting-tag">转换中…</span>
          <button v-else class="btn-clear-progress" @click="convertProgress = []">清空记录</button>
        </span>
      </div>
      <div class="progress-list">
        <div
          v-for="(item, idx) in convertProgress"
          :key="idx"
          :class="['progress-item', item.status]"
        >
          <span class="progress-name" :title="item.name">{{ item.name }}</span>
          <span class="progress-status">
            <span v-if="item.status === 'success'" class="tag-ok">✓ 成功</span>
            <span v-else-if="item.status === 'fail'" class="tag-fail">✗ 失败{{ item.message ? '：' + item.message : '' }}</span>
            <span v-else class="tag-pending">转换中…</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 分类标签 -->
    <div class="category-bar">
      <div class="category-tabs">
        <div
          v-for="cat in allCategories"
          :key="cat.id"
          :class="['category-tab', { active: activeCategory === cat.id }]"
          @click="activeCategory = cat.id"
        >
          <span class="cat-name">{{ cat.name }}</span>
          <span class="cat-count">{{ getCategoryCount(cat.id) }}</span>
          <span v-if="!cat.is_system && cat.id !== 'all'" class="cat-actions" @click.stop>
            <button class="cat-action-btn" @click="renameCategory(cat)" title="重命名">改</button>
            <button class="cat-action-btn danger" @click="confirmDeleteCategory(cat)" title="删除">删</button>
          </span>
        </div>
      </div>
      <button class="btn btn-sm" @click="showAddCategory = true">+ 添加分类</button>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <button class="btn btn-sm" @click="toggleSelectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
        <span class="btn-divider">|</span>
        <button :disabled="selectedIds.length === 0" class="btn btn-sm btn-danger" @click="confirmBatchDelete">
          删除选中 ({{ selectedIds.length }})
        </button>
        <button :disabled="selectedIds.length === 0" class="btn btn-sm" @click="showBatchMove = true">
          移动选中
        </button>
        <button :disabled="selectedIds.length === 0" class="btn btn-sm" @click="doBatchValidate">
          校验选中
        </button>
      </div>
      <div class="toolbar-right">
        <input type="text" v-model="searchQuery" placeholder="搜索..." class="search-input" />
      </div>
    </div>

    <!-- JSON文件列表 -->
    <div class="json-list" v-if="filteredJsons.length > 0">
      <div class="list-header">
        <div class="col-check"></div>
        <div class="col-name">名称</div>
        <div class="col-count">分镜数</div>
        <div class="col-status">状态</div>
        <div class="col-cat">分类</div>
        <div class="col-date">创建时间</div>
        <div class="col-actions">操作</div>
      </div>
      <div
        v-for="json in filteredJsons"
        :key="json.id"
        :class="['list-row', { selected: selectedIds.includes(json.id) }]"
      >
        <div class="col-check" @click.stop="toggleSelect(json.id)">
          <div :class="['checkbox', { checked: selectedIds.includes(json.id) }]"></div>
        </div>
        <div class="col-name" @click="editJson(json)" :title="json.filename || json.name">{{ json.name }}</div>
        <div class="col-count">{{ json.prompt_count }}</div>
        <div class="col-status">
          <span :class="['status-badge', json.is_valid ? 'valid' : 'invalid']">
            {{ json.is_valid ? '有效' : '无效' }}
          </span>
        </div>
        <div class="col-cat">{{ getCategoryName(json.category_id) }}</div>
        <div class="col-date">{{ formatDate(json.created_at) }}</div>
        <div class="col-actions" @click.stop>
          <button class="btn-icon-sm" @click="editJson(json)" title="编辑">编辑</button>
          <button class="btn-icon-sm" @click="moveJson(json)" title="移动分类">移动</button>
          <button class="btn-icon-sm danger" @click="confirmDeleteJson(json)" title="删除">删除</button>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <p>暂无JSON文件，请上传</p>
    </div>

    <!-- 添加分类对话框 -->
    <FloatingWindow v-model:open="showAddCategory" title="添加分类" size="default">
      <div class="form-group">
        <label>分类名称</label>
        <input type="text" v-model="newCategoryName" placeholder="输入分类名称" @keyup.enter="doAddCategory" />
      </div>
      <template #footer>
        <button class="btn" @click="showAddCategory = false">取消</button>
        <button class="btn btn-primary" @click="doAddCategory" :disabled="!newCategoryName">添加</button>
      </template>
    </FloatingWindow>

    <!-- 重命名分类对话框 -->
    <FloatingWindow v-model:open="renamingCategoryOpen" title="重命名分类" size="default">
      <template v-if="renamingCategory">
        <div class="form-group">
          <label>新名称</label>
          <input type="text" v-model="renameForm.name" @keyup.enter="doRenameCategory" />
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="renamingCategory = null">取消</button>
        <button class="btn btn-primary" @click="doRenameCategory">确定</button>
      </template>
    </FloatingWindow>

    <!-- 编辑JSON对话框 -->
    <FloatingWindow v-model:open="editingJsonOpen" :title="`编辑JSON: ${editingJson?.name || ''}`" size="large">
      <template v-if="editingJson">
        <div class="form-group">
          <label>名称</label>
          <input type="text" v-model="editForm.name" />
        </div>
        <div class="form-group">
          <label>分类</label>
          <select v-model="editForm.category_id">
            <option v-for="cat in userCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>JSON内容</label>
          <textarea v-model="editForm.json_data" rows="15" class="json-textarea"></textarea>
        </div>
        <div v-if="editMessage" class="edit-message" :class="{ error: editMessageError }">{{ editMessage }}</div>
      </template>
      <template #footer>
        <button class="btn" @click="closeEditor">取消</button>
        <button class="btn btn-primary" @click="doSaveJson">保存</button>
      </template>
    </FloatingWindow>

    <!-- 移动分类对话框 -->
    <FloatingWindow v-model:open="movingJsonOpen" title="移动分类" size="default">
      <template v-if="movingJson">
        <div class="form-group">
          <label>目标分类</label>
          <select v-model="moveForm.category_id">
            <option v-for="cat in userCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="movingJson = null">取消</button>
        <button class="btn btn-primary" @click="doMoveJson">确定</button>
      </template>
    </FloatingWindow>

    <!-- 批量移动分类对话框 -->
    <FloatingWindow v-model:open="showBatchMove" title="批量移动分类" size="default">
      <p>将选中的 {{ selectedIds.length }} 个文件移动到：</p>
      <div class="form-group">
        <select v-model="batchCategoryId">
          <option v-for="cat in userCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="showBatchMove = false">取消</button>
        <button class="btn btn-primary" @click="doBatchMove">确定</button>
      </template>
    </FloatingWindow>

    <!-- 删除确认弹窗 -->
    <FloatingWindow v-model:open="deleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">{{ deleteConfirm.message }}</p>
      <template #footer>
        <button class="btn" @click="deleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDelete">确定删除</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { apiClient } from '@/services/api'
import { useConfigStore } from '@/stores/config'
import { parseStoryboardWithConfig, buildPromptFromTemplate } from '@/utils/storyboardParser'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const configStore = useConfigStore()

const activeCategory = ref('all')
const searchQuery = ref('')
const selectedIds = ref([])
const jsons = ref([])
const categories = ref([])

const showAddCategory = ref(false)
const newCategoryName = ref('')

const renamingCategory = ref(null)
const renameForm = reactive({ name: '' })

const editingJson = ref(null)
const editForm = reactive({ name: '', category_id: 0, json_data: '' })
const editMessage = ref('')
const editMessageError = ref(false)

const movingJson = ref(null)
const moveForm = reactive({ category_id: 0 })

const showBatchMove = ref(false)
const batchCategoryId = ref(0)

const isDragOver = ref(false)
const fileInput = ref(null)

const isTxtDragOver = ref(false)
const txtFileInput = ref(null)
const convertProgress = ref([])
const isConverting = ref(false)

const deleteConfirm = ref({ show: false, type: '', target: null, message: '' })

const userCategories = computed(() => categories.value)

const allCategories = computed(() => {
  const all = [{ id: 'all', name: '全部', is_system: false }]
  return [...all, ...categories.value]
})

// Writable computed proxies for FloatingWindow v-model:open
const renamingCategoryOpen = computed({
  get: () => !!renamingCategory.value,
  set: (v) => { if (!v) renamingCategory.value = null }
})
const editingJsonOpen = computed({
  get: () => !!editingJson.value,
  set: (v) => { if (!v) closeEditor() }
})
const movingJsonOpen = computed({
  get: () => !!movingJson.value,
  set: (v) => { if (!v) movingJson.value = null }
})
const deleteConfirmOpen = computed({
  get: () => deleteConfirm.value.show,
  set: (v) => { if (!v) deleteConfirm.value.show = false }
})

const filteredJsons = computed(() => {
  let list = jsons.value
  if (activeCategory.value !== 'all') {
    list = list.filter(j => j.category_id === activeCategory.value)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(j => j.name.toLowerCase().includes(q) || (j.filename || '').toLowerCase().includes(q))
  }
  return list
})

const allSelected = computed(() => {
  return filteredJsons.value.length > 0 && filteredJsons.value.every(j => selectedIds.value.includes(j.id))
})

const txtSuccessCount = computed(() => convertProgress.value.filter(i => i.status === 'success').length)
const txtFailCount = computed(() => convertProgress.value.filter(i => i.status === 'fail').length)

function getCategoryName(categoryId) {
  if (!categoryId || categoryId === 0) return '未分类'
  const cat = categories.value.find(c => c.id === categoryId)
  return cat ? cat.name : '未分类'
}

function getCategoryCount(categoryId) {
  if (categoryId === 'all') return jsons.value.length
  return jsons.value.filter(j => j.category_id === categoryId).length
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = selectedIds.value.filter(id => !filteredJsons.value.some(j => j.id === id))
  } else {
    filteredJsons.value.forEach(j => {
      if (!selectedIds.value.includes(j.id)) selectedIds.value.push(j.id)
    })
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function loadJsons() {
  try {
    jsons.value = await apiClient.getStoryboardJsons()
    // 清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
    if (selectedIds.value.length > 0) {
      const validIds = new Set(jsons.value.map(item => item.id))
      selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
    }
  } catch (e) {
    console.error('加载JSON列表失败:', e)
  }
}

async function loadCategories() {
  try {
    categories.value = await apiClient.getStoryboardCategories()
  } catch (e) {
    console.error('加载分类失败:', e)
  }
}

// 上传处理
async function handleFileSelect(event) {
  const files = Array.from(event.target.files)
  await uploadFiles(files)
  event.target.value = ''
}

async function handleDrop(event) {
  isDragOver.value = false
  const files = Array.from(event.dataTransfer.files).filter(f => f.name.endsWith('.json'))
  await uploadFiles(files)
}

async function uploadFiles(files) {
  if (files.length === 0) return
  let successCount = 0
  let failCount = 0
  const targetCategoryId = activeCategory.value !== 'all' ? activeCategory.value : 0

  for (const file of files) {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      await apiClient.createStoryboardJson({
        category_id: targetCategoryId,
        name: file.name.replace(/\.json$/i, ''),
        filename: file.name,
        json_data: data
      })
      successCount++
    } catch (e) {
      failCount++
      console.error(`上传 ${file.name} 失败:`, e)
    }
  }
  await loadJsons()
  if (failCount > 0) {
    alert(`上传完成: ${successCount} 个成功, ${failCount} 个失败`)
  }
}

// ============ TXT 批量转换 ============
function triggerTxtFileInput() {
  txtFileInput.value?.click()
}

async function handleTxtFileSelect(event) {
  const files = Array.from(event.target.files).filter(f => f.name.toLowerCase().endsWith('.txt'))
  await convertFiles(files)
  event.target.value = ''
}

async function handleTxtDrop(event) {
  isTxtDragOver.value = false
  const files = Array.from(event.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.txt'))
  await convertFiles(files)
}

function parseStoryboard(content) {
  const cfg = configStore.storyboardParser
  return parseStoryboardWithConfig(content, cfg)
}

function generatePrompt(storyboard) {
  const cfg = configStore.storyboardParser
  if (storyboard.content) {
    return storyboard.content
  }
  return buildPromptFromTemplate(storyboard, cfg?.promptTemplate)
}

async function convertFiles(files) {
  if (files.length === 0) return
  isConverting.value = true
  const targetCategoryId = activeCategory.value !== 'all' ? activeCategory.value : 0
  convertProgress.value = files.map(f => ({ name: f.name, status: 'pending', message: '' }))

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    try {
      const text = await file.text()
      let storyboards
      try {
        storyboards = parseStoryboard(text)
      } catch (parseErr) {
        convertProgress.value[i].status = 'fail'
        convertProgress.value[i].message = '解析失败'
        continue
      }

      const prompts = storyboards.map(sb => ({ id: sb.id, prompt: generatePrompt(sb) }))
      if (prompts.length === 0) {
        convertProgress.value[i].status = 'fail'
        convertProgress.value[i].message = '未识别到分镜'
        continue
      }

      try {
        await apiClient.createStoryboardJson({
          category_id: targetCategoryId,
          name: file.name.replace(/\.txt$/i, ''),
          filename: file.name,
          json_data: prompts
        })
        convertProgress.value[i].status = 'success'
      } catch (createErr) {
        convertProgress.value[i].status = 'fail'
        convertProgress.value[i].message = createErr.message || '写入失败'
      }
    } catch (e) {
      convertProgress.value[i].status = 'fail'
      convertProgress.value[i].message = e.message || '读取失败'
    }
  }

  isConverting.value = false
  await loadJsons()
}

// 分类操作
async function doAddCategory() {
  if (!newCategoryName.value) return
  try {
    await apiClient.createStoryboardCategory({ name: newCategoryName.value })
    showAddCategory.value = false
    newCategoryName.value = ''
    await loadCategories()
  } catch (e) {
    alert('添加分类失败: ' + e.message)
  }
}

function renameCategory(cat) {
  renamingCategory.value = cat
  renameForm.name = cat.name
}

async function doRenameCategory() {
  if (!renamingCategory.value || !renameForm.name) return
  try {
    await apiClient.updateStoryboardCategory(renamingCategory.value.id, { name: renameForm.name })
    renamingCategory.value = null
    await loadCategories()
  } catch (e) {
    alert('重命名失败: ' + e.message)
  }
}

async function confirmDeleteCategory(cat) {
  deleteConfirm.value = { show: true, type: 'category', target: cat, message: `确定要删除分类"${cat.name}"吗？\n该分类下的JSON文件将移到"未分类"` }
}

// JSON编辑
async function editJson(json) {
  try {
    const full = await apiClient.getStoryboardJsonById(json.id)
    if (!full) return
    editingJson.value = full
    editForm.name = full.name
    editForm.category_id = full.category_id || 0
    let dataStr = full.json_data
    if (typeof dataStr === 'string') {
      try {
        dataStr = JSON.stringify(JSON.parse(dataStr), null, 2)
      } catch (e) { /* keep raw */ }
    } else {
      dataStr = JSON.stringify(dataStr, null, 2)
    }
    editForm.json_data = dataStr
    editMessage.value = ''
    editMessageError.value = false
  } catch (e) {
    console.error('加载JSON详情失败:', e)
  }
}

function closeEditor() {
  editingJson.value = null
  editMessage.value = ''
  editMessageError.value = false
}

async function doSaveJson() {
  if (!editingJson.value) return
  try {
    // 验证JSON格式
    JSON.parse(editForm.json_data)
    await apiClient.updateStoryboardJson(editingJson.value.id, {
      name: editForm.name,
      category_id: editForm.category_id,
      json_data: editForm.json_data
    })
    editMessage.value = '保存成功'
    editMessageError.value = false
    await loadJsons()
    setTimeout(() => { closeEditor() }, 800)
  } catch (e) {
    editMessage.value = '保存失败: ' + e.message
    editMessageError.value = true
  }
}

// 移动分类
function moveJson(json) {
  movingJson.value = json
  moveForm.category_id = json.category_id || 0
}

async function doMoveJson() {
  if (!movingJson.value) return
  try {
    await apiClient.updateStoryboardJson(movingJson.value.id, { category_id: moveForm.category_id })
    movingJson.value = null
    await loadJsons()
  } catch (e) {
    alert('移动失败: ' + e.message)
  }
}

// 删除
async function confirmDeleteJson(json) {
  deleteConfirm.value = { show: true, type: 'json', target: json, message: `确定要删除"${json.name}"吗？` }
}

// 批量操作
async function confirmBatchDelete() {
  deleteConfirm.value = { show: true, type: 'batch', target: null, message: `确定要删除选中的 ${selectedIds.value.length} 个文件吗？` }
}

async function doDelete() {
  const { type, target } = deleteConfirm.value
  deleteConfirm.value.show = false
  try {
    if (type === 'category') {
      await apiClient.deleteStoryboardCategory(target.id)
      if (activeCategory.value === target.id) activeCategory.value = 'all'
      await loadCategories()
      await loadJsons()
    } else if (type === 'json') {
      await apiClient.deleteStoryboardJson(target.id)
      await loadJsons()
    } else if (type === 'batch') {
      await apiClient.batchDeleteStoryboardJsons(selectedIds.value)
      selectedIds.value = []
      await loadJsons()
    }
  } catch (e) {
    alert('删除失败: ' + e.message)
  }
}

async function doBatchMove() {
  try {
    await apiClient.batchCategorizeStoryboardJsons(selectedIds.value, batchCategoryId.value)
    selectedIds.value = []
    showBatchMove.value = false
    await loadJsons()
  } catch (e) {
    alert('批量移动失败: ' + e.message)
  }
}

async function doBatchValidate() {
  try {
    await apiClient.batchValidateStoryboardJsons(selectedIds.value)
    await loadJsons()
  } catch (e) {
    alert('批量校验失败: ' + e.message)
  }
}

onMounted(() => {
  loadCategories()
  loadJsons()
})
</script>

<style scoped>
.json-manager {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
}

.json-manager h2 {
  margin: 0 0 16px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.category-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}

.category-tabs {
  display: flex;
  gap: 4px;
  padding: 0;
  background: transparent;
  border-radius: 0;
  flex-wrap: wrap;
  flex: 1;
  border-bottom: 1px solid var(--border-color);
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
  white-space: nowrap;
  position: relative;
}

.category-tab:hover {
  color: var(--text-primary);
}

.category-tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-color, #4a9eff);
}

.cat-count {
  font-size: 11px;
  opacity: 0.7;
}

.cat-actions {
  display: none;
  gap: 2px;
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 2px 4px;
  z-index: 10;
}

.category-tab:hover .cat-actions {
  display: flex;
}

.cat-action-btn {
  padding: 1px 4px;
  background: transparent;
  border: 1px solid var(--text-muted, #555);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 10px;
  cursor: pointer;
  line-height: 1.2;
}

.cat-action-btn:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.cat-action-btn.danger:hover {
  background: #fee2e2;
  color: #ef4444;
  border-color: #ef4444;
}

.upload-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.upload-zone {
  flex: 1;
  min-width: 240px;
  border: 2px dashed var(--text-muted);
  border-radius: 10px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-surface);
}

/* JSON 上传框：蓝色主题 */
.upload-zone.json-zone {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.04);
}

.upload-zone.json-zone:hover,
.upload-zone.json-zone.dragover {
  border-color: #2563eb;
  background: rgba(59, 130, 246, 0.1);
}

/* TXT 转换框：绿色主题 */
.upload-zone.txt-zone {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.04);
}

.upload-zone.txt-zone:hover,
.upload-zone.txt-zone.dragover {
  border-color: #059669;
  background: rgba(16, 185, 129, 0.1);
}

.zone-title {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
}

.json-title {
  color: #2563eb;
}

.txt-title {
  color: #059669;
}

.upload-text small {
  font-size: 12px;
  color: var(--text-secondary);
}

/* TXT 转换进度区 */
.convert-progress {
  background: var(--bg-surface);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 16px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.1);
}

.progress-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.progress-summary {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.converting-tag {
  color: var(--accent-color);
}

.btn-clear-progress {
  padding: 2px 10px;
  background: transparent;
  border: 1px solid var(--text-muted);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.btn-clear-progress:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.progress-list {
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  background: var(--bg-secondary);
}

.progress-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  max-width: 60%;
}

.progress-status {
  flex-shrink: 0;
}

.tag-ok {
  color: #4CAF50;
  font-weight: 600;
}

.tag-fail {
  color: #ef4444;
  font-weight: 600;
}

.tag-pending {
  color: var(--text-secondary);
}

.progress-item.fail {
  background: rgba(239, 68, 68, 0.06);
}

.progress-item.success {
  background: rgba(76, 175, 80, 0.06);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left, .toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  width: 200px;
  box-shadow: none;
  box-sizing: border-box;
}

.json-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
}

.list-header, .list-row {
  display: grid;
  grid-template-columns: 40px 1fr 70px 70px 100px 110px 160px;
  align-items: center;
  padding: 10px 12px;
  gap: 8px;
}

.list-header {
  background: var(--bg-secondary);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128,128,128,0.1));
}

.list-row {
  font-size: 13px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128,128,128,0.05));
  transition: background 0.15s ease;
}

.list-row:hover {
  background: var(--bg-secondary);
}

.list-row.selected {
  background: rgba(74, 158, 255, 0.08);
}

.list-row:last-child {
  border-bottom: none;
}

.col-check {
  display: flex;
  justify-content: center;
  cursor: pointer;
}

.checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--text-muted);
  border-radius: 4px;
  transition: all 0.15s ease;
}

.checkbox.checked {
  background: var(--accent-color);
  border-color: var(--accent-color);
  position: relative;
}

.checkbox.checked::after {
  content: '✓';
  color: white;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.col-name {
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.col-name:hover {
  color: var(--accent-color);
}

.col-count {
  font-size: 12px;
  color: var(--text-secondary);
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.status-badge.valid {
  background: rgba(76, 175, 80, 0.15);
  color: #4CAF50;
}

.status-badge.invalid {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.col-cat {
  font-size: 12px;
  color: var(--text-secondary);
}

.col-date {
  font-size: 12px;
  color: var(--text-muted);
}

.col-actions {
  display: flex;
  gap: 4px;
}

.btn-icon-sm {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-icon-sm:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--accent-color);
}

.btn-icon-sm.danger:hover {
  background: #fee2e2;
  color: #ef4444;
  border-color: #ef4444;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

/* Buttons */
.btn {
  padding: 8px 16px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: none;
}

.btn:hover:not(:disabled) {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-color: var(--accent-color, #4a9eff);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 批量按钮分隔符 */
.btn-divider {
  color: var(--text-tertiary, #666);
  margin: 0 4px;
  opacity: 0.5;
}

.btn-primary {
  background: var(--accent-color);
  color: var(--accent-text);
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-primary);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  box-shadow: var(--input-shadow);
}

.json-textarea {
  font-family: monospace;
  resize: vertical;
  min-height: 300px;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-x: hidden;
  overflow-y: auto;
}

.edit-message {
  margin-top: 8px;
  font-size: 13px;
  color: #4CAF50;
  padding: 8px 12px;
  background: rgba(76, 175, 80, 0.1);
  border-radius: 6px;
}

.edit-message.error {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.fw-confirm-msg {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-line;
  line-height: 1.6;
}
</style>
