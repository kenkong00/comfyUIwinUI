<template>
  <div class="card prompt-manager">
    <h2>提示词管理</h2>

    <!-- TXT 批量导入区域 -->
    <div
      class="upload-zone"
      :class="{ dragover: isDragOver }"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="handleDrop"
      @click="triggerTxtInput"
    >
      <input
        type="file"
        ref="txtInput"
        multiple
        accept=".txt"
        @change="handleTxtSelect"
        style="display: none"
      />
      <div class="upload-text">
        <p>点击或拖拽 TXT 文件到此处批量导入（每个文件为一条提示词，文件名=名称）</p>
        <small>导入到当前选中分类</small>
      </div>
    </div>
    <div v-if="importError" class="dialog-error">{{ importError }}</div>

    <!-- 分类栏 -->
    <div class="category-bar">
      <div class="category-tabs">
        <div
          v-for="cat in promptsStore.allCategories"
          :key="cat.id"
          :class="['category-tab', { active: activeCategory === cat.id }]"
          @click="activeCategory = cat.id"
        >
          <span class="cat-name">{{ cat.name }}</span>
          <span class="cat-count">{{ promptsStore.getCategoryCount(cat.id) }}</span>
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
        <button class="btn btn-icon-toggle" :class="{ active: viewMode === 'grid' }" @click="viewMode = 'grid'" title="网格显示">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>
        </button>
        <button class="btn btn-icon-toggle" :class="{ active: viewMode === 'list' }" @click="viewMode = 'list'" title="列表显示">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg>
        </button>
        <span class="btn-divider">|</span>
        <button :disabled="selectedIds.length === 0" class="btn btn-sm btn-danger" @click="confirmBatchDelete">
          删除选中 ({{ selectedIds.length }})
        </button>
        <button :disabled="selectedIds.length === 0" class="btn btn-sm" @click="showBatchMove = true">
          移动选中
        </button>
        <button class="btn btn-primary btn-sm" @click="openCreateDialog">+ 新建提示词</button>
      </div>
      <div class="toolbar-right">
        <input type="text" v-model="searchQuery" placeholder="搜索名称或内容..." class="search-input" />
      </div>
    </div>

    <!-- 网格视图 -->
    <div class="prompt-grid" v-if="filteredPrompts.length > 0 && viewMode === 'grid'">
      <div
        v-for="p in filteredPrompts"
        :key="p.id"
        :class="['prompt-card', { selected: selectedIds.includes(p.id) }]"
      >
        <div class="card-thumb" @click="toggleSelect(p.id)">
          <img v-if="getPromptThumb(p)" :src="getPromptThumb(p)" :alt="p.name" />
          <div v-else class="thumb-placeholder">文</div>
          <div class="thumb-check" @click.stop="toggleSelect(p.id)">
            <div :class="['checkbox', { checked: selectedIds.includes(p.id) }]"></div>
          </div>
        </div>
        <div class="card-info">
          <div class="card-name" :title="p.name">{{ p.name }}</div>
          <div class="card-meta">
            <span class="meta-cat">{{ promptsStore.getCategoryName(p.category_id) }}</span>
            <span class="meta-date">{{ formatDate(p.created_at) }}</span>
          </div>
          <div class="card-content" :title="p.content">{{ p.content }}</div>
        </div>
        <div class="card-actions">
          <button class="btn-icon-sm" @click="editPrompt(p)" title="编辑">编辑</button>
          <button class="btn-icon-sm" @click="movePrompt(p)" title="移动分类">移动</button>
          <button class="btn-icon-sm danger" @click="confirmDeletePrompt(p)" title="删除">删除</button>
        </div>
      </div>
    </div>

    <!-- 列表视图 -->
    <div class="prompt-list" v-if="filteredPrompts.length > 0 && viewMode === 'list'">
      <div class="list-header">
        <div class="col-check"></div>
        <div class="col-thumb">图</div>
        <div class="col-name">名称</div>
        <div class="col-content">内容预览</div>
        <div class="col-cat">分类</div>
        <div class="col-date">创建时间</div>
        <div class="col-actions">操作</div>
      </div>
      <div
        v-for="p in filteredPrompts"
        :key="p.id"
        :class="['list-row', { selected: selectedIds.includes(p.id) }]"
      >
        <div class="col-check" @click.stop="toggleSelect(p.id)">
          <div :class="['checkbox', { checked: selectedIds.includes(p.id) }]"></div>
        </div>
        <div class="col-thumb">
          <img v-if="getPromptThumb(p)" :src="getPromptThumb(p)" :alt="p.name" />
          <div v-else class="thumb-placeholder">文</div>
        </div>
        <div class="col-name" :title="p.name">{{ p.name }}</div>
        <div class="col-content" :title="p.content">{{ p.content ? p.content.slice(0, 60) + (p.content.length > 60 ? '...' : '') : '-' }}</div>
        <div class="col-cat">{{ promptsStore.getCategoryName(p.category_id) }}</div>
        <div class="col-date">{{ formatDate(p.created_at) }}</div>
        <div class="col-actions">
          <button class="btn-icon-sm" @click="editPrompt(p)" title="编辑">编辑</button>
          <button class="btn-icon-sm" @click="movePrompt(p)" title="移动分类">移动</button>
          <button class="btn-icon-sm danger" @click="confirmDeletePrompt(p)" title="删除">删除</button>
        </div>
      </div>
    </div>

    <div v-if="filteredPrompts.length === 0" class="empty-state">
      <p>暂无提示词，点击"新建提示词"或拖拽 TXT 文件批量导入</p>
    </div>

    <!-- 添加分类对话框 -->
    <FloatingWindow v-model:open="showAddCategory" title="添加分类" size="default">
      <div class="form-group">
        <label>分类名称</label>
        <input type="text" v-model="newCategoryName" placeholder="输入分类名称" />
      </div>
      <div v-if="dialogError" class="dialog-error">{{ dialogError }}</div>
      <template #footer>
        <button class="btn" @click="showAddCategory = false">取消</button>
        <button class="btn btn-primary" @click="doAddCategory" :disabled="!newCategoryName.trim()">添加</button>
      </template>
    </FloatingWindow>

    <!-- 重命名分类对话框 -->
    <FloatingWindow v-model:open="showRenameCategory" title="重命名分类" size="default">
      <div class="form-group">
        <label>分类名称</label>
        <input type="text" v-model="renameCategoryName" placeholder="输入新名称" />
      </div>
      <div v-if="dialogError" class="dialog-error">{{ dialogError }}</div>
      <template #footer>
        <button class="btn" @click="showRenameCategory = false">取消</button>
        <button class="btn btn-primary" @click="doRenameCategory" :disabled="!renameCategoryName.trim()">保存</button>
      </template>
    </FloatingWindow>

    <!-- 新建/编辑提示词对话框 -->
    <FloatingWindow v-model:open="showEditDialog" :title="editingPrompt ? '编辑提示词' : '新建提示词'" size="large" @close="closeEditDialog">
      <div class="form-group">
        <label>名称</label>
        <input type="text" v-model="promptForm.name" placeholder="提示词名称" />
      </div>
        <div class="form-group">
          <label>分类</label>
          <select v-model="promptForm.category_id">
            <option :value="0">未分类</option>
            <option v-for="cat in promptsStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>提示词内容</label>
          <textarea v-model="promptForm.content" placeholder="输入提示词内容..." rows="6"></textarea>
        </div>
        <div class="form-group">
          <label>关联图片（可选）</label>
          <div class="image-section">
            <div class="image-preview" v-if="promptForm.imagePreview">
              <img :src="promptForm.imagePreview" alt="预览" />
              <button class="btn-icon-sm danger" @click="clearImage">移除</button>
            </div>
            <div class="image-actions" v-else>
              <button class="btn btn-sm" @click="openGalleryPicker">从图库选择</button>
              <button class="btn btn-sm" @click="triggerImageUpload">上传图片</button>
              <input
                type="file"
                ref="imageInput"
                accept="image/*"
                @change="handleImageUpload"
                style="display: none"
              />
            </div>
          </div>
          <small v-if="promptForm.gallery_image_id">已关联图库图片（上传后会自动加入图库）</small>
        </div>
        <div v-if="dialogError" class="dialog-error">{{ dialogError }}</div>
      <template #footer>
        <button class="btn" @click="closeEditDialog">取消</button>
        <button class="btn btn-primary" @click="doSavePrompt" :disabled="!promptForm.name.trim()">保存</button>
      </template>
    </FloatingWindow>

    <!-- 图库选择器 -->
    <FloatingWindow v-model:open="showGalleryPicker" title="从图库选择图片" size="large">
      <div class="picker-filter">
          <select v-model="pickerCategory" class="filter-select">
            <option value="all">全部分类</option>
            <option v-for="cat in galleryStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
          <input type="text" v-model="pickerSearch" placeholder="搜索图片..." class="filter-search" />
        </div>
        <div class="picker-grid" v-if="filteredGalleryImages.length > 0">
          <div
            v-for="img in filteredGalleryImages"
            :key="img.id"
            :class="['picker-item', { selected: promptForm.gallery_image_id === img.id }]"
            @click="selectGalleryImage(img)"
          >
            <img v-if="img.thumbnail_data" :src="img.thumbnail_data" :alt="img.name" />
            <div v-else class="thumb-placeholder">无图</div>
            <div class="picker-item-name" :title="img.name">{{ img.name }}</div>
          </div>
        </div>
        <div v-else class="empty-hint">图库暂无图片</div>
      <template #footer>
        <button class="btn" @click="showGalleryPicker = false">取消</button>
      </template>
    </FloatingWindow>

    <!-- 移动分类对话框（单个/批量） -->
    <FloatingWindow v-model:open="showMoveDialog" title="移动到分类" size="default">
      <div class="form-group">
        <label>选择目标分类</label>
        <select v-model="moveTargetCategoryId">
          <option :value="0">未分类</option>
          <option v-for="cat in promptsStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="showMoveDialog = false">取消</button>
        <button class="btn btn-primary" @click="doMove">移动</button>
      </template>
    </FloatingWindow>

    <!-- 删除确认 -->
    <FloatingWindow v-model:open="confirmDialogOpen" title="确认" size="confirm">
      <p class="fw-confirm-msg">{{ confirmDialog.message }}</p>
      <template #footer>
        <button class="btn" @click="confirmDialog.visible = false">取消</button>
        <button class="btn btn-danger" @click="confirmDialog.onConfirm">确定</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { usePromptsStore } from '@/stores/prompts'
