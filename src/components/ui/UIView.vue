<template>
  <div class="card ui-view" :class="{ 'is-editor-mode': mode === 'editor' }">
    <!-- 列表模式 -->
    <template v-if="mode === 'list'">
      <h2>UI管理</h2>
      <p class="hint">管理UI原型方案，支持新建、编辑、分类、批量操作。点击"新建UI"创建新的UI原型。</p>

      <!-- 分类栏 -->
      <div class="category-bar">
        <div class="category-tabs">
          <div
            :class="['category-tab', { active: activeCategory === 'all' }]"
            @click="switchCategory('all')"
          >
            <span class="cat-name">全部</span>
            <span class="cat-count">{{ schemes.length }}</span>
          </div>
          <div
            :class="['category-tab', { active: activeCategory === 'uncategorized' }]"
            @click="switchCategory('uncategorized')"
          >
            <span class="cat-name">未分类</span>
            <span class="cat-count">{{ uncategorizedCount }}</span>
          </div>
          <div
            v-for="cat in categories"
            :key="cat.id"
            :class="['category-tab', { active: activeCategory === cat.id }]"
            @click="switchCategory(cat.id)"
          >
            <span class="cat-name">{{ cat.name }}</span>
            <span class="cat-count">{{ getCategoryCount(cat.id) }}</span>
            <span class="cat-actions" @click.stop>
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
          <button class="btn btn-primary" @click="createNewUI">+ 新建UI</button>
          <button
            v-if="schemes.length > 0"
            class="btn btn-sm"
            @click="toggleSelectAll"
          >{{ isAllSelected ? '取消全选' : '全选' }}</button>
          <span class="btn-divider">|</span>
          <button
            :disabled="selectedIds.length === 0"
            class="btn btn-sm"
            @click="openBatchMoveDialog"
          >移动选中 ({{ selectedIds.length }})</button>
          <button
            :disabled="selectedIds.length === 0"
            class="btn btn-sm btn-danger"
            @click="confirmBatchDelete"
          >删除选中 ({{ selectedIds.length }})</button>
          <button class="btn btn-sm" @click="loadSchemes" title="刷新">刷新</button>
        </div>
        <div class="toolbar-right">
          <input
            type="text"
            class="filter-search"
            v-model="searchKeyword"
            placeholder="搜索方案名..."
          />
        </div>
      </div>

      <!-- 方案列表 -->
      <div class="entity-list" v-if="filteredSchemes.length > 0">
        <div class="list-header">
          <div class="col-check" @click="toggleSelectAll">
            <div :class="['checkbox', { checked: isAllSelected }]"></div>
          </div>
          <div class="col-name">方案名</div>
          <div class="col-cat">分类</div>
          <div class="col-cat">画布尺寸</div>
          <div class="col-cat">版本</div>
          <div class="col-date">更新时间</div>
          <div class="col-actions">操作</div>
        </div>
        <div v-for="scheme in filteredSchemes" :key="scheme.id" class="list-row">
          <div class="col-check" @click.stop="toggleSelect(scheme.id)">
            <div :class="['checkbox', { checked: selectedIds.includes(scheme.id) }]"></div>
          </div>
          <div class="col-name" :title="scheme.name" @click="editScheme(scheme)">{{ scheme.name }}</div>
          <div class="col-cat">{{ getCategoryName(scheme.id) }}</div>
          <div class="col-cat">{{ scheme.canvasWidth }}×{{ scheme.canvasHeight }}</div>
          <div class="col-cat">v{{ scheme.version }}</div>
          <div class="col-date">{{ formatDate(scheme.updatedAt) }}</div>
          <div class="col-actions">
            <button class="btn-icon-sm" @click="editScheme(scheme)" title="编辑">编辑</button>
            <button class="btn-icon-sm" @click="openMoveDialog(scheme)" title="移动">移动</button>
            <button class="btn-icon-sm danger" @click="confirmDeleteScheme(scheme)" title="删除">删除</button>
          </div>
        </div>
      </div>
      <div v-else-if="!loading" class="empty-state">
        <p>暂无方案，点击"新建UI"创建</p>
      </div>
      <div v-else class="empty-state">
        <p>加载中...</p>
      </div>
    </template>

    <!-- 编辑器模式 -->
    <template v-else>
      <div class="editor-layout">
        <UITopToolbar @close="onCloseEditor" />
        <div class="editor-main">
          <UIEditorCanvas />
          <UIWidgetBar />
        </div>
      </div>
    </template>

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
          <label>分类名称</label>
          <input type="text" v-model="renameForm.name" @keyup.enter="doRenameCategory" />
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="renamingCategory = null">取消</button>
        <button class="btn btn-primary" @click="doRenameCategory" :disabled="!renameForm.name">保存</button>
      </template>
    </FloatingWindow>

    <!-- 批量移动到分类对话框 -->
    <FloatingWindow v-model:open="batchMoveDialogOpen" title="移动到分类" size="default">
      <p class="hint">将选中的 {{ selectedIds.length }} 个方案移动到指定分类</p>
      <div class="form-group">
        <label>目标分类</label>
        <select v-model="batchMoveTargetId">
          <option :value="0">未分类</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="batchMoveDialogOpen = false">取消</button>
        <button class="btn btn-primary" @click="doBatchMove" :disabled="batchMoveTargetId === null">移动</button>
      </template>
    </FloatingWindow>

    <!-- 单个移动对话框 -->
    <FloatingWindow v-model:open="moveDialogOpen" title="移动方案" size="default">
      <p class="hint">将"{{ moveDialog.schemeName }}"移动到指定分类</p>
      <div class="form-group">
        <label>目标分类</label>
        <select v-model="moveDialog.targetCategoryId">
          <option :value="0">未分类</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="moveDialogOpen = false">取消</button>
        <button class="btn btn-primary" @click="doMoveScheme" :disabled="moveDialog.targetCategoryId === null">移动</button>
      </template>
    </FloatingWindow>

    <!-- 删除分类确认弹窗 -->
    <FloatingWindow v-model:open="deleteCategoryConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除分类"{{ deleteCategoryConfirm.target?.name }}"吗？<br /><small>该分类下的方案将移到"未分类"</small></p>
      <template #footer>
        <button class="btn" @click="deleteCategoryConfirmOpen = false">取消</button>
        <button class="btn btn-danger" @click="doDeleteCategory">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 删除方案确认弹窗 -->
    <FloatingWindow v-model:open="deleteSchemeConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除方案"{{ deleteSchemeConfirm.target?.name }}"吗？</p>
      <template #footer>
        <button class="btn" @click="deleteSchemeConfirmOpen = false">取消</button>
        <button class="btn btn-danger" @click="doDeleteScheme">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 批量删除确认弹窗 -->
    <FloatingWindow v-model:open="batchDeleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除选中的 {{ batchDeleteConfirm.count }} 个方案吗？</p>
      <template #footer>
        <button class="btn" @click="batchDeleteConfirmOpen = false">取消</button>
        <button class="btn btn-danger" @click="doBatchDelete">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 关闭编辑器确认弹窗（保存/否/取消） -->
    <FloatingWindow v-model:open="closeEditorConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">是否保存当前方案的修改？</p>
      <template #footer>
        <button class="btn" @click="closeEditorConfirmOpen = false">取消</button>
        <button class="btn btn-danger" @click="doCloseWithoutSave">否</button>
        <button class="btn btn-primary" @click="doCloseWithSave" :disabled="store.isSaving">保存</button>
      </template>
    </FloatingWindow>

    <!-- 错误提示弹窗（替代alert） -->
    <FloatingWindow v-model:open="errorTipOpen" :title="errorTipTitle" size="confirm">
      <p class="fw-confirm-msg">{{ errorTipMessage }}</p>
      <template #footer>
        <button class="btn btn-primary" @click="errorTipOpen = false">确定</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useUiEditorStore } from '@/stores/uiEditor'
