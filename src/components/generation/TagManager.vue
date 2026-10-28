<template>
  <div class="card tag-manager">
    <h2>打标管理</h2>

    <p class="hint">管理文件库标签与标签分类，用于对文件进行打标归类</p>

    <!-- 分类栏（参考 TaskManager） -->
    <div class="category-bar">
      <div class="category-tabs">
        <!-- 系统分类：全部 -->
        <div
          :class="['category-tab', { active: activeCategory === 'all' }]"
          @click="switchCategory('all')"
        >
          <span class="cat-name">全部</span>
          <span class="cat-count">{{ tags.length }}</span>
        </div>
        <!-- 系统分类：未分类 -->
        <div
          :class="['category-tab', { active: activeCategory === 'uncategorized' }]"
          @click="switchCategory('uncategorized')"
        >
          <span class="cat-name">未分类</span>
          <span class="cat-count">{{ uncategorizedCount }}</span>
        </div>
        <!-- 用户自定义分类 -->
        <div
          v-for="cat in tagCategories"
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
        <button class="btn btn-primary" @click="openCreateDialog">+ 新建标签</button>
        <span class="btn-divider">|</span>
        <button
          :disabled="selectedIds.length === 0"
          class="btn btn-sm"
          @click="openBatchMoveDialog"
        >移动到分类 ({{ selectedIds.length }})</button>
        <button
          :disabled="selectedIds.length === 0"
          class="btn btn-sm btn-danger"
          @click="confirmBatchDelete"
        >删除选中 ({{ selectedIds.length }})</button>
      </div>
      <div class="toolbar-right">
        <input
          type="text"
          class="filter-search"
          v-model="searchKeyword"
          placeholder="搜索标签名..."
        />
      </div>
    </div>

    <!-- 标签列表 -->
    <div class="tag-list" v-if="filteredTags.length > 0">
      <div class="list-header">
        <div class="col-check"></div>
        <div class="col-color">颜色</div>
        <div class="col-name">名称</div>
        <div class="col-count">文件数</div>
        <div class="col-category">分类</div>
        <div class="col-actions">操作</div>
      </div>
      <div v-for="tag in filteredTags" :key="tag.id" class="list-row">
        <div class="col-check" @click.stop="toggleSelect(tag.id)">
          <div :class="['checkbox', { checked: selectedIds.includes(tag.id) }]"></div>
        </div>
        <div class="col-color">
          <span class="color-swatch" :style="{ background: tag.color || '#999' }"></span>
        </div>
        <div class="col-name" :title="tag.name">{{ tag.name }}</div>
        <div class="col-count">{{ tag.file_count || 0 }}</div>
        <div class="col-category">{{ getCategoryName(tag.category_id) }}</div>
        <div class="col-actions">
          <button class="btn-icon-sm" @click="editTag(tag)" title="编辑">编辑</button>
          <button class="btn-icon-sm danger" @click="confirmDeleteTag(tag)" title="删除">删除</button>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <p>暂无标签，点击"新建标签"创建</p>
    </div>

    <!-- 新建/编辑标签对话框 -->
    <FloatingWindow v-model:open="showDialogOpen" :title="editingTag ? '编辑标签' : '新建标签'" size="default">
      <div class="form-group">
        <label>标签名称</label>
        <input type="text" v-model="tagForm.name" placeholder="输入标签名称" @keyup.enter="doSaveTag" />
      </div>
      <div class="form-group">
        <label>颜色</label>
        <div class="color-picker-row">
          <input type="color" v-model="tagForm.color" class="color-input" />
          <div class="color-presets">
            <span
              v-for="c in presetColors"
              :key="c"
              class="color-preset"
              :style="{ background: c }"
              :class="{ active: tagForm.color === c }"
              @click="tagForm.color = c"
            ></span>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label>分类</label>
        <select v-model="tagForm.category_id">
          <option :value="0">未分类</option>
          <option v-for="cat in tagCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="closeDialog">取消</button>
        <button class="btn btn-primary" @click="doSaveTag" :disabled="!tagForm.name">
          {{ editingTag ? '保存' : '创建' }}
        </button>
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
      <p class="hint">将选中的 {{ selectedIds.length }} 个标签移动到指定分类</p>
      <div class="form-group">
        <label>目标分类</label>
        <select v-model="batchMoveDialog.targetCategoryId">
          <option :value="0">未分类</option>
          <option v-for="cat in tagCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="batchMoveDialog.show = false">取消</button>
        <button class="btn btn-primary" @click="doBatchMove" :disabled="batchMoveDialog.targetCategoryId === null">移动</button>
      </template>
    </FloatingWindow>

    <!-- 删除分类确认弹窗 -->
    <FloatingWindow v-model:open="deleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除分类"{{ deleteConfirm.target?.name }}"吗？<br/><small>该分类下的标签将移到"未分类"</small></p>
      <template #footer>
        <button class="btn" @click="deleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDeleteCategory">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 删除标签确认弹窗 -->
    <FloatingWindow v-model:open="tagDeleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除标签"{{ tagDeleteConfirm.target?.name }}"吗？</p>
      <template #footer>
        <button class="btn" @click="tagDeleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDeleteTag">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 批量删除确认弹窗 -->
    <FloatingWindow v-model:open="batchDeleteConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除选中的 {{ batchDeleteConfirm.count }} 个标签吗？</p>
      <template #footer>
        <button class="btn" @click="batchDeleteConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doBatchDelete">确定删除</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useFileLibraryStore } from '@/stores/fileLibrary'