import { useGalleryStore } from '@/stores/gallery'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const promptsStore = usePromptsStore()
const galleryStore = useGalleryStore()

const activeCategory = ref('all')
const viewMode = ref('grid')
const searchQuery = ref('')
const selectedIds = ref([])
const isDragOver = ref(false)
const txtInput = ref(null)
const imageInput = ref(null)

const showAddCategory = ref(false)
const newCategoryName = ref('')
const showRenameCategory = ref(false)
const renameCategoryName = ref('')
const renamingCategory = ref(null)
const dialogError = ref('')  // 对话框内错误提示
const importError = ref('')  // 拖拽导入错误提示

const showEditDialog = ref(false)
const editingPrompt = ref(null)
const promptForm = reactive({
  name: '',
  content: '',
  category_id: 0,
  gallery_image_id: null,
  imagePreview: ''
})

const showGalleryPicker = ref(false)
const pickerCategory = ref('all')
const pickerSearch = ref('')

const showMoveDialog = ref(false)
const moveTargetCategoryId = ref(0)
const movingIds = ref([])
const isBatchMove = ref(false)
const showBatchMove = ref(false)

const confirmDialog = reactive({
  visible: false,
  message: '',
  onConfirm: () => {}
})

// FloatingWindow open 代理：响应式对象 confirmDialog 用 writable computed 桥接到 v-model:open
const confirmDialogOpen = computed({
  get: () => confirmDialog.visible,
  set: (v) => { if (!v) confirmDialog.visible = false }
})

