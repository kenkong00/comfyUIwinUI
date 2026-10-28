<template>
  <div class="card workflow-manager">
    <h2>工作流管理</h2>

    <!-- 上传区域 -->
    <div
      class="upload-zone"
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
        <p>点击或拖拽JSON文件到此处上传（支持多选）</p>
        <small>上传时名称使用文件名，分类使用当前选中的分类</small>
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
          <span v-if="isUserCategory(cat)" class="cat-actions" @click.stop>
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
        <button :disabled="selectedIds.length === 0" class="btn btn-sm btn-danger" @click="confirmBatchDelete">
          删除选中 ({{ selectedIds.length }})
        </button>
        <button :disabled="selectedIds.length === 0" class="btn btn-sm" @click="showBatchCategorize = true">
          移动选中
        </button>
      </div>
      <div class="toolbar-right">
        <input type="text" v-model="searchQuery" placeholder="搜索工作流..." class="search-input" />
      </div>
    </div>

    <!-- 工作流列表 -->
    <div class="workflow-list" v-if="filteredWorkflows.length > 0">
      <div class="list-header">
        <div class="col-check"></div>
        <div class="col-name">名称</div>
        <div class="col-filename">文件名</div>
        <div class="col-category">分类</div>
        <div class="col-date">创建时间</div>
        <div class="col-actions">操作</div>
      </div>
      <div
        v-for="wf in filteredWorkflows"
        :key="wf.id"
        :class="['workflow-row', { selected: selectedIds.includes(wf.id) }]"
        @click="selectWorkflow(wf)"
      >
        <div class="col-check" @click.stop="toggleSelect(wf.id)">
          <div :class="['checkbox', { checked: selectedIds.includes(wf.id) }]"></div>
        </div>
        <div class="col-name">{{ wf.name }}</div>
        <div class="col-filename">{{ wf.filename || '无文件名' }}</div>
        <div class="col-category">{{ getCategoryName(wf.category_id) }}</div>
        <div class="col-date">{{ formatDate(wf.created_at) }}</div>
        <div class="col-actions" @click.stop>
          <button class="btn-icon-sm" @click="editWorkflow(wf)" title="编辑节点">编辑</button>
          <button class="btn-icon-sm" @click="reuploadWorkflow(wf)" title="重新上传">重传</button>
          <button class="btn-icon-sm" @click="renameWorkflow(wf)" title="重命名">改名</button>
          <button class="btn-icon-sm" @click="changeCategory(wf)" title="移动分类">移动</button>
          <button class="btn-icon-sm btn-danger-icon" @click="confirmDeleteWorkflow(wf)" title="删除">删除</button>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <p>暂无工作流，点击"上传工作流"添加</p>
    </div>

    <!-- 节点编辑对话框 -->
    <FloatingWindow v-model:open="editingWorkflowOpen" :title="`编辑工作流: ${editingWorkflow?.name || ''}`" size="large">
      <template v-if="editingWorkflow">
        <div class="workflow-editor-layout">
          <div class="editor-left">
            <div class="node-list">
              <div
                v-for="(node, id) in editingWorkflowData"
                :key="id"
                :class="['node-item', { active: selectedNodeId === id }]"
                @click="selectNode(id)"
              >
                <span class="node-id">{{ id }}</span>
                <span class="node-type">{{ node.class_type }}</span>
              </div>
            </div>
          </div>
          <div class="editor-right">
            <div v-if="selectedNode" class="edit-panel">
              <div class="node-id-container">
                <span>节点ID：<strong>{{ selectedNodeId }}</strong></span>
              </div>
              <div class="form-group">
                <label>属性名称</label>
                <select v-model="editNodeProperty" @change="onEditPropertyChange">
                  <option value="" disabled>请选择属性</option>
                  <option v-for="prop in editableNodeProps" :key="prop.key" :value="prop.key">
                    {{ prop.key }} ({{ formatPreview(prop.value) }})
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>属性值</label>
                <textarea v-model="editNodeValue" rows="5"></textarea>
              </div>
              <button class="btn btn-primary" @click="doUpdateNode">更新节点</button>
              <p v-if="editMessage" class="edit-message">{{ editMessage }}</p>
            </div>
            <div v-else class="empty-hint">
              <p>请从左侧选择一个节点进行编辑</p>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="closeEditor">完成</button>
      </template>
    </FloatingWindow>

    <!-- 重命名对话框 -->
    <FloatingWindow v-model:open="renamingWorkflowOpen" title="重命名工作流" size="default">
      <template v-if="renamingWorkflow">
        <div class="form-group">
          <label>新名称</label>
          <input type="text" v-model="renameForm.name" @keyup.enter="doRename" />
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="renamingWorkflow = null">取消</button>
        <button class="btn btn-primary" @click="doRename">确定</button>
      </template>
    </FloatingWindow>

    <!-- 移动分类对话框 -->
    <FloatingWindow v-model:open="movingWorkflowOpen" title="移动分类" size="default">
      <template v-if="movingWorkflow">
        <div class="form-group">
          <label>目标分类</label>
          <select v-model="moveForm.category_id">
            <option v-for="cat in allCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="movingWorkflow = null">取消</button>
        <button class="btn btn-primary" @click="doMoveCategory">确定</button>
      </template>
    </FloatingWindow>

    <!-- 批量移动分类对话框 -->
    <FloatingWindow v-model:open="showBatchCategorize" title="批量移动分类" size="default">
      <p>将选中的 {{ selectedIds.length }} 个工作流移动到：</p>
      <div class="form-group">
        <select v-model="batchCategoryId">
          <option v-for="cat in allCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="showBatchCategorize = false">取消</button>
        <button class="btn btn-primary" @click="doBatchCategorize">确定</button>
      </template>
    </FloatingWindow>

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
          <input type="text" v-model="renameCategoryForm.name" @keyup.enter="doRenameCategory" />
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="renamingCategory = null">取消</button>
        <button class="btn btn-primary" @click="doRenameCategory">确定</button>
      </template>
    </FloatingWindow>

    <!-- 删除分类确认对话框 -->
    <FloatingWindow v-model:open="deletingCategoryOpen" title="确认" size="confirm">
      <template v-if="deletingCategory">
        <p class="fw-confirm-msg">确定要删除分类"{{ deletingCategory.name }}"吗？<br/><small>该分类下的工作流将移到"未分类"</small></p>
      </template>
      <template #footer>
        <button class="btn" @click="deletingCategory = null">取消</button>
        <button class="btn btn-danger" @click="doDeleteCategory">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 删除工作流/批量删除确认对话框 -->
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
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const activeCategory = ref('all')
const searchQuery = ref('')
const selectedIds = ref([])
const workflows = ref([])
const categories = ref([])

