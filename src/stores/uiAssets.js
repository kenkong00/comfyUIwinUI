import { defineStore } from 'pinia'
import { ref } from 'vue'
import { assetApi, categoryApi } from '@/services/uiApi'

export const useUiAssetStore = defineStore('uiAssets', () => {
  const assets = ref([])
  const categories = ref([])
  const currentCategoryId = ref(null)
  const keyword = ref('')
  const loading = ref(false)

  async function fetchCategories() {
    categories.value = await categoryApi.list()
  }

  async function fetchAssets() {
    loading.value = true
    try {
      assets.value = await assetApi.list({
        categoryId: currentCategoryId.value || undefined,
        keyword: keyword.value || undefined
      })
    } finally {
      loading.value = false
    }
  }

  async function uploadAsset(file, categoryId) {
    const asset = await assetApi.upload(file, categoryId)
    assets.value.unshift(asset)
    return asset
  }

  async function updateAsset(id, data) {
    const updated = await assetApi.update(id, data)
    const idx = assets.value.findIndex(a => a.id === id)
    if (idx !== -1) assets.value[idx] = updated
  }

  async function deleteAsset(id) {
    await assetApi.delete(id)
    assets.value = assets.value.filter(a => a.id !== id)
  }

  async function createCategory(name, parentId) {
    await categoryApi.create({ name, parentId })
    await fetchCategories()
  }

  async function deleteCategory(id) {
    await categoryApi.delete(id)
    await fetchCategories()
  }

  return {
    assets, categories, currentCategoryId, keyword, loading,
    fetchCategories, fetchAssets, uploadAsset, updateAsset, deleteAsset,
    createCategory, deleteCategory
  }
})
