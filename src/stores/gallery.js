import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiClient } from '@/services/api'

export const useGalleryStore = defineStore('gallery', () => {
  const categories = ref([])
  const images = ref([])
  const isLoading = ref(false)

  const imageMap = computed(() => {
    const m = new Map()
    images.value.forEach(i => m.set(i.id, i))
    return m
  })

  const categoryMap = computed(() => {
    const m = new Map()
    categories.value.forEach(c => m.set(c.id, c))
    return m
  })

  const allCategories = computed(() => {
    const all = [{ id: 'all', name: '全部', is_system: false }]
    return [...all, ...categories.value]
  })

  function imagesByCategory(catId) {
    if (catId === 'all' || catId === undefined) return images.value
    return images.value.filter(i => i.category_id === catId)
  }

  function getImageById(id) {
    return imageMap.value.get(id) || null
  }

  function getCategoryById(id) {
    return categoryMap.value.get(id) || null
  }

  function getCategoryName(id) {
    if (id === 0 || id === undefined) return '未分类'
    const c = categoryMap.value.get(id)
    return c ? c.name : '未分类'
  }

  function getCategoryCount(catId) {
    if (catId === 'all') return images.value.length
    return images.value.filter(i => i.category_id === catId).length
  }

  async function loadCategories() {
    categories.value = await apiClient.getGalleryCategories()
  }

  async function loadImages() {
    images.value = await apiClient.getGalleryImages()
  }

  async function loadAll() {
    isLoading.value = true
    try {
      await Promise.all([loadCategories(), loadImages()])
    } finally {
      isLoading.value = false
    }
  }

  async function createCategory(name) {
    const c = await apiClient.createGalleryCategory({ name })
    if (c) await loadCategories()
    return c
  }

  async function updateCategory(id, data) {
    const c = await apiClient.updateGalleryCategory(id, data)
    if (c) await loadCategories()
    return c
  }

  async function deleteCategory(id) {
    const ok = await apiClient.deleteGalleryCategory(id)
    if (ok) await loadAll()
    return ok
  }

  async function createImage(data) {
    const i = await apiClient.createGalleryImage(data)
    if (i) await loadImages()
    return i
  }

  async function updateImage(id, data) {
    const i = await apiClient.updateGalleryImage(id, data)
    if (i) await loadImages()
    return i
  }

  async function deleteImage(id) {
    const ok = await apiClient.deleteGalleryImage(id)
    if (ok) await loadImages()
    return ok
  }

  async function batchDeleteImages(ids) {
    const ok = await apiClient.batchDeleteGalleryImages(ids)
    if (ok) await loadImages()
    return ok
  }

  async function batchCategorizeImages(ids, categoryId) {
    const ok = await apiClient.batchCategorizeGalleryImages(ids, categoryId)
    if (ok) await loadImages()
    return ok
  }

  // 从 File 生成 base64 + 缩略图 base64（缩略图等比缩放到最长边 300px）
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function generateThumbnail(base64DataUrl, maxSize = 300) {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > height) {
          if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
        } else {
          if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
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

  // 批量上传文件：每个 file → base64 + 缩略图 → createImage
  async function uploadFiles(fileList, defaultCategoryId) {
    let count = 0
    for (const file of fileList) {
      if (!file.type.startsWith('image/')) continue
      try {
        const base64 = await fileToBase64(file)
        const thumb = await generateThumbnail(base64)
        const format = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
        await createImage({
          name: file.name.replace(/\.[^.]+$/, ''),
          image_base64: base64,
          thumbnail_base64: thumb,
          category_id: defaultCategoryId || 0,
          format,
          file_size: file.size
        })
        count++
      } catch (e) {
        console.error('上传图片失败:', file.name, e)
      }
    }
    return count
  }

  return {
    categories,
    images,
    isLoading,
    imageMap,
    categoryMap,
    allCategories,
    imagesByCategory,
    getImageById,
    getCategoryById,
    getCategoryName,
    getCategoryCount,
    loadAll,
    loadCategories,
    loadImages,
    createCategory,
    updateCategory,
    deleteCategory,
    createImage,
    updateImage,
    deleteImage,
    batchDeleteImages,
    batchCategorizeImages,
    uploadFiles,
    fileToBase64,
    generateThumbnail
  }
})
