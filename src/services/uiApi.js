// UI系统 API 客户端 - 对接主项目后端 (端口 3007)
// 主后端地址：开发环境走 vite 同源代理 /server（见 vite.config.js）
const UI_API_BASE = '/server'

function snakeToCamel(obj) {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(snakeToCamel)
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      result[camelKey] = snakeToCamel(value)
    }
    return result
  }
  return obj
}

async function request(url, options) {
  const res = await fetch(`${UI_API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  const json = await res.json()
  if (json.code !== 0) {
    throw new Error(json.message || '请求失败')
  }
  return snakeToCamel(json.data)
}

// 获取素材文件的完整 URL
// 统一使用免 auth 接口 /api/ui-library/:id/file
// 后端先查文件库(UI库分类)的 fileId，回退查旧 UI 素材库的 assetId，兼容新旧数据
export function getAssetFileUrl(assetId) {
  if (!assetId) return ''
  return `${UI_API_BASE}/api/ui-library/${assetId}/file`
}

// UI库图片统一 URL（语义别名，与 getAssetFileUrl 等价）
export function getUiLibraryFileUrl(id) {
  if (!id) return ''
  return `${UI_API_BASE}/api/ui-library/${id}/file`
}

// 获取上传文件的完整 URL
export function getUploadUrl(filePath) {
  if (!filePath) return ''
  return `${UI_API_BASE}/uploads/${filePath}`
}

// 分类 API
export const categoryApi = {
  list: () => request('/api/ui/categories'),
  create: (data) => request('/api/ui/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/api/ui/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/api/ui/categories/${id}`, { method: 'DELETE' })
}

// 素材 API
export const assetApi = {
  list: (params) => {
    const query = new URLSearchParams()
    if (params?.categoryId) query.set('categoryId', String(params.categoryId))
    if (params?.keyword) query.set('keyword', params.keyword)
    const qs = query.toString()
    return request(`/api/ui/assets${qs ? `?${qs}` : ''}`)
  },
  upload: async (file, categoryId, name) => {
    const form = new FormData()
    form.append('file', file)
    if (categoryId) form.append('categoryId', String(categoryId))
    if (name) form.append('name', name)
    const res = await fetch(`${UI_API_BASE}/api/ui/assets`, { method: 'POST', body: form })
    const json = await res.json()
    if (json.code !== 0) throw new Error(json.message)
    return snakeToCamel(json.data)
  },
  update: (id, data) => request(`/api/ui/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/api/ui/assets/${id}`, { method: 'DELETE' })
}

// UI方案 API
export const schemeApi = {
  list: () => request('/api/ui/schemes'),
  get: (id) => request(`/api/ui/schemes/${id}`),
  create: (data) => request('/api/ui/schemes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/api/ui/schemes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/api/ui/schemes/${id}`, { method: 'DELETE' }),
  autosave: (id, data) => request(`/api/ui/schemes/${id}/autosave`, { method: 'PUT', body: JSON.stringify(data) })
}

// 组件模板 API
export const templateApi = {
  list: () => request('/api/ui/templates'),
  create: (data) => request('/api/ui/templates', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/api/ui/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/api/ui/templates/${id}`, { method: 'DELETE' })
}

export default { categoryApi, assetApi, schemeApi, templateApi, getAssetFileUrl, getUiLibraryFileUrl, getUploadUrl }