// Upload (drag & drop)
const isDragOver = ref(false)
const fileInput = ref(null)

// Editor
const editingWorkflow = ref(null)
const editingWorkflowData = ref(null)
const selectedNodeId = ref(null)
const editNodeProperty = ref('')
const editNodeValue = ref('')
const editMessage = ref('')
const editingWfId = ref(null)

// Rename
const renamingWorkflow = ref(null)
const renameForm = reactive({ name: '' })

// Move
const movingWorkflow = ref(null)
const moveForm = reactive({ category_id: 0 })

// Batch
const showBatchCategorize = ref(false)
const batchCategoryId = ref(0)

// Add category
const showAddCategory = ref(false)
const newCategoryName = ref('')

// Rename / delete category
const renamingCategory = ref(null)
const renameCategoryForm = reactive({ name: '' })
const deletingCategory = ref(null)

// Delete confirmation (workflow / batch)
const deleteConfirm = ref({ show: false, type: '', target: null, message: '' })

// Default categories
const defaultCategories = [
  { id: 'all', name: '全部' },
  { id: 'uncategorized', name: '未分类' }
]

const allCategories = computed(() => {
  const userCats = categories.value.map(c => ({ id: c.id, name: c.name }))
  return [...defaultCategories, ...userCats]
})

// Writable computed proxies for FloatingWindow v-model:open
const editingWorkflowOpen = computed({
  get: () => !!editingWorkflow.value,
  set: (v) => { if (!v) closeEditor() }
})
const renamingWorkflowOpen = computed({
  get: () => !!renamingWorkflow.value,
  set: (v) => { if (!v) renamingWorkflow.value = null }
})
const movingWorkflowOpen = computed({
  get: () => !!movingWorkflow.value,
  set: (v) => { if (!v) movingWorkflow.value = null }
})
const renamingCategoryOpen = computed({
  get: () => !!renamingCategory.value,
  set: (v) => { if (!v) renamingCategory.value = null }
})
const deletingCategoryOpen = computed({
  get: () => !!deletingCategory.value,
  set: (v) => { if (!v) deletingCategory.value = null }
})
const deleteConfirmOpen = computed({
  get: () => deleteConfirm.value.show,
  set: (v) => { if (!v) deleteConfirm.value.show = false }
})

