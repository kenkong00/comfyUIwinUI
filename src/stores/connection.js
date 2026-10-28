// src/stores/connection.js
// 全局连接状态：ComfyUI / 后端 API(3007) / 下载服务(3006) / 大模型 API 是否连通。
// 供右下角 WiFi 图标与通知使用。
//
// ⚠️ 设计要点（2026-10-03 重构）：
//   服务未运行（如 LM Studio 没开）是常态，不该每次启动都刷红色错误。
//   状态分三级：
//     ok   = 当前连通
//     drop = 本会话内"曾连通过"，现在断开了 —— 这才是值得告警的回归
//     off  = 当前未连通、且本会话从未连上过 —— 视为"服务没开"，中性提示即可
//   探测间隔自适应：有 drop 时 8s 快感知；全部 off 时 45s（避免 LM Studio 没开时每 15s 刷一次 504）。
// ⚠️ ComfyUI 检测必须走后端代理（GET /api/comfyui-configs/active-status），浏览器直连 127.0.0.1:8188 会被 CORS 拦。
import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import { apiClient } from '@/services/api'
import { useConfigStore } from '@/stores/config'
import { probeAiConfig } from '@/utils/aiProbe'

function ping(url, ms = 2500) {
  return new Promise((resolve) => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), ms)
    fetch(url, { method: 'GET', signal: ctrl.signal, cache: 'no-store' })
      .then((r) => {
        clearTimeout(t)
        // 401/403 说明服务可达只是需要鉴权，仍算"连通"
        resolve(r.ok || r.status === 401 || r.status === 403)
      })
      .catch(() => { clearTimeout(t); resolve(false) })
  })
}

// 三级状态推导：连上=ok；没连上但本会话曾连过=drop（回归告警）；没连上且从未连过=off（中性）
function levelOf(up, was) {
  return up ? 'ok' : (was ? 'drop' : 'off')
}

