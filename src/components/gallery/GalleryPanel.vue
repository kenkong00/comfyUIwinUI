<template>
  <div class="card gallery-manager">
    <h2>艺术图库</h2>

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
        accept="image/*"
        @change="handleFileSelect"
        style="display: none"
      />
      <div class="upload-text">
        <p>点击或拖拽图片到此处上传（支持多选）</p>
        <small>单张上传可选择裁切；批量上传保留原图不裁切</small>
      </div>
    </div>

    <!-- 分类标签 -->
    <div class="category-bar">
      <div class="category-tabs">
        <div
          v-for="cat in galleryStore.allCategories"
          :key="cat.id"
          :class="['category-tab', { active: activeCategory === cat.id }]"
          @click="activeCategory = cat.id"
        >
          <span class="cat-name">{{ cat.name }}</span>
          <span class="cat-count">{{ galleryStore.getCategoryCount(cat.id) }}</span>
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
      </div>
      <div class="toolbar-right">
        <input type="text" v-model="searchQuery" placeholder="搜索图片名称..." class="search-input" />
      </div>
    </div>

    <!-- 图片网格视图 -->
    <div class="image-grid" v-if="filteredImages.length > 0 && viewMode === 'grid'">
      <div
        v-for="img in filteredImages"
        :key="img.id"
        :class="['image-card', { selected: selectedIds.includes(img.id) }]"
      >
        <div class="card-thumb" @click="previewImage(img)">
          <img v-if="img.thumbnail_data" :src="img.thumbnail_data" :alt="img.name" />
          <div v-else class="thumb-placeholder">无图</div>
          <div class="thumb-check" @click.stop="toggleSelect(img.id)">
            <div :class="['checkbox', { checked: selectedIds.includes(img.id) }]"></div>
          </div>
        </div>
        <div class="card-info">
          <div class="card-name" :title="img.name">{{ img.name }}</div>
          <div class="card-meta">
            <span class="meta-cat">{{ galleryStore.getCategoryName(img.category_id) }}</span>
            <span class="meta-date">{{ formatDate(img.created_at) }}</span>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-icon-sm" @click="editImage(img)" title="编辑">编辑</button>
          <button class="btn-icon-sm" @click="moveImage(img)" title="移动分类">移动</button>
          <button class="btn-icon-sm danger" @click="confirmDeleteImage(img)" title="删除">删除</button>
        </div>
      </div>
    </div>

    <!-- 图片列表视图 -->
    <div class="image-list" v-if="filteredImages.length > 0 && viewMode === 'list'">
      <div class="list-header">
        <div class="col-check"></div>
        <div class="col-thumb">预览</div>
        <div class="col-name">名称</div>
        <div class="col-cat">分类</div>
        <div class="col-date">创建时间</div>
        <div class="col-actions">操作</div>
      </div>
      <div
        v-for="img in filteredImages"
        :key="img.id"
        :class="['list-row', { selected: selectedIds.includes(img.id) }]"
      >
        <div class="col-check" @click.stop="toggleSelect(img.id)">
          <div :class="['checkbox', { checked: selectedIds.includes(img.id) }]"></div>
        </div>
        <div class="col-thumb" @click="previewImage(img)">
          <img v-if="img.thumbnail_data" :src="img.thumbnail_data" :alt="img.name" />
          <div v-else class="thumb-placeholder">无图</div>
        </div>
        <div class="col-name" @click="previewImage(img)" :title="img.name">{{ img.name }}</div>
        <div class="col-cat">{{ galleryStore.getCategoryName(img.category_id) }}</div>
        <div class="col-date">{{ formatDate(img.created_at) }}</div>
        <div class="col-actions" @click.stop>
          <button class="btn-icon-sm" @click="editImage(img)" title="编辑">编辑</button>
          <button class="btn-icon-sm" @click="moveImage(img)" title="移动分类">移动</button>
          <button class="btn-icon-sm danger" @click="confirmDeleteImage(img)" title="删除">删除</button>
        </div>
      </div>
    </div>

    <div v-if="filteredImages.length === 0" class="empty-state">
      <p v-if="searchQuery">没有找到匹配的图片</p>
      <p v-else>暂无图片，请上传</p>
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
          <input type="text" v-model="renamingCategory.newName" @keyup.enter="doRenameCategory" />
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="renamingCategory = null">取消</button>
        <button class="btn btn-primary" @click="doRenameCategory">确定</button>
      </template>
    </FloatingWindow>

    <!-- 编辑图片对话框 -->
    <FloatingWindow v-model:open="editingImageOpen" title="编辑图片" size="default">
      <template v-if="editingImage">
        <div class="form-group">
          <label>名称</label>
          <input type="text" v-model="editingImage.name" />
        </div>
        <div class="form-group">
          <label>分类</label>
          <select v-model="editingImage.category_id">
            <option v-for="cat in galleryStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>描述</label>
          <input type="text" v-model="editingImage.description" placeholder="可选" />
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="editingImage = null">取消</button>
        <button class="btn btn-primary" @click="doSaveImage" :disabled="!editingImage?.name?.trim()">保存</button>
      </template>
    </FloatingWindow>

    <!-- 移动分类对话框 -->
    <FloatingWindow v-model:open="movingImageOpen" title="移动到分类" size="default">
      <template v-if="movingImage">
        <div class="form-group">
          <label>目标分类</label>
          <select v-model="movingImage.targetCategoryId">
            <option v-for="cat in galleryStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
        </div>
      </template>
      <template #footer>
        <button class="btn" @click="movingImage = null">取消</button>
        <button class="btn btn-primary" @click="doMoveImage">确定</button>
      </template>
    </FloatingWindow>

    <!-- 批量移动对话框 -->
    <FloatingWindow v-model:open="showBatchMove" :title="`批量移动 ${selectedIds.length} 张图片到分类`" size="default">
      <div class="form-group">
        <label>目标分类</label>
        <select v-model="batchMoveCategoryId">
          <option v-for="cat in galleryStore.categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </div>
      <template #footer>
        <button class="btn" @click="showBatchMove = false">取消</button>
        <button class="btn btn-primary" @click="doBatchMove">确定</button>
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

    <!-- 单张上传裁切选择对话框 -->
    <FloatingWindow v-model:open="showCropChoiceOpen" title="选择上传方式" size="default">
      <p class="upload-hint">请选择图片的上传方式：</p>
      <div class="choice-buttons">
        <button class="choice-btn" @click="chooseWholeUpload">
          <span class="choice-icon">⬜</span>
          <span class="choice-title">整张上传</span>
          <span class="choice-desc">保留原图，不裁切</span>
        </button>
        <button class="choice-btn" @click="chooseCropUpload">
          <span class="choice-icon">✂️</span>
          <span class="choice-title">裁切上传</span>
          <span class="choice-desc">按比例裁切后上传</span>
        </button>
      </div>
      <template #footer>
        <button class="btn btn-sm" @click="cancelCropChoice">取消</button>
      </template>
    </FloatingWindow>

    <!-- 裁切对话框 -->
    <FloatingWindow v-model:open="showCropperOpen" title="裁切图片" size="large">
      <div class="cropper-container">
        <img ref="cropperImg" :src="pendingBase64" />
      </div>
      <template #footer>
        <button class="btn" @click="cancelCrop">取消</button>
        <button class="btn btn-primary" @click="confirmCropUpload" :disabled="!cropperInstance">
          确认裁切并上传
        </button>
      </template>
    </FloatingWindow>

    <!-- 大图预览（使用 ImageViewer 组件） -->
    <ImageViewer v-model:visible="viewerVisible" :src="viewerSrc" :images="viewerImages" :prompts="viewerPrompts" :currentIndex="viewerCurrentIndex" @prev="onViewerPrev" @next="onViewerNext" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useGalleryStore } from '@/stores/gallery'