function isUserCategory(cat) {
  return cat.id !== 'all' && cat.id !== 'uncategorized'
}

const filteredWorkflows = computed(() => {
  let list = workflows.value
  if (activeCategory.value !== 'all') {
    const cat = allCategories.value.find(c => c.id === activeCategory.value)
    if (cat) {
      if (cat.id === 'uncategorized') {
        // 未分类：不属于任何用户自定义分类的工作流（含旧固定分类 id 1-5）
        const userCatIds = new Set(categories.value.map(c => c.id))
        list = list.filter(w => !w.category_id || w.category_id === 0 || !userCatIds.has(w.category_id))
      } else {
        list = list.filter(w => w.category_id === cat.id)
      }
    }
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(w => w.name.toLowerCase().includes(q) || (w.filename || '').toLowerCase().includes(q))
  }
  return list
})

function getCategoryName(categoryId) {
  if (!categoryId || categoryId === 0 || categoryId === 'uncategorized') return '未分类'
  const cat = allCategories.value.find(c => c.id === categoryId)
  return cat ? cat.name : '未分类'
}

function getCategoryCount(categoryId) {
  if (categoryId === 'all') return workflows.value.length
  const cat = allCategories.value.find(c => c.id === categoryId)
  if (!cat) return 0
  if (cat.id === 'uncategorized') {
    const userCatIds = new Set(categories.value.map(c => c.id))
    return workflows.value.filter(w => !w.category_id || w.category_id === 0 || !userCatIds.has(w.category_id)).length
  } else {
    return workflows.value.filter(w => w.category_id === cat.id).length
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function formatPreview(value) {
  if (value === null || value === undefined) return 'null'
  const str = String(value)
  return str.length > 20 ? str.slice(0, 20) + '...' : str
}

function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function selectWorkflow(wf) {
  // Click selects workflow + opens it
  editWorkflow(wf)
}

async function loadWorkflows() {
  try {
    workflows.value = await apiClient.getWorkflowAPIs()
    // 清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
    if (selectedIds.value.length > 0) {
      const validIds = new Set(workflows.value.map(item => item.id))
      selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
    }
  } catch (e) {
    console.error('加载工作流失败:', e)
  }
}

async function loadCategories() {
  try {
    categories.value = await apiClient.getWorkflowCategories()
  } catch (e) {
    console.error('加载分类失败:', e)
  }
}

// Upload (drag & drop, batch)
function triggerFileInput() {
  fileInput.value?.click()
}

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
      await apiClient.createWorkflowAPI({
        category_id: targetCategoryId,
        name: file.name.replace(/\.json$/i, ''),
        filename: file.name,
        workflow_data: data
      })
      successCount++
    } catch (e) {
      failCount++
      console.error(`上传 ${file.name} 失败:`, e)
    }
  }
  await loadWorkflows()
  if (failCount > 0) {
    console.error(`上传完成: ${successCount} 个成功, ${failCount} 个失败`)
  }
}

// Editor
const selectedNode = computed(() => {
  if (!selectedNodeId.value || !editingWorkflowData.value) return null
  return editingWorkflowData.value[selectedNodeId.value]
})

const editableNodeProps = computed(() => {
  const node = selectedNode.value
  if (!node || !node.inputs) return []
  return Object.entries(node.inputs)
    .filter(([, value]) => !Array.isArray(value))
    .map(([key, value]) => ({ key, value }))
})

function selectNode(nodeId) {
  selectedNodeId.value = nodeId
  editNodeProperty.value = ''
  editNodeValue.value = ''
  editMessage.value = ''
  
  const node = editingWorkflowData.value?.[nodeId]
  if (node?.inputs) {
    const props = Object.entries(node.inputs).filter(([, v]) => !Array.isArray(v))
    if (props.length > 0) {
      const textProp = props.find(p => p[0] === 'text') || props[0]
      editNodeProperty.value = textProp[0]
      editNodeValue.value = typeof textProp[1] === 'object' ? JSON.stringify(textProp[1], null, 2) : String(textProp[1])
    }
  }
}