import { schemeApi } from '@/services/uiApi'
import FloatingWindow from '@/components/common/FloatingWindow.vue'
import UITopToolbar from './UITopToolbar.vue'
import UIEditorCanvas from './UIEditorCanvas.vue'
import UIWidgetBar from './UIWidgetBar.vue'

const store = useUiEditorStore()

// 模式：list 或 editor
const mode = ref('list')
const loading = ref(false)
const schemes = ref([])

// 分类（localStorage 持久化）
const STORAGE_KEY_CATS = 'ui-manager-categories'
const STORAGE_KEY_MAPPING = 'ui-manager-scheme-cats'
const categories = ref(loadCategoriesFromStorage())
const schemeCatMap = ref(loadSchemeCatMapFromStorage())

function loadCategoriesFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_CATS) || '[]')
  } catch (e) {
    return []
  }
}
function saveCategoriesToStorage() {
  localStorage.setItem(STORAGE_KEY_CATS, JSON.stringify(categories.value))
}
function loadSchemeCatMapFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_MAPPING) || '{}')
  } catch (e) {
    return {}
  }
}
function saveSchemeCatMapToStorage() {
  localStorage.setItem(STORAGE_KEY_MAPPING, JSON.stringify(schemeCatMap.value))
}

// 列表状态
const activeCategory = ref('all')
const selectedIds = ref([])
const searchKeyword = ref('')

