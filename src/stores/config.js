import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { defaultWorkflow } from '@/config/workflow'
import { apiClient } from '@/services/api'

export const useConfigStore = defineStore('config', () => {
  const config = ref({
    comfyuiUrl: 'http://127.0.0.1:8188',
    downloadDir: `${new Date().getFullYear()}.${new Date().getMonth() + 1}.${new Date().getDate()}`,
    autoDownload: false,
    filenamePrefix: 'ComfyUI'
  })

  const aiConfig = ref({
    provider: 'siliconflow',
    apiKey: '',
    apiKeys: {
      siliconflow: '',
      openai: '',
      openrouter: '',
      aliyun: '',
      google: '',
      lmstudio: '',
      modelscope: '',
      custom: ''
    },
    apiUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    models: {
      siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
      openai: 'gpt-4o',
      openrouter: 'openai/gpt-4o',
      aliyun: 'qwen-plus',
      google: 'gemini-2.5-flash',
      lmstudio: '',
      modelscope: 'qwen2.5-7b-instruct',
      custom: ''
    },
    useProxy: false,
    proxyPort: '7890',
    enableThinking: false,
    enableThinkingByProvider: {
      siliconflow: false,
      openai: false,
      openrouter: false,
      aliyun: false,
      google: false,
      lmstudio: false,
      modelscope: false,
      custom: false
    },
    // 模型生成参数（可在设置面板"模型参数"选项卡中配置）
    maxTokens: 4000,
    temperature: 0.8,
    topP: 1.0,
    frequencyPenalty: 0,
    presencePenalty: 0,
    imageMaxTokens: 2000
  })

  const testedModels = ref({
    siliconflow: [],
    openai: [],
    openrouter: [],
    aliyun: [],
    google: [],
    lmstudio: [],
    modelscope: [],
    custom: []
  })

  let previousProvider = aiConfig.value.provider
  let skipModelRestore = false
  
  const setSkipModelRestore = (value) => {
    skipModelRestore = value
  }
  
  watch(() => aiConfig.value.provider, (newProvider, oldProvider) => {
    if (oldProvider && oldProvider !== newProvider) {
      console.log(`🔄 切换服务商：${oldProvider} → ${newProvider}`)
      
      // 确保 enableThinkingByProvider 存在
      if (!aiConfig.value.enableThinkingByProvider) {
        aiConfig.value.enableThinkingByProvider = {
          siliconflow: false,
          openai: false,
          openrouter: false,
          aliyun: false,
          google: false,
          lmstudio: false,
          modelscope: false,
          custom: false
        }
      }
      
      // 保存当前服务商的配置
      aiConfig.value.apiKeys[previousProvider] = aiConfig.value.apiKey
      aiConfig.value.models[previousProvider] = aiConfig.value.model
      aiConfig.value.enableThinkingByProvider[previousProvider] = aiConfig.value.enableThinking
      
      if (newProvider === 'openai') {
        aiConfig.value.apiUrl = 'https://api.openai.com/v1'
      } else if (newProvider === 'openrouter') {
        aiConfig.value.apiUrl = 'https://openrouter.ai/api/v1'
      } else if (newProvider === 'siliconflow') {
        aiConfig.value.apiUrl = 'https://api.siliconflow.cn/v1'
      } else if (newProvider === 'aliyun') {
        aiConfig.value.apiUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
      } else if (newProvider === 'google') {
        aiConfig.value.apiUrl = 'https://generativelanguage.googleapis.com/v1beta'
      } else if (newProvider === 'lmstudio') {
        aiConfig.value.apiUrl = 'http://127.0.0.1:1234/v1'
      } else if (newProvider === 'modelscope') {
        aiConfig.value.apiUrl = 'https://api-inference.modelscope.cn/v1'
      }
      
      // 注意：程序化装载「使用中」的配置（applyActiveAiConfig）时不能再用服务商缓存覆盖 apiKey，
      // 否则密钥会被清空，表现为「设置里测通了、对话里却说未连接」。用 skipModelRestore 一并跳过。
      if (!skipModelRestore) {
        const savedKey = aiConfig.value.apiKeys[newProvider]
        if (savedKey && savedKey.trim()) {
          aiConfig.value.apiKey = savedKey
          console.log(`🔑 已加载 ${newProvider} 的 API 密钥`)
        } else {
          aiConfig.value.apiKey = ''
          console.log(`⚠️ ${newProvider} 没有保存的 API 密钥，请手动配置`)
        }
      }
      
      // 恢复新服务商的思考模式配置
      const savedThinking = aiConfig.value.enableThinkingByProvider[newProvider]
      aiConfig.value.enableThinking = savedThinking !== undefined ? savedThinking : false
      console.log(`🧠 恢复 ${newProvider} 的思考模式：`, aiConfig.value.enableThinking ? '开启' : '关闭')
      
      if (!skipModelRestore) {
        const savedModel = aiConfig.value.models[newProvider] || ''
        console.log(`📖 恢复 ${newProvider} 的模型:`, savedModel)
        aiConfig.value.model = savedModel
      }
      previousProvider = newProvider
    }
    skipModelRestore = false
  })

  const customWorkflow = ref(null)
  const chatWorkflowId = ref(0)
  const workflowMessage = ref('')
  const workflowFilename = ref('')

  const isServerOnline = ref(false)
  const isComfyUIOnline = ref(false)
  const isAIOnline = ref(false)
  // 最近一次 AI 连通性探测的失败原因（给界面展示，避免只给一句"未连接"）
  const aiConnError = ref('')
  // 当前「使用中」的 AI 配置名（对话里显示，让"显示"和"实际调用"对得上）
  const activeAiConfigName = ref('')
  // 对话自动切换配置后的提示（一次性，用户可关闭）
  const aiAutoSwitchNotice = ref('')

  const serverStatusText = ref('下载服务')
  const comfyuiStatusText = ref('测试')
  const aiStatusText = ref('测试连接')

  const isLoading = ref(false)
  const lastSyncTime = ref(null)
  const isOnline = ref(navigator.onLine)

  const globalSettings = ref({
    theme: 'light',
    language: 'zh-CN',
    autoSave: true,
    globalRules: {}
  })

  // TXT 分镜解析配置（持久化到 localStorage，跨设备不同步）
  // 起始标记：一行一个，支持字符串前缀或正则表达式（用 /.../ 包裹表示正则）
  // 字段映射：一行一个，格式 "原字段名=>目标字段名"
  // 单行分隔符：紧凑单行格式中字段之间的分隔字符（多个用空格或换行分隔）
  // 提示词模板：{视角}、{角色动作与构图}、{灯光气氛}、{场景环境} 占位符
  const defaultStoryboardParser = {
    startMarkers: [
      '^--\\s*分镜\\s*\\d+',
      '^###\\s*分镜\\s*\\d+',
      '^分镜\\s*\\d+',
      '^分镜\\s*\\d+\\.',
      '^\\d+\\.\\s*视角[：:]',
      '^\\d+\\.\\s+视角[：:]'
    ],
    fieldMappings: [
      '视角=>视角',
      '角色位置关系=>角色动作与构图',
      '角色关系与构图=>角色动作与构图',
      '角色动作与构图=>角色动作与构图',
      '动作=>角色动作与构图',
      '打光=>灯光气氛',
      '灯光气氛=>灯光气氛',
      '灯光=>灯光气氛',
      '场景=>场景环境',
      '场景环境=>场景环境',
      '环境=>场景环境'
    ],
    fieldSeparators: [';', '；'],
    promptTemplate: '视角：{视角}\n角色动作与构图：{角色动作与构图}\n灯光气氛：{灯光气氛}\n场景环境：{场景环境}'
  }
  const storyboardParser = ref({ ...defaultStoryboardParser })

  function loadStoryboardParser() {
    try {
      const stored = localStorage.getItem('storyboard_parser_config')
      if (stored) {
        const parsed = JSON.parse(stored)
        storyboardParser.value = {
          startMarkers: Array.isArray(parsed.startMarkers) ? parsed.startMarkers : defaultStoryboardParser.startMarkers,
          fieldMappings: Array.isArray(parsed.fieldMappings) ? parsed.fieldMappings : defaultStoryboardParser.fieldMappings,
          fieldSeparators: Array.isArray(parsed.fieldSeparators) ? parsed.fieldSeparators : defaultStoryboardParser.fieldSeparators,
          promptTemplate: typeof parsed.promptTemplate === 'string' ? parsed.promptTemplate : defaultStoryboardParser.promptTemplate
        }
      }
    } catch (e) {
      console.warn('[Config] 加载分镜解析配置失败:', e)
    }
  }

  function saveStoryboardParser() {
    try {
      localStorage.setItem('storyboard_parser_config', JSON.stringify(storyboardParser.value))
      return true
    } catch (e) {
      console.error('[Config] 保存分镜解析配置失败:', e)
      return false
    }
  }

  function resetStoryboardParser() {
    storyboardParser.value = { ...defaultStoryboardParser }
    try { localStorage.removeItem('storyboard_parser_config') } catch (e) {}
  }

  // 初始化时加载
  loadStoryboardParser()

  const aiProviders = ref([])

  // 多配置列表（设置页管理）
  const aiConfigs = ref([])
  const aiConfigCategories = ref([])
  const comfyuiConfigs = ref([])
  const comfyuiConfigCategories = ref([])
  // 当前激活的 AI / ComfyUI 配置 ID
  const activeAiConfigId = ref(null)
  const activeComfyuiConfigId = ref(null)
  // 所有激活的 ComfyUI 配置 ID（支持多个同时激活）
  const activeComfyuiConfigIds = ref([])

  const getCurrentDateFolder = () => {
    const now = new Date()
    return `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}`
  }

  const initConfig = () => {
    config.value.downloadDir = getCurrentDateFolder()
  }

  const isLocalComfyUI = () => {
    const url = config.value.comfyuiUrl.toLowerCase()
    return url.includes('127.0.0.1') || url.includes('localhost')
  }

  const getApiBaseUrl = () => {
    if (isLocalComfyUI()) return '/api'
    return config.value.comfyuiUrl.endsWith('/') ? config.value.comfyuiUrl : config.value.comfyuiUrl + '/'
  }

  const getAiApiBaseUrl = () => {
    if (aiConfig.value.provider === 'openrouter') return '/ai-api'
    if (aiConfig.value.provider === 'siliconflow') return '/siliconflow-api'
    if (aiConfig.value.provider === 'openai') return '/openai-api'
    if (aiConfig.value.provider === 'aliyun') return '/aliyun-api'
    if (aiConfig.value.provider === 'google') {
      return aiConfig.value.useProxy ? `/google-proxy-api/v1beta` : '/google-api'
    }
    if (aiConfig.value.provider === 'lmstudio') return '/lmstudio-api'
    if (aiConfig.value.provider === 'modelscope') return '/modelscope-api'
    return aiConfig.value.apiUrl.endsWith('/') ? aiConfig.value.apiUrl.slice(0, -1) : aiConfig.value.apiUrl
  }

  const saveConfig = async () => {
    if (!apiClient.isLoggedIn()) {
      console.warn('[Config] 未登录，无法保存配置')
      return
    }
    try {
      // 1) 保存连接信息到激活的 ComfyUI 配置行
      if (activeComfyuiConfigId.value) {
        await apiClient.updateComfyuiConfig(activeComfyuiConfigId.value, {
          comfyui_url: config.value.comfyuiUrl,
          download_dir: config.value.downloadDir,
          auto_download: config.value.autoDownload,
          filename_prefix: config.value.filenamePrefix
        })
      }
      // 2) customWorkflow / chatWorkflowId 仍存 user_configs（未迁移）
      await apiClient.saveConfig('comfyui_settings', {
        comfyuiUrl: config.value.comfyuiUrl,
        downloadDir: config.value.downloadDir,
        autoDownload: config.value.autoDownload,
        customWorkflow: customWorkflow.value,
        chatWorkflowId: chatWorkflowId.value
      })
      console.log('[Config] ✓ 配置已保存到数据库')
    } catch (e) {
      console.error('[Config] ✗ 保存配置失败:', e)
    }
  }

  const saveAIConfig = async () => {
    if (!apiClient.isLoggedIn()) {
      console.warn('[Config] 未登录，无法保存AI配置')
      return
    }
    console.log('💾 保存AI配置:', {
      provider: aiConfig.value.provider,
      model: aiConfig.value.model,
      models: { ...aiConfig.value.models }
    })
    aiConfig.value.apiKeys[aiConfig.value.provider] = aiConfig.value.apiKey
    aiConfig.value.models[aiConfig.value.provider] = aiConfig.value.model
    console.log('✅ 已保存模型映射:', aiConfig.value.models)

    try {
      // 1) 保存到激活的 AI 配置行
      if (activeAiConfigId.value) {
        await apiClient.updateAiConfig(activeAiConfigId.value, {
          provider: aiConfig.value.provider,
          api_key: aiConfig.value.apiKey,
          api_url: aiConfig.value.apiUrl,
          model: aiConfig.value.model,
          use_proxy: aiConfig.value.useProxy,
          proxy_port: aiConfig.value.proxyPort,
          enable_thinking: aiConfig.value.enableThinking
        })
      }
      // 2) apiKeys/models/enableThinkingByProvider/tested_models 仍存 user_configs（列表表未覆盖）
      await apiClient.saveConfig('ai_config', {
        provider: aiConfig.value.provider,
        apiKey: aiConfig.value.apiKey,
        apiKeys: aiConfig.value.apiKeys,
        apiUrl: aiConfig.value.apiUrl,
        model: aiConfig.value.model,
        models: aiConfig.value.models,
        useProxy: aiConfig.value.useProxy,
        proxyPort: aiConfig.value.proxyPort,
        enableThinking: aiConfig.value.enableThinking,
        enableThinkingByProvider: aiConfig.value.enableThinkingByProvider,
        maxTokens: aiConfig.value.maxTokens,
        temperature: aiConfig.value.temperature,
        topP: aiConfig.value.topP,
        frequencyPenalty: aiConfig.value.frequencyPenalty,
        presencePenalty: aiConfig.value.presencePenalty,
        imageMaxTokens: aiConfig.value.imageMaxTokens
      })
      const testedModelsCopy = JSON.parse(JSON.stringify(testedModels.value))
      console.log('[Config] 📤 保存 tested_models 到数据库:', testedModelsCopy)
      await apiClient.saveConfig('tested_models', testedModelsCopy)
      console.log('[Config] ✓ AI配置已保存到数据库')
    } catch (e) {
      console.error('[Config] ✗ 保存AI配置失败:', e)
    }
  }

  const addTestedModel = async (provider, modelId, modelName) => {
    if (!testedModels.value[provider]) {
      testedModels.value[provider] = []
    }
    const exists = testedModels.value[provider].find(m => m.id === modelId)
    if (!exists) {
      testedModels.value[provider].push({
        id: modelId,
        name: modelName || modelId,
        provider: provider,
        testedAt: new Date().toISOString()
      })
      
      if (apiClient.isLoggedIn()) {
        try {
          const testedModelsCopy = JSON.parse(JSON.stringify(testedModels.value))
          console.log('[Config] 📤 保存 tested_models 到数据库 (addTestedModel):', testedModelsCopy)
          await apiClient.saveConfig('tested_models', testedModelsCopy)
          console.log('[Config] ✓ 已测试模型已保存到数据库:', modelId)
        } catch (e) {
          console.error('[Config] ✗ 保存已测试模型到数据库失败:', e)
        }
      } else {
        console.warn('[Config] 未登录，无法保存已测试模型')
      }
    }
  }

  const removeTestedModel = async (provider, modelId) => {
    if (testedModels.value[provider]) {
      const index = testedModels.value[provider].findIndex(m => m.id === modelId)
      if (index > -1) {
        testedModels.value[provider].splice(index, 1)
        
        if (apiClient.isLoggedIn()) {
          try {
            const testedModelsCopy = JSON.parse(JSON.stringify(testedModels.value))
            await apiClient.saveConfig('tested_models', testedModelsCopy)
            console.log('[Config] ✓ 已从数据库移除模型:', modelId)
          } catch (e) {
            console.error('[Config] ✗ 从数据库移除模型失败:', e)
          }
        } else {
          console.warn('[Config] 未登录，无法移除模型')
        }
      }
    }
  }

  const saveWorkflowToDB = async () => {
    if (!customWorkflow.value) return
    if (!apiClient.isLoggedIn()) {
      console.warn('[Config] 未登录，无法保存工作流')
      return
    }
    try {
      await apiClient.saveConfig('workflow_data', {
        data: customWorkflow.value,
        filename: workflowFilename.value
      })
      console.log('[Config] ✓ 工作流已保存到数据库')
    } catch (e) {
      console.error('[Config] ✗ 保存工作流失败:', e)
    }
  }

  // 加载激活的 AI 配置到 aiConfig（响应式）
  async function applyActiveAiConfig() {
    try {
      const active = await apiClient.getActiveAiConfig()
      if (active) {
        const prevId = activeAiConfigId.value
        activeAiConfigId.value = active.id
        activeAiConfigName.value = active.name || active.model || `配置#${active.id}`
        if (prevId !== null && prevId !== active.id) {
          // 换了配置，之前的"在线"结论作废，下次发消息会重新探测
          isAIOnline.value = false
          aiConnError.value = ''
        }
        skipModelRestore = true
        aiConfig.value.provider = active.provider || 'siliconflow'
        aiConfig.value.apiKey = active.api_key || ''
        aiConfig.value.apiUrl = active.api_url || ''
        aiConfig.value.model = active.model || ''
        aiConfig.value.useProxy = !!active.use_proxy
        aiConfig.value.proxyPort = active.proxy_port || '7890'
        aiConfig.value.enableThinking = !!active.enable_thinking
        // 加载模型参数（每个 API 配置独立存储）
        if (active.temperature !== undefined && active.temperature !== null) aiConfig.value.temperature = active.temperature
        if (active.top_p !== undefined && active.top_p !== null) aiConfig.value.topP = active.top_p
        if (active.max_tokens !== undefined && active.max_tokens !== null) aiConfig.value.maxTokens = active.max_tokens
        if (active.frequency_penalty !== undefined && active.frequency_penalty !== null) aiConfig.value.frequencyPenalty = active.frequency_penalty
        if (active.presence_penalty !== undefined && active.presence_penalty !== null) aiConfig.value.presencePenalty = active.presence_penalty
        if (active.image_max_tokens !== undefined && active.image_max_tokens !== null) aiConfig.value.imageMaxTokens = active.image_max_tokens
        previousProvider = aiConfig.value.provider
        if (aiConfig.value.apiKeys && aiConfig.value.apiKeys[aiConfig.value.provider]) {
          aiConfig.value.apiKey = aiConfig.value.apiKeys[aiConfig.value.provider] || aiConfig.value.apiKey
        }
        console.log('[Config] ✓ 已加载激活 AI 配置:', active.name)
      }
    } catch (e) {
      console.error('[Config] ✗ 加载激活 AI 配置失败:', e)
    }
  }

  // 加载激活的 ComfyUI 配置到 config（响应式，支持多个激活）
  async function applyActiveComfyuiConfig() {
    try {
      const list = await apiClient.getActiveComfyuiConfigs()
      const arr = Array.isArray(list) ? list : []
      activeComfyuiConfigIds.value = arr.map(c => c.id)
      if (arr.length > 0) {
        const active = arr[0]
        activeComfyuiConfigId.value = active.id
        config.value.comfyuiUrl = active.comfyui_url || 'http://127.0.0.1:8188'
        config.value.downloadDir = active.download_dir || getCurrentDateFolder()
        config.value.autoDownload = !!active.auto_download
        config.value.filenamePrefix = active.filename_prefix || 'ComfyUI'
        console.log('[Config] ✓ 已加载激活 ComfyUI 配置:', active.name, '共', arr.length, '个激活')
      } else {
        activeComfyuiConfigId.value = null
      }
    } catch (e) {
      console.error('[Config] ✗ 加载激活 ComfyUI 配置失败:', e)
    }
  }

  // 切换某个 ComfyUI 配置的激活状态（支持多激活）
  async function toggleActiveComfyuiConfig(id) {
    await apiClient.toggleActiveComfyuiConfig(id)
    await applyActiveComfyuiConfig()
    await loadComfyuiConfigs()
  }

  // 加载 AI / ComfyUI 配置列表（供设置页使用）
  async function loadAiConfigs() {
    aiConfigs.value = await apiClient.getAiConfigs()
  }
  async function loadAiConfigCategories() {
    aiConfigCategories.value = await apiClient.getAiConfigCategories()
  }
  async function loadComfyuiConfigs() {
    comfyuiConfigs.value = await apiClient.getComfyuiConfigs()
  }
  async function loadComfyuiConfigCategories() {
    comfyuiConfigCategories.value = await apiClient.getComfyuiConfigCategories()
  }

  // 切换激活 AI 配置
  async function setActiveAiConfig(id) {
    await apiClient.setActiveAiConfig(id)
    await applyActiveAiConfig()
    await loadAiConfigs()
  }
  // 切换激活 ComfyUI 配置
  async function setActiveComfyuiConfig(id) {
    await apiClient.setActiveComfyuiConfig(id)
    await applyActiveComfyuiConfig()
    await loadComfyuiConfigs()
  }

  async function loadConfigsFromDB() {
    if (!apiClient.isLoggedIn()) {
      console.log('[Config] 未登录，跳过从数据库加载')
      return
    }
    try {
      const configs = await apiClient.getConfigs()
      if (!configs || typeof configs !== 'object') return

      // 从 user_configs 加载 apiKeys/models/enableThinkingByProvider 等扩展字段
      const aiData = configs.ai_config
      if (aiData) {
        const parsed = typeof aiData === 'string' ? JSON.parse(aiData) : aiData
        // 仅合并扩展字段（apiKeys/models/enableThinkingByProvider），主字段由激活配置覆盖
        if (parsed.apiKeys) aiConfig.value.apiKeys = parsed.apiKeys
        if (parsed.models) aiConfig.value.models = parsed.models
        if (parsed.enableThinkingByProvider) aiConfig.value.enableThinkingByProvider = parsed.enableThinkingByProvider
        if (parsed.maxTokens != null) aiConfig.value.maxTokens = parsed.maxTokens
        if (parsed.temperature != null) aiConfig.value.temperature = parsed.temperature
        if (parsed.topP != null) aiConfig.value.topP = parsed.topP
        if (parsed.frequencyPenalty != null) aiConfig.value.frequencyPenalty = parsed.frequencyPenalty
        if (parsed.presencePenalty != null) aiConfig.value.presencePenalty = parsed.presencePenalty
        if (parsed.imageMaxTokens != null) aiConfig.value.imageMaxTokens = parsed.imageMaxTokens
      }

      // 从激活配置行加载主连接字段
      await applyActiveAiConfig()

      // 确保新添加的字段存在（兼容旧数据）
      if (!aiConfig.value.enableThinkingByProvider) {
        aiConfig.value.enableThinkingByProvider = {
          siliconflow: false, openai: false, openrouter: false, aliyun: false,
          google: false, lmstudio: false, modelscope: false, custom: false
        }
      }
      if (aiConfig.value.apiKeys && aiConfig.value.apiKeys[aiConfig.value.provider]) {
        aiConfig.value.apiKey = aiConfig.value.apiKeys[aiConfig.value.provider]
      }

      // 从激活 ComfyUI 配置行加载连接字段
      await applyActiveComfyuiConfig()

      // chatWorkflowId / customWorkflow 仍来自 user_configs
      const comfyuiData = configs.comfyui_settings
      if (comfyuiData) {
        const parsed = typeof comfyuiData === 'string' ? JSON.parse(comfyuiData) : comfyuiData
        if (parsed.chatWorkflowId != null) chatWorkflowId.value = Number(parsed.chatWorkflowId) || 0
        if (parsed.customWorkflow !== undefined) customWorkflow.value = parsed.customWorkflow
      }

      const testedModelsData = configs.tested_models
      if (testedModelsData) {
        const parsed = typeof testedModelsData === 'string' ? JSON.parse(testedModelsData) : testedModelsData
        console.log('[Config] 📥 从数据库加载 tested_models 原始数据:', parsed)
        if (parsed && typeof parsed === 'object') {
          Object.keys(parsed).forEach(provider => {
            if (Array.isArray(parsed[provider])) {
              testedModels.value[provider] = parsed[provider]
            }
          })
          console.log('[Config] ✓ 已从数据库加载已测试模型:', JSON.stringify(testedModels.value))
        }
      } else {
        console.log('[Config] ℹ️ 数据库中没有已测试模型数据')
      }

      const wfData = configs.workflow_data
      if (wfData) {
        const parsed = typeof wfData === 'string' ? JSON.parse(wfData) : wfData
        if (parsed.data) customWorkflow.value = parsed.data
        if (parsed.filename) {
          workflowFilename.value = parsed.filename
          workflowMessage.value = `已加载工作流: ${parsed.filename}`
        }
      }
      
      console.log('[Config] ✓ 配置已从数据库加载')
    } catch (e) {
      console.error('[Config] ✗ 从数据库加载配置失败:', e)
    }
  }

  const loadConfig = async () => {
    if (apiClient.isLoggedIn()) {
      await loadConfigsFromDB()
    } else {
      console.log('[Config] 未登录，跳过加载配置')
      initConfig()
    }
  }

  async function syncToDB() {
    if (!apiClient.isLoggedIn()) {
      console.warn('[Config] 未登录，无法同步到数据库')
      return
    }
    
    isLoading.value = true
    try {
      await apiClient.saveConfig('ai_providers', {
        providers: aiProviders.value,
        currentProvider: aiConfig.value.provider,
        apiKeyMasked: aiConfig.value.apiKey ? '***' : '',
        apiUrl: aiConfig.value.apiUrl,
        model: aiConfig.value.model,
        useProxy: aiConfig.value.useProxy,
        proxyPort: aiConfig.value.proxyPort
      })
      
      await apiClient.saveConfig('global_settings', {
        ...globalSettings.value,
        comfyuiUrl: config.value.comfyuiUrl,
        downloadDir: config.value.downloadDir,
        autoDownload: config.value.autoDownload,
        customWorkflow: customWorkflow.value
      })
      
      lastSyncTime.value = new Date().toISOString()
      console.log('[Config] ✓ 同步到数据库完成')
    } catch (error) {
      console.error('[Config] ✗ 同步到数据库失败:', error)
      lastSyncTime.value = new Date().toISOString()
    } finally {
      isLoading.value = false
    }
  }

  let saveTimeout = null
  function autoSave() {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(async () => {
      if (apiClient.isLoggedIn() && isOnline.value) {
        await syncToDB()
      }
    }, 1000)
  }

  const exportData = () => ({
    config: config.value,
    aiConfig: aiConfig.value,
    customWorkflow: customWorkflow.value,
    exportTime: new Date().toISOString(),
    version: '3.0',
    source: 'ai-character-platform-local-db'
  })

  const importData = async (data) => {
    if (data.config) Object.assign(config.value, data.config)
    if (data.aiConfig) {
      skipModelRestore = true
      Object.assign(aiConfig.value, data.aiConfig)
      previousProvider = aiConfig.value.provider
    }
    if (data.customWorkflow) customWorkflow.value = data.customWorkflow
    await autoSave()
  }

  const resetToDefaults = async (skipSync = false) => {
    config.value = {
      comfyuiUrl: 'http://127.0.0.1:8188',
      downloadDir: getCurrentDateFolder(),
      autoDownload: false,
      filenamePrefix: 'ComfyUI'
    }
    aiConfig.value = {
      provider: 'siliconflow',
      apiKey: '',
      apiKeys: { siliconflow: '', openai: '', openrouter: '', aliyun: '', google: '', lmstudio: '', modelscope: '', custom: '' },
      apiUrl: 'https://api.siliconflow.cn/v1',
      model: 'Qwen/Qwen2.5-7B-Instruct',
      models: {
        siliconflow: 'Qwen/Qwen2.5-7B-Instruct',
        openai: 'gpt-4o',
        openrouter: 'openai/gpt-4o',
        aliyun: 'qwen-plus',
        google: 'gemini-2.5-flash',
        lmstudio: '',
        modelscope: 'qwen2.5-7b-instruct',
        custom: ''
      },
      useProxy: false,
      proxyPort: '7890',
      enableThinking: false,
      maxTokens: 4000,
      temperature: 0.8,
      topP: 1.0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      imageMaxTokens: 2000
    }
    testedModels.value = {
      siliconflow: [],
      openai: [],
      openrouter: [],
      aliyun: [],
      google: [],
      lmstudio: [],
      modelscope: [],
      custom: []
    }
    customWorkflow.value = null
    chatWorkflowId.value = 0
    workflowFilename.value = ''
    workflowMessage.value = ''
    if (!skipSync) {
      await syncToDB()
    }
  }

  const currentWorkflow = computed(() => customWorkflow.value || defaultWorkflow)

  window.addEventListener('online', () => {
    isOnline.value = true
    if (lastSyncTime.value) syncToDB()
  })

  window.addEventListener('offline', () => {
    isOnline.value = false
  })

  return {
    config,
    aiConfig,
    testedModels,
    customWorkflow,
    chatWorkflowId,
    workflowMessage,
    workflowFilename,
    isServerOnline,
    isComfyUIOnline,
    isAIOnline,
    aiConnError,
    activeAiConfigName,
    aiAutoSwitchNotice,
    serverStatusText,
    comfyuiStatusText,
    aiStatusText,
    globalSettings,
    aiProviders,
    aiConfigs,
    aiConfigCategories,
    comfyuiConfigs,
    comfyuiConfigCategories,
    activeAiConfigId,
    activeComfyuiConfigId,
    activeComfyuiConfigIds,
    currentWorkflow,
    isLoading,
    lastSyncTime,
    isOnline,
    initConfig,
    isLocalComfyUI,
    getApiBaseUrl,
    getAiApiBaseUrl,
    saveConfig,
    saveAIConfig,
    addTestedModel,
    removeTestedModel,
    saveWorkflowToDB,
    loadConfig,
    loadConfigsFromDB,
    syncToDB,
    autoSave,
    exportData,
    importData,
    resetToDefaults,
    setSkipModelRestore,
    applyActiveAiConfig,
    applyActiveComfyuiConfig,
    loadAiConfigs,
    loadAiConfigCategories,
    loadComfyuiConfigs,
    loadComfyuiConfigCategories,
    setActiveAiConfig,
    setActiveComfyuiConfig,
    toggleActiveComfyuiConfig,
    storyboardParser,
    saveStoryboardParser,
    resetStoryboardParser
  }
})