function onEditPropertyChange() {
  const node = selectedNode.value
  if (!node?.inputs || !editNodeProperty.value) return
  const value = node.inputs[editNodeProperty.value]
  editNodeValue.value = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || '')
}

async function doUpdateNode() {
  try {
    const workflow = JSON.parse(JSON.stringify(editingWorkflowData.value))
    const nodeId = selectedNodeId.value
    if (!workflow[nodeId]?.inputs) {
      editMessage.value = '节点或inputs不存在'
      return
    }
    workflow[nodeId].inputs[editNodeProperty.value] = editNodeValue.value
    
    await apiClient.updateWorkflowAPI(editingWfId.value, { workflow_data: workflow })
    editingWorkflowData.value = workflow
    editMessage.value = `节点 ${nodeId} 的 ${editNodeProperty.value} 已更新`
    await loadWorkflows()
  } catch (e) {
    editMessage.value = '更新失败: ' + e.message
  }
}

async function editWorkflow(wf) {
  try {
    const full = await apiClient.getWorkflowAPIById(wf.id)
    if (!full) return
    editingWorkflowData.value = typeof full.workflow_data === 'string' ? JSON.parse(full.workflow_data) : full.workflow_data
    editingWorkflow.value = full
    editingWfId.value = full.id
    selectedNodeId.value = null
    editMessage.value = ''
  } catch (e) {
    console.error('加载工作流失败:', e)
  }
}

function closeEditor() {
  editingWorkflow.value = null
  editingWorkflowData.value = null
  selectedNodeId.value = null
  editingWfId.value = null
}

// Re-upload
function reuploadWorkflow(wf) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      await apiClient.updateWorkflowAPI(wf.id, { workflow_data: data, filename: file.name })
      await loadWorkflows()
    } catch (err) {
      console.error('更新失败:', err)
    }
  }
  input.click()
}

// Rename
function renameWorkflow(wf) {
  renamingWorkflow.value = wf
  renameForm.name = wf.name
}

async function doRename() {
  if (!renamingWorkflow.value || !renameForm.name) return
  try {
    await apiClient.updateWorkflowAPI(renamingWorkflow.value.id, { name: renameForm.name })
    renamingWorkflow.value = null
    await loadWorkflows()
  } catch (e) {
    console.error('重命名失败:', e)
  }
}

// Move category
function changeCategory(wf) {
  movingWorkflow.value = wf
  moveForm.category_id = wf.category_id || 0
}

async function doMoveCategory() {
  if (!movingWorkflow.value) return
  try {
    await apiClient.updateWorkflowAPI(movingWorkflow.value.id, { category_id: moveForm.category_id })
    movingWorkflow.value = null
    await loadWorkflows()
  } catch (e) {
    console.error('移动失败:', e)
  }
}

// Delete
function confirmDeleteWorkflow(wf) {
  deleteConfirm.value = { show: true, type: 'workflow', target: wf, message: `确定要删除工作流"${wf.name}"吗？` }
}

// Batch delete
function confirmBatchDelete() {
  deleteConfirm.value = { show: true, type: 'batch', target: null, message: `确定要删除选中的 ${selectedIds.value.length} 个工作流吗？` }
}

async function doDelete() {
  const { type, target } = deleteConfirm.value
  deleteConfirm.value.show = false
  try {
    if (type === 'workflow') {
      await apiClient.deleteWorkflowAPI(target.id)
      await loadWorkflows()
    } else if (type === 'batch') {
      await apiClient.batchDeleteWorkflowAPIs(selectedIds.value)
      selectedIds.value = []
      await loadWorkflows()
    }
  } catch (e) {
    console.error('删除失败:', e)
  }
}

// Batch categorize
async function doBatchCategorize() {
  try {
    await apiClient.batchCategorizeWorkflowAPIs(selectedIds.value, batchCategoryId.value)
    selectedIds.value = []
    showBatchCategorize.value = false
    await loadWorkflows()
  } catch (e) {
    console.error('批量移动失败:', e)
  }
}

