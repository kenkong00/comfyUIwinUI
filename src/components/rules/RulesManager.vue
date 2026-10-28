<template>
  <div class="card rules-manager">
    <h2>规则管理</h2>

    <!-- 上传区域（批量导入TXT） -->
    <div
      class="upload-zone"
      :class="{ dragover: isDragOver }"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="handleDrop"
      @click="triggerImport"
    >
      <input
        type="file"
        ref="importInput"
        multiple
        accept=".txt"
        @change="handleImportSelect"
        style="display: none"
      />
      <div class="upload-text">
        <p>点击或拖拽TXT文件到此处上传（支持多选）</p>
        <small>每个TXT文件将作为一条独立规则导入，分类使用当前选中的分类</small>
      </div>
    </div>

    <!-- 分类标签栏 -->
    <div class="category-bar">
      <div class="category-tabs">
        <div
          v-for="cat in rulesStore.allCategories"
          :key="cat.id"
          :class="['category-tab', { active: activeCategory === cat.id }]"
          @click="activeCategory = cat.id"
        >
          <span class="cat-name">{{ cat.name }}</span>
          <span class="cat-count">{{ rulesStore.getCategoryCount(cat.id) }}</span>
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
        <button class="btn btn-sm btn-primary" @click="startCreateRule">+ 新建规则</button>
        <button class="btn btn-sm" @click="toggleSelectAll">{{ allSelected ? '取消全选' : '全选' }}</button>
        <span class="btn-divider">|</span>
        <button :disabled="selectedIds.length === 0" class="btn btn-sm btn-danger" @click="confirmBatchDelete">
          删除选中 ({{ selectedIds.length }})
        </button>
        <button :disabled="selectedIds.length === 0" class="btn btn-sm" @click="showBatchMove = true">
          移动选中
        </button>
      </div>
      <div class="toolbar-right">
        <input type="text" v-model="searchQuery" placeholder="搜索规则..." class="search-input" />
      </div>
    </div>

    <!-- 规则列表 -->
    <div class="rules-list" v-if="filteredRules.length > 0">
      <div class="list-header">
        <div class="col-check"></div>
        <div class="col-name">名称</div>
        <div class="col-type">类型</div>
        <div class="col-cat">分类</div>
        <div class="col-date">更新时间</div>
        <div class="col-actions">操作</div>
      </div>
      <div
        v-for="rule in filteredRules"
        :key="rule.id"
        :class="['list-row', { selected: selectedIds.includes(rule.id) }]"
      >
        <div class="col-check" @click.stop="toggleSelect(rule.id)">
          <div :class="['checkbox', { checked: selectedIds.includes(rule.id) }]"></div>
        </div>
        <div class="col-name" @click="editRule(rule)" :title="rule.description || rule.name">{{ rule.name }}</div>
        <div class="col-type">
          <span :class="['type-badge', rule.type]">{{ getTypeName(rule.type) }}</span>
        </div>
        <div class="col-cat">{{ rulesStore.getCategoryName(rule.category_id) }}</div>
        <div class="col-date">{{ formatDate(rule.updated_at || rule.created_at) }}</div>
        <div class="col-actions" @click.stop>
          <button class="btn-icon-sm" @click="editRule(rule)" title="编辑">编辑</button>
          <button class="btn-icon-sm" @click="moveRule(rule)" title="移动分类">移动</button>
          <button class="btn-icon-sm danger" @click="confirmDeleteRule(rule)" title="删除">删除</button>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <p v-if="searchQuery">没有找到匹配的规则</p>
      <p v-else>暂无规则，点击"新建规则"或"批量导入TXT"开始</p>
    </div>

    <!-- 添加分类对话框 -->
    <FloatingWindow v-model:open="showAddCategory" title="添加分类" size="default">
      <input type="text" v-model="newCategoryName" placeholder="分类名称" @keyup.enter="doAddCategory" ref="newCatInput" />
      <template #footer>
        <button class="btn btn-sm" @click="showAddCategory = false">取消</button>
        <button class="btn btn-sm btn-primary" @click="doAddCategory">确定</button>
      </template>
    </FloatingWindow>

    <!-- 重命名分类对话框 -->
    <FloatingWindow v-model:open="renamingCategoryOpen" title="重命名分类" size="default">
      <template v-if="renamingCategory">
        <input type="text" v-model="renamingCategory.newName" placeholder="分类名称" @keyup.enter="doRenameCategory" />
      </template>
      <template #footer>
        <button class="btn btn-sm" @click="renamingCategory = null">取消</button>
        <button class="btn btn-sm btn-primary" @click="doRenameCategory">确定</button>
      </template>
    </FloatingWindow>

    <!-- 编辑规则对话框 -->
    <FloatingWindow v-model:open="editingRuleOpen" :title="editingRule?.id ? '编辑规则' : '新建规则'" size="large">
      <template v-if="editingRule">
        <div class="form-group">
          <label>规则名称</label>
          <input type="text" v-model="editingRule.name" placeholder="请输入规则名称" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>分类</label>
            <select v-model="editingRule.category_id">
              <option v-for="cat in rulesStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>类型</label>
            <select v-model="editingRule.type">
              <option value="general">通用</option>
              <option value="system">系统规则</option>
              <option value="image">生图规则</option>
              <option value="chat">对话规则</option>
              <option value="dialogue">多人对话规则</option>
              <option value="behavior">行为规则</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>描述（可选）</label>
          <input type="text" v-model="editingRule.description" placeholder="简短描述规则用途" />
        </div>
        <div class="form-group">
          <label>规则内容（支持 Markdown）</label>
          <MdEditor v-model="editingRule.content" :rows="16" />
        </div>
      </template>
      <template #footer>
        <button class="btn btn-sm" @click="cancelEditRule">取消</button>
        <button class="btn btn-sm btn-primary" @click="saveRule" :disabled="!editingRule?.name?.trim()">保存</button>
      </template>
    </FloatingWindow>

    <!-- 移动分类对话框（单个） -->
    <FloatingWindow v-model:open="movingRuleOpen" title="移动到分类" size="default">
      <template v-if="movingRule">
        <select v-model="movingRule.targetCategoryId">
          <option v-for="cat in rulesStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </template>
      <template #footer>
        <button class="btn btn-sm" @click="movingRule = null">取消</button>
        <button class="btn btn-sm btn-primary" @click="doMoveRule">确定</button>
      </template>
    </FloatingWindow>

    <!-- 批量移动对话框 -->
    <FloatingWindow v-model:open="showBatchMove" :title="`批量移动 ${selectedIds.length} 条规则到分类`" size="default">
      <select v-model="batchMoveCategoryId">
        <option v-for="cat in rulesStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
      </select>
      <template #footer>
        <button class="btn btn-sm" @click="showBatchMove = false">取消</button>
        <button class="btn btn-sm btn-primary" @click="doBatchMove">确定</button>
      </template>
    </FloatingWindow>

    <!-- 删除确认对话框 -->
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
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRulesStore } from '@/stores/rules'
import MdEditor from '@/components/common/MdEditor.vue'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const rulesStore = useRulesStore()