import { apiClient } from '@/services/api'
import ImageViewer from '@/components/ui/ImageViewer.vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const galleryStore = useGalleryStore()

const activeCategory = ref('all')
const searchQuery = ref('')
const selectedIds = ref([])
const viewMode = ref('grid')

const showAddCategory = ref(false)
const newCategoryName = ref('')

const renamingCategory = ref(null)

const editingImage = ref(null)
const movingImage = ref(null)
const showBatchMove = ref(false)
const batchMoveCategoryId = ref(null)

const isDragOver = ref(false)
const fileInput = ref(null)

const deleteConfirm = ref({ show: false, type: '', target: null, message: '' })

// 大图预览（ImageViewer）
const viewerVisible = ref(false)
const viewerSrc = ref('')
const viewerCurrentIndex = ref(-1)
// 当前过滤后的图片列表（用于上一张/下一张导航；与 viewerPrompts 顺序保持一致）
const viewerImages = computed(() => filteredImages.value.map(img => img.thumbnail_data || ''))
// 与 viewerImages 顺序对应的提示词列表（取图片描述作为提示词）
const viewerPrompts = computed(() => filteredImages.value.map(img => img.description || ''))

// 单张上传裁切
const showCropChoice = ref(false)
const showCropper = ref(false)
const pendingBase64 = ref('')
const pendingFileName = ref('')
const cropperImg = ref(null)
const cropperInstance = ref(null)
const cropTargetCategoryId = ref(0)

