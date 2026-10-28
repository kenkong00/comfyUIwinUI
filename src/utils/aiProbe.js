// src/utils/aiProbe.js
// 探测「设置中正在使用(active)的大模型 API 配置」是否真的能连通。
// 复刻 chat.js 的 probeActiveAiConfig 逻辑（避免循环依赖，且让连接面板 / 文字编辑层共用同一结论）。
// 接入方式：传入 useConfigStore() 的实例，内部用 configStore.getAiApiBaseUrl() 推导基址。
//
// 返回：{ ok:boolean, reason:string, name:string }
//   ok=false 的原因可能是：没有激活配置 / 没填密钥 / 没选模型 / 网络不通 / HTTP 非 2xx
export async function probeAiConfig(configStore) {
  try {
    const cfg = configStore.aiConfig
    const name = configStore.activeAiConfigName || ''

    if (!configStore.activeAiConfigId) {
      return { ok: false, reason: '设置里没有「使用中」的 API 配置', name }
    }
    if (!cfg || !cfg.apiKey) {
      return { ok: false, reason: '该配置没有填写 API 密钥', name }
    }
    if (!cfg.model) {
      return { ok: false, reason: '该配置没有选择模型', name }
    }

    const provider = (cfg.provider || '').toLowerCase()
    const aiApiBase = configStore.getAiApiBaseUrl()
    const endpoint = provider === 'google'
      ? `${aiApiBase}/models/${cfg.model}:generateContent?key=${cfg.apiKey}`
      : `${aiApiBase}/chat/completions`

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    }
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin
      headers['X-Title'] = 'Connection'
    }

    const body = provider === 'google'
      ? { contents: [{ parts: [{ text: 'Hi' }] }], generationConfig: { maxOutputTokens: 5 } }
      : { model: cfg.model, messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (res.ok) return { ok: true, reason: '', name }
    const text = await res.text().catch(() => '')
    const detail = (text || '').replace(/\s+/g, ' ').slice(0, 80)
    return { ok: false, reason: `接口返回 HTTP ${res.status}${detail ? ' - ' + detail : ''}`, name }
  } catch (e) {
    return {
      ok: false,
      reason: `无法连接（${e && e.message ? e.message : '未知错误'}）`,
      name: (configStore && configStore.activeAiConfigName) || '',
    }
  }
}
