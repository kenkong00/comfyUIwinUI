<template>
  <div class="card conversation-history-panel">
    <h2>对话记录</h2>
    <p class="section-desc">查看和管理历史对话记录，点击记录可继续对话</p>

    <!-- 分类栏（参考打标管理） -->
    <div class="category-bar">
      <div class="category-tabs">
        <!-- 系统分类：全部 -->
        <div
          :class="['category-tab', { active: activeCategory === 'all' }]"
          @click="switchCategory('all')"
        >
          <span class="cat-name">全部</span>
          <span class="cat-count">{{ list.length }}</span>
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
          v-for="cat in chatStore.conversationCategories"
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
        <button class="btn btn-sm" @click="toggleSelectAll" v-if="filteredList.length > 0">{{ allSelected ? '取消全选' : '全选' }}</button>
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
        <button class="btn btn-sm" @click="refreshList" title="刷新">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M23 4v6h-6M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          刷新
        </button>
      </div>
      <div class="toolbar-right">
        <input type="text" v-model="searchQuery" placeholder="搜索对话..." class="search-input" />
      </div>
    </div>

    <!-- 对话记录列表 -->
    <div class="entity-list" v-if="filteredList.length > 0">
      <div class="list-header">
        <div class="col-check"></div>
        <div class="col-preview">预览</div>
        <div class="col-title">标题</div>
        <div class="col-count">消息数</div>
        <div class="col-category">分类</div>
        <div class="col-date">更新时间</div>
        <div class="col-actions">操作</div>
      </div>
      <div
        v-for="conv in filteredList"
        :key="conv.id"
        :class="['list-row', { selected: selectedIds.includes(conv.id) }]"
      >
        <div class="col-check" @click.stop="toggleSelect(conv.id)">
          <div :class="['checkbox', { checked: selectedIds.includes(conv.id) }]"></div>
        </div>
        <div class="col-preview" @click="openConversation(conv)">
          <div v-if="getConversationThumb(conv)" class="conv-thumb" :style="{ backgroundImage: `url(${getConversationThumb(conv)})` }"></div>
          <div v-else class="conv-thumb-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
        </div>
        <div class="col-title" @click="openConversation(conv)" :title="conv.title">
          {{ conv.title || '新对话' }}
        </div>
        <div class="col-count">{{ conv.message_count || 0 }}</div>
        <div class="col-category">
          <select
            class="cat-select"
            :value="conv.category_id || 0"
            @click.stop
            @change="onQuickMove($event, conv)"
          >
            <option :value="0">未分类</option>
            <option v-for="cat in chatStore.conversationCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <div class="col-date">{{ formatDate(conv.updated_at) }}</div>
        <div class="col-actions">
          <button class="btn-icon-sm" @click="openConversation(conv)" title="继续对话">继续</button>
          <button class="btn-icon-sm danger" @click="confirmDelete(conv)" title="删除">删除</button>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">
      <p v-if="searchQuery">未找到匹配的对话记录</p>
      <p v-else>暂无对话记录</p>
      <p class="empty-hint">在"对话"栏目中开始对话后，记录会自动保存到这里</p>
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
          <label>分类名称</label>
          <input type="text" v-model="renameForm.name" @keyup.enter="doRenameCategory" />
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="renamingCategory = null">取消</button>
        <button class="btn btn-primary" @click="doRenameCategory" :disabled="!renameForm?.name">保存</button>
      </template>
    </FloatingWindow>

    <!-- 批量移动到分类对话框 -->
    <FloatingWindow v-model:open="batchMoveDialogOpen" title="移动到分类" size="default">
      <p class="hint">将选中的 {{ selectedIds.length }} 条对话移动到指定分类</p>
      <div class="form-group">
        <label>目标分类</label>
        <select v-model="batchMoveDialog.targetCategoryId">
          <option :value="0">未分类</option>
          <option v-for="cat in chatStore.conversationCategories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="batchMoveDialog.show = false">取消</button>
        <button class="btn btn-primary" @click="doBatchMove" :disabled="batchMoveDialog.targetCategoryId === null">移动</button>
      </template>
    </FloatingWindow>

    <!-- 删除分类确认弹窗 -->
    <FloatingWindow v-model:open="deleteCategoryConfirmOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">确定要删除分类"{{ deleteCategoryConfirm.target?.name }}"吗？<br/><small>该分类下的对话将移到"未分类"</small></p>
      <template #footer>
        <button class="btn" @click="deleteCategoryConfirm.show = false">取消</button>
        <button class="btn btn-danger" @click="doDeleteCategory">确定删除</button>
      </template>
    </FloatingWindow>

    <!-- 删除对话确认 -->
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
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const emit = defineEmits(['navigate'])