const filteredPrompts = computed(() => {
  let list = promptsStore.promptsByCategory(activeCategory.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    list = list.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.content || '').toLowerCase().includes(q)
    )
  }
  return list
})

const allSelected = computed(() => {
  const list = filteredPrompts.value
  return list.length > 0 && list.every(p => selectedIds.value.includes(p.id))
})

const filteredGalleryImages = computed(() => {
  let list = galleryStore.images
  if (pickerCategory.value !== 'all') {
    list = list.filter(img => img.category_id === pickerCategory.value)
  }
  if (pickerSearch.value.trim()) {
    const q = pickerSearch.value.trim().toLowerCase()
    list = list.filter(img => (img.name || '').toLowerCase().includes(q))
  }
  return list
})

function formatDate(d) {
  if (!d) return '-'
  try {
    return new Date(d).toLocaleDateString('zh-CN')
  } catch { return '-' }
}

function getPromptThumb(prompt) {
  if (!prompt.gallery_image_id) return ''
  const img = galleryStore.getImageById(prompt.gallery_image_id)
  return img ? (img.thumbnail_data || '') : ''
}

function toggleSelect(id) {
  const i = selectedIds.value.indexOf(id)
  if (i >= 0) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = []
  } else {
    selectedIds.value = filteredPrompts.value.map(p => p.id)
  }
}

