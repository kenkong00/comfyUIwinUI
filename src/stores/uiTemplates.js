import { defineStore } from 'pinia'
import { ref } from 'vue'
import { templateApi } from '@/services/uiApi'

export const useUiTemplateStore = defineStore('uiTemplates', () => {
  const templates = ref([])
  const loading = ref(false)

  async function fetchTemplates() {
    loading.value = true
    try {
      templates.value = await templateApi.list()
    } finally {
      loading.value = false
    }
  }

  async function createTemplate(data) {
    const tpl = await templateApi.create(data)
    templates.value.unshift(tpl)
    return tpl
  }

  async function updateTemplate(id, data) {
    const updated = await templateApi.update(id, data)
    const idx = templates.value.findIndex(t => t.id === id)
    if (idx !== -1) templates.value[idx] = updated
  }

  async function deleteTemplate(id) {
    await templateApi.delete(id)
    templates.value = templates.value.filter(t => t.id !== id)
  }

  return {
    templates, loading,
    fetchTemplates, createTemplate, updateTemplate, deleteTemplate
  }
})