const activeCategory = ref('all')
const searchQuery = ref('')
const selectedIds = ref([])

const showAddCategory = ref(false)
const newCategoryName = ref('')
const newCatInput = ref(null)

const renamingCategory = ref(null)

const editingRule = ref(null)

const movingRule = ref(null)
const showBatchMove = ref(false)
const batchMoveCategoryId = ref(null)

const importInput = ref(null)
const isDragOver = ref(false)

const deleteConfirm = ref({ show: false, type: '', target: null, message: '' })

const typeNames = {
  general: '通用',
  system: '系统',
  image: '生图',
  chat: '对话',
  dialogue: '多人对话',
  behavior: '行为'
}

function getTypeName(type) {
  return typeNames[type] || type || '通用'
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return dateStr
  }
}

const filteredRules = computed(() => {
  let list = rulesStore.rulesByCategory(activeCategory.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(r =>
      r.name?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.content?.toLowerCase().includes(q)
    )
  }
  return list
})

const allSelected = computed(() => {
  return filteredRules.value.length > 0 && filteredRules.value.every(r => selectedIds.value.includes(r.id))
})

// Writable computed proxies for FloatingWindow v-model:open
const renamingCategoryOpen = computed({
  get: () => !!renamingCategory.value,
  set: (v) => { if (!v) renamingCategory.value = null }
})
const editingRuleOpen = computed({
  get: () => !!editingRule.value,
  set: (v) => { if (!v) cancelEditRule() }
})
const movingRuleOpen = computed({
  get: () => !!movingRule.value,
  set: (v) => { if (!v) movingRule.value = null }
})
const deleteConfirmOpen = computed({
  get: () => deleteConfirm.value.show,
  set: (v) => { if (!v) deleteConfirm.value.show = false }
})

