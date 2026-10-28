// src/stores/textEdit.js
// 「AI 文字编辑」功能的中枢：编辑设置持久化 + 已激活的文字编辑功能 + 调用大模型生成文本。
// 设置存后端 user_configs(config_type='editor_settings')，与项目约定一致（业务数据不落 localStorage）。
import { defineStore } from 'pinia'
import { apiClient } from '@/services/api'
import { chatCompletion, chatCompletionStream } from '@/utils/aiApi'

// 功能库里「文字编辑」类型的 tab_id
export const TEXT_EDIT_TAB = 'text-edit'
export const EDITOR_SETTINGS_TYPE = 'editor_settings'

export const DEFAULT_EDITOR_SETTINGS = {
  enabled: true,                 // 总开关
  ctxMenuEnabled: true,          // 文本域右键显示「AI 文字编辑」子菜单
  holdEnabled: true,             // 按住快捷键触发
  holdSide: 'left',              // 'left' | 'right' | 'either'
  holdKey: 'ctrl',               // 'ctrl' | 'alt' | 'shift'
  holdMs: 600,                   // 按住多少毫秒触发
  acceptKey: 'Tab',              // 采纳幽灵预览的键（KeyboardEvent.key）
  cancelKey: 'Escape',           // 取消幽灵预览的键
  contextChars: 500,             // 光标前后各取多少字作为上下文
  defaultFunctionId: null,       // 快捷键默认使用的功能（null=弹窗选择）
  ghostEnabled: true,            // 快捷键触发时是否走内联灰色预览（关闭则直接弹结果窗）
}

function deepDefaults(obj) {
  const out = { ...DEFAULT_EDITOR_SETTINGS, ...(obj || {}) }
  // 防呆：数值字段被存成字符串时纠正回数字
  out.holdMs = Number(out.holdMs) || DEFAULT_EDITOR_SETTINGS.holdMs
  out.contextChars = Number(out.contextChars) || DEFAULT_EDITOR_SETTINGS.contextChars
  return out
}

