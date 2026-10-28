// src/shell/vfs.js
// 虚拟文件系统（VFS）适配层：把"文件库"（可写，像真实磁盘）与各业务数据库（只读浏览）
// 统一成 Windows 资源管理器能呈现的目录/文件。所有写操作集中在文件库；业务库双击即用对应查看器打开。
import { defineStore } from 'pinia'
import { apiClient } from '@/services/api'
import { useWm } from '@/shell/wm'
import { isComfyWorkflowText } from '@/utils/workflowDetect'
import { isStoryboardText } from '@/utils/storyboardDetect'

// 主后端地址：开发环境走 vite 同源代理 /server（见 vite.config.js）
const API_BASE = '/server'

// 分类/盘符元数据缓存：load() 每次切换目录都会用到（面包屑、盘符列表、mainCategoryId），
// 加一层短 TTL 缓存，避免每次目录切换都多打 1~4 个 HTTP 往返（这是切换目录"卡一下"的主因之一）。
// 新建/删除盘符时主动失效，保证一致性。
let _catsCache = null
let _catsCacheAt = 0
const CATS_TTL = 20000

// 此电脑下的"库"快捷方式（只读浏览区）。api 为该库列表接口；open 时按字段打开查看器。
export const LIBRARIES = [
  { lib: 'prompts',          name: '提示词库',   icon: 'notepad',    api: '/api/prompts' },
  { lib: 'characters',       name: '角色库',     icon: 'character',  api: '/api/characters' },
  { lib: 'gallery-images',   name: '艺术图库',   icon: 'photos',     api: '/api/gallery-images' },
  { lib: 'workflow-apis',    name: '工作流库',   icon: 'layer',      api: '/api/workflow-apis' },
  { lib: 'storyboard-jsons', name: '分镜脚本',   icon: 'storyboard', api: '/api/storyboard-jsons' },
  { lib: 'rules',            name: '规则库',     icon: 'rule',       api: '/api/rules' },
  { lib: 'functions',        name: '功能库',     icon: 'function',   api: '/api/functions' },
  { lib: 'conversations',    name: '对话记录',   icon: 'chat',       api: '/api/conversations' },
  { lib: 'generation-tasks', name: '生成任务',   icon: 'tasks',      api: '/api/generation-tasks' },
]

