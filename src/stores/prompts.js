import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiClient } from '@/services/api'

export const usePromptsStore = defineStore('prompts', () => {
  const categories = ref([])
  const prompts = ref([])
  const isLoading = ref(false)

  const promptMap = computed(() => {
    const m = new Map()
    prompts.value.forEach(p => m.set(p.id, p))
    return m
  })

  const categoryMap = computed(() => {
    const m = new Map()
    categories.value.forEach(c => m.set(c.id, c))
    return m
  })

  const allCategories = computed(() => {
    // 过滤掉后端返回的系统分类（改用 id=0 作为虚拟"未分类"）
    const userCats = categories.value.filter(c => !c.is_system)
    return [
      { id: 'all', name: '全部', is_system: false },
      { id: 0, name: '未分类', is_system: true },
      ...userCats
    ]
  })

  function promptsByCategory(catId) {
    if (catId === 'all' || catId === undefined) return prompts.value
    // 兼容：将系统分类 id（非 0）的提示词也归入"未分类(0)"
    if (catId === 0) {
      const systemIds = new Set(
        categories.value.filter(c => c.is_system).map(c => c.id)
      )
      return prompts.value.filter(p => !p.category_id || systemIds.has(p.category_id))
    }
    return prompts.value.filter(p => p.category_id === catId)
  }

  function getPromptById(id) {
    return promptMap.value.get(id) || null
  }

  function getCategoryName(id) {
    if (id === 0 || id === undefined) return '未分类'
    const c = categoryMap.value.get(id)
    return c ? c.name : '未分类'
  }

  function getCategoryCount(catId) {
    if (catId === 'all') return prompts.value.length
    if (catId === 0) return promptsByCategory(0).length
    return prompts.value.filter(p => p.category_id === catId).length
  }

  // 解析多个提示词 id 为合并后的文本（按顺序拼接，用换行分隔）
  function resolvePromptContents(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return ''
    return ids
      .map(id => getPromptById(id))
      .filter(Boolean)
      .map(p => p.content || '')
      .filter(c => c.trim())
      .join('\n')
  }

  async function loadCategories() {
    categories.value = await apiClient.getPromptCategories()
  }

  async function loadPrompts() {
    prompts.value = await apiClient.getPrompts()
  }

  async function loadAll() {
    isLoading.value = true
    try {
      await Promise.all([loadCategories(), loadPrompts()])
    } finally {
      isLoading.value = false
    }
  }

  async function createCategory(name) {
    const c = await apiClient.createPromptCategory({ name })
    if (c) await loadCategories()
    return c
  }

  async function updateCategory(id, data) {
    const c = await apiClient.updatePromptCategory(id, data)
    if (c) await loadCategories()
    return c
  }

  async function deleteCategory(id) {
    const ok = await apiClient.deletePromptCategory(id)
    if (ok) await loadAll()
    return ok
  }

  async function createPrompt(data) {
    const p = await apiClient.createPrompt(data)
    if (p) await loadPrompts()
    return p
  }

  async function updatePrompt(id, data) {
    const p = await apiClient.updatePrompt(id, data)
    if (p) await loadPrompts()
    return p
  }

  async function deletePrompt(id) {
    const ok = await apiClient.deletePrompt(id)
    if (ok) await loadPrompts()
    return ok
  }

  async function batchDeletePrompts(ids) {
    const ok = await apiClient.batchDeletePrompts(ids)
    if (ok) await loadPrompts()
    return ok
  }

  async function batchCategorizePrompts(ids, categoryId) {
    const ok = await apiClient.batchCategorizePrompts(ids, categoryId)
    if (ok) await loadPrompts()
    return ok
  }

  // 批量导入 txt 文件：每个 File 读取为文本，name=文件名（去扩展名），content=文件内容
  async function batchImportTxtFiles(fileList, categoryId) {
    const items = []
    for (const file of fileList) {
      try {
        const content = await fileToText(file)
        items.push({
          name: file.name.replace(/\.[^.]+$/, ''),
          content
        })
      } catch (e) {
        console.error('读取文件失败:', file.name, e)
      }
    }
    if (items.length === 0) return 0
    const result = await apiClient.batchImportPrompts(items, categoryId)
    if (result) await loadPrompts()
    return result ? result.imported : 0
  }

  function fileToText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result || '')
      reader.onerror = reject
      reader.readAsText(file, 'utf-8')
    })
  }

  return {
    categories,
    prompts,
    isLoading,
    promptMap,
    categoryMap,
    allCategories,
    promptsByCategory,
    getPromptById,
    getCategoryName,
    getCategoryCount,
    resolvePromptContents,
    loadAll,
    loadCategories,
    loadPrompts,
    createCategory,
    updateCategory,
    deleteCategory,
    createPrompt,
    updatePrompt,
    deletePrompt,
    batchDeletePrompts,
    batchCategorizePrompts,
    batchImportTxtFiles
  }
})
