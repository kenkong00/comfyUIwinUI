<template>
  <div class="ui-prop-row asset-selector-row">
    <label class="ui-prop-label" v-if="label">{{ label }}</label>
    <div class="asset-slot-wrap">
      <div
        class="asset-slot"
        :class="{ 'slot-drag-over': isDragOver }"
        @dragover.prevent="onSlotDragOver"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="onSlotDrop"
      >
        <!-- 有图片 -->
        <template v-if="assetId">
          <img :src="getAssetFileUrl(assetId)" class="slot-img" @error="onImgError" />
          <button class="slot-remove" @click="clearAsset" title="移除">×</button>
        </template>
        <!-- 无图片 -->
        <template v-else>
          <div class="slot-empty">
            <button type="button" class="slot-btn" @click="openGallery">图库选择</button>
            <button type="button" class="slot-btn" @click="triggerUpload">上传</button>
          </div>
        </template>
      </div>
      <input ref="fileInputRef" type="file" accept="image/*" style="display:none" @change="onFileChange" />
    </div>

    <!-- 图库选择弹窗 -->
    <FloatingWindow v-model:open="galleryOpen" title="从UI库选择图片" size="default" class="gallery-fw" @open="onGalleryOpen">
      <div class="gallery-picker">
        <div class="gallery-search-row">
          <input v-model="searchKeyword" placeholder="搜索UI库图片..." class="gallery-search" @input="onSearchInput" />
          <select v-model="selectedFolderId" class="gallery-folder-select" @change="onFolderChange">
            <option :value="null">根目录</option>
            <option v-for="folder in topFolders" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
          </select>
        </div>
        <div class="gallery-grid" v-if="filteredFiles.length > 0">
          <div
            v-for="file in filteredFiles"
            :key="file.id"
            class="gallery-item"
            :class="{ 'is-selected': String(file.id) === String(assetId) }"
            @click="selectAsset(file.id)"
          >
            <div class="gallery-thumb-wrap">
              <img :src="getAssetFileUrl(file.id)" class="gallery-thumb" @error="onThumbError($event, file.id)" />
            </div>
            <span class="gallery-name">{{ file.name }}</span>
          </div>
        </div>
        <div v-else-if="fileStore.panelLoading" class="gallery-empty">加载中...</div>
        <div v-else class="gallery-empty">UI库暂无图片，请先上传</div>
      </div>
      <template #footer>
        <button class="btn-fw" @click="galleryOpen = false">取消</button>
      </template>
    </FloatingWindow>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useFileLibraryStore } from '@/stores/fileLibrary'
import { getAssetFileUrl } from '@/services/uiApi'
import FloatingWindow from '@/components/common/FloatingWindow.vue'

const props = defineProps({ label: String, assetId: String })
const emit = defineEmits({ 'update:assetId': [String] })

const fileStore = useFileLibraryStore()
const fileInputRef = ref(null)
const galleryOpen = ref(false)
const searchKeyword = ref('')
const isDragOver = ref(false)
const uiLibCategoryId = ref(null)
// UI库顶级文件夹列表（下拉选择用），选择文件夹后切换到该文件夹的文件
const topFolders = ref([])
const selectedFolderId = ref(null)

// 当前层级（根目录或所选文件夹）下的图片文件
const uiLibImages = computed(() => {
  return fileStore.panelFiles.filter(f => f.file_type === 'image')
})

const filteredFiles = computed(() => {
  if (!searchKeyword.value.trim()) return uiLibImages.value
  const kw = searchKeyword.value.trim().toLowerCase()
  return uiLibImages.value.filter(f => (f.name || '').toLowerCase().includes(kw))
})

// 加载UI库分类及其根目录图片，并缓存顶级文件夹列表
async function loadUiLibrary() {
  await fileStore.loadCategories()
  const uiLib = fileStore.categories.find(c => c.name === 'UI库' && c.is_system === 1)
  if (uiLib) {
    uiLibCategoryId.value = uiLib.id
    selectedFolderId.value = null
    await fileStore.panelNavigateToCategory(uiLib.id)
    // 缓存UI库顶级文件夹，供下拉选择
    topFolders.value = [...fileStore.panelFolders]
  }
}

onMounted(() => {
  loadUiLibrary()
})

function onGalleryOpen() {
  searchKeyword.value = ''
  // 每次打开强制重新加载UI库分类，确保最新数据（含新建文件夹）
  loadUiLibrary()
}

// 切换文件夹：null=根目录，否则进入对应文件夹
async function onFolderChange() {
  if (!uiLibCategoryId.value) return
  if (selectedFolderId.value == null) {
    await fileStore.panelNavigateToCategory(uiLibCategoryId.value)
  } else {
    await fileStore.panelNavigateToFolder(selectedFolderId.value)
  }
}

let searchTimer = null
function onSearchInput() {
  if (searchTimer) clearTimeout(searchTimer)
  // 仅前端筛选，无需重新请求
}

function openGallery() {
  galleryOpen.value = true
}

function selectAsset(id) {
  emit('update:assetId', String(id))
  galleryOpen.value = false
}

function clearAsset() {
  emit('update:assetId', '')
}

function triggerUpload() {
  fileInputRef.value?.click()
}