// Add category
async function doAddCategory() {
  if (!newCategoryName.value) return
  try {
    await apiClient.createWorkflowCategory({
      name: newCategoryName.value
    })
    showAddCategory.value = false
    newCategoryName.value = ''
    await loadCategories()
  } catch (e) {
    console.error('添加分类失败:', e)
  }
}

// Rename category
function renameCategory(cat) {
  renamingCategory.value = cat
  renameCategoryForm.name = cat.name
}

async function doRenameCategory() {
  if (!renamingCategory.value || !renameCategoryForm.name) return
  try {
    await apiClient.updateWorkflowCategory(renamingCategory.value.id, { name: renameCategoryForm.name })
    renamingCategory.value = null
    await loadCategories()
  } catch (e) {
    console.error('重命名失败:', e)
  }
}

// Delete category
function confirmDeleteCategory(cat) {
  deletingCategory.value = cat
}

async function doDeleteCategory() {
  if (!deletingCategory.value) return
  try {
    await apiClient.deleteWorkflowCategory(deletingCategory.value.id)
    if (activeCategory.value === deletingCategory.value.id) activeCategory.value = 'all'
    deletingCategory.value = null
    await loadCategories()
    await loadWorkflows()
  } catch (e) {
    console.error('删除失败:', e)
  }
}

onMounted(() => {
  loadWorkflows()
  loadCategories()
})
</script>

<style scoped>
.workflow-manager {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
}

.workflow-manager h2 {
  margin: 0 0 16px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
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
  margin-left: 4px;
  font-size: 11px;
  opacity: 0.7;
}

.workflow-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--input-shadow);
}

.list-header {
  display: grid;
  grid-template-columns: 40px 1.5fr 1.5fr 1fr 1fr auto;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-secondary);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.15));
  align-items: center;
}

.workflow-row {
  display: grid;
  grid-template-columns: 40px 1.5fr 1.5fr 1fr 1fr auto;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.08));
  cursor: pointer;
  transition: background 0.15s ease;
  align-items: center;
}

.workflow-row:last-child {
  border-bottom: none;
}

.workflow-row:hover {
  background: var(--bg-secondary);
}

.workflow-row.selected {
  background: rgba(0, 122, 255, 0.08);
}

.col-check {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.col-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-filename {
  font-size: 13px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-category {
  font-size: 13px;
  color: var(--accent-color);
}

.col-date {
  font-size: 12px;
  color: var(--text-muted);
}

.col-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
  flex-wrap: nowrap;
}

.checkbox {
  width: 18px;
  height: 18px;
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
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.btn-icon-sm {
  padding: 5px 10px;
  background: var(--bg-secondary);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-icon-sm:hover {
  background: var(--bg-primary);
}

.btn-danger-icon:hover {
  background: #fee2e2;
  color: #dc2626;
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

.btn-icon {
  font-size: 14px;
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

.form-group textarea {
  font-family: monospace;
  resize: vertical;
}

.form-group small {
  display: block;
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 12px;
}

.workflow-editor-layout {
  display: flex;
  gap: 20px;
  min-height: 400px;
}

.editor-left {
  flex: 0 0 250px;
}

.editor-right {
  flex: 1;
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 500px;
  overflow-y: auto;
  padding: 8px;
  background: var(--bg-surface);
  border-radius: 8px;
}

.node-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  gap: 8px;
}

.node-item:hover {
  background: var(--bg-primary);
}

.node-item.active {
  background: var(--accent-color);
  color: var(--accent-text);
}

.node-id {
  font-weight: 600;
  font-size: 14px;
  font-family: monospace;
  min-width: 40px;
}

.node-type {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-id-container {
  margin-bottom: 12px;
  font-size: 14px;
}

.edit-panel {
  margin-bottom: 16px;
}

.empty-hint {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

.edit-message {
  margin-top: 8px;
  font-size: 13px;
  color: var(--accent-color);
}

/* Category actions (rename/delete) */
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

/* Upload zone (drag & drop) */
.upload-zone {
  border: 2px dashed var(--text-muted);
  border-radius: 10px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 16px;
  background: var(--bg-surface);
}

.upload-zone:hover,
.upload-zone.dragover {
  border-color: var(--accent-color);
  background: var(--bg-secondary);
}

.upload-text p {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.upload-text small {
  font-size: 12px;
  color: var(--text-secondary);
}

.fw-confirm-msg small {
  font-size: 12px;
  color: var(--text-muted);
}
</style>