const filteredImages = computed(() => {
  let list = galleryStore.imagesByCategory(activeCategory.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(i => i.name?.toLowerCase().includes(q))
  }
  return list
})

const allSelected = computed(() => {
  return filteredImages.value.length > 0 && filteredImages.value.every(i => selectedIds.value.includes(i.id))
})

// Writable computed proxies for FloatingWindow v-model:open
const renamingCategoryOpen = computed({
  get: () => !!renamingCategory.value,
  set: (v) => { if (!v) renamingCategory.value = null }
})
const editingImageOpen = computed({
  get: () => !!editingImage.value,
  set: (v) => { if (!v) editingImage.value = null }
})
const movingImageOpen = computed({
  get: () => !!movingImage.value,
  set: (v) => { if (!v) movingImage.value = null }
})
const deleteConfirmOpen = computed({
  get: () => deleteConfirm.value.show,
  set: (v) => { if (!v) deleteConfirm.value.show = false }
})
const showCropChoiceOpen = computed({
  get: () => showCropChoice.value,
  set: (v) => { if (!v) cancelCropChoice() }
})
const showCropperOpen = computed({
  get: () => showCropper.value,
  set: (v) => { if (!v) cancelCrop() }
})

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function toggleSelect(id) {
  const i = selectedIds.value.indexOf(id)
  if (i > -1) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(id)
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = selectedIds.value.filter(id => !filteredImages.value.some(i => i.id === id))
  } else {
    filteredImages.value.forEach(i => {
      if (!selectedIds.value.includes(i.id)) selectedIds.value.push(i.id)
    })
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileSelect(event) {
  const files = Array.from(event.target.files || [])
  await uploadFiles(files)
  event.target.value = ''
}

async function handleDrop(event) {
  isDragOver.value = false
  const files = Array.from(event.dataTransfer.files).filter(f => f.type.startsWith('image/'))
  await uploadFiles(files)
}

async function uploadFiles(files) {
  if (files.length === 0) return
  const targetCategoryId = activeCategory.value !== 'all' ? activeCategory.value : 0

  if (files.length === 1) {
    // 单张：弹出裁切选择
    const f = files[0]
    if (!f.type.startsWith('image/')) return
    pendingFileName.value = f.name
    cropTargetCategoryId.value = targetCategoryId
    pendingBase64.value = await galleryStore.fileToBase64(f)
    showCropChoice.value = true
  } else {
    // 批量：直接整张上传
    await galleryStore.uploadFiles(files, targetCategoryId)
  }
}

// 单张上传裁切选择
function cancelCropChoice() {
  showCropChoice.value = false
  pendingBase64.value = ''
  pendingFileName.value = ''
}

async function chooseWholeUpload() {
  // 整张上传：直接用原图
  showCropChoice.value = false
  const thumb = await galleryStore.generateThumbnail(pendingBase64.value)
  const format = 'png'
  await galleryStore.createImage({
    name: pendingFileName.value.replace(/\.[^.]+$/, ''),
    image_base64: pendingBase64.value,
    thumbnail_base64: thumb,
    category_id: cropTargetCategoryId.value,
    format,
    file_size: 0
  })
  pendingBase64.value = ''
  pendingFileName.value = ''
}

async function chooseCropUpload() {
  // 裁切上传：打开裁切器
  showCropChoice.value = false
  showCropper.value = true
  await nextTick()
  if (cropperImg.value) {
    cropperInstance.value = new Cropper(cropperImg.value, {
      viewMode: 1,
      autoCropArea: 0.9,
      responsive: true,
      background: false
    })
  }
}

async function confirmCropUpload() {
  if (!cropperInstance.value) return
  const canvas = cropperInstance.value.getCroppedCanvas({
    maxWidth: 2048,
    maxHeight: 2048,
    imageSmoothingQuality: 'high'
  })
  const base64 = canvas.toDataURL('image/png')
  cleanupCropper()
  showCropper.value = false

  const thumb = await galleryStore.generateThumbnail(base64)
  await galleryStore.createImage({
    name: pendingFileName.value.replace(/\.[^.]+$/, ''),
    image_base64: base64,
    thumbnail_base64: thumb,
    category_id: cropTargetCategoryId.value,
    format: 'png',
    file_size: 0
  })
  pendingBase64.value = ''
  pendingFileName.value = ''
}

function cancelCrop() {
  cleanupCropper()
  showCropper.value = false
  pendingBase64.value = ''
  pendingFileName.value = ''
}

function cleanupCropper() {
  if (cropperInstance.value) {
    cropperInstance.value.destroy()
    cropperInstance.value = null
  }
}

// 分类操作
async function doAddCategory() {
  if (!newCategoryName.value.trim()) return
  await galleryStore.createCategory(newCategoryName.value.trim())
  newCategoryName.value = ''
  showAddCategory.value = false
}

function renameCategory(cat) {
  renamingCategory.value = { id: cat.id, newName: cat.name }
}

async function doRenameCategory() {
  if (!renamingCategory.value || !renamingCategory.value.newName.trim()) return
  await galleryStore.updateCategory(renamingCategory.value.id, { name: renamingCategory.value.newName.trim() })
  renamingCategory.value = null
}

function confirmDeleteCategory(cat) {
  deleteConfirm.value = {
    show: true,
    type: 'category',
    target: cat,
    message: `确定删除分类"${cat.name}"吗？\n分类下的图片将移到"未分类"。`
  }
}

// 图片操作
function editImage(img) {
  editingImage.value = {
    id: img.id,
    name: img.name,
    description: img.description || '',
    category_id: img.category_id
  }
}

async function doSaveImage() {
  if (!editingImage.value?.name?.trim()) return
  await galleryStore.updateImage(editingImage.value.id, {
    name: editingImage.value.name.trim(),
    description: editingImage.value.description,
    category_id: editingImage.value.category_id
  })
  editingImage.value = null
}

function moveImage(img) {
  movingImage.value = { id: img.id, targetCategoryId: img.category_id }
}

async function doMoveImage() {
  if (!movingImage.value) return
  await galleryStore.updateImage(movingImage.value.id, { category_id: movingImage.value.targetCategoryId })
  movingImage.value = null
}

function confirmDeleteImage(img) {
  deleteConfirm.value = {
    show: true,
    type: 'image',
    target: img,
    message: `确定删除图片"${img.name}"吗？`
  }
}

function confirmBatchDelete() {
  deleteConfirm.value = {
    show: true,
    type: 'batch',
    target: null,
    message: `确定删除选中的 ${selectedIds.value.length} 张图片吗？`
  }
}

async function doDelete() {
  const { type, target } = deleteConfirm.value
  if (type === 'category') {
    await galleryStore.deleteCategory(target.id)
  } else if (type === 'image') {
    await galleryStore.deleteImage(target.id)
    selectedIds.value = selectedIds.value.filter(id => id !== target.id)
  } else if (type === 'batch') {
    await galleryStore.batchDeleteImages([...selectedIds.value])
    selectedIds.value = []
  }
  deleteConfirm.value.show = false
}

async function doBatchMove() {
  if (batchMoveCategoryId.value === null) return
  await galleryStore.batchCategorizeImages([...selectedIds.value], batchMoveCategoryId.value)
  selectedIds.value = []
  showBatchMove.value = false
}

// 预览：优先获取磁盘原图，失败则降级用缩略图
async function previewImage(img) {
  viewerSrc.value = ''
  // 记录当前图片在过滤后列表中的索引（用于上一张/下一张导航）
  viewerCurrentIndex.value = filteredImages.value.findIndex(i => i.id === img.id)
  // 先用缩略图快速展示
  if (img.thumbnail_data) {
    viewerSrc.value = img.thumbnail_data
    viewerVisible.value = true
  }
  // 异步获取磁盘原图替换
  try {
    const blobUrl = await apiClient.getGalleryImageBlobUrl(img.id)
    if (blobUrl) {
      const oldSrc = viewerSrc.value
      viewerSrc.value = blobUrl
      // 释放旧的 blob URL（如果是 blob 类型）
      if (oldSrc && oldSrc.startsWith('blob:')) {
        URL.revokeObjectURL(oldSrc)
      }
    }
  } catch (e) {
    // 获取原图失败，保持缩略图
  }
}

// 上一张/下一张导航：切换到指定索引的图片
async function navigateViewerTo(newIndex) {
  const target = filteredImages.value[newIndex]
  if (!target) return
  viewerCurrentIndex.value = newIndex
  // 先用缩略图占位
  if (target.thumbnail_data) {
    viewerSrc.value = target.thumbnail_data
  }
  try {
    const blobUrl = await apiClient.getGalleryImageBlobUrl(target.id)
    if (blobUrl) {
      const oldSrc = viewerSrc.value
      viewerSrc.value = blobUrl
      if (oldSrc && oldSrc.startsWith('blob:')) {
        URL.revokeObjectURL(oldSrc)
      }
    }
  } catch (e) {
    // 获取原图失败，保持缩略图
  }
}

function onViewerPrev(newIndex) {
  navigateViewerTo(newIndex)
}

function onViewerNext(newIndex) {
  navigateViewerTo(newIndex)
}

onMounted(() => {
  galleryStore.loadAll()
})

// 监听图库数据变化，清理已不存在于当前数据中的选中项，避免批量操作数量显示错误
watch(() => galleryStore.images, () => {
  if (selectedIds.value.length > 0) {
    const validIds = new Set(galleryStore.images.map(item => item.id))
    selectedIds.value = selectedIds.value.filter(id => validIds.has(id))
  }
})

// 关闭预览时释放 blob URL
watch(viewerVisible, (val) => {
  if (!val && viewerSrc.value && viewerSrc.value.startsWith('blob:')) {
    URL.revokeObjectURL(viewerSrc.value)
    viewerSrc.value = ''
  }
})

onBeforeUnmount(() => {
  cleanupCropper()
  if (viewerSrc.value && viewerSrc.value.startsWith('blob:')) {
    URL.revokeObjectURL(viewerSrc.value)
  }
})
</script>

<style scoped>
.gallery-manager {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
}

.gallery-manager h2 {
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

/* 图片网格 */
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
}

.image-card {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  border: 2px solid transparent;
}

.image-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--card-shadow);
}