// 分类对话框
const showAddCategory = ref(false)
const newCategoryName = ref('')
const renamingCategory = ref(null)
const renameForm = reactive({ name: '' })
const deleteCategoryConfirm = ref({ show: false, target: null })

// 方案对话框
const deleteSchemeConfirm = ref({ show: false, target: null })
const batchDeleteConfirm = ref({ show: false, count: 0 })
const batchMoveTargetId = ref(0)
const moveDialog = reactive({ show: false, schemeId: null, schemeName: '', targetCategoryId: 0 })

// 关闭编辑器确认
const closeEditorConfirmOpen = ref(false)

// 错误提示弹窗（替代alert）
const errorTipOpen = ref(false)
const errorTipTitle = ref('提示')
const errorTipMessage = ref('')

function showError(title, msg) {
  errorTipTitle.value = title
  errorTipMessage.value = msg
  errorTipOpen.value = true
}

// FloatingWindow open 代理
const renamingCategoryOpen = computed({
  get: () => !!renamingCategory.value,
  set: (v) => { if (!v) renamingCategory.value = null }
})
const batchMoveDialogOpen = ref(false)
const moveDialogOpen = computed({
  get: () => moveDialog.show,
  set: (v) => { if (!v) moveDialog.show = false }
})
const deleteCategoryConfirmOpen = computed({
  get: () => deleteCategoryConfirm.value.show,
  set: (v) => { if (!v) deleteCategoryConfirm.value.show = false }
})
const deleteSchemeConfirmOpen = computed({
  get: () => deleteSchemeConfirm.value.show,
  set: (v) => { if (!v) deleteSchemeConfirm.value.show = false }
})
const batchDeleteConfirmOpen = computed({
  get: () => batchDeleteConfirm.value.show,
  set: (v) => { if (!v) batchDeleteConfirm.value.show = false }
})

// ============ 计算属性 ============
const uncategorizedCount = computed(() =>
  schemes.value.filter(s => !schemeCatMap.value[s.id]).length
)

const filteredSchemes = computed(() => {
  let list = schemes.value
  if (activeCategory.value === 'uncategorized') {
    list = list.filter(s => !schemeCatMap.value[s.id])
  } else if (activeCategory.value !== 'all') {
    list = list.filter(s => schemeCatMap.value[s.id] === activeCategory.value)
  }
  const kw = searchKeyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(s => (s.name || '').toLowerCase().includes(kw))
  }
  return list
})

const isAllSelected = computed(() => {
  return filteredSchemes.value.length > 0 &&
    filteredSchemes.value.every(s => selectedIds.value.includes(s.id))
})

// ============ 工具函数 ============
function getCategoryCount(catId) {
  return Object.values(schemeCatMap.value).filter(c => c === catId).length
}

function getCategoryName(schemeId) {
  const catId = schemeCatMap.value[schemeId]
  if (!catId) return '未分类'
  const cat = categories.value.find(c => c.id === catId)
  return cat ? cat.name : '未分类'
}

function formatDate(ts) {
  if (!ts) return '-'
  try {
    const d = new Date(typeof ts === 'number' ? ts : parseInt(ts))
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    return String(ts)
  }
}

// ============ 选择 ============
function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    const ids = filteredSchemes.value.map(s => s.id)
    selectedIds.value = selectedIds.value.filter(id => !ids.includes(id))
  } else {
    const ids = filteredSchemes.value.map(s => s.id)
    ids.forEach(id => {
      if (!selectedIds.value.includes(id)) selectedIds.value.push(id)
    })
  }
}

