import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiClient } from '@/services/api'

function safeParse(s) {
  try { return JSON.parse(s || '[]') } catch { return [] }
}

function safeParseObj(s) {
  try { return JSON.parse(s || '{}') } catch { return {} }
}

export const useCharacterStore = defineStore('character', () => {
  // 独立角色实体数组
  const characters = ref([])
  // 团队数组
  const teams = ref([])
  // 角色分类
  const characterCategories = ref([])
  // 团队分类
  const teamCategories = ref([])
  const currentTeamId = ref(null)
  // 当前编辑的角色 ID
  const currentCharacterId = ref(null)
  // 全局规则引用
  const globalRuleRefs = ref({
    systemRuleIds: [],
    chatRuleIds: [],
    dialogueRuleIds: []
  })
  const contextIsolation = ref(true)
  const isLoading = ref(false)

  // === getters ===
  const currentTeam = computed(() => teams.value.find(t => t.id === currentTeamId.value) || null)

  const currentCharacter = computed(() =>
    characters.value.find(c => c.id === currentCharacterId.value) || null
  )

  // 角色分类（含"全部"）
  const allCharacterCategories = computed(() => {
    return [{ id: 'all', name: '全部', is_system: false }, ...characterCategories.value]
  })

  // 团队分类（含"全部"）
  const allTeamCategories = computed(() => {
    return [{ id: 'all', name: '全部', is_system: false }, ...teamCategories.value]
  })

  function getCharacterCategoryName(id) {
    if (id === 0 || id === undefined) return '未分类'
    const c = characterCategories.value.find(x => x.id === id)
    return c ? c.name : '未分类'
  }

  function getTeamCategoryName(id) {
    if (id === 0 || id === undefined) return '未分类'
    const c = teamCategories.value.find(x => x.id === id)
    return c ? c.name : '未分类'
  }

  function getCharacterCategoryCount(catId) {
    if (catId === 'all') return characters.value.length
    return characters.value.filter(c => c.category_id === catId).length
  }

  function getTeamCategoryCount(catId) {
    if (catId === 'all') return teams.value.length
    return teams.value.filter(t => t.category_id === catId).length
  }

  function charactersByCategory(catId) {
    if (catId === 'all' || catId === undefined) return characters.value
    return characters.value.filter(c => c.category_id === catId)
  }

  function teamsByCategory(catId) {
    if (catId === 'all' || catId === undefined) return teams.value
    return teams.value.filter(t => t.category_id === catId)
  }

  // 当前团队成员配置解析
  const currentMembers = computed(() => {
    if (!currentTeam.value) return []
    return safeParse(currentTeam.value.member_config)
  })

  // 激活的 AI 角色（排除用户角色）
  const activeCharacters = computed(() => {
    return currentMembers.value
      .filter(m => m.is_active && !m.is_user)
      .map(m => characters.value.find(c => c.id === m.character_id))
      .filter(Boolean)
  })

  // 用户扮演的角色
  const userCharacter = computed(() => {
    const m = currentMembers.value.find(m => m.is_user)
    return m ? characters.value.find(c => c.id === m.character_id) : null
  })

  // 所有团队成员（含用户角色）
  const allTeamCharacters = computed(() => {
    return currentMembers.value
      .map(m => characters.value.find(c => c.id === m.character_id))
      .filter(Boolean)
  })

  // === 规则文件缓存（来自文件库可调用文件夹） ===
  const ruleFiles = ref([])
  const ruleFileMap = computed(() => {
    const m = new Map()
    ruleFiles.value.forEach(f => m.set(f.id, f))
    return m
  })

  async function loadRuleFiles() {
    try {
      ruleFiles.value = await apiClient.getCallableFiles('rule')
    } catch (e) {
      console.error('加载可调用规则文件失败:', e)
      ruleFiles.value = []
    }
  }

  // 预加载指定 ID 的规则文件（用于补充可调用文件夹之外的规则文件）
  async function preloadRuleFiles(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return
    const missing = ids.filter(id => !ruleFileMap.value.has(id))
    if (missing.length === 0) return
    try {
      const fetched = await Promise.all(
        missing.map(id => apiClient.getFileLibraryFileById(id).catch(() => null))
      )
      for (const f of fetched) {
        if (f && f.id && !ruleFileMap.value.has(f.id)) {
          ruleFiles.value.push(f)
        }
      }
    } catch (e) {
      console.error('预加载规则文件失败:', e)
    }
  }

  // === 规则解析辅助（从文件库规则文件中获取内容） ===
  function resolveRules(ruleIds) {
    if (!Array.isArray(ruleIds) || ruleIds.length === 0) return ''
    return ruleIds
      .map(id => ruleFileMap.value.get(id))
      .filter(Boolean)
      .map(r => r.content)
      .filter(Boolean)
      .join('\n\n')
  }

  function parseCharRuleRefs(character) {
    const defaults = { chatRuleIds: [], chatRuleText: '' }
    if (!character || !character.rule_refs) return defaults
    const refs = typeof character.rule_refs === 'string' ? safeParseObj(character.rule_refs) : character.rule_refs
    return {
      chatRuleIds: refs.chatRuleIds || [],
      chatRuleText: refs.chatRuleText || ''
    }
  }

  // 默认功能规则（用户可在角色编辑中自定义覆盖）
  const DEFAULT_FUNCTION_RULES = `当用户的对话内容需要调用某个功能时，请在回复内容的末尾单独一行添加功能调用标记，格式为 [调用功能:功能名称]。
例如：用户要求生成图片时，输出 [调用功能:文生图]。
如果不需要调用任何功能，正常回复即可，不要添加任何标记。
一次回复最多调用一个功能。`

  // 功能库缓存（供角色编辑时选择）
  const functions = ref([])

  async function loadFunctions() {
    try {
      functions.value = await apiClient.getFunctions()
    } catch (e) {
      console.error('加载功能库失败:', e)
      functions.value = []
    }
  }

  function getFunctionById(id) {
    return functions.value.find(f => f.id === id) || null
  }

  // 解析角色"开启功能"配置（新结构：enabled + selectedFunctionIds + functionRules + functionRuleFileIds）
  function parseCharFuncConfig(character) {
    const defaults = { enabled: false, selectedFunctionIds: [], functionRules: '', functionRuleFileIds: [] }
    if (!character || !character.function_config) return defaults
    const cfg = typeof character.function_config === 'string' ? safeParseObj(character.function_config) : character.function_config
    // 兼容旧结构 { imageGen: {...} }，旧结构视为未开启
    if (cfg && cfg.imageGen && cfg.enabled === undefined) return defaults
    return {
      enabled: !!cfg?.enabled,
      selectedFunctionIds: Array.isArray(cfg?.selectedFunctionIds) ? cfg.selectedFunctionIds : [],
      functionRules: cfg?.functionRules || '',
      functionRuleFileIds: Array.isArray(cfg?.functionRuleFileIds) ? cfg.functionRuleFileIds : []
    }
  }

  // 判断角色是否开启了功能（供对话页面决定是否启用图片输入等）
  function isCharacterFunctionEnabled(character) {
    if (!character) return false
    const cfg = parseCharFuncConfig(character)
    return cfg.enabled && cfg.selectedFunctionIds.length > 0
  }

  // 获取角色已选择的功能对象列表
  function getCharacterFunctions(character) {
    const cfg = parseCharFuncConfig(character)
    if (!cfg.enabled) return []
    return cfg.selectedFunctionIds
      .map(id => functions.value.find(f => f.id === id))
      .filter(Boolean)
  }

  // === generateSystemPrompt 改造（核心）===
  const generateSystemPrompt = (characterList, isImageMode = false, isSharedContext = false) => {
    if (!Array.isArray(characterList)) characterList = [characterList]
    if (characterList.length === 0) return ''
    characterList = characterList.filter(Boolean)
    if (characterList.length === 0) return ''

    const systemRulesText = resolveRules(globalRuleRefs.value.systemRuleIds)
    const chatRulesText = resolveRules(globalRuleRefs.value.chatRuleIds)
    const dialogueRulesText = resolveRules(globalRuleRefs.value.dialogueRuleIds)

    const userInfo = userCharacter.value
    const userInfoText = userInfo ? `\n\n## 与你对话的用户信息\n用户名字：${userInfo.name}\n用户描述：${userInfo.description || ''}` : ''

    if (characterList.length === 1) {
      const c = characterList[0]
      const refs = parseCharRuleRefs(c)
      // 对话规则 = 拖入的规则文件内容 + 角色专属对话规则文本
      const charChatFileText = resolveRules(refs.chatRuleIds)
      const charChatText = [charChatFileText, refs.chatRuleText].filter(Boolean).join('\n\n')

      const isolationHint = isSharedContext
        ? `【重要：多角色共享上下文模式，只以${c.name}身份发言，不替其他角色说话。】`
        : `【重要：单角色模式，只有${c.name}参与对话。】`

      let prompt = `${isolationHint}\n\n你是一个有独特个性的角色，名叫${c.name}。\n\n## 你的角色设定\n${c.description || ''}`
      if (c.gender) prompt += `\n性别：${c.gender}`
      prompt += `\n\n## 系统规则\n${systemRulesText}${userInfoText}`
      prompt += `\n\n## 输出格式\n每次回复必须以【${c.name}】开头，然后是${c.name}的对话内容。不要添加其他角色的对话。\n\n## 严格禁止（必须遵守）\n直接以【${c.name}】开头输出最终对话内容，严禁输出任何思考、分析、推理、草稿等中间过程，包括但不限于：角色分析、情境分析、当前角色状态、回应策略、细节填充、字数检查、草稿构思、优化润色、最终输出结构等。只输出对话本身，不要解释你是如何得出回复的。`

      // 对话规则：角色专属（文件+文本）优先，否则使用全局
      const chatRuleText = charChatText || chatRulesText
      let finalPrompt = prompt + `\n\n## 对话规则\n${chatRuleText}`
      // 追加"开启功能"相关规则（功能选择 + 功能规则）
      finalPrompt = appendFunctionRules(finalPrompt, c)
      return finalPrompt
    }

    // 多角色模板
    const charDescs = characterList.map((c, i) => {
      let desc = `### 角色${i + 1}：${c.name}\n${c.description || ''}`
      if (c.gender) desc += `\n性别：${c.gender}`
      return desc
    }).join('\n\n')
    const names = characterList.map(c => c.name).join('、')

    let prompt = `你是一个多角色扮演AI，需同时扮演${characterList.length}个角色（${names}）。\n\n## 角色设定\n${charDescs}\n\n## 系统规则\n${systemRulesText}${userInfoText}\n\n## 多角色对话规则\n${dialogueRulesText}`

    return prompt + `\n\n## 对话规则\n${chatRulesText}\n\n## 输出格式\n所有选中角色都要发言，格式：\n【角色名】（对话内容）\n\n## 严格禁止（必须遵守）\n直接以【角色名】开头输出最终对话内容，严禁输出任何思考、分析、推理、草稿等中间过程，包括但不限于：角色分析、情境分析、当前角色状态、回应策略、细节填充、字数检查、草稿构思、优化润色、最终输出结构等。只输出对话本身，不要解释你是如何得出回复的。`
  }

  // 在系统提示词末尾追加"开启功能"相关规则（功能清单 + 功能规则）
  // 功能规则 = 拖入的规则文件内容 + 输入框文本（不硬编码：规则文本来自用户配置）
  function appendFunctionRules(prompt, character) {
    const cfg = parseCharFuncConfig(character)
    if (!cfg.enabled || cfg.selectedFunctionIds.length === 0) return prompt
    const funcs = getCharacterFunctions(character)
    if (funcs.length === 0) return prompt
    const funcList = funcs.map(f => `- ${f.name}${f.description ? `（${f.description}）` : ''}`).join('\n')
    // 功能规则 = 拖入文件内容 + 输入框文本
    const fileRulesText = resolveRules(cfg.functionRuleFileIds)
    const textboxRules = cfg.functionRules && cfg.functionRules.trim() ? cfg.functionRules.trim() : ''
    const rules = [fileRulesText, textboxRules].filter(Boolean).join('\n\n') || DEFAULT_FUNCTION_RULES
    return prompt + `\n\n## 可用功能\n你可以在回复中调用以下功能：\n${funcList}\n\n## 功能调用规则\n${rules}`
  }

  // === 加载 ===
  async function loadCharacters() {
    characters.value = await apiClient.getCharacters()
  }

  async function loadTeams() {
    teams.value = await apiClient.getTeams()
  }

  async function loadCharacterCategories() {
    characterCategories.value = await apiClient.getCharacterCategories()
  }

  async function loadTeamCategories() {
    teamCategories.value = await apiClient.getTeamCategories()
  }

  async function loadGlobalRuleRefs() {
    const cfg = await apiClient.getConfigs('global_rule_refs')
    if (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) {
      globalRuleRefs.value = {
        systemRuleIds: cfg.systemRuleIds || [],
        chatRuleIds: cfg.chatRuleIds || [],
        dialogueRuleIds: cfg.dialogueRuleIds || []
      }
    }
  }

  async function loadAll() {
    isLoading.value = true
    try {
      await Promise.all([
        loadCharacters(),
        loadTeams(),
        loadGlobalRuleRefs(),
        loadCharacterCategories(),
        loadTeamCategories(),
        loadRuleFiles(),
        loadFunctions()
      ])
      // 确保至少有一个团队
      if (teams.value.length === 0) {
        await createTeam('默认团队')
      }
      if (!currentTeamId.value && teams.value[0]) {
        currentTeamId.value = teams.value[0].id
      }
      if (characters.value.length > 0 && !currentCharacterId.value) {
        currentCharacterId.value = characters.value[0].id
      }
    } finally {
      isLoading.value = false
    }
  }

  // === 角色分类 CRUD ===
  async function createCharacterCategory(name) {
    const c = await apiClient.createCharacterCategory({ name })
    if (c) await loadCharacterCategories()
    return c
  }

  async function updateCharacterCategory(id, data) {
    const c = await apiClient.updateCharacterCategory(id, data)
    if (c) await loadCharacterCategories()
    return c
  }

  async function deleteCharacterCategory(id) {
    const ok = await apiClient.deleteCharacterCategory(id)
    if (ok) await Promise.all([loadCharacterCategories(), loadCharacters()])
    return ok
  }

  // === 团队分类 CRUD ===
  async function createTeamCategory(name) {
    const c = await apiClient.createTeamCategory({ name })
    if (c) await loadTeamCategories()
    return c
  }

  async function updateTeamCategory(id, data) {
    const c = await apiClient.updateTeamCategory(id, data)
    if (c) await loadTeamCategories()
    return c
  }

  async function deleteTeamCategory(id) {
    const ok = await apiClient.deleteTeamCategory(id)
    if (ok) await Promise.all([loadTeamCategories(), loadTeams()])
    return ok
  }

  // === 角色 CRUD ===
  async function createCharacter(data) {
    const c = await apiClient.createCharacter(data)
    if (c) {
      characters.value.push(c)
      currentCharacterId.value = c.id
    }
    return c
  }

  async function updateCharacter(id, data) {
    const c = await apiClient.updateCharacter(id, data)
    if (c) {
      const i = characters.value.findIndex(x => x.id === id)
      if (i > -1) characters.value[i] = c
    }
    return c
  }

  async function deleteCharacter(id) {
    await apiClient.deleteCharacter(id)
    characters.value = characters.value.filter(c => c.id !== id)
    // 从所有团队的 member_config 中移除该角色引用
    for (const t of teams.value) {
      const members = safeParse(t.member_config).filter(m => m.character_id !== id)
      if (members.length !== safeParse(t.member_config).length) {
        await apiClient.updateTeam(t.id, { member_config: members })
      }
    }
    await loadTeams()
    if (currentCharacterId.value === id) {
      currentCharacterId.value = characters.value[0]?.id || null
    }
  }

  // === 团队 CRUD ===
  async function createTeam(name) {
    const t = await apiClient.createTeam({ name, description: '', member_config: [] })
    if (t) {
      teams.value.push(t)
      currentTeamId.value = t.id
    }
    return t
  }

  async function updateTeam(id, data) {
    const t = await apiClient.updateTeam(id, data)
    if (t) {
      const i = teams.value.findIndex(x => x.id === id)
      if (i > -1) teams.value[i] = t
    }
    return t
  }

  async function deleteTeam(id) {
    if (teams.value.length <= 1) return false
    await apiClient.deleteTeam(id)
    teams.value = teams.value.filter(t => t.id !== id)
    if (currentTeamId.value === id) {
      currentTeamId.value = teams.value[0]?.id || null
    }
    return true
  }

  function switchTeam(id) {
    currentTeamId.value = id
  }

  // 团队成员操作
  async function addMember(characterId) {
    const t = currentTeam.value
    if (!t) return
    const members = safeParse(t.member_config)
    if (members.some(m => m.character_id === characterId)) return
    members.push({ character_id: characterId, is_active: true, is_user: false })
    await updateTeam(t.id, { member_config: members })
  }

  async function removeMember(characterId) {
    const t = currentTeam.value
    if (!t) return
    const members = safeParse(t.member_config).filter(m => m.character_id !== characterId)
    await updateTeam(t.id, { member_config: members })
  }

  async function toggleMemberActive(characterId) {
    const t = currentTeam.value
    if (!t) return
    const members = safeParse(t.member_config).map(m =>
      m.character_id === characterId ? { ...m, is_active: !m.is_active } : m
    )
    await updateTeam(t.id, { member_config: members })
  }

  async function setUserCharacter(characterId) {
    const t = currentTeam.value
    if (!t) return
    const members = safeParse(t.member_config).map(m => ({
      ...m,
      is_user: m.character_id === characterId ? !m.is_user : false
    }))
    await updateTeam(t.id, { member_config: members })
  }

  // === 全局规则引用保存 ===
  async function saveGlobalRuleRefs() {
    await apiClient.saveConfig('global_rule_refs', globalRuleRefs.value)
  }

  // === 辅助方法 ===
  function getCharacterById(id) {
    return characters.value.find(c => c.id === id) || null
  }

  function getCharacterName(id) {
    const c = getCharacterById(id)
    return c?.name || 'AI'
  }

  function getCharacterAvatar(id) {
    const c = getCharacterById(id)
    return c?.avatar_url || c?.avatar || null
  }

  return {
    characters,
    teams,
    characterCategories,
    teamCategories,
    currentTeamId,
    currentCharacterId,
    globalRuleRefs,
    contextIsolation,
    isLoading,
    currentTeam,
    currentCharacter,
    currentMembers,
    activeCharacters,
    userCharacter,
    allTeamCharacters,
    allCharacterCategories,
    allTeamCategories,
    generateSystemPrompt,
    resolveRules,
    ruleFiles,
    loadRuleFiles,
    preloadRuleFiles,
    parseCharRuleRefs,
    parseCharFuncConfig,
    isCharacterFunctionEnabled,
    getCharacterFunctions,
    functions,
    loadFunctions,
    getFunctionById,
    DEFAULT_FUNCTION_RULES,
    getCharacterCategoryName,
    getTeamCategoryName,
    getCharacterCategoryCount,
    getTeamCategoryCount,
    charactersByCategory,
    teamsByCategory,
    loadAll,
    loadCharacters,
    loadTeams,
    loadCharacterCategories,
    loadTeamCategories,
    loadGlobalRuleRefs,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    createCharacterCategory,
    updateCharacterCategory,
    deleteCharacterCategory,
    createTeam,
    updateTeam,
    deleteTeam,
    createTeamCategory,
    updateTeamCategory,
    deleteTeamCategory,
    switchTeam,
    addMember,
    removeMember,
    toggleMemberActive,
    setUserCharacter,
    saveGlobalRuleRefs,
    getCharacterById,
    getCharacterName,
    getCharacterAvatar
  }
})