.image-card.selected {
  border-color: var(--accent-color);
}

.card-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: var(--bg-secondary);
  cursor: zoom-in;
  overflow: hidden;
}

.card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--text-muted);
  font-size: 14px;
}

.thumb-check {
  position: absolute;
  top: 6px;
  left: 6px;
  cursor: pointer;
  padding: 4px;
  background: rgba(0,0,0,0.4);
  border-radius: 6px;
}

.checkbox {
  width: 16px;
  height: 16px;
  border: 2px solid #fff;
  border-radius: 4px;
  transition: all 0.15s ease;
  background: transparent;
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

.card-info {
  padding: 8px 10px;
  flex: 1;
}

.card-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-bottom: 4px;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
}

.card-actions {
  display: flex;
  gap: 4px;
  padding: 4px 8px 8px;
  border-top: 1px solid var(--bg-tertiary, rgba(128,128,128,0.1));
}

.btn-icon-sm {
  flex: 1;
  padding: 4px 6px;
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

.fw-confirm-msg {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: var(--text-primary);
  white-space: pre-line;
  line-height: 1.6;
}

/* 视图切换按钮 */
.btn-icon-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: var(--bg-surface);
  border: 1px solid var(--text-muted);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.btn-icon-toggle:hover {
  border-color: var(--accent-color);
  color: var(--text-primary);
}

.btn-icon-toggle.active {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: var(--accent-text);
}

/* 列表视图 */
.image-list {
  background: var(--bg-surface);
  border-radius: 10px;
  overflow: hidden;
}

.image-list .list-header {
  display: grid;
  grid-template-columns: 40px 60px 1fr 120px 120px 160px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--bg-tertiary, rgba(128,128,128,0.1));
}