function toggleSelect(id) {
  const i = selectedIds.value.indexOf(id)
  if (i > -1) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = selectedIds.value.filter(id => !filteredRules.value.some(r => r.id === id))
  } else {
    filteredRules.value.forEach(r => {
      if (!selectedIds.value.includes(r.id)) selectedIds.value.push(r.id)
    })
  }
}

// 分类操作
async function doAddCategory() {
  if (!newCategoryName.value.trim()) return
  await rulesStore.createCategory(newCategoryName.value.trim())
  newCategoryName.value = ''
  showAddCategory.value = false
}

function renameCategory(cat) {
  renamingCategory.value = { id: cat.id, newName: cat.name }
}

async function doRenameCategory() {
  if (!renamingCategory.value || !renamingCategory.value.newName.trim()) return
  await rulesStore.updateCategory(renamingCategory.value.id, { name: renamingCategory.value.newName.trim() })
  renamingCategory.value = null
}

function confirmDeleteCategory(cat) {
  deleteConfirm.value = {
    show: true,
    type: 'category',
    target: cat,
    message: `确定删除分类"${cat.name}"吗？分类下的规则将移到"未分类"。`
  }
}

// 规则操作
function startCreateRule() {
  const defaultCatId = activeCategory.value !== 'all' ? activeCategory.value : (rulesStore.categories[0]?.id || 0)
  editingRule.value = {
    id: null,
    name: '',
    content: '',
    type: 'general',
    description: '',
    category_id: defaultCatId
  }
}

function editRule(rule) {
  editingRule.value = {
    id: rule.id,
    name: rule.name,
    content: rule.content || '',
    type: rule.type || 'general',
    description: rule.description || '',
    category_id: rule.category_id
  }
}

function cancelEditRule() {
  editingRule.value = null
}

async function saveRule() {
  if (!editingRule.value.name?.trim()) return
  const data = {
    name: editingRule.value.name.trim(),
    content: editingRule.value.content,
    type: editingRule.value.type,
    description: editingRule.value.description,
    category_id: editingRule.value.category_id
  }
  if (editingRule.value.id) {
    await rulesStore.updateRule(editingRule.value.id, data)
  } else {
    await rulesStore.createRule(data)
  }
  editingRule.value = null
}

function moveRule(rule) {
  movingRule.value = { id: rule.id, targetCategoryId: rule.category_id }
}

async function doMoveRule() {
  if (!movingRule.value) return
  await rulesStore.updateRule(movingRule.value.id, { category_id: movingRule.value.targetCategoryId })
  movingRule.value = null
}

function confirmDeleteRule(rule) {
  deleteConfirm.value = {
    show: true,
    type: 'rule',
    target: rule,
    message: `确定删除规则"${rule.name}"吗？`
  }
}

function confirmBatchDelete() {
  deleteConfirm.value = {
    show: true,
    type: 'batch',
    target: null,
    message: `确定删除选中的 ${selectedIds.value.length} 条规则吗？`
  }
}

async function doDelete() {
  const { type, target } = deleteConfirm.value
  if (type === 'category') {
    await rulesStore.deleteCategory(target.id)
  } else if (type === 'rule') {
    await rulesStore.deleteRule(target.id)
    selectedIds.value = selectedIds.value.filter(id => id !== target.id)
  } else if (type === 'batch') {
    await rulesStore.batchDeleteRules([...selectedIds.value])
    selectedIds.value = []
  }
  deleteConfirm.value.show = false
}

async function doBatchMove() {
  if (batchMoveCategoryId.value === null) return
  await rulesStore.batchCategorizeRules([...selectedIds.value], batchMoveCategoryId.value)
  selectedIds.value = []
  showBatchMove.value = false
  batchMoveCategoryId.value = null
}

// 批量导入
function triggerImport() {
  importInput.value?.click()
}

async function handleImportSelect(e) {
  const files = Array.from(e.target.files || [])
  if (files.length === 0) return
  const defaultCatId = activeCategory.value !== 'all' ? activeCategory.value : 0
  await rulesStore.importTxtRules(files, defaultCatId)
  e.target.value = ''
}

async function handleDrop(event) {
  isDragOver.value = false
  const files = Array.from(event.dataTransfer.files).filter(f => f.name.endsWith('.txt'))
  if (files.length === 0) return
  const defaultCatId = activeCategory.value !== 'all' ? activeCategory.value : 0
  await rulesStore.importTxtRules(files, defaultCatId)
}

