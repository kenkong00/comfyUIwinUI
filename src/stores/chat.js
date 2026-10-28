import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useConfigStore } from './config'
import { useCharacterStore } from './character'
import { useGenerationStore } from './generation'
import { defaultWorkflow } from '@/config/workflow'
import apiClient from '@/services/api'

export const useChatStore = defineStore('chat', () => {
  const chatMessages = ref([])
  const chatInput = ref('')
  const isAITyping = ref(false)
  const isGeneratingImage = ref(false)
  const generatingCharacterIndex = ref(-1)
  const autoGenerateImage = ref(false)
  const singleImageMode = ref(false)
  const singleImageStatus = ref('')
  const parsedMessagesCache = new Map()
  let currentAbortController = null

  // 暴露 generationStore 的状态文本给模板使用
  const generationStatusText = computed(() => {
    try {
      return useGenerationStore().generationStatus
    } catch { return '' }
  })

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  // 根据配置对象计算 API 基础 URL（支持角色级 ai_config_override）
  const getApiBaseUrlForConfig = (config) => {
    const provider = config.provider
    if (provider === 'openrouter') return '/ai-api'
    if (provider === 'siliconflow') return '/siliconflow-api'
    if (provider === 'openai') return '/openai-api'
    if (provider === 'aliyun') return '/aliyun-api'
    if (provider === 'google') return '/google-api'
    if (provider === 'lmstudio') return '/lmstudio-api'
    if (provider === 'modelscope') return '/modelscope-api'
    const url = config.apiUrl || ''
    return url.endsWith('/') ? url.slice(0, -1) : url
  }

  const clearChat = () => {
    chatMessages.value = []
    parsedMessagesCache.clear()
    autoGenerateImage.value = false
    generatingCharacterIndex.value = -1

    console.log('🧹 已清空对话并重置状态')
  }

  const parseMultiCharacterMessage = (content) => {
    if (!content || typeof content !== 'string') {
      return [{
        characterName: '',
        characterId: null,
        content: ''
      }]
    }

    const characterStore = useCharacterStore()
    const cleanedContent = content.replace(/【[^】]+】/g, '').trim()

    if (!cleanedContent) {
      return [{
        characterName: '',
        characterId: null,
        content: ''
      }]
    }

    const activeChars = characterStore.activeCharacters
    if (activeChars.length === 1) {
      return [{
        characterName: activeChars[0]?.name || '',
        characterId: activeChars[0]?.id || null,
        content: cleanedContent
      }]
    }

    return [{
      characterName: '',
      characterId: null,
      content: cleanedContent
    }]
  }

  const getParsedMessages = (msg, msgIndex, isStreaming = false) => {
    if (!msg) {
      return [{
        characterName: '',
        characterId: null,
        content: '',
        isLast: true
      }]
    }

    if (!msg.content && msg.characterId != null && msg.characterName) {
      return [{
        characterName: msg.characterName,
        characterId: msg.characterId,
        content: '',
        isLast: true
      }]
    }

    if (!msg.content) {
      return [{
        characterName: '',
        characterId: null,
        content: '',
        isLast: true
      }]
    }

    if (msg.isSingleImage) {
      return [{
        characterName: '',
        characterId: null,
        content: msg.content || '',
        isLast: true
      }]
    }

    if (isStreaming) {
    const cleanedContent = (msg.content || '').replace(/【[^】]+】/g, '').trim()

    if (msg.characterId != null && msg.characterName) {
      return [{
        characterName: msg.characterName,
        characterId: msg.characterId,
        content: cleanedContent,
        isLast: true
      }]
    }

    const characterStore = useCharacterStore()
    const activeChars = characterStore.activeCharacters
    if (activeChars.length >= 1) {
      return [{
        characterName: activeChars[0]?.name || '',
        characterId: activeChars[0]?.id || null,
        content: cleanedContent,
        isLast: true
      }]
    }

    return [{
      characterName: '',
      characterId: null,
      content: cleanedContent,
      isLast: true
    }]
  }
    
    const cacheKey = `${msgIndex}-${msg.content}`
    if (parsedMessagesCache.has(cacheKey)) {
      return parsedMessagesCache.get(cacheKey)
    }

    let result
    if (msg.characterId != null) {
      result = [{
        characterName: msg.characterName || '',
        characterId: msg.characterId,
        content: (msg.content || '').replace(/【[^】]+】/g, '').trim(),
        isLast: true
      }]
    } else {
      result = parseMultiCharacterMessage(msg.content)
      if (result.length > 0) {
        result[result.length - 1].isLast = true
      }
    }

    parsedMessagesCache.set(cacheKey, result)
    return result
  }

  const callAIAssistantStream = async function* (userMessage, singleCharacter = null) {
    const configStore = useConfigStore()
    const characterStore = useCharacterStore()

    const targetCharacter = singleCharacter || characterStore.activeCharacters[0]
    if (!targetCharacter) throw new Error('没有可用的AI角色，请在角色设置中配置团队和成员')

    // AI 配置覆盖功能已移除，统一使用全局激活的 AI 配置
    const effectiveConfig = configStore.aiConfig

    console.log('🔍 调试信息:', {
      targetCharacter: targetCharacter?.name,
      autoGenerateImage: autoGenerateImage.value,
      provider: configStore.aiConfig.provider
    })

    if (!effectiveConfig.apiKey) {
      throw new Error('请先配置AI API密钥')
    }

    const allActiveCharacters = characterStore.activeCharacters

    // 预加载角色引用的规则文件（确保可调用文件夹之外的规则文件也能解析到内容）
    const refs = characterStore.parseCharRuleRefs(targetCharacter)
    const funcCfg = characterStore.parseCharFuncConfig(targetCharacter)
    const globalChatIds = characterStore.globalRuleRefs.chatRuleIds || []
    const globalSystemIds = characterStore.globalRuleRefs.systemRuleIds || []
    const globalDialogueIds = characterStore.globalRuleRefs.dialogueRuleIds || []
    await characterStore.preloadRuleFiles([
      ...refs.chatRuleIds,
      ...funcCfg.functionRuleFileIds,
      ...globalChatIds,
      ...globalSystemIds,
      ...globalDialogueIds
    ])

    const systemPrompt = characterStore.generateSystemPrompt(
      [targetCharacter],
      false,
      characterStore.contextIsolation
    )

    let finalSystemPrompt = systemPrompt

    if (characterStore.contextIsolation && allActiveCharacters.length > 1) {
      const otherCharacters = allActiveCharacters.filter(c => c.name !== targetCharacter.name)
      if (otherCharacters.length > 0) {
        const otherCharInfo = otherCharacters.map(c => `- ${c.name}：${c.description || ''}`).join('\n')
        finalSystemPrompt = systemPrompt + `\n\n## 当前场景中的其他角色\n${otherCharInfo}\n\n【重要：以上角色也在场，你可以在对话中与他们互动、回应他们的话、或描述他们的动作和状态。】`
      }
    }

    let currentRoundSummary = ''
    if (characterStore.contextIsolation && allActiveCharacters.length > 1) {
      const priorReplies = chatMessages.value
        .filter(m => m.isCurrentRound && m.characterName && m.characterName !== targetCharacter.name && m.content)
        .map(m => `${m.characterName}说：${(m.content || '').replace(/【[^】]+】/g, '').trim()}`)
      if (priorReplies.length > 0) {
        currentRoundSummary = `\n\n## 刚刚发生的对话（请参考但不要重复）\n${priorReplies.join('\n')}\n现在轮到你发言了，请根据上述内容自然地回应。`
      }
    }

    finalSystemPrompt = finalSystemPrompt + currentRoundSummary

    console.log('📄 完整系统提示词:\n', finalSystemPrompt)

    const characterMessages = !characterStore.contextIsolation || allActiveCharacters.length <= 1
      ? chatMessages.value
          .filter(m => {
            if (m.role === 'user') return true
            if (m.characterName === targetCharacter.name) return true
            return false
          })
          .map(m => ({
            role: m.role,
            content: m.rawContent || m.content
          }))
      : chatMessages.value
          .filter(m => {
            if (m.isCurrentRound && m.characterName !== targetCharacter.name) {
              return false
            }
            return true
          })
          .map(m => ({
            role: m.role === 'assistant' && m.characterName ? 'assistant' : m.role,
            content: (m.rawContent || m.content || '').replace(/【[^】]+】/g, '').trim(),
            name: m.characterName || undefined
          }))

    const messages = [
      { role: 'system', content: finalSystemPrompt },
      ...characterMessages
    ]
    
    console.log(`📜 ${targetCharacter.name} 的对话历史(${characterMessages.length}条)`)

    const timings = {
      start: Date.now(),
      requestStart: 0,
      firstByte: 0,
      firstChunk: 0,
      complete: 0
    }
    
    console.log('🚀 开始AI请求:', {
      provider: effectiveConfig.provider,
      character: targetCharacter?.name,
      model: effectiveConfig.model
    })

    if (effectiveConfig.provider === 'google') {
      yield* callGoogleGeminiStream(messages, effectiveConfig, timings)
      return
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${effectiveConfig.apiKey}`
    }

    if (effectiveConfig.provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin
      headers['X-Title'] = 'Character Generator'
    }

    const aiApiBase = configStore.getAiApiBaseUrl()

    const controller = currentAbortController || new AbortController()
    const timeoutId = setTimeout(() => {
      console.warn('⏱️ 请求超时,正在中止...')
      controller.abort()
    }, 60000)
    let response
    try {
      timings.requestStart = Date.now()

      const requestBody = {
        model: effectiveConfig.model,
        messages: messages,
        stream: true,
        max_tokens: configStore.aiConfig.maxTokens,
        temperature: configStore.aiConfig.temperature,
        top_p: configStore.aiConfig.topP,
        frequency_penalty: configStore.aiConfig.frequencyPenalty,
        presence_penalty: configStore.aiConfig.presencePenalty
      }

      // 处理思考模式
      // 关键：Qwen3 等模型默认开启思考，必须显式发送 enable_thinking: false 才能关闭
      const enableThinking = configStore.aiConfig.enableThinking || false
      if (enableThinking) {
        if (effectiveConfig.provider === 'openrouter') {
          requestBody.reasoning = { effort: 'medium' }
          console.log('🧠 已启用 OpenRouter 思考模式')
        } else if (effectiveConfig.provider === 'openai' || effectiveConfig.provider === 'google') {
          console.log('ℹ️', effectiveConfig.provider, '不支持 enable_thinking 参数，已跳过')
        } else {
          requestBody.enable_thinking = true
          console.log('🧠 思考模式已开启')
        }
      } else {
        // 显式关闭思考模式，防止 Qwen3/DeepSeek-R1 等模型默认思考导致极慢
        if (effectiveConfig.provider === 'openai' || effectiveConfig.provider === 'google' || effectiveConfig.provider === 'openrouter') {
          // 这些服务商不支持 enable_thinking 参数，跳过
        } else {
          requestBody.enable_thinking = false
          console.log('🧠 思考模式已关闭（enable_thinking: false）')
        }
      }

      console.log('📝 请求详情:', {
        url: `${aiApiBase}/chat/completions`,
        model: effectiveConfig.model,
        provider: effectiveConfig.provider,
        apiKey: effectiveConfig.apiKey ? '已配置' : '未配置',
        messageCount: messages.length,
        enableThinking
      })

      console.log('📦 请求体:', JSON.stringify(requestBody, null, 2))

      response = await fetch(`${aiApiBase}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })
      timings.firstByte = Date.now()
      console.log(`⏱️ 首字节响应耗时：${((timings.firstByte - timings.requestStart) / 1000).toFixed(2)}秒`)
      console.log('✅ 收到响应:', response.status, response.statusText)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('ERR_ABORTED') || fetchError.message?.includes('Failed to fetch')) {
        console.log('📌 请求被中止（可能是切换模型、超时或网络中断）')
        return
      }
      console.error('❌ 请求失败:', fetchError)
      throw new Error(`网络错误：${fetchError.message || '未知错误'}`)
    }
    
    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMsg = errorData.error?.message || `API 请求失败：${response.status}`
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || '5'
        const waitSeconds = parseInt(retryAfter) || 5
        console.warn(`⚠️ 请求过于频繁，将在 ${waitSeconds}秒后重试...`)
        
        // 等待指定时间后重试
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000))
        console.log('🔄 重试请求...')
        
        // 重新发送请求
        response = await fetch(`${aiApiBase}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal
        })
        
        // 如果重试后仍然 429，则抛出错误
        if (response.status === 429) {
          throw new Error('请求过于频繁，请稍后再试（已自动重试，但 API 仍然限流）')
        }
        
        console.log('✅ 重试成功')
      }
      
      if (response.status === 401) {
        throw new Error('API 密钥无效，请检查配置')
      }
      if (response.status === 504) {
        throw new Error('代理连接超时，请检查网络或尝试其他服务商')
      }
      
      if (!response.ok) {
        throw new Error(errorMsg)
      }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let isFirstChunk = true
    let hasContent = false
    let rawBodySnippet = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (isFirstChunk) {
          timings.firstChunk = Date.now()
          console.log(`⏱️ 首块数据耗时: ${((timings.firstChunk - timings.firstByte) / 1000).toFixed(2)}秒`)
          isFirstChunk = false
        }

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk
        // 保存原始响应片段（用于错误诊断）
        if (!hasContent && rawBodySnippet.length < 500) {
          rawBodySnippet += chunk
        }

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine || !trimmedLine.startsWith('data:')) continue

          const data = trimmedLine.slice(5).trim()
          if (data === '[DONE]') {
            timings.complete = Date.now()
            return
          }

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              hasContent = true
              yield content
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    } catch (streamError) {
      if (streamError.name === 'AbortError' || streamError.message?.includes('ERR_ABORTED')) {
        console.log('📌 流式响应正常结束，连接已关闭')
      } else {
        throw streamError
      }
    } finally {
      try {
        reader.releaseLock()
      } catch (e) {
        // 忽略释放锁错误
      }
    }

    // 检测空响应：API 返回 200 但没有任何 SSE 数据
    // 常见于本地 API 服务器未正确启动或模型未加载
    if (!hasContent) {
      console.error('❌ API 返回 200 但无有效内容，原始响应片段:', rawBodySnippet.slice(0, 200))
      throw new Error('API 返回了空响应（服务器可能未正确启动或模型未加载）。原始响应: ' + rawBodySnippet.slice(0, 200))
    }
    
    timings.complete = Date.now()
    console.log('📊 性能分析:')
    console.log(`  - 总耗时: ${((timings.complete - timings.start) / 1000).toFixed(2)}秒`)
    console.log(`  - 网络请求: ${((timings.firstByte - timings.requestStart) / 1000).toFixed(2)}秒`)
    console.log(`  - 流式传输: ${((timings.complete - timings.firstByte) / 1000).toFixed(2)}秒`)
  }

  const callGoogleGeminiStream = async function* (messages, config, timings) {
    const model = config.model || 'gemini-2.0-flash'
    const apiKey = config.apiKey
    const aiApiBase = getApiBaseUrlForConfig(config)

    const systemInstruction = messages.find(m => m.role === 'system')?.content || ''
    const chatMessages = messages.filter(m => m.role !== 'system')

    const contents = chatMessages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))

    const requestBody = {
      contents,
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        maxOutputTokens: configStore.aiConfig.maxTokens,
        temperature: configStore.aiConfig.temperature,
        topP: configStore.aiConfig.topP,
        frequencyPenalty: configStore.aiConfig.frequencyPenalty,
        presencePenalty: configStore.aiConfig.presencePenalty
      }
    }

    const controller = currentAbortController || new AbortController()
    const timeoutId = setTimeout(() => {
      console.warn('⏱️ 请求超时,正在中止...')
      controller.abort()
    }, 60000)

    let response
    try {
      timings.requestStart = Date.now()
      response = await fetch(`${aiApiBase}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })
      timings.firstByte = Date.now()
      console.log(`⏱️ 首字节响应耗时: ${((timings.firstByte - timings.requestStart) / 1000).toFixed(2)}秒`)
      console.log('✅ 收到响应:', response.status, response.statusText)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      console.error('❌ 请求失败:', fetchError)
      if (fetchError.name === 'AbortError') {
        throw new Error('连接超时(60秒),请检查:\n1. 网络连接是否正常\n2. API密钥是否正确\n3. 尝试切换其他服务商')
      }
      if (fetchError.message.includes('Failed to fetch')) {
        throw new Error('网络连接失败,可能原因:\n1. 开发服务器未启动\n2. 代理配置错误\n3. 网络被防火墙阻止')
      }
      throw new Error(`网络错误: ${fetchError.message}`)
    }

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMsg = errorData.error?.message || `API请求失败: ${response.status}`
      if (response.status === 429) {
        throw new Error('请求过于频繁,请稍后再试')
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('API密钥无效,请检查配置')
      }
      if (response.status === 504) {
        throw new Error('代理连接超时,请检查网络或尝试其他服务商')
      }
      throw new Error(errorMsg)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let isFirstChunk = true

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (isFirstChunk) {
          timings.firstChunk = Date.now()
          console.log(`⏱️ 首块数据耗时: ${((timings.firstChunk - timings.firstByte) / 1000).toFixed(2)}秒`)
          isFirstChunk = false
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine || !trimmedLine.startsWith('data:')) continue
          
          const data = trimmedLine.slice(5).trim()
          if (data === '[DONE]') {
            timings.complete = Date.now()
            return
          }
          
          try {
            const parsed = JSON.parse(data)
            const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text
            if (content) {
              yield content
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    } catch (streamError) {
      if (streamError.name === 'AbortError' || streamError.message?.includes('ERR_ABORTED')) {
        console.log('📌 流式响应正常结束，连接已关闭')
      } else {
        throw streamError
      }
    } finally {
      try {
        reader.releaseLock()
      } catch (e) {
        // 忽略释放锁错误
      }
    }

    timings.complete = Date.now()
    console.log('📊 性能分析:')
    console.log(`  - 总耗时: ${((timings.complete - timings.start) / 1000).toFixed(2)}秒`)
    console.log(`  - 网络请求: ${((timings.firstByte - timings.requestStart) / 1000).toFixed(2)}秒`)
    console.log(`  - 流式传输: ${((timings.complete - timings.firstByte) / 1000).toFixed(2)}秒`)
  }

  const sendChatMessage = async () => {
    const message = chatInput.value.trim()
    if (!message || isAITyping.value) return

    currentAbortController = new AbortController()

    const configStore = useConfigStore()
    const generationStore = useGenerationStore()
    const characterStore = useCharacterStore()

    if (!configStore.isAIOnline) {
      console.log('🔌 AI 未在线，正在自动测试连接...')
      await testAIConnectionAuto(configStore)
      if (!configStore.isAIOnline) {
        // 使用者可能已经在设置里把某个配置测通并标为「可调用」，这里自动兜底切过去
        console.log('🔁 当前配置不可用，尝试切换到其它「可调用」配置...')
        const switched = await activateFirstWorkingCallableConfig(configStore)
        if (!switched) {
          chatMessages.value.push({
            role: 'assistant',
            content: buildOfflineMessage(configStore),
            timestamp: Date.now()
          })
          return
        }
      }
    }

    chatInput.value = ''
    // 把当前用户上传的图片附加到用户消息上（供历史记录和回显使用）
    const userImages = pendingInputImages.value.length > 0
      ? pendingInputImages.value.map(i => ({ base64: i.base64, thumb: i.thumb || '', name: i.name || '' }))
      : []
    chatMessages.value.push({
      role: 'user',
      content: message,
      images: userImages,
      timestamp: Date.now()
    })

    // 如果当前没有对话记录，创建一条新的对话记录（持久化到数据库）
    if (!currentConversationId.value) {
      const firstChar = characterStore.activeCharacters[0]
      const conv = await createConversation('新对话', firstChar?.id || null)
      if (conv) {
        currentConversationId.value = conv.id
      }
    }

    isAITyping.value = true

    generationStore.error = ''
    if (!generationStore.isGenerating) {
      generationStore.generationStatus = '待命状态...'
    }

    const activeCharacters = characterStore.activeCharacters
    console.log(`🎭 将依次让 ${activeCharacters.length} 个角色发言:`, activeCharacters.map(c => c.name).join('、'))

    for (let i = 0; i < activeCharacters.length; i++) {
      const character = activeCharacters[i]
      console.log(`\n▶️ 第 ${i + 1}/${activeCharacters.length} 个角色发言: ${character.name}`)
      
      const startTime = Date.now()

      const assistantMessageIndex = chatMessages.value.length
      chatMessages.value.push({
        role: 'assistant',
        content: '',
        characterName: character.name,
        characterId: character.id,
        timestamp: Date.now(),
        responseTime: null,
        isCurrentRound: true
      })

      let fullContent = ''

      try {
        for await (const chunk of callAIAssistantStream(message, character)) {
          if (!currentAbortController) {
            console.log('⏹️ 检测到中止信号，停止接收数据')
            break
          }
          fullContent += chunk
          chatMessages.value[assistantMessageIndex].content = fullContent
        }

        if (!currentAbortController) {
          console.log(`⏹️ ${character.name} 的响应已被用户中止`)
          continue
        }

        const endTime = Date.now()
        const responseTime = endTime - startTime
        chatMessages.value[assistantMessageIndex].responseTime = responseTime
        console.log(`⏱️ ${character.name} 响应完成，耗时: ${(responseTime / 1000).toFixed(2)}秒`)

        // 保存原始内容（包含功能调用标记），并设置显示内容（剥离标记）
        const functionCall = parseFunctionCallFromResponse(fullContent, character)
        const displayContent = functionCall ? fullContent.replace(/\n*\[调用功能:[^\]]+\]\s*$/m, '').trim() : fullContent
        chatMessages.value[assistantMessageIndex].rawContent = fullContent
        chatMessages.value[assistantMessageIndex].content = displayContent

        // 功能调用：角色开启了功能且 AI 输出了 [调用功能:xxx] 标记
        if (functionCall) {
          console.log(`🔧 ${character.name} 触发功能调用:`, functionCall.functionName)
          await executeFunctionForChat(character, functionCall, assistantMessageIndex, message, fullContent)
        } else if (autoGenerateImage.value && !characterStore.isCharacterFunctionEnabled(character)) {
          // 旧的手动"生图"开关：仅在角色未开启功能时生效
          // 角色开启功能后，自身生图规则失效，由功能规则取代
          await generateImageForChat(character, assistantMessageIndex, message, fullContent)
        }
      } catch (e) {
        console.error(`❌ ${character.name} 发言失败:`, e)
        if (!chatMessages.value[assistantMessageIndex].content) {
          chatMessages.value[assistantMessageIndex].content = `抱歉，发生了错误: ${e.message}`
        } else {
          console.log(`📝 ${character.name} 对话内容已保留，仅图片生成失败`)
        }
        if (isGeneratingImage.value) {
          isGeneratingImage.value = false
          generatingCharacterIndex.value = -1
          const errorMsg = e.message || '未知错误'
          const isNetworkError = errorMsg.includes('Failed to fetch') || errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('ERR_')
          const isTimeoutError = errorMsg.includes('超时')
          let suggestion = ''
          if (isNetworkError) {
            suggestion = '\n\n🔧 解决方法：\n1. 检查 ComfyUI 是否已启动（通常在 http://localhost:8188）\n2. 检查设置中的 ComfyUI 地址是否正确\n3. 检查网络连接是否正常'
          } else if (isTimeoutError) {
            suggestion = '\n\n🔧 解决方法：\n1. 图片生成超时，可能是提示词太复杂或 ComfyUI 负载过高\nn2. 尝试简化对话内容后重新发送\n3. 关闭生图模式进行纯对话'
          } else {
            suggestion = `\n\n🔧 解决方法：\n1. 错误信息：${errorMsg}\n2. 请检查 ComfyUI 服务状态和配置`
          }
          generationStore.generationStatus = `❌ ${character.name} 图片生成失败${suggestion}`
          generationStore.error = `${character.name} 图片生成失败: ${errorMsg}${suggestion}`
        }
      }
    }

    chatMessages.value.forEach(m => { delete m.isCurrentRound })
    console.log(`\n✅ 所有 ${activeCharacters.length} 个角色发言完毕`)
    isAITyping.value = false
    currentAbortController = null
    // 本轮对话结束后清理已使用的输入图片
    pendingInputImages.value = []

    // 对话结束后保存到数据库（持久化，刷新页面不丢失）
    await saveCurrentConversation()
    // 刷新对话列表（让侧边栏/记录页看到最新记录）
    await loadConversations()
  }

  const stopGeneration = () => {
    if (currentAbortController) {
      console.log('⏹️ 用户主动终止对话生成')
      currentAbortController.abort()
      currentAbortController = null
      isAITyping.value = false
      isGeneratingImage.value = false
      generatingCharacterIndex.value = -1
    }
  }

  const handleImageError = (event, msg) => {
    console.error('图片加载失败:', msg.imageUrl)
    event.target.style.display = 'none'
  }

  // 探测当前「使用中」的 AI 配置是否真的能调用，返回 { ok, reason, endpoint }
  const probeActiveAiConfig = async (configStore) => {
    const cfg = configStore.aiConfig
    const provider = cfg.provider
    const aiApiBase = configStore.getAiApiBaseUrl()
    const endpoint = provider === 'google'
      ? `${aiApiBase}/models/${cfg.model || 'gemini-2.0-flash'}:generateContent?key=${cfg.apiKey}`
      : `${aiApiBase}/chat/completions`

    if (!configStore.activeAiConfigId) {
      return { ok: false, reason: '设置里没有「使用中」的配置', endpoint: '' }
    }
    if (!cfg.apiKey) return { ok: false, reason: '该配置没有填写 API 密钥', endpoint }
    if (!cfg.model) return { ok: false, reason: '该配置没有选择模型', endpoint }

    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`
      }
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = window.location.origin
        headers['X-Title'] = 'Character Generator'
      }

      const body = provider === 'google'
        ? { contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 5 } }
        : { model: cfg.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })

      if (response.ok) return { ok: true, reason: '', endpoint }

      const text = await response.text().catch(() => '')
      const detail = (text || '').replace(/\s+/g, ' ').slice(0, 80)
      return { ok: false, reason: `接口返回 HTTP ${response.status}${detail ? ' - ' + detail : ''}`, endpoint }
    } catch (e) {
      return { ok: false, reason: `无法连接（${e.message || '未知错误'}）`, endpoint }
    }
  }

  const testAIConnectionAuto = async (configStore) => {
    const res = await probeActiveAiConfig(configStore)
    configStore.isAIOnline = res.ok
    configStore.aiConnError = res.ok ? '' : res.reason
    if (res.ok) {
      console.log('✅ AI 自动连接测试成功:', configStore.activeAiConfigName)
    } else {
      console.warn('⚠️ AI 自动连接测试失败:', res.reason, res.endpoint)
    }
    return res
  }

  // 当前「使用中」的配置连不通时，按「可调用」列表顺序试其它配置，把第一个通的设为使用中
  const activateFirstWorkingCallableConfig = async (configStore) => {
    try {
      if (!configStore.aiConfigs || configStore.aiConfigs.length === 0) {
        await configStore.loadAiConfigs()
      }
    } catch (e) {
      console.warn('[Chat] 加载 AI 配置列表失败:', e)
    }

    const candidates = (configStore.aiConfigs || [])
      .filter(c => c.is_callable && c.id !== configStore.activeAiConfigId)

    if (candidates.length === 0) return null

    const failedName = configStore.activeAiConfigName || '当前配置'
    const failedReason = configStore.aiConnError

    for (const c of candidates) {
      try {
        await configStore.setActiveAiConfig(c.id) // 写库 is_active + 重新装载 aiConfig
        const res = await probeActiveAiConfig(configStore)
        if (res.ok) {
          configStore.isAIOnline = true
          configStore.aiConnError = ''
          configStore.aiAutoSwitchNotice = `「${failedName}」不可用（${failedReason}），已自动切换为「${c.name || c.model}」`
          console.log('✅ 已自动切换到可用配置:', c.name)
          return c
        }
        console.warn('[Chat] 候选配置不可用:', c.name, res.reason)
      } catch (e) {
        console.warn('[Chat] 切换候选配置失败:', c.name, e)
      }
    }
    return null
  }

  // 全都连不通时给出可操作的原因，而不是一句"请点测试连接"（点设置里的测试按钮并不会改变这里的状态）
  const buildOfflineMessage = (configStore) => {
    const cfg = configStore.aiConfig
    const name = configStore.activeAiConfigName || '（未设置）'
    const target = configStore.getAiApiBaseUrl() || cfg.apiUrl || '（无地址）'
    const reason = configStore.aiConnError || '未知原因'
    const lines = [
      '抱歉，AI 服务未连接。',
      `对话使用中：「${name}」（${cfg.provider} · ${target} · 模型 ${cfg.model || '未设置'}）`,
      `失败原因：${reason}`,
      '请到 设置 → API配置：① 点行内「测试」确认能通；② 点「使用」把它设为对话配置（「可调用」只是让它出现在对话的模型下拉里）。'
    ]
    return lines.join('\n')
  }

  const generateSingleImage = async () => {
    if (!chatInput.value.trim()) return
    
    const promptText = chatInput.value.trim()
    chatInput.value = ''
    
    isGeneratingImage.value = true
    singleImageStatus.value = '发送生成请求...'
    
    try {
      const configStore = useConfigStore()
      let workflowToUse = configStore.customWorkflow || defaultWorkflow
      if (configStore.chatWorkflowId > 0) {
        try {
          const wfFile = await apiClient.getFileLibraryFileById(configStore.chatWorkflowId)
          if (wfFile && wfFile.content) {
            workflowToUse = typeof wfFile.content === 'string'
              ? JSON.parse(wfFile.content)
              : wfFile.content
          }
        } catch (e) {
          console.warn('加载对话工作流失败，使用默认:', e)
        }
      }
      const token = apiClient.token
      
      singleImageStatus.value = '等待 ComfyUI 响应...'
      
      const generateResponse = await fetch('/server/api/comfyui/generate-single', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          prompt: promptText,
          workflow: workflowToUse,
          comfyuiUrl: configStore.config.comfyuiUrl,
          filenamePrefix: configStore.config.filenamePrefix
        })
      })
      
      const genData = await generateResponse.json()
      if (!genData.success) throw new Error(genData.error)
      
      const promptId = genData.promptId
      const apiUrl = genData.apiUrl
      
      singleImageStatus.value = '图片生成中...'
      
      let imageUrl = null
      for (let i = 0; i < 120; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        singleImageStatus.value = `等待生成完成... 已等待 ${i * 2} 秒`
        
        const historyResponse = await fetch(`/server/api/comfyui/history/${promptId}?apiUrl=${encodeURIComponent(apiUrl)}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        })
        if (!historyResponse.ok) continue
        
        const historyData = await historyResponse.json()
        if (historyData[promptId]?.outputs) {
          const outputs = Object.values(historyData[promptId].outputs)
          for (const output of outputs) {
            if (output.images?.length > 0) {
              const image = output.images[0]
              imageUrl = `${apiUrl}/view?filename=${image.filename}&subfolder=${image.subfolder || ''}&type=${image.type || 'output'}`
              break
            }
          }
          if (imageUrl) break
        }
      }
      
      if (!imageUrl) throw new Error('生成超时')
      
      try {
        const generationStore = useGenerationStore()
        if (generationStore.results) {
          generationStore.results.value.push({
            url: imageUrl,
            prompt: promptText,
            filename: `single_${Date.now()}.png`,
            showInfo: false,
            loaded: true
          })
        }
      } catch (e) {
        console.warn('同步到生成进度失败:', e.message)
      }
      
      chatMessages.value.push({
        role: 'user',
        content: promptText,
        timestamp: Date.now(),
        isSingleImage: true
      })
      
      chatMessages.value.push({
        role: 'assistant',
        content: '',
        imageUrl,
        timestamp: Date.now(),
        isSingleImage: true
      })
      
    } catch (e) {
      console.error('单图生成失败:', e)
      chatMessages.value.push({
        role: 'assistant',
        content: `图片生成失败: ${e.message}`,
        timestamp: Date.now(),
        isSingleImage: true
      })
    } finally {
      isGeneratingImage.value = false
      singleImageStatus.value = ''
    }
  }

  function extractImagePromptFromDialogue(dialogueContent, character) {
    const cleaned = dialogueContent
      .replace(/【[^】]+】/g, '')
      .replace(/[（）]/g, '(')
      .trim()

    const parts = []
    parts.push(character.name)

    const locationPatterns = [
      /在(.{2,15}?)(?:的|里|中|间|内|外|前|后|旁|边|下|上|，|。)/,
      /(?:来到|走到|站在|坐在|躺在|靠在|趴在)(.{2,15}?)(?:[，。])/,
      /(?:房间|卧室|客厅|厨房|浴室|办公室|教室|公园|花园|街道|阳台|走廊|大厅|包厢|车厢|船舱)(.{0,10})?/
    ]
    for (const pat of locationPatterns) {
      const m = cleaned.match(pat)
      if (m && m[1] && m[1].length >= 2) {
        parts.push(m[1].trim().replace(/[，。！？]$/, ''))
        break
      }
    }

    const actionPatterns = [
      /[（(](.{3,25}?)[）)]/,
      /(?:猛地|缓缓|轻轻|慢慢|迅速|突然|急忙|慌张|僵硬|颤抖地)(.{2,10}?)(?:[，。])/,
      /(?:转身|抬头|低头|伸手|握住|抓住|推开|拉住|抱住|靠向|凑近|后退|向前|跨步|跪下|站起)(.{0,10})?(?:[，。])/,
      /(?:走|跑|跳|躺|坐|站|靠|抱|抓|推|拉|踢|打|摸|亲|咬|舔|掐|捏)(.{2,12}?)(?:[，。])/
    ]
    for (const pat of actionPatterns) {
      const m = cleaned.match(pat)
      if (m && m[1] && m[1].length >= 2) {
        const action = m[1].trim().replace(/[，。！？]$]/, '')
        if (action.length <= 20) {
          parts.push(action)
          break
        }
      }
    }

    const clothingPatterns = [
      /(?:穿着|身穿|身着|披着|裹着|脱下|换上)(.{2,15}?)(?:[，。])/,
      /(?:连衣裙|吊带|短裤|长裙|西装|衬衫|T恤|毛衣|外套|大衣|风衣|旗袍|和服|制服|睡衣|内衣|丝袜|高跟鞋|运动鞋)(.{0,8})?/
    ]
    for (const pat of clothingPatterns) {
      const m = cleaned.match(pat)
      if (m) {
        const clothing = (m[1] || m[0]).trim().replace(/[，。！？]$/, '')
        if (clothing.length >= 2 && clothing.length <= 20) {
          parts.push(clothing)
          break
        }
      }
    }

    const emotionMap = {
      '害羞': '羞涩', '脸红': '羞涩', ' blush': '羞涩',
      '愤怒': '生气', '怒': '生气',
      '惊讶': '震惊', '惊': '震惊', '愣住': '震惊',
      '悲伤': '难过', '哭': '哭泣', '流泪': '哭泣', '眼泪': '哭泣',
      '开心': '微笑', '笑': '微笑', '大笑': '开怀',
      '恐惧': '害怕', '怕': '恐惧', '抖': '恐惧',
      '温柔': '柔美', '冷峻': '冷漠', '严肃': '认真',
      '期待': '渴望', '紧张': '不安', '放松': '惬意',
      '沉思': '若有所思', '专注': '全神贯注'
    }
    let foundEmotion = false
    for (const [keyword, emotion] of Object.entries(emotionMap)) {
      if (cleaned.includes(keyword)) {
        parts.push(`${emotion}的表情`)
        foundEmotion = true
        break
      }
    }
    if (!foundEmotion) {
      const genericEmotionMatch = cleaned.match(/(?:表情|神色|眼神|目光|脸上).{0,5}(.{2,4})/)
      if (genericEmotionMatch) {
        parts.push(`${genericEmotionMatch[1]}的表情`)
      }
    }

    const timeEnvPatterns = [
      /(?:清晨|傍晚|夜晚|中午|黄昏|黎明|深夜|凌晨|午后|上午)/,
      /(?:月光|阳光|灯光|烛光|霓虹|夕阳|晨光|星光)/,
      /(?:雨中|雪中|风中|雾中|水下)/
    ]
    for (const pat of timeEnvPatterns) {
      const m = cleaned.match(pat)
      if (m) {
        parts.push(m[0])
        break
      }
    }

    const physicalPatterns = [
      /(?:呼吸|喘息|胸口|心跳|身体|肌肤|皮肤|汗水|体温|嘴唇|手指|手掌|眼睛|睫毛|头发|腰肢|肩膀|大腿|胸部|臀部).{0,8}/
    ]
    for (const pat of physicalPatterns) {
      const m = cleaned.match(pat)
      if (m && m[0].length >= 4) {
        parts.push(m[0])
        break
      }
    }

    const prompt = parts.filter(p => p && p.length >= 1).join('，')
    console.log('📝 从对话内容提取提示词:', prompt)
    return prompt
  }

  async function* generateImagePrompt(dialogueContent, character, historyContext = '', rulesOverride = null) {
    const configStore = useConfigStore()
    const characterStore = useCharacterStore()

    // AI 配置覆盖已移除，统一使用全局激活配置
    const effectiveConfig = configStore.aiConfig
    if (!effectiveConfig.apiKey) {
      throw new Error('请先配置AI API密钥')
    }

    // 生图规则：仅使用功能规则（rulesOverride），生图规则已移除
    const imageRules = rulesOverride || ''

    console.log(`🖼️ 生图提示词生成(流式) - ${rulesOverride ? '功能规则' : '无规则'}`)

    const promptGenSystem = `你是一个专业的AI图像提示词生成器，不是角色扮演AI。你的唯一任务是根据给定的对话内容，将其转换为一段纯描述性的图片提示词。

## 角色信息
名字：${character.name}
描述：${character.description || ''}

## 生图规则
${imageRules}

## 要求
1. 根据对话内容中描述的场景、动作、服装、表情、环境等细节生成提示词
2. 提示词必须符合上述生图规则的要求
3. 只输出图片提示词本身，不要输出任何其他内容
4. 提示词要具体生动，包含人物外貌、动作姿态、服装细节、场景环境、光线氛围等
5. 提示词必须是第三人称的客观画面描述，用逗号分隔的描述性短语

## 严格禁止（必须遵守）
1. 禁止以对话形式输出——不要用括号表示动作（如(微笑)、(叹气)），不要输出角色对话，不要以【角色名】开头
2. 禁止添加任何markdown格式标题，如**核心动作与姿态：**、**面部表情与眼神：**、**视角**：等
3. 禁止添加任何英文质量标签，如masterpiece、best quality、ultra detailed、ultra realistic等
4. 禁止添加任何英文括号标签，如(high quality)、(detailed)等
5. 禁止输出markdown格式、禁止使用**加粗**、禁止使用#标题
6. 只输出纯文本提示词，直接描述画面内容
7. 提示词的语言、格式、字数等完全遵循上述生图规则的要求
8. 你是在生成图片提示词，不是在续写对话，不要模仿对话内容的格式和语气`

    let userMessage = `请根据以下对话内容，提取其中的视觉画面信息，生成一段纯描述性的图片提示词。注意：以下内容是对话，你需要把它转换成画面描述，而不是续写对话。\n\n---对话内容开始---\n${dialogueContent}\n---对话内容结束---\n\n请直接输出图片提示词，不要输出对话。`

    if (historyContext) {
      userMessage = `请根据以下对话历史和最新对话，提取视觉画面信息，生成一段纯描述性的图片提示词。注意：你需要把对话内容转换成画面描述，而不是续写对话。\n\n---之前对话历史---\n${historyContext}\n---历史结束---\n\n---当前最新对话---\n${dialogueContent}\n---当前对话结束---\n\n请结合历史对话和当前对话，生成一张能体现最新场景和状态的图片提示词。注意人物状态可能随着对话发展发生了变化。直接输出图片提示词，不要输出对话。`
    }

    const messages = [
      { role: 'system', content: promptGenSystem },
      { role: 'user', content: userMessage }
    ]

    console.log('🖼️ 开始流式生成图片提示词...')

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${effectiveConfig.apiKey}`
    }

    if (effectiveConfig.provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin
      headers['X-Title'] = 'Character Generator'
    }

    const aiApiBase = configStore.getAiApiBaseUrl()
    const controller = currentAbortController || new AbortController()

    // 超时保护：120 秒后自动中止请求，防止本地模型挂起导致永久等待
    const timeoutId = setTimeout(() => {
      console.warn('⏱️ 生图提示词请求超时(120秒),正在中止...')
      controller.abort()
    }, 120000)

    // 生图提示词不需要思考，显式关闭以加速生成
    const imageRequestBody = {
      model: effectiveConfig.model,
      messages,
      stream: true,
      max_tokens: configStore.aiConfig.imageMaxTokens,
      temperature: configStore.aiConfig.temperature,
      top_p: configStore.aiConfig.topP,
      frequency_penalty: configStore.aiConfig.frequencyPenalty,
      presence_penalty: configStore.aiConfig.presencePenalty
    }
    if (effectiveConfig.provider !== 'openai' && effectiveConfig.provider !== 'google' && effectiveConfig.provider !== 'openrouter') {
      imageRequestBody.enable_thinking = false
    }

    let response
    try {
      response = await fetch(`${aiApiBase}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(imageRequestBody),
        signal: controller.signal
      })
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('请求被取消')
      throw new Error(`网络错误: ${e.message}`)
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`API错误 (${response.status}): ${errorText}`)
    }

    // 流式读取 SSE 响应
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let hasContent = false

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine || !trimmedLine.startsWith('data:')) continue

          const data = trimmedLine.slice(5).trim()
          if (data === '[DONE]') return

          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              hasContent = true
              yield content
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    } catch (streamError) {
      if (streamError.name === 'AbortError' || streamError.message?.includes('ERR_ABORTED')) {
        console.log('📌 生图提示词流式响应正常结束')
      } else {
        throw streamError
      }
    } finally {
      clearTimeout(timeoutId)
      try { reader.releaseLock() } catch (e) {}
    }

    if (!hasContent) {
      throw new Error('API 返回了空响应（生图提示词生成失败）')
    }

    console.log('✅ 图片提示词流式生成完成')
  }

  // ============ 功能调用相关（AI 主动识别并调用角色已开启的功能） ============

  // 持久保存用户在对话中上传的输入图片（切换角色时不丢失，由 ChatPanel 维护并注入）
  const pendingInputImages = ref([]) // [{ base64, name }]

  function setPendingInputImages(images) {
    pendingInputImages.value = Array.isArray(images) ? images : []
  }

  // 从 AI 回复中解析功能调用标记 [调用功能:功能名称]
  // 仅当角色开启了功能且标记中的功能名在角色已选功能列表中时才返回调用信息
  function parseFunctionCallFromResponse(content, character) {
    if (!content) return null
    const characterStore = useCharacterStore()
    if (!characterStore.isCharacterFunctionEnabled(character)) return null
    const m = content.match(/\[调用功能[:：]\s*([^\]]+)\]/)
    if (!m) return null
    const funcName = m[1].trim()
    const funcs = characterStore.getCharacterFunctions(character)
    const found = funcs.find(f => f.name === funcName || f.name.includes(funcName) || funcName.includes(f.name))
    if (!found) {
      console.warn(`⚠️ AI 调用了未授权的功能: ${funcName}`)
      return null
    }
    return { functionName: found.name, functionId: found.id, function: found }
  }

  // 在对话中执行被调用的功能：加载功能配置 → 用功能规则生成提示词 → 调用 ComfyUI → 将结果挂到消息上
  async function executeFunctionForChat(character, functionCall, assistantMessageIndex, userMessage, aiContent) {
    const configStore = useConfigStore()
    const generationStore = useGenerationStore()
    const characterStore = useCharacterStore()

    const fn = functionCall.function
    let cfg = {}
    try { cfg = typeof fn.config_json === 'string' ? JSON.parse(fn.config_json) : (fn.config_json || {}) }
    catch (e) { console.warn('解析功能 config_json 失败:', e) }

    // 获取角色"开启功能"配置中的功能规则（拖入文件内容 + 输入框文本）
    const funcCfg = characterStore.parseCharFuncConfig(character)
    const fileRulesText = characterStore.resolveRules(funcCfg.functionRuleFileIds)
    const textboxRules = (funcCfg.functionRules || '').trim()
    const functionRules = [fileRulesText, textboxRules].filter(Boolean).join('\n\n')

    // 清理 AI 输出（剥离角色名标记和功能调用标记）
    const aiCleaned = (aiContent || '').replace(/【[^】]+】/g, '').replace(/\[调用功能:[^\]]+\]/g, '').trim()

    chatMessages.value[assistantMessageIndex].generatingPrompt = true
    chatMessages.value[assistantMessageIndex].functionName = fn.name
    generationStore.generationStatus = `正在用功能规则生成图片提示词...`

    // 当角色开启了功能规则时，用功能规则取代生图规则，调用 AI 生成图片提示词
    // 这样图片提示词会受功能规则影响，而不是直接使用对话内容
    let generatedPrompt = ''
    if (functionRules && functionRules.trim()) {
      console.log(`🔧 功能规则已启用，将取代生图规则生成图片提示词`)
      chatMessages.value[assistantMessageIndex].showPrompt = true
      chatMessages.value[assistantMessageIndex].prompt = ''
      try {
        for await (const chunk of generateImagePrompt(aiCleaned, character, '', functionRules.trim())) {
          generatedPrompt += chunk
          chatMessages.value[assistantMessageIndex].prompt = generatedPrompt
        }
        console.log(`✅ 功能规则生成的图片提示词长度: ${generatedPrompt.length}`)
      } catch (e) {
        // 用户主动停止或请求超时：中断整个功能执行流程
        if (e.name === 'AbortError' || e.message?.includes('取消') || e.message?.includes('超时')) {
          chatMessages.value[assistantMessageIndex].generatingPrompt = false
          console.log('📌 功能调用已中止')
          return
        }
        console.warn('⚠️ 功能规则生成提示词失败，回退到对话内容:', e.message)
        generatedPrompt = aiCleaned
      }
    } else {
      // 未配置功能规则，直接使用对话内容
      generatedPrompt = aiCleaned
    }

    // 构建最终提示词：插入提示词 + 功能自带提示词 + AI 生成的图片提示词
    // 注意：insertedPromptIds 可能引用文件库中任意文件（不限于可调用规则），
    // 需通过 API 获取文件内容，不能用 ruleFileMap（仅含可调用规则）
    let inserted = ''
    try {
      const ids = Array.isArray(cfg.insertedPromptIds) ? cfg.insertedPromptIds : []
      if (ids.length > 0) {
        const files = await Promise.all(ids.map(id => apiClient.getFileLibraryFileById(id)))
        inserted = files
          .filter(Boolean)
          .map(f => f.content)
          .filter(Boolean)
          .join('\n\n')
      }
    } catch (e) { console.warn('加载插入提示词失败:', e) }
    const funcPromptText = cfg.promptText || ''
    let promptParts = []
    if (inserted) promptParts.push(inserted)
    if (funcPromptText) promptParts.push(funcPromptText)
    if (generatedPrompt) promptParts.push(generatedPrompt)
    const combinedPrompt = promptParts.join('\n').trim()

    if (!combinedPrompt) {
      console.warn('⚠️ 功能调用未产生有效提示词，跳过执行')
      return
    }

    chatMessages.value[assistantMessageIndex].prompt = combinedPrompt
    chatMessages.value[assistantMessageIndex].showPrompt = true
    chatMessages.value[assistantMessageIndex].generatingPrompt = false

    isGeneratingImage.value = true
    generatingCharacterIndex.value = character.id
    generationStore.resetProgress()
    generationStore.generationStatus = `正在执行功能"${fn.name}"...`

    // 临时切换 ComfyUI 配置（如功能指定了独立配置）
    const selectedCfgId = cfg.comfyuiConfigId
    let comfyCfg = null
    if (selectedCfgId) {
      comfyCfg = (configStore.comfyuiConfigs || []).find(c => c.id === selectedCfgId)
    }
    const originalUrl = configStore.config.comfyuiUrl
    const originalDownloadDir = configStore.config.downloadDir
    const originalFilenamePrefix = configStore.config.filenamePrefix
    if (comfyCfg && comfyCfg.comfyui_url) {
      configStore.config.comfyuiUrl = comfyCfg.comfyui_url
      if (comfyCfg.download_dir) configStore.config.downloadDir = comfyCfg.download_dir
      if (comfyCfg.filename_prefix) configStore.config.filenamePrefix = comfyCfg.filename_prefix
    }

    try {
      const workflowApiId = cfg.selectedWorkflowId || 0
      generationStore.generationOptions.prompt = combinedPrompt
      generationStore.selectedWorkflowApiId = workflowApiId
      generationStore.error = ''

      const needsImage = !!cfg.needsImage
      const hasUserImages = pendingInputImages.value.length > 0

      if (needsImage && hasUserImages) {
        // 构建图片槽位：使用功能的 imageNodeIds，回退 LoadImage
        const slots = pendingInputImages.value.slice(0, 4).map((img, idx) => ({
          base64: img.base64,
          nodeId: (cfg.imageNodeIds && cfg.imageNodeIds[idx]) || null
        }))
        await generationStore.generateWithImage({
          prompt: combinedPrompt,
          workflowApiId,
          inputImageSlots: slots
        })
      } else {
        // 文生图类功能
        await generationStore.generate({ imageParams: cfg.imageParams || null })
      }

      if (generationStore.results.length > 0) {
        const latestResult = generationStore.results[generationStore.results.length - 1]
        chatMessages.value[assistantMessageIndex].imageUrl = latestResult.url
        chatMessages.value[assistantMessageIndex].isVideo = !!latestResult.isVideo
        // 生成缩略图 base64（持久化到对话记录，参考生成进度面板）
        if (!latestResult.isVideo) {
          try {
            const thumb = await generationStore.compressThumbnail(latestResult.url)
            chatMessages.value[assistantMessageIndex].thumbUrl = thumb || ''
          } catch (e) { console.warn('缩略图生成失败:', e) }
          // 大图保存到硬盘下载目录，并记录保存路径到 message（用于删除对话时一并清理）
          try {
            const convTitle = deriveConversationTitle()
            const savedPaths = await generationStore.saveImageToDirectory([latestResult], convTitle || '对话')
            if (savedPaths && savedPaths.length > 0) {
              const msg = chatMessages.value[assistantMessageIndex]
              msg.savedFiles = [...(msg.savedFiles || []), ...savedPaths]
            }
          } catch (e) { console.warn('保存对话图片到硬盘失败:', e) }
        }
        console.log(`✅ 功能"${fn.name}"执行完成`)
      } else {
        console.warn(`⚠️ 功能"${fn.name}"执行无结果`)
      }
    } catch (e) {
      console.error(`❌ 功能"${fn.name}"执行失败:`, e)
      chatMessages.value[assistantMessageIndex].functionError = e.message || '功能执行失败'
    } finally {
      // 恢复原有 ComfyUI 配置
      if (comfyCfg && comfyCfg.comfyui_url) {
        configStore.config.comfyuiUrl = originalUrl
        configStore.config.downloadDir = originalDownloadDir
        configStore.config.filenamePrefix = originalFilenamePrefix
      }
      isGeneratingImage.value = false
      generatingCharacterIndex.value = -1
    }
  }

  // 兼容旧"生图"开关：使用对话工作流为角色生成图片
  async function generateImageForChat(character, assistantMessageIndex, userMessage, aiContent) {
    const configStore = useConfigStore()
    const generationStore = useGenerationStore()

    chatMessages.value[assistantMessageIndex].generatingPrompt = true
    generationStore.generationStatus = `正在为 ${character.name} 生成图片提示词...`

    const historyMessages = chatMessages.value
      .filter(m => m.role === 'user' || (m.characterName === character.name && m.content && m !== chatMessages.value[assistantMessageIndex]))
      .slice(-10)
      .map(m => {
        const role = m.role === 'user' ? '用户' : character.name
        return `${role}：${(m.rawContent || m.content || '').replace(/【[^】]+】/g, '').trim()}`
      })
      .join('\n')

    let imagePrompt = ''
    chatMessages.value[assistantMessageIndex].showPrompt = true
    chatMessages.value[assistantMessageIndex].prompt = ''
    try {
      for await (const chunk of generateImagePrompt(aiContent, character, historyMessages)) {
        imagePrompt += chunk
        chatMessages.value[assistantMessageIndex].prompt = imagePrompt
      }
    } catch (promptError) {
      // 用户主动停止或请求超时：中断整个图片生成流程
      if (promptError.name === 'AbortError' || promptError.message?.includes('取消') || promptError.message?.includes('超时')) {
        chatMessages.value[assistantMessageIndex].generatingPrompt = false
        console.log('📌 图片生成已中止')
        return
      }
      console.warn(`⚠️ ${character.name} 提示词生成失败，使用本地提取:`, promptError.message)
      imagePrompt = extractImagePromptFromDialogue(aiContent, character)
    }

    chatMessages.value[assistantMessageIndex].prompt = imagePrompt
    chatMessages.value[assistantMessageIndex].generatingPrompt = false

    isGeneratingImage.value = true
    generatingCharacterIndex.value = character.id
    generationStore.resetProgress()
    generationStore.generationStatus = `正在为 ${character.name} 生成图片...`
    let chatWorkflow = configStore.customWorkflow || defaultWorkflow
    if (configStore.chatWorkflowId > 0) {
      try {
        const wfFile = await apiClient.getFileLibraryFileById(configStore.chatWorkflowId)
        if (wfFile && wfFile.content) {
          chatWorkflow = typeof wfFile.content === 'string'
            ? JSON.parse(wfFile.content)
            : wfFile.content
        }
      } catch (e) {
        console.warn('加载对话工作流失败，使用默认:', e)
      }
    }
    const promptId = await generationStore.sendGenerateRequest(
      generationStore.updateWorkflow(chatWorkflow, imagePrompt, 1)
    )
    await generationStore.pollTaskStatus(promptId)
    isGeneratingImage.value = false
    generatingCharacterIndex.value = -1

    if (generationStore.results.length > 0) {
      const latestResult = generationStore.results[generationStore.results.length - 1]
      chatMessages.value[assistantMessageIndex].imageUrl = latestResult.url
      // 生成缩略图 base64 + 大图保存到硬盘
      if (!latestResult.isVideo) {
        try {
          const thumb = await generationStore.compressThumbnail(latestResult.url)
          chatMessages.value[assistantMessageIndex].thumbUrl = thumb || ''
        } catch (e) { console.warn('缩略图生成失败:', e) }
        try {
          const convTitle = deriveConversationTitle()
          const savedPaths = await generationStore.saveImageToDirectory([latestResult], convTitle || '对话')
          if (savedPaths && savedPaths.length > 0) {
            const msg = chatMessages.value[assistantMessageIndex]
            msg.savedFiles = [...(msg.savedFiles || []), ...savedPaths]
          }
        } catch (e) { console.warn('保存对话图片到硬盘失败:', e) }
      }
      console.log(`🖼️ ${character.name} 的图片生成完成`)
    } else {
      console.warn(`⚠️ ${character.name} 的图片生成无结果，对话内容保留`)
    }
  }

  // ============ 对话历史记录管理 ============
  const conversations = ref([])
  const currentConversationId = ref(null)
  const conversationCategories = ref([])

  async function loadConversations() {
    try {
      conversations.value = await apiClient.getConversations()
    } catch (e) {
      console.error('加载对话历史失败:', e)
      conversations.value = []
    }
  }

  async function loadConversationCategories() {
    try {
      conversationCategories.value = await apiClient.getConversationCategories()
    } catch (e) {
      console.error('加载对话分类失败:', e)
      conversationCategories.value = []
    }
  }

  async function createConversationCategory(name) {
    try {
      const cat = await apiClient.createConversationCategory({ name })
      if (cat) {
        conversationCategories.value.push(cat)
        return cat
      }
    } catch (e) {
      console.error('创建对话分类失败:', e)
    }
    return null
  }

  async function updateConversationCategory(id, data) {
    try {
      const cat = await apiClient.updateConversationCategory(id, data)
      if (cat) {
        const idx = conversationCategories.value.findIndex(c => c.id === id)
        if (idx >= 0) conversationCategories.value[idx] = cat
      }
      return cat
    } catch (e) {
      console.error('更新对话分类失败:', e)
    }
    return null
  }

  async function deleteConversationCategory(id) {
    try {
      const ok = await apiClient.deleteConversationCategory(id)
      if (ok) {
        conversationCategories.value = conversationCategories.value.filter(c => c.id !== id)
        // 将该分类下的对话移到未分类（后端已处理，前端同步 category_id）
        conversations.value.forEach(c => {
          if (c.category_id === id) c.category_id = 0
        })
      }
      return ok
    } catch (e) {
      console.error('删除对话分类失败:', e)
    }
    return false
  }

  // 将对话移动到指定分类
  async function moveConversationToCategory(convId, categoryId) {
    try {
      const cat = await apiClient.updateConversation(convId, { category_id: categoryId })
      if (cat) {
        const idx = conversations.value.findIndex(c => c.id === convId)
        if (idx >= 0) conversations.value[idx].category_id = categoryId
      }
      return cat
    } catch (e) {
      console.error('移动对话分类失败:', e)
    }
    return null
  }

  async function createConversation(title = '新对话', characterId = null) {
    try {
      const conv = await apiClient.createConversation({
        title,
        character_id: characterId,
        messages: []
      })
      if (conv) {
        conversations.value.unshift(conv)
        currentConversationId.value = conv.id
      }
      return conv
    } catch (e) {
      console.error('创建对话失败:', e)
      return null
    }
  }

  async function saveCurrentConversation() {
    if (!currentConversationId.value) return
    try {
      const title = deriveConversationTitle()
      await apiClient.updateConversation(currentConversationId.value, {
        title,
        messages: chatMessages.value
      })
    } catch (e) {
      console.error('保存对话失败:', e)
    }
  }

  async function loadConversation(convId) {
    try {
      const conv = await apiClient.getConversationById(convId)
      if (!conv) return
      let msgs = conv.messages
      if (typeof msgs === 'string') { try { msgs = JSON.parse(msgs) } catch { msgs = [] } }
      chatMessages.value = Array.isArray(msgs) ? msgs : []
      currentConversationId.value = conv.id
      parsedMessagesCache.clear()
    } catch (e) {
      console.error('加载对话详情失败:', e)
    }
  }

  async function deleteConversation(convId) {
    try {
      const ok = await apiClient.deleteConversation(convId)
      if (ok) {
        conversations.value = conversations.value.filter(c => c.id !== convId)
        if (currentConversationId.value === convId) {
          currentConversationId.value = null
          chatMessages.value = []
        }
      }
      return ok
    } catch (e) {
      console.error('删除对话失败:', e)
      return false
    }
  }

  // 开始新对话：若当前有未保存的对话则先保存，然后清空
  async function startNewConversation() {
    if (currentConversationId.value && chatMessages.value.length > 0) {
      await saveCurrentConversation()
    }
    chatMessages.value = []
    parsedMessagesCache.clear()
    autoGenerateImage.value = false
    generatingCharacterIndex.value = -1
    currentConversationId.value = null
  }

  function deriveConversationTitle() {
    const firstUser = chatMessages.value.find(m => m.role === 'user')
    if (firstUser && firstUser.content) {
      const t = firstUser.content.replace(/【[^】]+】/g, '').trim()
      return t.length > 30 ? t.slice(0, 30) + '...' : t
    }
    return '新对话'
  }

  return {
    chatMessages,
    chatInput,
    isAITyping,
    isGeneratingImage,
    generatingCharacterIndex,
    autoGenerateImage,
    singleImageMode,
    singleImageStatus,
    pendingInputImages,
    setPendingInputImages,
    conversations,
    currentConversationId,
    conversationCategories,
    generationStatusText,
    formatTime,
    clearChat,
    parseMultiCharacterMessage,
    getParsedMessages,
    callAIAssistantStream,
    sendChatMessage,
    stopGeneration,
    generateSingleImage,
    handleImageError,
    parseFunctionCallFromResponse,
    executeFunctionForChat,
    generateImageForChat,
    loadConversations,
    createConversation,
    saveCurrentConversation,
    loadConversation,
    deleteConversation,
    startNewConversation,
    loadConversationCategories,
    createConversationCategory,
    updateConversationCategory,
    deleteConversationCategory,
    moveConversationToCategory
  }
})