import { storeToRefs } from 'pinia'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const store = useFileLibraryStore()
const { tags, tagCategories } = storeToRefs(store)

const activeCategory = ref('all')
const selectedIds = ref([])
const searchKeyword = ref('')

const showDialog = ref(false)
const editingTag = ref(null)
const showAddCategory = ref(false)
const newCategoryName = ref('')
const renamingCategory = ref(null)
const renameForm = reactive({ name: '' })
const deleteConfirm = ref({ show: false, target: null })
const tagDeleteConfirm = ref({ show: false, target: null })
const batchDeleteConfirm = ref({ show: false, count: 0 })
const batchMoveDialog = reactive({ show: false, targetCategoryId: 0 })

const presetColors = [
  '#4a9eff', '#2ecc71', '#e74c3c', '#f39c12',
  '#9b59b6', '#1abc9c', '#34495e', '#e67e22'
]

const tagForm = reactive({
  name: '',
  color: '#4a9eff',
  category_id: 0
})

const uncategorizedCount = computed(() =>
  tags.value.filter(t => !t.category_id).length
)

const filteredTags = computed(() => {
  let list = tags.value
  if (activeCategory.value === 'uncategorized') {
    list = list.filter(t => !t.category_id)
  } else if (activeCategory.value !== 'all') {
    list = list.filter(t => t.category_id === activeCategory.value)
  }
  const kw = searchKeyword.value.trim().toLowerCase()
  if (kw) {
    list = list.filter(t => (t.name || '').toLowerCase().includes(kw))
  }
  return list
})

// FloatingWindow open proxies
const showDialogOpen = computed({
  get: () => showDialog.value,
  set: (v) => { if (!v) closeDialog() }
})
const renamingCategoryOpen = computed({
  get: () => !!renamingCategory.value,
  set: (v) => { if (!v) renamingCategory.value = null }
})
const batchMoveDialogOpen = computed({
  get: () => batchMoveDialog.show,
  set: (v) => { if (!v) batchMoveDialog.show = false }
})
const deleteConfirmOpen = computed({
  get: () => deleteConfirm.value.show,
  set: (v) => { if (!v) deleteConfirm.value.show = false }
})
const tagDeleteConfirmOpen = computed({
  get: () => tagDeleteConfirm.value.show,
  set: (v) => { if (!v) tagDeleteConfirm.value.show = false }
})
const batchDeleteConfirmOpen = computed({
  get: () => batchDeleteConfirm.value.show,
  set: (v) => { if (!v) batchDeleteConfirm.value.show = false }
})

function getCategoryCount(catId) {
  return tags.value.filter(t => t.category_id === catId).length
}

function getCategoryName(catId) {
  if (!catId) return '未分类'
  const cat = tagCategories.value.find(c => c.id === catId)
  return cat ? cat.name : '未分类'
}