export const useTextEditStore = defineStore('textEdit', {
  state: () => ({
    settings: { ...DEFAULT_EDITOR_SETTINGS },
    functions: [],       // 已激活的文字编辑功能（tab_id === 'text-edit' && is_active）
    settingsLoaded: false,
    functionsLoaded: false,
    busy: false,         // 是否正在请求 AI
    lastError: '',
  }),

  getters: {
    activeFunctions: (s) => s.functions || [],
    hasAny: (s) => (s.functions || []).length > 0,
    // 快捷键触发时用的功能：显式默认 > 唯一的那个 > null（交给调用方弹选择框）
    defaultFunction: (s) => {
      const list = s.functions || []
      if (!list.length) return null
      if (s.settings.defaultFunctionId != null) {
        const hit = list.find((f) => f.id === s.settings.defaultFunctionId)
        if (hit) return hit
      }
      return list.length === 1 ? list[0] : null
    },
  },

  actions: {
    // ---------- 设置 ----------
    async loadSettings() {
      try {
        const data = await apiClient.getConfigs(EDITOR_SETTINGS_TYPE)
        this.settings = deepDefaults(data)
      } catch (e) {
        console.warn('[textEdit] 加载编辑设置失败，使用默认值:', e)
        this.settings = { ...DEFAULT_EDITOR_SETTINGS }
      }
      this.settingsLoaded = true
      return this.settings
    },

    async saveSettings(patch = null) {
      if (patch) this.settings = { ...this.settings, ...patch }
      try {
        await apiClient.saveConfig(EDITOR_SETTINGS_TYPE, this.settings)
        this.settingsLoaded = true
        return true
      } catch (e) {
        console.error('[textEdit] 保存编辑设置失败:', e)
        this.lastError = e?.message || '保存编辑设置失败'
        return false
      }
    },

    // ---------- 功能列表 ----------
    async loadFunctions() {
      try {
        const all = await apiClient.getFunctions()
        const list = Array.isArray(all) ? all : []
        this.functions = list.filter(
          (f) => f && f.tab_id === TEXT_EDIT_TAB && (f.is_active === 1 || f.is_active === true)
        )
      } catch (e) {
        console.error('[textEdit] 加载文字编辑功能失败:', e)
        this.functions = []
      }
      this.functionsLoaded = true
      return this.functions
    },

    parseConfig(fn) {
      if (!fn) return {}
      if (fn.config_json && typeof fn.config_json === 'object') return fn.config_json
      if (typeof fn.config_json === 'string') {
        try { return JSON.parse(fn.config_json) } catch { return {} }
      }
      return {}
    },

    // ---------- 组装提示词 ----------
    // 规则与批量推理一致：插入的提示词文件拼在前面，功能自带的提示词跟在后面。
    async buildSystemPrompt(fn) {
      const cfg = this.parseConfig(fn)
      const ids = Array.isArray(cfg.insertedPromptIds) ? cfg.insertedPromptIds : []
      let inserted = ''
      if (ids.length) {
        const files = await Promise.all(
          ids.map((id) => apiClient.getFileLibraryFileById(id).catch(() => null))
        )
        inserted = files
          .filter(Boolean)
          .map((f) => f.content || '')
          .filter(Boolean)
          .join('\n\n')
      }
      const own = (cfg.promptText || '').trim()
      const head = inserted ? inserted + (own ? '\n\n' : '') : ''
      const tail =
        '\n\n## 输出要求（必须遵守）\n' +
        '1. 只输出正文内容本身，不要解释、不要加标题、不要加前后缀说明。\n' +
        '2. 如果用户输入里给了【选中文本】，你的输出将整体替换这段选中文本，因此必须是一段完整可独立成立的内容。\n' +
        '3. 如果用户输入里没有【选中文本】，你的输出将直接插入到光标位置，必须能紧接前文自然连读。\n' +
        '4. 保持与原文一致的人称、时态、文风与语言。'
      return head + own + tail
    },

    buildUserPrompt({ mode, selectedText, beforeText, afterText }) {
      const parts = []
      if (mode === 'expand' && selectedText) {
        parts.push('【选中文本】\n' + selectedText)
      }
      if (beforeText) parts.push('【光标前上下文】\n' + beforeText)
      if (afterText) parts.push('【光标后上下文】\n' + afterText)
      if (!parts.length) return '（空文档，请直接开始写作）'
      return parts.join('\n\n')
    },

    /**
     * 调用某个文字编辑功能。
     * @param {Object} fn 功能行
     * @param {Object} payload { mode:'continue'|'expand', selectedText, beforeText, afterText, maxTokens, temperature }
     * @returns {Promise<string>} 生成的文本
     */
    async runFunction(fn, payload = {}) {
      const cfg = this.parseConfig(fn)
      if (!cfg.apiConfigId) throw new Error('该功能未配置 API 配置，请先到功能库编辑')
      const aiCfg = await apiClient.getAiConfigById(cfg.apiConfigId)
      if (!aiCfg) throw new Error('找不到对应的 API 配置，请到功能库重新选择')

      const systemPrompt = await this.buildSystemPrompt(fn)
      const userPrompt = this.buildUserPrompt(payload)

      this.busy = true
      this.lastError = ''
      try {
        const text = await chatCompletion(aiCfg, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], {
          maxTokens: payload.maxTokens,
          temperature: payload.temperature,
        })
        return text
      } catch (e) {
        this.lastError = e?.message || 'AI 调用失败'
        throw e
      } finally {
        this.busy = false
      }
    },

    /**
     * 流式调用某个文字编辑功能：逐字回调，支持中途打断。
     * @param {Object} fn 功能行
     * @param {Object} payload { mode, selectedText, beforeText, afterText, maxTokens, temperature }
     * @param {Object} io { onDelta(fullText, delta), signal }
     * @returns {Promise<string>} 完整文本（被打断时为已生成的部分）
     */
    async runFunctionStream(fn, payload = {}, io = {}) {
      const cfg = this.parseConfig(fn)
      if (!cfg.apiConfigId) throw new Error('该功能未配置 API 配置，请先到功能库编辑')
      const aiCfg = await apiClient.getAiConfigById(cfg.apiConfigId)
      if (!aiCfg) throw new Error('找不到对应的 API 配置，请到功能库重新选择')

      const systemPrompt = await this.buildSystemPrompt(fn)
      const userPrompt = this.buildUserPrompt(payload)

      this.busy = true
      this.lastError = ''
      try {
        return await chatCompletionStream(aiCfg, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], {
          onDelta: io.onDelta,
          signal: io.signal,
          maxTokens: payload.maxTokens,
          temperature: payload.temperature,
        })
      } catch (e) {
        this.lastError = e?.message || 'AI 调用失败'
        throw e
      } finally {
        this.busy = false
      }
    },
  },
})