// 上传图片到文件库"UI库"分类根目录
async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    // 确保UI库分类已加载
    if (!uiLibCategoryId.value) {
      await loadUiLibrary()
    }
    if (!uiLibCategoryId.value) {
      console.error('未找到UI库分类')
      return
    }
    const base64 = await fileStore.fileToBase64(file)
    const thumbnail = await fileStore.generateThumbnail(base64)
    const format = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    const fileName = file.name.replace(/\.[^.]+$/, '')
    const created = await fileStore.createFile({
      category_id: uiLibCategoryId.value,
      folder_id: null,
      name: fileName,
      file_type: 'image',
      image_base64: base64,
      thumbnail_base64: thumbnail,
      format,
      file_size: file.size,
      filename: file.name
    })
    if (created && created.id) {
      emit('update:assetId', String(created.id))
      // 刷新面板列表，使下次图库选择能看到新上传的图片
      await fileStore.panelNavigateToCategory(uiLibCategoryId.value)
    }
  } catch (err) {
    console.error('上传图片到UI库失败:', err)
  }
  e.target.value = ''
}

// 拖入图片到槽位（支持文件库图片和外部图片）
function onSlotDragOver(e) {
  const types = Array.from(e.dataTransfer.types)
  if (types.includes('application/x-rfp-file') || types.includes('Files')) {
    e.dataTransfer.dropEffect = 'move'
    isDragOver.value = true
  } else {
    e.dataTransfer.dropEffect = 'none'
  }
}

async function onSlotDrop(e) {
  isDragOver.value = false
  // 内部文件库图片：直接使用其 fileId 作为 assetId（统一接口会从文件库读取）
  const json = e.dataTransfer.getData('application/x-rfp-file')
  if (json) {
    try {
      const item = JSON.parse(json)
      if (item._kind === 'file' && item.file_type === 'image') {
        emit('update:assetId', String(item.id))
        return
      }
    } catch (err) {
      console.error('[AssetSelector] 解析拖拽数据失败:', err)
    }
  }
  // 外部图片文件：上传到UI库分类
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0]
    if (file.type && file.type.startsWith('image/')) {
      try {
        if (!uiLibCategoryId.value) {
          await loadUiLibrary()
        }
        const base64 = await fileStore.fileToBase64(file)
        const thumbnail = await fileStore.generateThumbnail(base64)
        const format = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
        const fileName = file.name.replace(/\.[^.]+$/, '')
        const created = await fileStore.createFile({
          category_id: uiLibCategoryId.value,
          folder_id: null,
          name: fileName,
          file_type: 'image',
          image_base64: base64,
          thumbnail_base64: thumbnail,
          format,
          file_size: file.size,
          filename: file.name
        })
        if (created && created.id) {
          emit('update:assetId', String(created.id))
        }
      } catch (err) {
        console.error('拖入图片上传失败:', err)
      }
    }
  }
}

function onImgError(e) {
  e.target.style.opacity = '0.2'
}

function onThumbError(e) {
  e.target.style.display = 'none'
}
</script>

<style scoped>
.ui-prop-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 6px;
}
.ui-prop-label {
  font-size: 11px;
  color: var(--text-secondary);
}
.asset-slot-wrap {
  display: flex;
  justify-content: center;
}

/* 方形槽位（参考功能库图片输入样式） */
.asset-slot {
  width: 100px;
  height: 100px;
  border: 1px dashed var(--border-color, rgba(128, 128, 128, 0.4));
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.asset-slot.slot-drag-over {
  border-color: var(--accent-color, #4a9eff);
  border-style: solid;
  background: rgba(74, 158, 255, 0.12);
}
.slot-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.slot-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.slot-remove:hover {
  background: #ef4444;
}
.slot-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 6px;
}
.slot-btn {
  padding: 3px 10px;
  font-size: 11px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: 1px solid var(--border-color, rgba(128, 128, 128, 0.3));
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.slot-btn:hover {
  background: var(--bg-tertiary, #2a2a2a);
  border-color: var(--accent-color, #4a9eff);
}

/* 图库选择弹窗 */
.gallery-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gallery-search-row {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  align-items: center;
}
.gallery-search {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  font-size: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
}
.gallery-search:focus {
  border-color: var(--accent-color, #3b82f6);
}
.gallery-folder-select {
  flex-shrink: 0;
  max-width: 200px;
  padding: 6px 8px;
  font-size: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;
}
.gallery-folder-select:focus {
  border-color: var(--accent-color, #3b82f6);
}
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
  padding: 2px;
}
.gallery-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.gallery-item:hover {
  background: var(--bg-secondary);
}
.gallery-item.is-selected {
  border-color: var(--accent-color, #3b82f6);
  background: rgba(59, 130, 246, 0.1);
}
.gallery-thumb-wrap {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border-radius: 4px;
  overflow: hidden;
}
.gallery-thumb {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.gallery-name {
  font-size: 10px;
  color: var(--text-secondary);
  margin-top: 3px;
  text-align: center;
  max-width: 82px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gallery-empty {
  text-align: center;
  padding: 32px 12px;
  color: var(--text-muted);
  font-size: 12px;
}
.btn-fw {
  padding: 6px 16px;
  font-size: 12px;
  background: var(--bg-surface);
  color: var(--text-primary);
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style>

<!-- 全局样式：FloatingWindow 通过 Teleport 渲染到 body，需用非 scoped 样式覆盖宽度 -->
<style>
.gallery-fw.fw-window {
  width: 720px !important;
  max-width: 95vw;
}
</style>
