import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import apiClient from '@/services/api'

// 文件类型定义
export const FILE_TYPES = {
  image: { label: '图片', icon: '🖼️', color: '#4a9eff' },
  video: { label: '视频', icon: '🎬', color: '#9b59b6' },
  audio: { label: '音频', icon: '🎵', color: '#e67e22' },
  prompt: { label: '提示词', icon: '📝', color: '#2ecc71' },
  json: { label: 'JSON', icon: '📄', color: '#e74c3c' },
  storyboard: { label: 'Json分镜', icon: '🎞️', color: '#16a085' },
  workflow: { label: '工作流', icon: '⚙️', color: '#34495e' },
  rule: { label: '规则', icon: '📋', color: '#f39c12' }
}

export const useFileLibraryStore = defineStore('fileLibrary', () => {
  const categories = ref([])
  const folders = ref([])       // 当前层级的文件夹
  const files = ref([])          // 当前层级的文件
  const tags = ref([])
  const tagCategories = ref([])
  const isLoading = ref(false)
  const recycledFiles = ref([])
  const recycledFolders = ref([])

  // 导航状态
  const currentCategoryId = ref(null)
  const currentFolderId = ref(null)  // null = 分类根目录
  const breadcrumb = ref([])         // [{id, name, type}]

  // ============================================
  // 右侧筛选窗独立状态（不污染主库状态）
  // ============================================
  const panelCategoryId = ref(null)
  const panelFolderId = ref(null)
  const panelBreadcrumb = ref([])
  const panelFolders = ref([])
  const panelFiles = ref([])
  const panelFilterType = ref('all')   // 'all' | 'prompt' | 'rule' | 'json' | ...
  const panelTagFilter = ref(null)
  const panelSearch = ref('')
  const panelLoading = ref(false)

  // 计算属性
  const categoryMap = computed(() => {
    const m = new Map()
    categories.value.forEach(c => m.set(c.id, c))
    return m
  })

  const fileMap = computed(() => {
    const m = new Map()
    files.value.forEach(f => m.set(f.id, f))
    return m
  })

  const tagMap = computed(() => {
    const m = new Map()
    tags.value.forEach(t => m.set(t.id, t))
    return m
  })

  function getCategoryById(id) {
    return categoryMap.value.get(id) || null
  }

  function getFileTypeLabel(type) {
    return FILE_TYPES[type]?.label || type
  }

  function getFileTypeIcon(type) {
    return FILE_TYPES[type]?.icon || '📄'
  }

  // ============================================
  // 分类管理
  // ============================================

  async function loadCategories() {
    categories.value = await apiClient.getFileLibraryCategories()
  }

  async function createCategory(name) {
    const cat = await apiClient.createFileLibraryCategory({ name })
    if (cat) categories.value.push(cat)
    return cat
  }

  async function updateCategory(id, data) {
    const cat = await apiClient.updateFileLibraryCategory(id, data)
    if (cat) {
      const idx = categories.value.findIndex(c => c.id === id)
      if (idx >= 0) categories.value[idx] = cat
    }
    return cat
  }

  async function deleteCategory(id) {
    const ok = await apiClient.deleteFileLibraryCategory(id)
    if (ok) categories.value = categories.value.filter(c => c.id !== id)
    return ok
  }

  // ============================================
  // 文件夹管理
  // ============================================

  async function loadFolders(categoryId, parentId) {
    const params = { category_id: categoryId }
    if (parentId === null || parentId === undefined) params.parent_id = 'null'
    else params.parent_id = parentId
    folders.value = await apiClient.getFileLibraryFolders(params)
  }

  async function createFolder(data) {
    const folder = await apiClient.createFileLibraryFolder(data)
    if (folder) folders.value.push(folder)
    return folder
  }

  async function updateFolder(id, data) {
    const folder = await apiClient.updateFileLibraryFolder(id, data)
    if (folder) {
      const idx = folders.value.findIndex(f => f.id === id)
      if (idx >= 0) folders.value[idx] = folder
    }
    return folder
  }

  async function deleteFolder(id) {
    const ok = await apiClient.deleteFileLibraryFolder(id)
    if (ok) folders.value = folders.value.filter(f => f.id !== id)
    return ok
  }

  async function batchDeleteFolders(ids) {
    const ok = await apiClient.batchDeleteFileLibraryFolders(ids)
    if (ok) folders.value = folders.value.filter(f => !ids.includes(f.id))
    return ok
  }

  async function batchMoveFolders(ids, categoryId, parentId) {
    const ok = await apiClient.batchMoveFileLibraryFolders(ids, categoryId, parentId)
    if (ok) folders.value = folders.value.filter(f => !ids.includes(f.id))
    return ok
  }

  // ============================================
  // 文件管理
  // ============================================

  async function loadFiles(categoryId, folderId, fileType) {
    const params = { category_id: categoryId }
    if (folderId === null) params.folder_id = 'null'
    else if (folderId) params.folder_id = folderId
    if (fileType && fileType !== 'all') params.file_type = fileType
    files.value = await apiClient.getFileLibraryFiles(params)
  }

  async function getFileById(id) {
    return await apiClient.getFileLibraryFileById(id)
  }

  async function createFile(data) {
    const file = await apiClient.createFileLibraryFile(data)
    if (file) files.value.unshift(file)
    return file
  }

  async function updateFile(id, data) {
    const file = await apiClient.updateFileLibraryFile(id, data)
    if (file) {
      const idx = files.value.findIndex(f => f.id === id)
      if (idx >= 0) files.value[idx] = file
    }
    return file
  }

  async function deleteFile(id) {
    const ok = await apiClient.deleteFileLibraryFile(id)
    if (ok) files.value = files.value.filter(f => f.id !== id)
    return ok
  }

  async function batchDeleteFiles(ids) {
    const ok = await apiClient.batchDeleteFileLibraryFiles(ids)
    if (ok) files.value = files.value.filter(f => !ids.includes(f.id))
    return ok
  }

  async function batchMoveFiles(ids, categoryId, folderId) {
    const ok = await apiClient.batchMoveFileLibraryFiles(ids, categoryId, folderId)
    if (ok) files.value = files.value.filter(f => !ids.includes(f.id))
    return ok
  }

  // ============================================
  // 可调用文件查询（供任务管理/角色设置使用）
  // ============================================

  async function getCallableFiles(fileType) {
    return await apiClient.getCallableFiles(fileType)
  }

  // ============================================
  // 标签管理
  // ============================================

  async function loadTags() {
    tags.value = await apiClient.getFileLibraryTags()
  }

  async function createTag(data) {
    const tag = await apiClient.createFileLibraryTag(data)
    if (tag) tags.value.push(tag)
    return tag
  }

  // ============================================
  // 标签分类管理
  // ============================================

  async function loadTagCategories() {
    tagCategories.value = await apiClient.getFileLibraryTagCategories()
  }

  async function createTagCategory(name) {
    const cat = await apiClient.createFileLibraryTagCategory(name)
    if (cat) tagCategories.value.push(cat)
    return cat
  }

  async function updateTagCategory(id, data) {
    const cat = await apiClient.updateFileLibraryTagCategory(id, data)
    if (cat) {
      const idx = tagCategories.value.findIndex(c => c.id === id)
      if (idx >= 0) tagCategories.value[idx] = cat
    }
    return cat
  }

  async function deleteTagCategory(id) {
    const ok = await apiClient.deleteFileLibraryTagCategory(id)
    if (ok) tagCategories.value = tagCategories.value.filter(c => c.id !== id)
    return ok
  }

  // ============================================
  // 回收站管理
  // ============================================

  async function loadRecycleBin() {
    const data = await apiClient.getRecycleBin()
    if (data) {
      recycledFiles.value = data.files || []
      recycledFolders.value = data.folders || []
    }
    return data
  }

  async function restoreFiles(ids) {
    const ok = await apiClient.restoreFiles(ids)
    if (ok) recycledFiles.value = recycledFiles.value.filter(f => !ids.includes(f.id))
    return ok
  }

  async function restoreFolders(ids) {
    const ok = await apiClient.restoreFolders(ids)
    if (ok) recycledFolders.value = recycledFolders.value.filter(f => !ids.includes(f.id))
    return ok
  }

  async function restoreAll() {
    const ok = await apiClient.restoreAll()
    if (ok) {
      recycledFiles.value = []
      recycledFolders.value = []
    }
    return ok
  }

  async function purgeFiles(ids) {
    const ok = await apiClient.purgeFiles(ids)
    if (ok) recycledFiles.value = recycledFiles.value.filter(f => !ids.includes(f.id))
    return ok
  }

  async function purgeFolders(ids) {
    const ok = await apiClient.purgeFolders(ids)
    if (ok) recycledFolders.value = recycledFolders.value.filter(f => !ids.includes(f.id))
    return ok
  }

  async function emptyRecycleBin() {
    const ok = await apiClient.emptyRecycleBin()
    if (ok) {
      recycledFiles.value = []
      recycledFolders.value = []
    }
    return ok
  }

  async function updateTag(id, data) {
    const tag = await apiClient.updateFileLibraryTag(id, data)
    if (tag) {
      const idx = tags.value.findIndex(t => t.id === id)
      if (idx >= 0) tags.value[idx] = tag
    }
    return tag
  }

  async function deleteTag(id) {
    const ok = await apiClient.deleteFileLibraryTag(id)
    if (ok) tags.value = tags.value.filter(t => t.id !== id)
    return ok
  }

  async function batchDeleteTags(ids) {
    const ok = await apiClient.batchDeleteFileLibraryTags(ids)
    if (ok) tags.value = tags.value.filter(t => !ids.includes(t.id))
    return ok
  }

  async function tagFile(fileId, tagId) {
    const ok = await apiClient.tagFile(fileId, tagId)
    if (ok) {
      const f = files.value.find(f => f.id === fileId)
      if (f && !f.tags.find(t => t.id === tagId)) {
        const tag = tagMap.value.get(tagId)
        if (tag) f.tags.push(tag)
      }
    }
    return ok
  }

  async function batchTagFiles(fileIds, tagId) {
    const ok = await apiClient.batchTagFiles(fileIds, tagId)
    if (ok) {
      const tag = tagMap.value.get(tagId)
      if (tag) {
        for (const fid of fileIds) {
          const f = files.value.find(f => f.id === fid)
          if (f && !f.tags.find(t => t.id === tagId)) f.tags.push(tag)
        }
      }
    }
    return ok
  }

  async function untagFile(fileId, tagId) {
    const ok = await apiClient.untagFile(fileId, tagId)
    if (ok) {
      const f = files.value.find(f => f.id === fileId)
      if (f) f.tags = f.tags.filter(t => t.id !== tagId)
    }
    return ok
  }

  // ============================================
  // 导航
  // ============================================

  async function navigateToCategory(categoryId) {
    currentCategoryId.value = categoryId
    currentFolderId.value = null
    const cat = categoryMap.value.get(categoryId)
    breadcrumb.value = cat ? [{ id: cat.id, name: cat.name, type: 'category' }] : []
    await Promise.all([loadFolders(categoryId, null), loadFiles(categoryId, null)])
  }

  async function navigateToFolder(folderId) {
    const folder = folders.value.find(f => f.id === folderId)
    if (!folder) return
    currentFolderId.value = folderId
    // 构建面包屑
    const path = await apiClient.getFolderPath(folderId)
    breadcrumb.value = path
    await Promise.all([loadFolders(currentCategoryId.value, folderId), loadFiles(currentCategoryId.value, folderId)])
  }

  async function navigateToBreadcrumb(index) {
    const item = breadcrumb.value[index]
    if (item.type === 'category') {
      await navigateToCategory(item.id)
    } else if (item.type === 'folder') {
      // 截断面包屑
      breadcrumb.value = breadcrumb.value.slice(0, index + 1)
      currentFolderId.value = item.id
      await Promise.all([loadFolders(currentCategoryId.value, item.id), loadFiles(currentCategoryId.value, item.id)])
    }
  }

  // ============================================
  // 右侧筛选窗导航（独立实现）
  // ============================================

  async function panelNavigateToCategory(categoryId) {
    panelCategoryId.value = categoryId
    panelFolderId.value = null
    const cat = categoryMap.value.get(categoryId)
    panelBreadcrumb.value = cat ? [{ id: cat.id, name: cat.name, type: 'category' }] : []
    panelLoading.value = true
    try {
      const params = { category_id: categoryId }
      params.parent_id = 'null'
      panelFolders.value = await apiClient.getFileLibraryFolders(params)
      const fileParams = { category_id: categoryId, folder_id: 'null' }
      panelFiles.value = await apiClient.getFileLibraryFiles(fileParams)
    } finally {
      panelLoading.value = false
    }
  }

  async function panelNavigateToFolder(folderId) {
    const folder = panelFolders.value.find(f => f.id === folderId)
    if (!folder) return
    panelFolderId.value = folderId
    panelLoading.value = true
    try {
      const path = await apiClient.getFolderPath(folderId)
      panelBreadcrumb.value = path
      const folderParams = { category_id: panelCategoryId.value, parent_id: folderId }
      panelFolders.value = await apiClient.getFileLibraryFolders(folderParams)
      const fileParams = { category_id: panelCategoryId.value, folder_id: folderId }
      panelFiles.value = await apiClient.getFileLibraryFiles(fileParams)
    } finally {
      panelLoading.value = false
    }
  }

  async function panelNavigateToBreadcrumb(index) {
    const item = panelBreadcrumb.value[index]
    if (item.type === 'category') {
      await panelNavigateToCategory(item.id)
    } else if (item.type === 'folder') {
      panelBreadcrumb.value = panelBreadcrumb.value.slice(0, index + 1)
      panelFolderId.value = item.id
      panelLoading.value = true
      try {
        const folderParams = { category_id: panelCategoryId.value, parent_id: item.id }
        panelFolders.value = await apiClient.getFileLibraryFolders(folderParams)
        const fileParams = { category_id: panelCategoryId.value, folder_id: item.id }
        panelFiles.value = await apiClient.getFileLibraryFiles(fileParams)
      } finally {
        panelLoading.value = false
      }
    }
  }

  async function panelRefresh() {
    // 直接重新加载当前层级的数据，不经过导航函数（避免 panelNavigateToFolder 的早返回检查）
    panelLoading.value = true
    try {
      if (panelFolderId.value) {
        const folderParams = { category_id: panelCategoryId.value, parent_id: panelFolderId.value }
        panelFolders.value = await apiClient.getFileLibraryFolders(folderParams)
        const fileParams = { category_id: panelCategoryId.value, folder_id: panelFolderId.value }
        panelFiles.value = await apiClient.getFileLibraryFiles(fileParams)
      } else if (panelCategoryId.value) {
        const folderParams = { category_id: panelCategoryId.value, parent_id: 'null' }
        panelFolders.value = await apiClient.getFileLibraryFolders(folderParams)
        const fileParams = { category_id: panelCategoryId.value, folder_id: 'null' }
        panelFiles.value = await apiClient.getFileLibraryFiles(fileParams)
      } else {
        const folderParams = { category_id: 'all', parent_id: 'null' }
        panelFolders.value = await apiClient.getFileLibraryFolders(folderParams)
        const fileParams = { category_id: 'all', folder_id: 'null' }
        panelFiles.value = await apiClient.getFileLibraryFiles(fileParams)
      }
    } finally {
      panelLoading.value = false
    }
  }

  // 加载全部分类的根级内容
  async function panelNavigateToAll() {
    panelCategoryId.value = null
    panelFolderId.value = null
    panelBreadcrumb.value = []
    panelLoading.value = true
    try {
      const folderParams = { category_id: 'all', parent_id: 'null' }
      panelFolders.value = await apiClient.getFileLibraryFolders(folderParams)
      const fileParams = { category_id: 'all', folder_id: 'null' }
      panelFiles.value = await apiClient.getFileLibraryFiles(fileParams)
    } finally {
      panelLoading.value = false
    }
  }

  // 右侧筛选窗展示列表：文件夹优先 + 文件，应用筛选
  const panelDisplayItems = computed(() => {
    const q = panelSearch.value.trim().toLowerCase()
    const folders = panelFolders.value
      .filter(f => !q || (f.name || '').toLowerCase().includes(q))
      .map(f => ({ ...f, _kind: 'folder' }))
    let files = panelFiles.value
      .filter(f => panelFilterType.value === 'all' || f.file_type === panelFilterType.value)
      .filter(f => !q || (f.name || '').toLowerCase().includes(q))
      .filter(f => !panelTagFilter.value || (f.tags || []).some(t => t.id === panelTagFilter.value))
      .map(f => ({ ...f, _kind: 'file' }))
    return [...folders, ...files]
  })

  async function panelLoadAll() {
    await loadCategories()
    if (categories.value.length > 0) {
      await panelNavigateToCategory(categories.value[0].id)
    }
  }

  // ============================================
  // 工具函数
  // ============================================

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function generateThumbnail(base64DataUrl, maxSize = 300) {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > height) {
          if (width > maxSize) { height = height * maxSize / width; width = maxSize }
        } else {
          if (height > maxSize) { width = width * maxSize / height; height = maxSize }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => resolve('')
      img.src = base64DataUrl
    })
  }

  // 根据文件扩展名判断文件类型
  function detectFileType(file) {
    const name = file.name.toLowerCase()
    const type = file.type
    if (type.startsWith('image/')) return 'image'
    if (type.startsWith('video/')) return 'video'
    if (type.startsWith('audio/')) return 'audio'
    if (name.endsWith('.json')) {
      // 尝试判断是工作流还是分镜JSON
      return 'json'
    }
    if (name.endsWith('.txt') || name.endsWith('.md')) return 'prompt'
    return null
  }

  // 上传文件到当前位置
  async function uploadFiles(fileList) {
    let count = 0
    for (const file of fileList) {
      const fileType = detectFileType(file)
      if (!fileType) continue
      try {
        const data = {
          category_id: currentCategoryId.value,
          folder_id: currentFolderId.value,
          name: file.name.replace(/\.[^.]+$/, ''),
          file_type: fileType,
          filename: file.name
        }
        if (['image', 'video', 'audio'].includes(fileType)) {
          const base64 = await fileToBase64(file)
          data.image_base64 = base64
          if (fileType === 'image') {
            data.thumbnail_base64 = await generateThumbnail(base64)
            const format = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
            data.format = format
            data.file_size = file.size
          }
        } else {
          // 文本文件读取内容
          const text = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsText(file, 'utf-8')
          })
          data.content = text
          // JSON 文件：检测是否为 ComfyUI 工作流（节点对象，含 class_type 字段）
          if (fileType === 'json') {
            try {
              const parsed = JSON.parse(text)
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const values = Object.values(parsed)
                if (values.length > 0 && values.every(v => v && typeof v === 'object' && 'class_type' in v)) {
                  data.file_type = 'workflow'
                } else if (Array.isArray(parsed)) {
                  // 分镜 JSON：保存分镜数和校验状态
                  data.prompt_count = parsed.length
                  data.is_valid = 1
                }
              }
            } catch (e) {
              data.is_valid = 0
              data.validation_message = 'JSON 格式错误：' + e.message
            }
          }
        }
        await createFile(data)
        count++
      } catch (e) {
        console.error('上传文件失败:', file.name, e)
      }
    }
    return count
  }

  async function loadAll() {
    isLoading.value = true
    try {
      await Promise.all([loadCategories(), loadTags(), loadTagCategories()])
      if (categories.value.length > 0) {
        await navigateToCategory(categories.value[0].id)
      }
    } finally {
      isLoading.value = false
    }
  }

  return {
    // 状态
    categories, folders, files, tags, tagCategories, isLoading,
    recycledFiles, recycledFolders,
    currentCategoryId, currentFolderId, breadcrumb,
    // 右侧筛选窗状态
    panelCategoryId, panelFolderId, panelBreadcrumb,
    panelFolders, panelFiles, panelFilterType, panelTagFilter,
    panelSearch, panelLoading, panelDisplayItems,
    // 计算属性
    categoryMap, fileMap, tagMap,
    // 分类
    loadCategories, createCategory, updateCategory, deleteCategory,
    getCategoryById, getFileTypeLabel, getFileTypeIcon,
    // 文件夹
    loadFolders, createFolder, updateFolder, deleteFolder,
    batchDeleteFolders, batchMoveFolders,
    // 文件
    loadFiles, getFileById, createFile, updateFile, deleteFile,
    batchDeleteFiles, batchMoveFiles, getCallableFiles,
    // 标签
    loadTags, createTag, updateTag, deleteTag, batchDeleteTags,
    tagFile, batchTagFiles, untagFile,
    // 标签分类
    loadTagCategories, createTagCategory, updateTagCategory, deleteTagCategory,
    // 回收站
    loadRecycleBin, restoreFiles, restoreFolders, restoreAll,
    purgeFiles, purgeFolders, emptyRecycleBin,
    // 导航
    navigateToCategory, navigateToFolder, navigateToBreadcrumb,
    panelNavigateToCategory, panelNavigateToFolder, panelNavigateToBreadcrumb,
    panelNavigateToAll, panelRefresh, panelLoadAll,
    // 工具
    fileToBase64, generateThumbnail, detectFileType, uploadFiles,
    loadAll
  }
})