const chatStore = useChatStore()

const selectedIds = ref([])
const searchQuery = ref('')
const activeCategory = ref('all')
const deleteConfirm = ref({ show: false, id: null, isBatch: false, message: '' })

// 分类相关
const showAddCategory = ref(false)
const newCategoryName = ref('')
const renamingCategory = ref(null)
const renameForm = reactive({ name: '' })
const deleteCategoryConfirm = ref({ show: false, target: null })
const batchMoveDialog = reactive({ show: false, targetCategoryId: 0 })

// FloatingWindow open proxies
const renamingCategoryOpen = computed({
  get: () => !!renamingCategory.value,
  set: (v) => { if (!v) renamingCategory.value = null }
})
const batchMoveDialogOpen = computed({
  get: () => batchMoveDialog.show,
  set: (v) => { if (!v) batchMoveDialog.show = false }
})
const deleteCategoryConfirmOpen = computed({
  get: () => deleteCategoryConfirm.value.show,
  set: (v) => { if (!v) deleteCategoryConfirm.value.show = false }
})
const deleteConfirmOpen = computed({
  get: () => deleteConfirm.value.show,
  set: (v) => { if (!v) deleteConfirm.value.show = false }
})

const list = computed(() => chatStore.conversations || [])

const uncategorizedCount = computed(() =>
  list.value.filter(c => !c.category_id).length
)

const filteredList = computed(() => {
  let arr = list.value
  if (activeCategory.value === 'uncategorized') {
    arr = arr.filter(c => !c.category_id)
  } else if (activeCategory.value !== 'all') {
    arr = arr.filter(c => c.category_id === activeCategory.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    arr = arr.filter(c => (c.title || '新对话').toLowerCase().includes(q))
  }
  return arr
})

function getCategoryCount(catId) {
  return list.value.filter(c => c.category_id === catId).length
}

// 切换分类时清空勾选
function switchCategory(cat) {
  activeCategory.value = cat
  selectedIds.value = []
}

const allSelected = computed(() => {
  return filteredList.value.length > 0 && selectedIds.value.length === filteredList.value.length
})

const toggleSelectAll = () => {
  if (allSelected.value) {
    selectedIds.value = []
  } else {
    selectedIds.value = filteredList.value.map(c => c.id)
  }
}

const toggleSelect = (id) => {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1)
  else selectedIds.value.push(id)
}