function switchCategory(cat) {
  activeCategory.value = cat
  selectedIds.value = []
}

// ============ 数据加载 ============
async function loadSchemes() {
  loading.value = true
  try {
    const list = await schemeApi.list()
    schemes.value = Array.isArray(list) ? list : []
    // 清理已删除方案的分类映射
    const validIds = new Set(schemes.value.map(s => s.id))
    let changed = false
    for (const k of Object.keys(schemeCatMap.value)) {
      if (!validIds.has(Number(k))) {
        delete schemeCatMap.value[k]
        changed = true
      }
    }
    if (changed) saveSchemeCatMapToStorage()
    // 清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
    if (selectedIds.value.length > 0) {
      selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
    }
  } catch (e) {
    console.error('加载UI方案列表失败:', e)
    schemes.value = []
  } finally {
    loading.value = false
  }
}

// ============ 新建/编辑 ============
async function createNewUI() {
  store.newScheme()
  store.isEditorActive = true
  mode.value = 'editor'
}

async function editScheme(scheme) {
  try {
    await store.loadScheme(scheme.id)
    store.isEditorActive = true
    mode.value = 'editor'
  } catch (e) {
    console.error('加载方案失败:', e)
    showError('加载失败', '加载方案失败: ' + (e.message || e))
  }
}

// ============ 关闭编辑器 ============
function onCloseEditor() {
  // 如果有修改，弹出确认弹窗；否则直接退出
  if (store.isModified) {
    closeEditorConfirmOpen.value = true
  } else {
    backToList()
  }
}

async function doCloseWithSave() {
  try {
    await store.saveScheme()
    closeEditorConfirmOpen.value = false
    backToList()
  } catch (e) {
    console.error('保存失败:', e)
    showError('保存失败', '无法连接到后端服务，请确保后端服务已启动（端口3007）。\n\n错误信息: ' + (e.message || e))
  }
}

function doCloseWithoutSave() {
  closeEditorConfirmOpen.value = false
  backToList()
}

// 当编辑器模式退出时回到列表（暴露给外部）
function backToList() {
  store.isEditorActive = false
  mode.value = 'list'
  loadSchemes()
}

// ============ 删除 ============
function confirmDeleteScheme(scheme) {
  deleteSchemeConfirm.value = { show: true, target: scheme }
}

async function doDeleteScheme() {
  const scheme = deleteSchemeConfirm.value.target
  deleteSchemeConfirm.value.show = false
  try {
    await schemeApi.delete(scheme.id)
    delete schemeCatMap.value[scheme.id]
    saveSchemeCatMapToStorage()
    selectedIds.value = selectedIds.value.filter(id => id !== scheme.id)
    await loadSchemes()
  } catch (e) {
    console.error('删除方案失败:', e)
    showError('删除失败', '删除方案失败: ' + (e.message || e))
  }
}

function confirmBatchDelete() {
  batchDeleteConfirm.value = { show: true, count: selectedIds.value.length }
}

async function doBatchDelete() {
  batchDeleteConfirm.value.show = false
  const ids = [...selectedIds.value]
  for (const id of ids) {
    try {
      await schemeApi.delete(id)
      delete schemeCatMap.value[id]
    } catch (e) {
      console.error('删除方案失败:', id, e)
    }
  }
  saveSchemeCatMapToStorage()
  selectedIds.value = []
  await loadSchemes()
}

// ============ 移动 ============
function openBatchMoveDialog() {
  batchMoveTargetId.value = 0
  batchMoveDialogOpen.value = true
}

function doBatchMove() {
  const targetId = batchMoveTargetId.value
  batchMoveDialogOpen.value = false
  for (const id of selectedIds.value) {
    if (targetId === 0) {
      delete schemeCatMap.value[id]
    } else {
      schemeCatMap.value[id] = targetId
    }
  }
  saveSchemeCatMapToStorage()
}

function openMoveDialog(scheme) {
  moveDialog.schemeId = scheme.id
  moveDialog.schemeName = scheme.name
  moveDialog.targetCategoryId = schemeCatMap.value[scheme.id] || 0
  moveDialog.show = true
}

function doMoveScheme() {
  const targetId = moveDialog.targetCategoryId
  const schemeId = moveDialog.schemeId
  moveDialog.show = false
  if (targetId === 0) {
    delete schemeCatMap.value[schemeId]
  } else {
    schemeCatMap.value[schemeId] = targetId
  }
  saveSchemeCatMapToStorage()
}