function triggerTxtInput() {
  txtInput.value && txtInput.value.click()
}

function handleTxtSelect(e) {
  const files = Array.from(e.target.files || [])
  if (files.length > 0) doBatchImport(files)
  e.target.value = ''
}

function handleDrop(e) {
  isDragOver.value = false
  const files = Array.from(e.dataTransfer.files || []).filter(f => f.name.toLowerCase().endsWith('.txt'))
  if (files.length > 0) doBatchImport(files)
}

async function doBatchImport(files) {
  const catId = activeCategory.value === 'all' ? 0 : activeCategory.value
  try {
    const imported = await promptsStore.batchImportTxtFiles(files, catId)
    if (imported === 0) {
      console.warn('批量导入：未导入任何提示词')
    }
  } catch (e) {
    console.error('批量导入失败:', e)
    importError.value = e.message || '导入失败，请检查后端服务是否运行'
    setTimeout(() => { importError.value = '' }, 5000)
  }
}

// 分类操作
async function doAddCategory() {
  if (!newCategoryName.value.trim()) return
  dialogError.value = ''
  try {
    await promptsStore.createCategory(newCategoryName.value.trim())
    newCategoryName.value = ''
    showAddCategory.value = false
  } catch (e) {
    console.error('添加分类失败:', e)
    dialogError.value = e.message || '添加失败，请检查后端服务是否运行'
  }
}

function renameCategory(cat) {
  renamingCategory.value = cat
  renameCategoryName.value = cat.name
  dialogError.value = ''
  showRenameCategory.value = true
}

async function doRenameCategory() {
  if (!renameCategoryName.value.trim() || !renamingCategory.value) return
  dialogError.value = ''
  try {
    await promptsStore.updateCategory(renamingCategory.value.id, { name: renameCategoryName.value.trim() })
    showRenameCategory.value = false
    renamingCategory.value = null
  } catch (e) {
    console.error('重命名失败:', e)
    dialogError.value = e.message || '重命名失败'
  }
}

function confirmDeleteCategory(cat) {
  confirmDialog.message = `确定删除分类「${cat.name}」吗？分类下的提示词将移动到「未分类」`
  confirmDialog.onConfirm = async () => {
    try {
      await promptsStore.deleteCategory(cat.id)
    } catch (e) {
      console.error('删除分类失败:', e)
    }
    confirmDialog.visible = false
  }
  confirmDialog.visible = true
}

// 提示词操作
function openCreateDialog() {
  editingPrompt.value = null
  promptForm.name = ''
  promptForm.content = ''
  promptForm.category_id = activeCategory.value === 'all' ? 0 : activeCategory.value
  promptForm.gallery_image_id = null
  promptForm.imagePreview = ''
  dialogError.value = ''
  showEditDialog.value = true
}

function editPrompt(p) {
  editingPrompt.value = p
  promptForm.name = p.name || ''
  promptForm.content = p.content || ''
  promptForm.category_id = p.category_id || 0
  promptForm.gallery_image_id = p.gallery_image_id || null
  const img = p.gallery_image_id ? galleryStore.getImageById(p.gallery_image_id) : null
  promptForm.imagePreview = img ? (img.thumbnail_data || '') : ''
  dialogError.value = ''
  showEditDialog.value = true
}

function closeEditDialog() {
  showEditDialog.value = false
  editingPrompt.value = null
  dialogError.value = ''
}