// 从对话 messages 中提取第一张缩略图（base64）作为预览
function getConversationThumb(conv) {
  if (!conv || !conv.messages) return ''
  let msgs = conv.messages
  if (typeof msgs === 'string') {
    try { msgs = JSON.parse(msgs) } catch { return '' }
  }
  if (!Array.isArray(msgs)) return ''
  for (const m of msgs) {
    if (m.role === 'assistant' && m.thumbUrl) return m.thumbUrl
    if (m.role === 'user' && m.images && m.images.length > 0 && m.images[0].thumb) return m.images[0].thumb
  }
  return ''
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = (now - d) / 1000
    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`
    if (diff < 604800) return `${Math.floor(diff / 86400)}天前`
    return d.toLocaleDateString('zh-CN')
  } catch { return '' }
}

const openConversation = async (conv) => {
  if (chatStore.isAITyping || chatStore.isGeneratingImage) return
  await chatStore.loadConversation(conv.id)
  emit('navigate', 'chat')
}

const confirmDelete = (conv) => {
  deleteConfirm.value = {
    show: true,
    id: conv.id,
    isBatch: false,
    message: `确定要删除对话"${conv.title || '新对话'}"吗？其中的图片和视频资料将一并删除。`
  }
}

const confirmBatchDelete = () => {
  if (selectedIds.value.length === 0) return
  deleteConfirm.value = {
    show: true,
    id: null,
    isBatch: true,
    message: `确定要删除选中的 ${selectedIds.value.length} 条对话记录吗？其中的图片和视频资料将一并删除。`
  }
}

const doDelete = async () => {
  if (deleteConfirm.value.isBatch) {
    const ids = [...selectedIds.value]
    for (const id of ids) {
      await chatStore.deleteConversation(id)
    }
    selectedIds.value = []
  } else {
    const id = deleteConfirm.value.id
    if (id != null) {
      await chatStore.deleteConversation(id)
      selectedIds.value = selectedIds.value.filter(x => x !== id)
    }
  }
  deleteConfirm.value.show = false
}

const refreshList = async () => {
  await chatStore.loadConversations()
  await chatStore.loadConversationCategories()
}

// ============ 分类管理 ============
async function doAddCategory() {
  if (!newCategoryName.value.trim()) return
  await chatStore.createConversationCategory(newCategoryName.value.trim())
  newCategoryName.value = ''
  showAddCategory.value = false
}

function renameCategory(cat) {
  renamingCategory.value = cat
  renameForm.name = cat.name || ''
}

async function doRenameCategory() {
  if (!renameForm.name.trim() || !renamingCategory.value) return
  await chatStore.updateConversationCategory(renamingCategory.value.id, { name: renameForm.name.trim() })
  renamingCategory.value = null
}

function confirmDeleteCategory(cat) {
  deleteCategoryConfirm.value = { show: true, target: cat }
}

async function doDeleteCategory() {
  const cat = deleteCategoryConfirm.value.target
  if (cat) {
    await chatStore.deleteConversationCategory(cat.id)
    if (activeCategory.value === cat.id) activeCategory.value = 'all'
  }
  deleteCategoryConfirm.value = { show: false, target: null }
}

function openBatchMoveDialog() {
  if (selectedIds.value.length === 0) return
  batchMoveDialog.show = true
  batchMoveDialog.targetCategoryId = 0
}

async function doBatchMove() {
  const targetId = batchMoveDialog.targetCategoryId
  for (const id of selectedIds.value) {
    await chatStore.moveConversationToCategory(id, targetId)
  }
  batchMoveDialog.show = false
  selectedIds.value = []
}

// 列表中快速更改单条对话的分类
async function onQuickMove(event, conv) {
  const newCatId = Number(event.target.value)
  await chatStore.moveConversationToCategory(conv.id, newCatId)
}

onMounted(async () => {
  await chatStore.loadConversations()
  await chatStore.loadConversationCategories()
})

// 监听对话数据变化，清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
watch(() => chatStore.conversations, () => {
  if (selectedIds.value.length > 0) {
    const validIds = new Set((chatStore.conversations || []).map(item => item.id))
    selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
  }
})
</script>

<style scoped>
.conversation-history-panel {
  padding: 16px;
}

.section-desc {
  margin: 4px 0 16px 0;
  font-size: 13px;
  color: var(--text-muted);
}

/* 分类栏 */
.category-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
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

.cat-name {
  font-size: 15px;
  font-weight: 500;
}

.cat-count {
  font-size: 11px;
  background: rgba(0, 0, 0, 0.15);
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.category-tab:not(.active) .cat-count {
  background: rgba(0, 0, 0, 0.08);
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
  opacity: 1;
  background: rgba(0, 0, 0, 0.15);
}

.cat-action-btn.danger:hover {
  background: #ef4444;
  color: #fff;
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  gap: 8px;
  align-items: center;
}

.toolbar-right {
  display: flex;
  gap: 8px;
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

.entity-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.list-header,
.list-row {
  display: grid;
  grid-template-columns: 40px 56px 1fr 70px 130px 120px 120px;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-size: 13px;
}

.list-header {
  background: var(--bg-surface);
  border-radius: 6px;
  color: var(--text-secondary);
  font-weight: 600;
}

.list-row {
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  cursor: default;
}

.list-row:hover {
  background: var(--bg-surface);
}

.list-row.selected {
  background: rgba(59, 130, 246, 0.1);
  border-color: var(--accent-color);
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

.col-preview {
  display: flex;
  justify-content: center;
}

.conv-thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background-size: cover;
  background-position: center;
  background-color: var(--bg-secondary);
}

.conv-thumb-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.col-title {
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--text-primary);
}

.col-title:hover {
  color: var(--accent-color);
}

.col-count,
.col-date {
  font-size: 12px;
  color: var(--text-secondary);
}

.cat-select {
  padding: 3px 6px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  max-width: 110px;
}

.col-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

.btn-icon-sm {
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-icon-sm:hover {
  background: var(--accent-color);
  color: var(--accent-text);
}

.btn-icon-sm.danger:hover {
  background: #ef4444;
  color: #fff;
}

.empty-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--text-muted);
}

.empty-state p {
  margin: 4px 0;
  font-size: 14px;
}

.empty-hint {
  font-size: 12px !important;
  color: var(--text-muted);
  margin-top: 12px !important;
}

/* 对话框 */
.hint {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--text-muted);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  box-sizing: border-box;
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
  padding: 5px 10px;
  font-size: 12px;
}

.btn-primary {
  background: var(--accent-color);
  color: var(--accent-text);
  border-color: var(--accent-color);
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-danger {
  background: #ef4444;
  color: #fff;
  border-color: #ef4444;
}

.btn-danger:hover {
  background: #dc2626;
}

.fw-confirm-msg {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-line;
  line-height: 1.6;
}
</style>