// 把代理返回的长串 JSON 错误压缩成一句人话
function shortenReason(reason) {
  if (!reason) return ''
  const m = reason.match(/ECONNREFUSED\s+([\d.:]+)/)
  if (m) return `连接被拒绝（${m[1]} 未监听，服务可能没启动）`
  // 去掉 {"error":...,"details":...} 这类 JSON，只保留前半句
  const s = reason.split(/[{}]/)[0].replace(/\s+/g, ' ').trim()
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

export const useConnectionStore = defineStore('connection', () => {
  const comfyConnected = ref(false)
  const apiConnected = ref(false)      // 后端 API(3007)
  const downloadConnected = ref(false) // 下载服务(3006)
  const aiConnected = ref(false)       // 设置中的「大模型 API」(active 配置)
  const checking = ref(false)
  const lastCheck = ref('')
  const lastCheckTs = ref(0) // 原始时间戳，供 checkIfStale 判断检测结果是否过期
  // 当前检测使用的 ComfyUI 地址与配置名（弹窗展示用）
  const comfyUrl = ref('')
  const comfyName = ref('')
  // 未激活任何 ComfyUI 配置时为 true（提示用户去激活，而不是显示未连通）
  const comfyNotConfigured = ref(false)
  // 大模型 API 展示用：配置名 / provider / 配置总数（>1 时提示可切换）/ 失败原因（仅 drop 详情）
  const aiName = ref('')
  const aiProvider = ref('')
  const aiConfigCount = ref(0)
  const aiError = ref('')
  // 本会话内"曾经连通过"的基线（用于区分 off 与 drop）
  const ever = reactive({ comfy: false, api: false, dl: false, ai: false })
  let timer = null
  let nextDelay = 15000

  const levels = computed(() => ({
    comfy: levelOf(comfyConnected.value, ever.comfy),
    api: levelOf(apiConnected.value, ever.api),
    dl: levelOf(downloadConnected.value, ever.dl),
    ai: levelOf(aiConnected.value, ever.ai),
  }))

  const connected = computed(
    () => comfyConnected.value || apiConnected.value || downloadConnected.value || aiConnected.value
  )
  const statusText = computed(() => {
    const up = []
    if (comfyConnected.value) up.push('ComfyUI')
    if (apiConnected.value) up.push('后端 3007')
    if (downloadConnected.value) up.push('下载 3006')
    if (aiConnected.value) up.push('大模型 API')
    if (!up.length) return '当前无已连接的服务'
    return '已连接：' + up.join(' · ')
  })

  async function checkNow() {
    checking.value = true
    try {
      const [c1, c2, c3] = await Promise.all([
        // ComfyUI：走后端代理探测（服务端 fetch 已激活配置的 /system_stats）
        apiClient.getComfyActiveStatus().then((s) => {
          comfyUrl.value = s.url || ''
          comfyName.value = s.name || ''
          comfyNotConfigured.value = s.configured === false
          return !!s.connected
        }).catch(() => {
          comfyNotConfigured.value = false
          return false
        }),
        // 后端 API：经 vite 同源代理探测（局域网下浏览器位于其它设备，localhost 指向自身而非后端机）
        ping('/server/api/health'),
        // 下载服务：经 vite 同源代理探测
        ping('/dl/api/health'),
      ])
      comfyConnected.value = c1
      apiConnected.value = c2
      downloadConnected.value = c3

      // 大模型 API（active 配置）：若尚未装载激活配置先补加载，再探测并写回全局在线状态
      const cfgStore = useConfigStore()
      if (!cfgStore.activeAiConfigId) {
        try { await cfgStore.applyActiveAiConfig() } catch { /* 忽略，下面探测会给出原因 */ }
      }
      const aiRes = await probeAiConfig(cfgStore)
      aiConnected.value = aiRes.ok
      aiName.value = aiRes.name || cfgStore.activeAiConfigName || ''
      aiProvider.value = (cfgStore.aiConfig && cfgStore.aiConfig.provider) || ''
      try { aiConfigCount.value = Array.isArray(cfgStore.aiConfigs) ? cfgStore.aiConfigs.length : 0 } catch { aiConfigCount.value = 0 }
      // 真实错误只留作 drop 详情，且压缩掉代理原始 JSON
      aiError.value = aiRes.ok ? '' : shortenReason(aiRes.reason)
      // 同步回配置 store，供「右键文字编辑 / 快捷键」门控共用
      cfgStore.isAIOnline = aiRes.ok
      cfgStore.aiConnError = aiRes.ok ? '' : aiError.value

      // 记录"曾经连通过"的基线（本会话内），区分"从未连上"与"连上后断开"
      if (c1) ever.comfy = true
      if (c2) ever.api = true
      if (c3) ever.dl = true
      if (aiRes.ok) ever.ai = true

      // 自适应下次检测间隔：
      //  有 drop（曾连通后断开）→ 8s 快速感知回归
      //  全部未连通过（疑似服务压根没开）→ 45s，避免 LM Studio 没开时每 15s 刷一次 504 刷屏
      const lv = levels.value
      const anyDrop = lv.comfy === 'drop' || lv.api === 'drop' || lv.dl === 'drop' || lv.ai === 'drop'
      const allDownCold = !comfyConnected.value && !apiConnected.value && !downloadConnected.value && !aiConnected.value
      nextDelay = anyDrop ? 8000 : (allDownCold ? 45000 : 15000)

      lastCheck.value = new Date().toLocaleTimeString()
      lastCheckTs.value = Date.now()
    } catch (e) {
      // 检测自身异常（极少）：不刷红，放慢节奏下次重试
      nextDelay = 30000
    } finally {
      checking.value = false
    }
  }

  // 自适应轮询：用递归 setTimeout 而非固定 setInterval，便于按 nextDelay 调整节奏
  function loop() {
    checkNow().finally(() => { timer = setTimeout(loop, nextDelay) })
  }
  function start() { if (timer) return; loop() }
  function stop() { if (timer) { clearTimeout(timer); timer = null } }
  // 按需补检：距上次检测超过 maxAgeMs 才真正探测（打开状态弹层 / 切回标签页时调用，
  // 避免服务已启动而面板仍显示旧的"未启动"状态，同时不滥用付费的大模型探测）
  function checkIfStale(maxAgeMs = 10000) {
    if (checking.value) return
    if (lastCheckTs.value && Date.now() - lastCheckTs.value < maxAgeMs) return
    checkNow()
  }

  return {
    comfyConnected, apiConnected, downloadConnected, aiConnected, checking, lastCheck,
    comfyUrl, comfyName, comfyNotConfigured, aiName, aiProvider, aiConfigCount, aiError,
    ever, levels, connected, statusText, checkNow, checkIfStale, start, stop,
  }
})