// ============ 分类管理 ============
async function doAddCategory() {
  if (!newCategoryName.value) return
  const newCat = {
    id: Date.now(),
    name: newCategoryName.value.trim()
  }
  categories.value.push(newCat)
  saveCategoriesToStorage()
  showAddCategory.value = false
  newCategoryName.value = ''
}

function renameCategory(cat) {
  renamingCategory.value = cat
  renameForm.name = cat.name
}

function doRenameCategory() {
  if (!renamingCategory.value || !renameForm.name) return
  const cat = categories.value.find(c => c.id === renamingCategory.value.id)
  if (cat) cat.name = renameForm.name.trim()
  saveCategoriesToStorage()
  renamingCategory.value = null
}

function confirmDeleteCategory(cat) {
  deleteCategoryConfirm.value = { show: true, target: cat }
}

function doDeleteCategory() {
  const cat = deleteCategoryConfirm.value.target
  deleteCategoryConfirm.value.show = false
  // 移除分类下的方案的分类映射
  for (const k of Object.keys(schemeCatMap.value)) {
    if (schemeCatMap.value[k] === cat.id) {
      delete schemeCatMap.value[k]
    }
  }
  categories.value = categories.value.filter(c => c.id !== cat.id)
  if (activeCategory.value === cat.id) activeCategory.value = 'all'
  saveCategoriesToStorage()
  saveSchemeCatMapToStorage()
}

// ============ 监听编辑器退出 ============
watch(() => store.isEditorActive, (active) => {
  if (!active && mode.value === 'editor') {
    mode.value = 'list'
    loadSchemes()
  }
})

// ============ 暴露方法给父组件 ============
defineExpose({
  backToList,
  isEditorMode: () => mode.value === 'editor'
})

// ============ 初始化 ============
onMounted(() => {
  loadSchemes()
})
</script>

<style scoped>
.ui-view {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.ui-view.is-editor-mode {
  padding: 0;
  background: var(--bg-primary, #1a1a1a);
  overflow: hidden;
}

.ui-view h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px 0;
}

/* 分类栏 */
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

/* 工具栏 */
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

/* 列表 */
.entity-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--input-shadow);
  flex: 1;
  overflow-y: auto;
}

.list-header, .list-row {
  display: grid;
  grid-template-columns: 36px 1.5fr 100px 120px 70px 140px 160px;
  align-items: center;
  padding: 10px 12px;
  gap: 8px;
}

.list-header {
  background: var(--bg-secondary);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128, 128, 128, 0.15));
  position: sticky;
  top: 0;
  z-index: 1;
}

.list-row {
  font-size: 13px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128, 128, 128, 0.05));
  transition: background 0.15s ease;
}

.list-row:hover {
  background: var(--bg-secondary);
}

.list-row:last-child {
  border-bottom: none;
}

.col-check {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.col-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.col-name:hover {
  color: var(--accent-color);
}

.col-cat {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-date {
  font-size: 11px;
  color: var(--text-muted);
}

.col-actions {
  display: flex;
  gap: 4px;
  flex-wrap: nowrap;
}

/* 复选框 */
.checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid var(--text-muted);
  border-radius: 4px;
  transition: all 0.15s ease;
  flex-shrink: 0;
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
  padding: 4px 8px;
  background: var(--bg-secondary);
  border: none;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-icon-sm:hover {
  background: var(--bg-primary);
}

.btn-icon-sm.danger:hover {
  background: #fee2e2;
  color: #ef4444;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

/* 按钮 */
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

/* 搜索框 */
.filter-search {
  flex: 1;
  min-width: 180px;
  padding: 7px 12px;
  background: var(--bg-surface);
  border: none;
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  box-shadow: var(--input-shadow);
  outline: none;
}

.filter-search:focus {
  box-shadow: 0 0 0 2px var(--accent-color);
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
.form-group select {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  box-shadow: var(--input-shadow);
  box-sizing: border-box;
}

/* 编辑器布局 */
.editor-layout {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-primary, #1a1a1a);
}

.editor-main {
  position: relative;
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* FloatingWindow confirm */
.fw-confirm-msg {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-line;
  line-height: 1.6;
}

.fw-confirm-msg small {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