export const useVfs = defineStore('vfs', {
  state: () => ({
    // 跨窗口共享的剪贴板：{ op:'copy'|'cut', items:[{kind:'file'|'folder', id, name}] }
    clipboard: null,
    recycleCount: 0,
  }),
  actions: {
    // ============================================================
    // 此电脑：盘符 = 总库(C:) + 各分类(D:/E:/F:…)
    // 业务库（提示词库/角色库等）只是其它表的只读视图，不再作为盘符出现。
    // ============================================================
    async listComputer() {
      const cats = await this.listCategories()
      const sorted = cats.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id)
      const drives = []
      let code = 68 // D
      for (const c of sorted) {
        if (c.is_system === 1 && c.name === '总库') continue
        drives.push({
          id: 'cat:' + c.id, name: c.name, kind: 'cat', catId: c.id,
          letter: c.drive_letter || String.fromCharCode(code++), isDrive: true,
          fileCount: c.file_count || 0, subCount: c.folder_count || 0, raw: c,
        })
      }
      return [
        { id: 'fl:root', name: '总库', kind: 'fl-root', icon: 'drive', letter: 'C', isDrive: true },
        ...drives,
      ]
    },

    // 新建盘符（= 新建分类，与总库平行）
    async createCategory(name) {
      const r = await apiClient.request('POST', '/api/file-library-categories', { name })
      if (!r.success) throw new Error(r.error || '创建盘符失败')
      this.invalidateCategories()
      return r.data
    },

    // 删除盘符。后端强制：系统分类不可删、目录内有文件/文件夹不可删。
    // 返回 { success, error? }，失败时把原因交给界面提示。
    async deleteCategory(id) {
      const r = await apiClient.request('DELETE', `/api/file-library-categories/${id}`)
      this.invalidateCategories()
      return r
    },

    // 主动让分类缓存失效（新建/删除盘符后调用）
    invalidateCategories() { _catsCache = null },

    // ============================================================
    // 文件库（主树，可写）
    // ============================================================
    // ---------- 分类（C: 盘符下的"分类文件夹"）----------
    async listCategories(force = false) {
      const now = Date.now()
      if (!force && _catsCache && now - _catsCacheAt < CATS_TTL) return _catsCache
      const r = await apiClient.request('GET', '/api/file-library-categories')
      const data = r.success && Array.isArray(r.data) ? r.data : []
      _catsCache = data
      _catsCacheAt = now
      return data
    },

    // 总库（系统分类）的 id：C: 盘符的"根"
    async mainCategoryId() {
      const cats = await this.listCategories()
      const sys = cats.find((c) => c.is_system === 1 && c.name === '总库')
        || cats.find((c) => c.is_system === 1)
      return sys ? sys.id : 0
    },

    // 把 folderId 解析成后端需要的 { categoryId, parentId }
    // folderId 取值：'root' | 'cat:<分类id>' | '<数字文件夹id>'
    async resolveTarget(folderId) {
      const fid = folderId === 'root' || folderId == null ? 'root' : String(folderId)
      if (fid.startsWith('cat:')) return { categoryId: parseInt(fid.slice(4)) || 0, parentId: null, raw: fid }
      if (fid === 'root') return { categoryId: await this.mainCategoryId(), parentId: null, raw: 'root' }
      return { categoryId: 0, parentId: parseInt(fid) || null, raw: fid }
    },

    mapFolders(r) {
      return (r.success ? r.data : []).map((f) => ({
        id: 'fld:' + f.id, name: f.name, kind: 'folder',
        folderId: f.id, fileCount: f.file_count || 0, subCount: f.subfolder_count || 0, raw: f,
      }))
    },

    mapFiles(r) {
      return (r.success ? r.data : []).map((f) => ({
        id: 'fil:' + f.id, name: f.name, kind: 'file', fileType: f.file_type,
        fileId: f.id, size: f.file_size || 0, thumb: f.thumbnail_data || '',
        modified: f.updated_at || f.created_at, raw: f,
      }))
    },

    async listFl(folderId) {
      const fid = folderId === 'root' || folderId == null ? 'root' : String(folderId)

      // 分类目录：该分类下的根文件夹 + 直属文件
      if (fid.startsWith('cat:')) {
        const catId = fid.slice(4)
        const [folders, files] = await Promise.all([
          apiClient.request('GET', `/api/file-library-folders?parent_id=null&category_id=${catId}`),
          apiClient.request('GET', `/api/file-library-files?folder_id=root&category_id=${catId}&light=1`),
        ])
        return [...this.mapFolders(folders), ...this.mapFiles(files)]
      }

      // 总库根 (C:\)：总库自己的根文件夹 + 直属文件（分类已经是独立盘符，不再混进来）
      if (fid === 'root') {
        const catId = await this.mainCategoryId()
        const catQs = catId ? `&category_id=${catId}` : ''
        const [folders, files] = await Promise.all([
          apiClient.request('GET', `/api/file-library-folders?parent_id=null${catQs}`),
          apiClient.request('GET', `/api/file-library-files?folder_id=root${catQs}&light=1`),
        ])
        return [...this.mapFolders(folders), ...this.mapFiles(files)]
      }

      // 普通文件夹
      const [folders, files] = await Promise.all([
        apiClient.request('GET', `/api/file-library-folders?parent_id=${fid}`),
        apiClient.request('GET', `/api/file-library-files?folder_id=${fid}&light=1`),
      ])
      return [...this.mapFolders(folders), ...this.mapFiles(files)]
    },

    // 子文件夹树（导航窗格懒加载）
    async listFlSubfolders(parentId) {
      const pid = parentId === 'root' || parentId == null ? 'root' : String(parentId)

      if (pid.startsWith('cat:')) {
        const r = await apiClient.request('GET', `/api/file-library-folders?parent_id=null&category_id=${pid.slice(4)}`)
        return this.mapTree(r)
      }
      if (pid === 'root') {
        const catId = await this.mainCategoryId()
        const catQs = catId ? `&category_id=${catId}` : ''
        const folders = await apiClient.request('GET', `/api/file-library-folders?parent_id=null${catQs}`)
        return this.mapTree(folders)
      }
      const r = await apiClient.request('GET', `/api/file-library-folders?parent_id=${pid}`)
      return this.mapTree(r)
    },

    mapTree(r) {
      return (r.success ? r.data : []).map((f) => ({
        id: 'fld:' + f.id, folderId: f.id, name: f.name, kind: 'folder', hasChildren: (f.subfolder_count || 0) > 0,
      }))
    },

    // 文件夹的层级路径（面包屑用）。'cat:<id>' 与 'root' 没有实体路径，返回空。
    async getFlPath(folderId) {
      const fid = folderId == null ? 'root' : String(folderId)
      if (fid === 'root' || fid.startsWith('cat:')) return []
      const r = await apiClient.request('GET', `/api/file-library-files/folder-path/${fid}`)
      return r.success ? r.data : []
    },

    async createFlFolder(parentId, name) {
      const { categoryId, parentId: pid } = await this.resolveTarget(parentId)
      const r = await apiClient.request('POST', '/api/file-library-folders', {
        category_id: categoryId, parent_id: pid, name,
      })
      if (!r.success) throw new Error(r.error || '新建文件夹失败')
      return r.data
    },

    async createFlTextFile(folderId, name, content = '') {
      const { categoryId, parentId } = await this.resolveTarget(folderId)
      const r = await apiClient.request('POST', '/api/file-library-files', {
        category_id: categoryId, folder_id: parentId,
        name, file_type: 'text', content,
      })
      if (!r.success) throw new Error(r.error || '新建文件失败')
      return r.data
    },

    // 新建 Json 分镜文件（批量提示词分镜工具的文档格式：[{id, content}, ...]）
    async createFlStoryboardFile(folderId, name = '新建Json分镜.json') {
      const { categoryId, parentId } = await this.resolveTarget(folderId)
      const r = await apiClient.request('POST', '/api/file-library-files', {
        category_id: categoryId, folder_id: parentId,
        name, file_type: 'storyboard', filename: name,
        content: '[]',
      })
      if (!r.success) throw new Error(r.error || '新建分镜文件失败')
      return r.data
    },

    // 新建小说文件（小说阅读器格式：{title, author, chapters:[{id,title,html}]} 的 JSON）
    async createFlNovelFile(folderId, name = '新建小说.novel') {
      const { categoryId, parentId } = await this.resolveTarget(folderId)
      const defaultContent = JSON.stringify({
        v: 1, title: name.replace(/\.novel$/i, ''), author: '', chapters: [],
      })
      const r = await apiClient.request('POST', '/api/file-library-files', {
        category_id: categoryId, folder_id: parentId,
        name, file_type: 'novel', filename: name,
        content: defaultContent,
      })
      if (!r.success) throw new Error(r.error || '新建小说失败')
      return r.data
    },

    // 导入本地文件（图片/视频/音频/文本）
    async importFlFile(folderId, file) {
      const { categoryId, parentId: target } = await this.resolveTarget(folderId)
      let r
      if (/^(image|video|audio)\//.test(file.type)) {
        const base64 = await readAsDataURL(file)
        const ext = (file.name.split('.').pop() || '').toLowerCase()
        const fmt = ['mp4', 'webm', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'mp3', 'wav', 'ogg'].includes(ext) ? ext : (file.type.split('/')[1] || 'bin')
        r = await apiClient.request('POST', '/api/file-library-files', {
          category_id: categoryId, folder_id: target, name: file.name,
          file_type: file.type.split('/')[0], format: fmt, image_base64: base64,
        })
      } else if (file.type.startsWith('text/') || /\.(txt|md|json|csv|xml|yml|yaml|srt|ass)$/i.test(file.name)) {
        const text = await readAsText(file)
        // JSON 文件若内容是 ComfyUI 工作流（API/UI 格式），归类为 workflow —— 这样才能
        // 双击进入节点编辑器，且能出现在各处"使用工作流（单选）"的可调用列表里。
        const isWf = /\.json$/i.test(file.name) && isComfyWorkflowText(text)
        r = await apiClient.request('POST', '/api/file-library-files', {
          category_id: categoryId, folder_id: target, name: file.name,
          file_type: isWf ? 'workflow' : (/\.json$/i.test(file.name) ? 'json' : 'text'), content: text,
        })
      } else {
        throw new Error('仅支持导入图片 / 视频 / 音频 / 文本文件')
      }
      if (!r.success) throw new Error(r.error || ('导入 ' + file.name + ' 失败'))
      return r.data
    },

    async renameFl(kind, id, name) {
      let path = '/api/file-library-files/'
      if (kind === 'folder') path = '/api/file-library-folders/'
      else if (kind === 'cat') path = '/api/file-library-categories/'
      const r = await apiClient.request('PUT', path + id, { name })
      if (!r.success) throw new Error(r.error || '重命名失败')
      return true
    },

    // 删除到回收站（软删除）。失败时抛出后端原因，不再静默。
    // 注意：必须用数字 ID —— item.id 是带前缀的 'fld:123' / 'fil:456'，直接拼进 URL 后端匹配 0 行（还返回成功）。
    async removeFl(items) {
      const folderIds = idsOf(items, 'folder')
      const fileIds = idsOf(items, 'file')
      const errors = []
      for (const fid of folderIds) {
        const r = await apiClient.request('DELETE', `/api/file-library-folders/${fid}`)
        if (!r.success) errors.push(r.error || '删除文件夹失败')
      }
      for (const fid of fileIds) {
        const r = await apiClient.request('DELETE', `/api/file-library-files/${fid}`)
        if (!r.success) errors.push(r.error || '删除文件失败')
      }
      await this.refreshRecycle()
      // 通知所有打开的回收站窗口立即刷新（删除后回收站应马上出现新条目，不用手动关重开）
      try { window.dispatchEvent(new CustomEvent('recycle-changed')) } catch {}
      if (errors.length) throw new Error(errors[0])
      return true
    },

    // 粘贴前预检：目标目录里有哪些同名项。返回冲突列表（无冲突返回空数组）
    async previewPasteConflicts(items, targetFolderId) {
      const { categoryId, parentId } = await this.resolveTarget(targetFolderId)
      const payload = {
        items: (items || []).map((it) => ({
          kind: it.kind === 'folder' ? 'folder' : 'file',
          id: it.kind === 'folder' ? (it.folderId != null ? it.folderId : it.id) : (it.fileId != null ? it.fileId : it.id),
        })).filter((x) => x.id != null && x.id !== ''),
        category_id: categoryId,
        folder_id: parentId,
      }
      if (!payload.items.length) return []
      try {
        const r = await apiClient.request('POST', '/api/file-library-paste/conflicts', payload)
        return r.success ? (r.data && r.data.conflicts ? r.data.conflicts : []) : []
      } catch {
        return [] // 预检失败不阻塞粘贴，退化成后端的自动编号
      }
    },

    async copyFl(items, targetFolderId, conflict, decisions) {
      const { categoryId, parentId } = await this.resolveTarget(targetFolderId)
      const folderIds = idsOf(items, 'folder')
      const fileIds = idsOf(items, 'file')
      const errors = []
      const opt = (id) => {
        const o = { ...(conflict ? { conflict } : {}) }
        if (Array.isArray(decisions) && decisions.length) {
          const hit = decisions.find((d) => String(d.id) === String(id))
          if (hit) o.decisions = [hit]
        }
        return o
      }
      // 注意：文件夹要逐个复制（后端 copy 一次只处理一个），且 parentId 为 null（盘符根）也是合法目标
      if (folderIds.length) {
        for (const fid of folderIds) {
          const r = await apiClient.request('POST', '/api/file-library-folders/copy', {
            id: fid, parent_id: parentId, category_id: categoryId, ...opt(fid),
          })
          if (!r.success) errors.push(r.error || '复制文件夹失败')
        }
      }
      if (fileIds.length) {
        const body = { ids: fileIds, category_id: categoryId, folder_id: parentId, ...(conflict ? { conflict } : {}) }
        if (Array.isArray(decisions) && decisions.length) body.decisions = decisions
        const r = await apiClient.request('POST', '/api/file-library-files/copy', body)
        if (!r.success) errors.push(r.error || '复制文件失败')
      }
      if (errors.length) throw new Error(errors[0])
      return true
    },

    async moveFl(items, targetFolderId, conflict, decisions) {
      const { categoryId, parentId } = await this.resolveTarget(targetFolderId)
      const folderIds = idsOf(items, 'folder')
      const fileIds = idsOf(items, 'file')
      const errors = []
      if (folderIds.length) {
        const body = { ids: folderIds, category_id: categoryId, parent_id: parentId, ...(conflict ? { conflict } : {}) }
        if (Array.isArray(decisions) && decisions.length) body.decisions = decisions
        const r = await apiClient.request('POST', '/api/file-library-folders/batch-move', body)
        if (!r.success) errors.push(r.error || '移动文件夹失败')
      }
      if (fileIds.length) {
        const body = { ids: fileIds, category_id: categoryId, folder_id: parentId, ...(conflict ? { conflict } : {}) }
        if (Array.isArray(decisions) && decisions.length) body.decisions = decisions
        const r = await apiClient.request('POST', '/api/file-library-files/batch-move', body)
        if (!r.success) errors.push(r.error || '移动文件失败')
      }
      if (errors.length) throw new Error(errors[0])
      return true
    },

    // ============================================================
    // 业务库（只读浏览）
    // ============================================================
    async listLib(lib) {
      const def = LIBRARIES.find((l) => l.lib === lib)
      if (!def) return []
      const r = await apiClient.request('GET', def.api)
      const arr = r.success ? r.data : []
      return (Array.isArray(arr) ? arr : []).map((it) => ({
        id: 'libitem:' + it.id, name: it.name || it.title || ('#' + it.id), kind: 'libitem',
        lib, itemId: it.id, raw: it,
      }))
    },

    // ============================================================
    // 回收站
    // ============================================================
    async getRecycle() {
      const r = await apiClient.request('GET', '/api/file-library-recycle')
      const data = r.success ? r.data : { files: [], folders: [] }
      const files = (data.files || []).map((f) => ({
        id: 'rf:' + f.id, name: f.name, kind: 'recycle-file', fileId: f.id,
        fileType: f.file_type, size: f.file_size || 0, deletedAt: f.deleted_at, raw: f,
      }))
      const folders = (data.folders || []).map((f) => ({
        id: 'rfd:' + f.id, name: f.name, kind: 'recycle-folder', folderId: f.id,
        deletedAt: f.deleted_at, raw: f,
      }))
      const all = [...folders, ...files]
      this.recycleCount = all.length
      return all
    },

    async refreshRecycle() {
      try { await this.getRecycle() } catch { /* ignore */ }
    },

    async restoreRecycle(items) {
      const folderIds = items.filter((i) => i.kind === 'recycle-folder').map((i) => i.folderId)
      const fileIds = items.filter((i) => i.kind === 'recycle-file').map((i) => i.fileId)
      let ok = true
      if (folderIds.length) { const r = await apiClient.request('POST', '/api/file-library-recycle/restore-folders', { ids: folderIds }); ok = ok && r.success }
      if (fileIds.length) { const r = await apiClient.request('POST', '/api/file-library-recycle/restore-files', { ids: fileIds }); ok = ok && r.success }
      await this.refreshRecycle()
      // 还原后：目标资源管理器窗口要立刻出现文件；回收站列表也要立刻刷新
      try {
        window.dispatchEvent(new CustomEvent('fl-files-changed', { detail: { sender: 'recycle' } }))
        window.dispatchEvent(new CustomEvent('recycle-changed'))
      } catch {}
      return ok
    },

    async purgeRecycle(items) {
      const folderIds = items.filter((i) => i.kind === 'recycle-folder').map((i) => i.folderId)
      const fileIds = items.filter((i) => i.kind === 'recycle-file').map((i) => i.fileId)
      let ok = true
      if (folderIds.length) { const r = await apiClient.request('POST', '/api/file-library-recycle/purge-folders', { ids: folderIds }); ok = ok && r.success }
      if (fileIds.length) { const r = await apiClient.request('POST', '/api/file-library-recycle/purge-files', { ids: fileIds }); ok = ok && r.success }
      await this.refreshRecycle()
      try { window.dispatchEvent(new CustomEvent('recycle-changed')) } catch {}
      return ok
    },

    async emptyRecycle() {
      const r = await apiClient.request('POST', '/api/file-library-recycle/empty')
      await this.refreshRecycle()
      try { window.dispatchEvent(new CustomEvent('recycle-changed')) } catch {}
      return r.success
    },

    // 在资源管理器新窗口中打开某个文件夹（供生成结果等"在文件夹中显示"互通）
    revealInExplorer(folderId = 'root') {
      const wm = useWm()
      wm.open('explorer', { initialScope: { scope: 'fl', folderId: folderId || 'root' } }, { w: 1000, h: 660 })
    },

    // 缩略图兜底（轻量列表模式下按需调用）：
    // 先取库里存的小缩略图（~22KB），取不到再回退磁盘原图 blob。
    async ensureThumb(item) {
      if (!item || item.kind !== 'file') return
      if (item.thumb) return
      if (item.fileType !== 'image') return
      if (item._thumbLoading) return
      item._thumbLoading = true
      try {
        const t = await apiClient.getFileLibraryThumbnail(item.fileId)
        if (t) item.thumb = t
        else {
          const url = await apiClient.getFileLibraryFileBlobUrl(item.fileId)
          if (url) item.thumb = url
        }
      } catch { /* 原图丢失则保持无缩略图 */ }
      item._thumbLoading = false
    },

    // ============================================================
    // 打开：把条目分派到对应查看器应用（像 Windows 双击打开）
    // ctx.siblings：当前目录里的全部文件项 —— 供照片查看器"上一张/下一张"翻页
    // ============================================================
    async openFile(item, ctx = {}) {
      const wm = useWm()
      const id = item.fileId
      const type = item.fileType
      try {
        const detail = await apiClient.getFileLibraryFileById(id)
        const content = detail ? (detail.content || '') : ''
        const promptText = detail ? (detail.description || detail.prompt || '') : ''

        // 图片 / 视频 / 音频：优先取磁盘原图 blob，取不到则回退用缩略图。
        // 关键：不再"穿透"到下面的 JSON 分支 —— 这正是之前图片被当成 JSON 打开的原因。
        if (type === 'image' || type === 'video' || type === 'audio') {
          let src = await apiClient.getFileLibraryFileBlobUrl(id)
          if (!src && detail && detail.thumbnail_data) src = detail.thumbnail_data
          if (type === 'image') {
            // 同目录的所有图片，组成可翻页列表
            let images = null
            let index = 0
            if (Array.isArray(ctx.siblings)) {
              images = ctx.siblings
                .filter((x) => x.fileType === 'image')
                .map((x) => ({
                  fileId: x.fileId, name: x.name,
                  thumb: x.thumb || (x.raw && x.raw.thumbnail_data) || '',
                  prompt: (x.raw && (x.raw.description || x.raw.prompt)) || '',
                }))
              if (images.length) index = Math.max(0, images.findIndex((x) => String(x.fileId) === String(id)))
              else images = null
            }
            return wm.open('photos', {
              title: item.name, fileId: id, src: src || '', prompt: promptText || content,
              images, index,
            }, { w: 900, h: 660 })
          }
          // 同目录的同类型媒体（视频/音频），组成可翻页列表
          let medias = null
          let mediaIdx = 0
          if (Array.isArray(ctx.siblings) && (type === 'video' || type === 'audio')) {
            const list = ctx.siblings
              .filter((x) => x.fileType === type)
              .map((x) => ({
                fileId: x.fileId, name: x.name,
                thumb: x.thumb || (x.raw && x.raw.thumbnail_data) || '',
              }))
            if (list.length > 1) {
              mediaIdx = Math.max(0, list.findIndex((x) => String(x.fileId) === String(id)))
              medias = list
            }
          }
          return wm.open('media', { title: item.name, src: src || '', type, medias, index: mediaIdx }, { w: 960, h: 640 })
        }
        if (type === 'prompt' || type === 'text' || type === 'rule') {
          return wm.open('notepad', {
            title: item.name, content, fileId: id, fileType: type,
            onSave: (t) => apiClient.updateFileLibraryFile(id, { content: t }),
          }, { w: 820, h: 620 })
        }
        // Json 分镜文件：用分镜工具打开（可编辑/删除/新增/保存回原文件）。
        // 兼容历史数据：老版本把分镜存成 file_type='json'，按内容识别。
        if (type === 'storyboard' || (type !== 'workflow' && type === 'json' && isStoryboardText(content))) {
          return wm.open('storyboard', {
            title: item.name, fileId: id, fileName: item.name, fileContent: content,
          }, { w: 1000, h: 700 })
        }
        // 工作流：用节点编辑器打开（可显示并编辑节点），不再退化为只读 JSON 树。
        // 兼容历史数据：早期从磁盘导入的 .json 被存成 file_type='json'，
        // 只要内容是 ComfyUI 工作流（API/UI 格式）同样按工作流打开。
        if (type === 'workflow' || (type === 'json' && isComfyWorkflowText(content))) {
          return wm.open('workflow', { title: item.name, json: content, fileId: id }, { w: 1120, h: 740 })
        }
        // 小说：用小说阅读器打开（目录 + 章节 + 阅读/编辑模式 + 插图）
        if (type === 'novel') {
          return wm.open('novel', { title: item.name, fileId: id, content }, { w: 1080, h: 720 })
        }
        // 其它 JSON 文件：像 TXT 一样用可编辑文本编辑器打开（可修改并保存回原文件）。
        // 工作流 / 分镜已在上面分派到专用工具；剩下的普通 JSON 不再用只读 JSON 树查看器。
        return wm.open('notepad', {
          title: item.name, content, fileId: id, fileType: type,
          onSave: (t) => apiClient.updateFileLibraryFile(id, { content: t }),
        }, { w: 860, h: 640 })
      } catch (e) {
        return null
      }
    },

    async openLibItem(item) {
      const wm = useWm()
      const def = LIBRARIES.find((l) => l.lib === item.lib)
      if (!def) return null
      try {
        const r = await apiClient.request('GET', `${def.api}/${item.itemId}`)
        const rec = r.success ? r.data : item.raw
        const id = item.itemId
        // 图片类
        if (item.lib === 'gallery-images') {
          const src = await apiClient.getGalleryImageBlobUrl(id)
          if (src) return wm.open('photos', { title: item.name, src }, { w: 900, h: 660 })
        }
        if (item.lib === 'characters') {
          const av = rec.avatar || rec.image_data || rec.thumbnail_data
          if (typeof av === 'string' && av.startsWith('data:')) {
            return wm.open('photos', { title: item.name, src: av }, { w: 820, h: 640 })
          }
        }
        // 文本类（提示词 / 规则）
        if ((item.lib === 'prompts' || item.lib === 'rules') && rec.content) {
          return wm.open('notepad', { title: item.name, content: rec.content }, { w: 820, h: 620 })
        }
        // JSON 类（工作流 / 分镜）
        if (item.lib === 'workflow-apis' && (rec.workflow_json || rec.workflow_data)) {
          return wm.open('workflow', { title: item.name, json: rec.workflow_json || rec.workflow_data, workflowId: id }, { w: 1120, h: 740 })
        }
        if (item.lib === 'storyboard-jsons' && rec.json_data) {
          return wm.open('json', { title: item.name, json: rec.json_data }, { w: 820, h: 640 })
        }
        // 兜底：展示完整记录 JSON
        return wm.open('json', { title: item.name, json: rec }, { w: 820, h: 640 })
      } catch (e) {
        return null
      }
    },
  },
})

// ---- 本地工具 ----
// 统一取数字 ID：优先 folderId/fileId，兜底从 'fld:123' 这类前缀 id 里剥出数字。
// （历史 bug：直接把 'fld:123' 拼进 URL，后端 WHERE id = 'fld:123' 匹配不到，
//   batch-move 更是静默返回成功 —— 造成"提示成功但刷新后没变化"。）
function idsOf(items, kind) {
  return (items || [])
    .filter((i) => i && i.kind === kind)
    .map((i) => (kind === 'folder' ? (i.folderId != null ? i.folderId : i.id) : (i.fileId != null ? i.fileId : i.id)))
    .map((v) => {
      if (typeof v === 'number') return v
      if (typeof v === 'string') {
        const s = v.includes(':') ? v.slice(v.lastIndexOf(':') + 1) : v
        const n = parseInt(s, 10)
        return Number.isFinite(n) ? n : null
      }
      return null
    })
    .filter((v) => v != null)
}
function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}
function readAsText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = reject
    fr.readAsText(file)
  })
}