function toggleSelect(id) {
  const idx = selectedIds.value.indexOf(id)
  if (idx > -1) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

// 切换分类时清空勾选
function switchCategory(cat) {
  activeCategory.value = cat
  selectedIds.value = []
}

function openCreateDialog() {
  editingTag.value = null
  tagForm.name = ''
  tagForm.color = '#4a9eff'
  tagForm.category_id = 0
  showDialog.value = true
}

function closeDialog() {
  showDialog.value = false
  editingTag.value = null
}

function editTag(tag) {
  editingTag.value = tag
  tagForm.name = tag.name || ''
  tagForm.color = tag.color || '#4a9eff'
  tagForm.category_id = tag.category_id || 0
  showDialog.value = true
}

async function doSaveTag() {
  if (!tagForm.name) return
  try {
    const data = {
      name: tagForm.name,
      color: tagForm.color,
      category_id: tagForm.category_id || null
    }
    if (editingTag.value) {
      await store.updateTag(editingTag.value.id, data)
    } else {
      await store.createTag(data)
    }
    closeDialog()
    await store.loadTags()
  } catch (e) {
    console.error('保存标签失败:', e)
  }
}

function confirmDeleteTag(tag) {
  tagDeleteConfirm.value = { show: true, target: tag }
}

async function doDeleteTag() {
  const tag = tagDeleteConfirm.value.target
  tagDeleteConfirm.value.show = false
  try {
    await store.deleteTag(tag.id)
    selectedIds.value = selectedIds.value.filter(id => id !== tag.id)
    await store.loadTags()
  } catch (e) {
    console.error('删除标签失败:', e)
  }
}

function confirmBatchDelete() {
  batchDeleteConfirm.value = { show: true, count: selectedIds.value.length }
}

async function doBatchDelete() {
  batchDeleteConfirm.value.show = false
  try {
    await store.batchDeleteTags([...selectedIds.value])
    selectedIds.value = []
    await store.loadTags()
  } catch (e) {
    console.error('批量删除失败:', e)
  }
}

function openBatchMoveDialog() {
  batchMoveDialog.targetCategoryId = 0
  batchMoveDialog.show = true
}

async function doBatchMove() {
  const targetId = batchMoveDialog.targetCategoryId
  batchMoveDialog.show = false
  try {
    const ids = [...selectedIds.value]
    for (const id of ids) {
      await store.updateTag(id, { category_id: targetId || null })
    }
    selectedIds.value = []
    await store.loadTags()
  } catch (e) {
    console.error('批量移动失败:', e)
  }
}

async function doAddCategory() {
  if (!newCategoryName.value) return
  try {
    await store.createTagCategory(newCategoryName.value)
    showAddCategory.value = false
    newCategoryName.value = ''
    await store.loadTagCategories()
  } catch (e) {
    console.error('添加分类失败:', e)
  }
}

function renameCategory(cat) {
  renamingCategory.value = cat
  renameForm.name = cat.name
}

async function doRenameCategory() {
  if (!renamingCategory.value || !renameForm.name) return
  try {
    await store.updateTagCategory(renamingCategory.value.id, { name: renameForm.name })
    renamingCategory.value = null
    await store.loadTagCategories()
  } catch (e) {
    console.error('重命名失败:', e)
  }
}

function confirmDeleteCategory(cat) {
  deleteConfirm.value = { show: true, target: cat }
}

async function doDeleteCategory() {
  const cat = deleteConfirm.value.target
  deleteConfirm.value.show = false
  try {
    await store.deleteTagCategory(cat.id)
    if (activeCategory.value === cat.id) activeCategory.value = 'all'
    await store.loadTagCategories()
    await store.loadTags()
  } catch (e) {
    console.error('删除失败:', e)
  }
}

onMounted(() => {
  store.loadTags()
  store.loadTagCategories()
})

// 监听标签数据变化，清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
watch(tags, () => {
  if (selectedIds.value.length > 0) {
    const validIds = new Set(tags.value.map(item => item.id))
    selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
  }
})
</script>

<style scoped>
.tag-manager {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
}

.tag-manager h2 {
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

/* 分类栏（与 TaskManager 一致） */
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

/* 标签列表 */
.tag-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: var(--input-shadow);
}

.list-header, .list-row {
  display: grid;
  grid-template-columns: 36px 60px 1.5fr 80px 1fr 160px;
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

.col-color {
  display: flex;
  align-items: center;
}

.color-swatch {
  display: inline-block;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--bg-secondary);
  box-shadow: 0 0 0 1px var(--bg-tertiary, rgba(128, 128, 128, 0.2));
}

.col-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-count {
  font-size: 13px;
  color: var(--accent-color);
  font-weight: 600;
}

.col-category {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.form-group small {
  display: block;
  margin-top: 6px;
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 500;
}

/* 颜色选择 */
.color-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.color-input {
  width: 44px;
  height: 36px;
  padding: 2px;
  border: none;
  border-radius: 8px;
  background: var(--bg-surface);
  cursor: pointer;
  box-shadow: var(--input-shadow);
  flex-shrink: 0;
}

.color-presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.color-preset {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.15s ease;
}

.color-preset:hover {
  transform: scale(1.1);
}

.color-preset.active {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 2px var(--bg-secondary);
}

</style>