async function doSavePrompt() {
  if (!promptForm.name.trim()) return
  dialogError.value = ''
  const data = {
    name: promptForm.name.trim(),
    content: promptForm.content,
    category_id: promptForm.category_id || 0,
    gallery_image_id: promptForm.gallery_image_id || null
  }
  try {
    if (editingPrompt.value) {
      await promptsStore.updatePrompt(editingPrompt.value.id, data)
    } else {
      await promptsStore.createPrompt(data)
    }
    closeEditDialog()
  } catch (e) {
    console.error('保存提示词失败:', e)
    dialogError.value = e.message || '保存失败，请检查后端服务是否运行'
  }
}

function confirmDeletePrompt(p) {
  confirmDialog.message = `确定删除提示词「${p.name}」吗？`
  confirmDialog.onConfirm = async () => {
    try {
      await promptsStore.deletePrompt(p.id)
    } catch (e) {
      console.error('删除失败:', e)
    }
    confirmDialog.visible = false
  }
  confirmDialog.visible = true
}

function confirmBatchDelete() {
  confirmDialog.message = `确定删除选中的 ${selectedIds.value.length} 条提示词吗？`
  confirmDialog.onConfirm = async () => {
    try {
      await promptsStore.batchDeletePrompts([...selectedIds.value])
      selectedIds.value = []
    } catch (e) {
      console.error('批量删除失败:', e)
    }
    confirmDialog.visible = false
  }
  confirmDialog.visible = true
}

function movePrompt(p) {
  movingIds.value = [p.id]
  isBatchMove.value = false
  moveTargetCategoryId.value = 0
  showMoveDialog.value = true
}

function doMove() {
  if (movingIds.value.length === 0) return
  promptsStore.batchCategorizePrompts([...movingIds.value], moveTargetCategoryId.value)
    .then(() => {
      showMoveDialog.value = false
      if (isBatchMove.value) {
        selectedIds.value = []
        showBatchMove.value = false
      }
      movingIds.value = []
    })
    .catch(e => console.error('移动失败:', e))
}

// 批量移动入口（toolbar 按钮）
watch(showBatchMove, (v) => {
  if (v) {
    movingIds.value = [...selectedIds.value]
    isBatchMove.value = true
    moveTargetCategoryId.value = 0
    showMoveDialog.value = true
    showBatchMove.value = false
  }
})

// 图库选择
function openGalleryPicker() {
  showGalleryPicker.value = true
}

function selectGalleryImage(img) {
  promptForm.gallery_image_id = img.id
  promptForm.imagePreview = img.thumbnail_data || ''
  showGalleryPicker.value = false
}

function clearImage() {
  promptForm.gallery_image_id = null
  promptForm.imagePreview = ''
}

function triggerImageUpload() {
  imageInput.value && imageInput.value.click()
}

async function handleImageUpload(e) {
  const file = e.target.files && e.target.files[0]
  if (!file) return
  try {
    const base64 = await galleryStore.fileToBase64(file)
    const thumb = await galleryStore.generateThumbnail(base64)
    const format = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    const created = await galleryStore.createImage({
      name: file.name.replace(/\.[^.]+$/, ''),
      image_base64: base64,
      thumbnail_base64: thumb,
      category_id: 0,
      format,
      file_size: file.size
    })
    if (created) {
      promptForm.gallery_image_id = created.id
      promptForm.imagePreview = thumb
    }
  } catch (err) {
    console.error('上传图片失败:', err)
  }
  e.target.value = ''
}

onMounted(async () => {
  try {
    await Promise.all([
      promptsStore.loadAll(),
      galleryStore.loadAll()
    ])
  } catch (e) {
    console.error('加载数据失败:', e)
  }
})

// 监听提示词数据变化，清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
watch(() => promptsStore.prompts, () => {
  if (selectedIds.value.length > 0) {
    const validIds = new Set(promptsStore.prompts.map(item => item.id))
    selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
  }
})
</script>