onMounted(() => {
  rulesStore.loadAll()
})

// 监听规则数据变化，清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
watch(() => rulesStore.rules, () => {
  if (selectedIds.value.length > 0) {
    const validIds = new Set(rulesStore.rules.map(item => item.id))
    selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
  }
})

// 添加分类对话框打开时自动聚焦
function focusNewCatInput() {
  nextTick(() => newCatInput.value?.focus())
}

import { watch } from 'vue'
watch(showAddCategory, (v) => { if (v) focusNewCatInput() })
</script>

<style scoped>
.rules-manager {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
}

.rules-manager h2 {
  margin: 0 0 16px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

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

.category-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
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
  background: rgba(0,0,0,0.1);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
}

.category-tab.active .cat-count {
  background: rgba(255,255,255,0.3);
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
  background: rgba(0,0,0,0.15);
}

.cat-action-btn.danger:hover {
  color: #ef4444;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.divider {
  color: var(--text-tertiary, #ccc);
  margin: 0 4px;
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

.rules-list {
  border: 1px solid var(--border-color, #eee);
  border-radius: 8px;
  overflow: hidden;
}

.list-header, .list-row {
  display: grid;
  grid-template-columns: 40px 1fr 90px 120px 140px 180px;
  align-items: center;
  padding: 10px 12px;
}

.list-header {
  background: var(--bg-main, #f5f5f5);
  font-weight: 600;
  font-size: 13px;
  color: var(--text-secondary, #666);
}

.list-row {
  border-top: 1px solid var(--border-color, #eee);
  cursor: pointer;
  font-size: 13px;
}

.list-row:hover {
  background: var(--bg-surface, #fafafa);
}

.list-row.selected {
  background: var(--accent-bg, rgba(79, 70, 229, 0.05));
}

.checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color, #ccc);
  border-radius: 3px;
  cursor: pointer;
}

.checkbox.checked {
  background: var(--accent-color, #4f46e5);
  border-color: var(--accent-color, #4f46e5);
  position: relative;
}

.checkbox.checked::after {
  content: '✓';
  color: #fff;
  font-size: 11px;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.col-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-name:hover {
  color: var(--accent-color, #4f46e5);
}

.type-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--bg-main, #eee);
  color: var(--text-secondary, #666);
}

.type-badge.system { background: #dbeafe; color: #1e40af; }
.type-badge.image { background: #fef3c7; color: #92400e; }
.type-badge.chat { background: #d1fae5; color: #065f46; }
.type-badge.dialogue { background: #ede9fe; color: #5b21b6; }
.type-badge.behavior { background: #fce7f3; color: #9d174d; }

.col-actions {
  display: flex;
  gap: 6px;
}

.btn-icon-sm {
  padding: 3px 8px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 4px;
  background: var(--bg-surface, #fff);
  color: var(--text-primary, #333);
  cursor: pointer;
  font-size: 12px;
}

.btn-icon-sm:hover {
  background: var(--bg-main, #f5f5f5);
}

.btn-icon-sm.danger {
  color: #ef4444;
}

.btn-icon-sm.danger:hover {
  background: #fef2f2;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-tertiary, #999);
}

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
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

/* 批量按钮分隔符 */
.btn-divider {
  color: var(--text-tertiary, #666);
  margin: 0 4px;
  opacity: 0.5;
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-primary {
  background: var(--accent-color, #4f46e5);
  color: var(--accent-text, #fff);
  border-color: var(--accent-color, #4f46e5);
}

.btn-primary:hover {
  opacity: 0.9;
  background: var(--accent-color, #4f46e5);
}

.btn-danger {
  color: #ef4444;
  border-color: #fecaca;
}

.btn-danger:hover {
  background: #fef2f2;
}

.fw-body input, .fw-body select, .fw-body textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-surface, #fff);
  color: var(--text-primary, #333);
  box-sizing: border-box;
}

.fw-body input:focus, .fw-body select:focus, .fw-body textarea:focus {
  outline: none;
  border-color: var(--accent-color, #4f46e5);
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--text-secondary, #666);
  font-weight: 500;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row .form-group {
  flex: 1;
}

.fw-body p {
  color: var(--text-secondary, #666);
  margin: 8px 0;
}

.fw-confirm-msg {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-line;
  line-height: 1.6;
}
</style>
