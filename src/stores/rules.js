import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiClient } from '@/services/api'

export const useRulesStore = defineStore('rules', () => {
  const categories = ref([])
  const rules = ref([])
  const isLoading = ref(false)

  const ruleMap = computed(() => {
    const m = new Map()
    rules.value.forEach(r => m.set(r.id, r))
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

  function rulesByCategory(catId) {
    if (catId === 'all' || catId === undefined) return rules.value
    return rules.value.filter(r => r.category_id === catId)
  }

  function getRuleById(id) {
    return ruleMap.value.get(id) || null
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
    if (catId === 'all') return rules.value.length
    return rules.value.filter(r => r.category_id === catId).length
  }

  // 根据 ID 数组解析规则内容，拼接返回
  function resolveRuleContents(ruleIds) {
    if (!Array.isArray(ruleIds) || ruleIds.length === 0) return ''
    return ruleIds
      .map(id => ruleMap.value.get(id))
      .filter(Boolean)
      .map(r => r.content)
      .filter(Boolean)
      .join('\n\n')
  }

  async function loadCategories() {
    categories.value = await apiClient.getRuleCategories()
  }

  async function loadRules() {
    rules.value = await apiClient.getRules()
  }

  async function loadAll() {
    isLoading.value = true
    try {
      await Promise.all([loadCategories(), loadRules()])
    } finally {
      isLoading.value = false
    }
  }

  async function createCategory(name) {
    const c = await apiClient.createRuleCategory({ name })
    if (c) await loadCategories()
    return c
  }

  async function updateCategory(id, data) {
    const c = await apiClient.updateRuleCategory(id, data)
    if (c) await loadCategories()
    return c
  }

  async function deleteCategory(id) {
    const ok = await apiClient.deleteRuleCategory(id)
    if (ok) await loadAll()
    return ok
  }

  async function createRule(data) {
    const r = await apiClient.createRule(data)
    if (r) await loadRules()
    return r
  }

  async function updateRule(id, data) {
    const r = await apiClient.updateRule(id, data)
    if (r) await loadRules()
    return r
  }

  async function deleteRule(id) {
    const ok = await apiClient.deleteRule(id)
    if (ok) await loadRules()
    return ok
  }

  async function batchDeleteRules(ids) {
    const ok = await apiClient.batchDeleteRules(ids)
    if (ok) await loadRules()
    return ok
  }

  async function batchCategorizeRules(ids, categoryId) {
    const ok = await apiClient.batchCategorizeRules(ids, categoryId)
    if (ok) await loadRules()
    return ok
  }

  async function importTxtRules(fileList, defaultCategoryId) {
    const items = []
    for (const f of fileList) {
      if (f.name.toLowerCase().endsWith('.txt')) {
        const text = await f.text()
        items.push({
          name: f.name.replace(/\.txt$/i, ''),
          content: text,
          category_id: defaultCategoryId || 0
        })
      }
    }
    if (items.length) {
      await apiClient.batchImportRules({ rules: items })
      await loadRules()
    }
    return items.length
  }

  return {
    categories,
    rules,
    isLoading,
    ruleMap,
    categoryMap,
    allCategories,
    rulesByCategory,
    getRuleById,
    getCategoryById,
    getCategoryName,
    getCategoryCount,
    resolveRuleContents,
    loadAll,
    loadCategories,
    loadRules,
    createCategory,
    updateCategory,
    deleteCategory,
    createRule,
    updateRule,
    deleteRule,
    batchDeleteRules,
    batchCategorizeRules,
    importTxtRules
  }
})