<style scoped>
.prompt-manager {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.prompt-manager h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.upload-zone {
  border: 2px dashed var(--border-color, #444);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s ease;
  background: var(--bg-surface);
}

.upload-zone:hover,
.upload-zone.dragover {
  border-color: var(--accent-color);
  background: var(--bg-tertiary, rgba(255,255,255,0.04));
}

.upload-text p {
  margin: 0 0 4px 0;
  color: var(--text-primary);
  font-size: 14px;
}

.upload-text small {
  color: var(--text-secondary);
  font-size: 12px;
}

.category-bar {
  display: flex;
  align-items: center;
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

.cat-name {
  font-size: 15px;
}

.cat-count {
  background: rgba(0,0,0,0.18);
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  min-width: 18px;
  text-align: center;
}

.category-tab.active .cat-count {
  background: rgba(0,0,0,0.25);
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
}

.cat-action-btn.danger:hover {
  color: #ef4444;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
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

.filter-search {
  padding: 6px 10px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  box-shadow: var(--input-shadow);
  min-width: 180px;
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
  opacity: 0.5;
  cursor: not-allowed;
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
  background: var(--accent-color);
  color: var(--accent-text);
}

.btn-danger {
  background: #ef4444;
  color: white;
}

.btn-icon-toggle {
  padding: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-icon-toggle.active {
  background: var(--accent-color);
  color: var(--accent-text);
}

.prompt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.prompt-card {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 2px solid transparent;
  transition: border-color 0.15s ease;
}

.prompt-card.selected {
  border-color: var(--accent-color);
}

.card-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: var(--bg-tertiary, rgba(0,0,0,0.2));
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  color: var(--text-secondary);
  font-size: 24px;
  font-weight: 600;
  opacity: 0.4;
}

.thumb-check {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0,0,0,0.5);
  border-radius: 6px;
  padding: 4px;
  cursor: pointer;
}

.checkbox {
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 3px;
  background: transparent;
}

.checkbox.checked {
  background: var(--accent-color);
  border-color: var(--accent-color);
}

.card-info {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
}

.card-content {
  font-size: 12px;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
  max-height: 32px;
}

.card-actions {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  border-top: 1px solid var(--border-color, rgba(255,255,255,0.05));
}

.btn-icon-sm {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 6px;
  font-size: 12px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.btn-icon-sm:hover {
  background: var(--bg-tertiary, rgba(255,255,255,0.06));
  color: var(--text-primary);
}

.btn-icon-sm.danger:hover {
  color: #ef4444;
}

.prompt-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
}

.list-header,
.list-row {
  display: grid;
  grid-template-columns: 40px 60px 1.2fr 2fr 1fr 100px 200px;
  align-items: center;
  padding: 8px 12px;
  gap: 8px;
}

.list-header {
  background: var(--bg-tertiary, rgba(255,255,255,0.03));
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.list-row {
  border-top: 1px solid var(--border-color, rgba(255,255,255,0.05));
  font-size: 13px;
  color: var(--text-primary);
}

.list-row.selected {
  background: rgba(255,255,255,0.04);
}

.list-row .col-thumb {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-tertiary, rgba(0,0,0,0.2));
  display: flex;
  align-items: center;
  justify-content: center;
}

.list-row .col-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.list-row .col-thumb .thumb-placeholder {
  font-size: 14px;
}

.col-name,
.col-content,
.col-cat {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-row .col-actions,
.list-header .col-actions {
  display: flex;
  gap: 4px;
}

.col-check {
  cursor: pointer;
}

.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
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
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
  box-shadow: var(--input-shadow);
  box-sizing: border-box;
}

.form-group textarea {
  resize: vertical;
  font-family: inherit;
}

.image-section {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.image-preview {
  position: relative;
  display: inline-block;
}

.image-preview img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 8px;
}

.image-preview .btn-icon-sm.danger {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0,0,0,0.6);
  color: white;
  padding: 2px 6px;
}

.image-actions {
  display: flex;
  gap: 8px;
}

.dialog-error {
  padding: 8px 12px;
  margin-bottom: 12px;
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border-radius: 8px;
  font-size: 12px;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.picker-filter {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-select {
  padding: 6px 10px;
  font-size: 13px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 8px;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
  max-height: 50vh;
  overflow-y: auto;
}

.picker-item {
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-surface);
}

.picker-item.selected {
  border-color: var(--accent-color);
}

.picker-item img {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  display: block;
}

.picker-item .thumb-placeholder {
  width: 100%;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary, rgba(0,0,0,0.2));
}

.picker-item-name {
  padding: 4px 6px;
  font-size: 11px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.empty-hint {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

/* FloatingWindow confirm 消息样式（保留原 .confirm-dialog p 的视觉效果） */
.fw-confirm-msg {
  margin: 0;
  font-size: 15px;
  color: var(--text-primary);
  line-height: 1.6;
}
</style>
