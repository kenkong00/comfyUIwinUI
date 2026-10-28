// src/utils/aiApi.js
// 统一封装「按 AI 配置调用大模型」的基址推导与非流式对话请求。
// 与聊天/批量推理用的是同一套代理前缀，这里抽出来供文字编辑功能复用，
// 避免每个调用点各写一份 provider→base 的映射（漏一个就 404）。

// 与 vite.config.js 中的代理前缀保持一致
export function getAiApiBaseUrl(cfg) {
  if (!cfg) return ''
  const provider = (cfg.provider || '').toLowerCase()
  const map = {
    openrouter: '/ai-api',
    siliconflow: '/siliconflow-api',
    openai: '/openai-api',
    aliyun: '/aliyun-api',
    google: '/google-api',
    lmstudio: '/lmstudio-api',
    modelscope: '/modelscope-api',
  }
  if (map[provider]) return map[provider]
  const url = cfg.api_url || ''
  return url.endsWith('/') ? url.slice(0, -1) : url
}

/**
 * 非流式对话补全。
 * @param {Object} cfg  AI 配置行（ai_configs），至少含 provider / api_key / model
 * @param {Array}  messages [{role, content}]
 * @param {Object} opts { temperature, maxTokens, topP, enableThinking, signal }
 * @returns {Promise<string>} 模型输出文本
 */
export async function chatCompletion(cfg, messages, opts = {}) {
  if (!cfg) throw new Error('未选择 API 配置')
  const base = getAiApiBaseUrl(cfg)
  if (!base) throw new Error('API 配置缺少地址（provider 与 api_url 均为空）')
  if (!cfg.api_key) throw new Error('API 配置缺少 api_key')
  if (!cfg.model) throw new Error('API 配置缺少 model')

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.api_key}`,
  }
  if ((cfg.provider || '').toLowerCase() === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'Text Edit'
  }

  const body = {
    model: cfg.model,
    messages,
    stream: false,
    max_tokens: opts.maxTokens ?? cfg.max_tokens ?? 1024,
    temperature: opts.temperature ?? cfg.temperature ?? 0.8,
    top_p: opts.topP ?? cfg.top_p ?? 1.0,
    frequency_penalty: cfg.frequency_penalty ?? 0,
    presence_penalty: cfg.presence_penalty ?? 0,
  }
  if (typeof opts.enableThinking === 'boolean') body.enable_thinking = opts.enableThinking
  else if (typeof cfg.enable_thinking === 'boolean') body.enable_thinking = cfg.enable_thinking

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    ...(opts.signal ? { signal: opts.signal } : {}),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`AI 接口错误 (${res.status}): ${String(txt).slice(0, 200)}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('AI 未返回任何内容')
  return String(content).trim()
}

/**
 * 流式对话补全（SSE）。逐字回调 onDelta，用于文字编辑的实时打字机效果。
 * @param {Object} cfg  AI 配置行（ai_configs）
 * @param {Array}  messages [{role, content}]
 * @param {Object} opts { onDelta(fullText, delta), signal, temperature, maxTokens, topP, enableThinking }
 * @returns {Promise<string>} 完整文本（被打断时返回已收到的部分）
 */
export async function chatCompletionStream(cfg, messages, opts = {}) {
  if (!cfg) throw new Error('未选择 API 配置')
  const base = getAiApiBaseUrl(cfg)
  if (!base) throw new Error('API 配置缺少地址（provider 与 api_url 均为空）')
  if (!cfg.api_key) throw new Error('API 配置缺少 api_key')
  if (!cfg.model) throw new Error('API 配置缺少 model')

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.api_key}`,
  }
  if ((cfg.provider || '').toLowerCase() === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin
    headers['X-Title'] = 'Text Edit'
  }

  const body = {
    model: cfg.model,
    messages,
    stream: true,
    max_tokens: opts.maxTokens ?? cfg.max_tokens ?? 1024,
    temperature: opts.temperature ?? cfg.temperature ?? 0.8,
    top_p: opts.topP ?? cfg.top_p ?? 1.0,
    frequency_penalty: cfg.frequency_penalty ?? 0,
    presence_penalty: cfg.presence_penalty ?? 0,
  }
  if (typeof opts.enableThinking === 'boolean') body.enable_thinking = opts.enableThinking
  else if (typeof cfg.enable_thinking === 'boolean') body.enable_thinking = cfg.enable_thinking

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    ...(opts.signal ? { signal: opts.signal } : {}),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`AI 接口错误 (${res.status}): ${String(txt).slice(0, 200)}`)
  }

  // 有些网关/模型不支持 stream，会一次性回普通 JSON——兼容处理
  const ctype = res.headers.get('content-type') || ''
  if (ctype.includes('application/json')) {
    const data = await res.json()
    const content = String(data?.choices?.[0]?.message?.content || '')
    if (!content) throw new Error('AI 未返回任何内容')
    if (opts.onDelta) opts.onDelta(content, content)
    return content
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const t = line.trim()
        if (!t || !t.startsWith('data:')) continue
        const payload = t.slice(5).trim()
        if (payload === '[DONE]') return full
        try {
          const parsed = JSON.parse(payload)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            full += delta
            if (opts.onDelta) opts.onDelta(full, delta)
          }
        } catch { /* 半包/心跳行，忽略 */ }
      }
    }
  } catch (e) {
    // 用户主动打断：返回已生成的部分，不算错误
    if (e && (e.name === 'AbortError' || String(e.message).includes('aborted'))) return full
    throw e
  }
  return full
}