.image-list .list-row {
  display: grid;
  grid-template-columns: 40px 60px 1fr 120px 120px 160px;
  padding: 8px 12px;
  align-items: center;
  border-bottom: 1px solid var(--bg-tertiary, rgba(128,128,128,0.05));
  cursor: default;
  transition: background 0.15s;
}

.image-list .list-row:hover {
  background: var(--bg-secondary);
}

.image-list .list-row.selected {
  background: rgba(79, 70, 229, 0.08);
}

.image-list .col-check {
  cursor: pointer;
}

.image-list .col-thumb {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-secondary);
  cursor: zoom-in;
}

.image-list .col-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-list .col-name {
  font-size: 13px;
  color: var(--text-primary);
  cursor: zoom-in;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 8px;
}

.image-list .col-cat,
.image-list .col-date {
  font-size: 12px;
  color: var(--text-secondary);
}

.image-list .col-actions {
  display: flex;
  gap: 4px;
}

/* 裁切选择对话框 */
.upload-hint {
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.choice-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.choice-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 12px;
  border: 2px solid var(--border-color, #e0e0e0);
  border-radius: 10px;
  background: var(--bg-surface, #fff);
  cursor: pointer;
  transition: all 0.2s;
}

.choice-btn:hover {
  border-color: var(--accent-color);
  background: var(--bg-hover, #f5f7ff);
}

.choice-icon {
  font-size: 28px;
}

.choice-title {
  font-weight: 600;
  font-size: 14px;
}

.choice-desc {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

/* 裁切弹窗 */
.cropper-container {
  width: 100%;
  height: 360px;
  background: #1a1a1a;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
}

.cropper-container img {
  display: block;
  max-width: 100%;
}
</style>
