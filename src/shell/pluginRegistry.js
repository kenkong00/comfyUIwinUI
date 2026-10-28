// src/shell/pluginRegistry.js
// 插件发现与注册 —— 本项目等价于 ComfyUI 的 `init_external_custom_nodes()`。
//
// 两段式加载（对应两条插件分发渠道）：
//   A. 源码插件（第一方 / 开发期）：plugins/<id>/ui/index.js 在**构建期**被 import.meta.glob 收集，
//      改动即热更新，不需要预构建。缺点是新增插件目录需要重启 vite（重新收集 glob）。
//   B. 预构建插件（第三方 / 免重启）：plugin.json 里声明 app.dist，运行期通过 HTTP
//      `import('/server/plugins/<id>/dist/index.mjs')` 动态拉取，无需重新构建内核。
// A 命中就用 A，否则退回 B，两者对上层完全等价。

import { defineAsyncComponent, h, ref } from 'vue'
import { registerApp, unregisterApp, PLUGIN_APPS } from '@/shell/registry'
import { apiClient } from '@/services/api'

// ---- 构建期收集（相对本文件的路径：../../plugins = 项目根/plugins）----
const LOCAL_UI = import.meta.glob('../../plugins/*/ui/index.js')
const LOCAL_MANIFEST = import.meta.glob('../../plugins/*/plugin.json', {
  eager: true,
  import: 'default',
})

// 运行期可见的插件清单（供"插件管理器"UI 使用）
export const PLUGIN_LIST = ref([])
// 加载失败明细 [{ id, error }]
export const PLUGIN_ERRORS = ref([])
// 本轮已成功注册的插件 id，用于下一轮对比出"被禁用/被删除"的插件
let _registeredIds = new Set()

function dirOfGlobKey(key) {
  const m = String(key).split('/plugins/')[1]
  return m ? m.split('/')[0] : ''
}

/** 本地（构建期可见）的插件清单 */
function localManifests() {
  const out = []
  for (const [key, mod] of Object.entries(LOCAL_MANIFEST)) {
    const dir = dirOfGlobKey(key)
    if (!dir || !mod || !mod.id) continue
    out.push({ ...mod, _dir: dir, _source: 'local' })
  }
  return out
}

/** 后端权威清单（含启用/禁用状态）；后端没起时返回 null，由调用方回退到本地 */
async function serverManifests() {
  try {
    const list = await apiClient.getPlugins()
    if (Array.isArray(list) && list.length) {
      return list.map((m) => ({ ...m, _dir: m._dir || m.id, _source: 'server' }))
    }
    if (Array.isArray(list)) return [] // 后端明确返回空列表：尊重它
    return null
  } catch (e) {
    return null
  }
}

function pickComponent(mod, exportName) {
  if (!mod) return null
  if (exportName && exportName !== 'default') return mod[exportName] || null
  return mod.default || mod.component || null
}

/** 按清单解析出插件 UI 组件 */
async function loadPluginComponent(m) {
  // A：构建期 glob（按「目录名 + ui/index.js」后缀匹配，不依赖 Vite 返回的 key 前缀形式）
  const suffix = `/plugins/${m._dir}/ui/index.js`
  const key = Object.keys(LOCAL_UI).find((k) => String(k).endsWith(suffix))
  if (key && LOCAL_UI[key]) {
    const mod = await LOCAL_UI[key]()
    const c = pickComponent(mod, m.app?.export)
    if (c) return c
  }
  // B：运行期 HTTP 拉取预构建产物
  const dist = m.app?.dist
  if (dist) {
    const url = `/server/plugins/${encodeURIComponent(m.id)}/${dist}`
    try {
      const mod = await import(/* @vite-ignore */ url)
      const c = pickComponent(mod, m.app?.export)
      if (c) return c
    } catch (e) {
      throw new Error(`拉取 ${url} 失败：${e.message || e}`)
    }
  }
  throw new Error('未找到可用入口（ui/index.js 或 app.dist）')
}

function brokenComponent(message) {
  return {
    name: 'BrokenPlugin',
    setup() {
      return () =>
        h(
          'div',
          {
            style:
              'padding:18px;font-size:13px;line-height:1.7;color:#b91c1c;' +
              'background:var(--bg-secondary,#f9fafb);height:100%;box-sizing:border-box',
          },
          ['⚠ 插件加载失败：', h('span', { style: 'opacity:.85' }, message)]
        )
    },
  }
}

function registerOne(m) {
  const appDef = m.app || {}
  const component = defineAsyncComponent({
    loader: () => loadPluginComponent(m),
    errorComponent: brokenComponent(m.name || m.id),
    delay: 0,
    timeout: 20000,
  })
  return registerApp(m.id, {
    name: m.name || m.id,
    icon: m.icon || 'file',
    component,
    multi: appDef.multi !== false,
    pin: Number(appDef.pin || 0),
    w: Number(appDef.w || 900),
    h: Number(appDef.h || 640),
    // 插件元信息，将来"插件管理器"UI 直接读这里
    _manifest: m,
  })
}

/**
 * 发现并注册全部插件。应在 Vue 挂载前调用（main.js）。
 * 后端不可用时自动回退到构建期本地清单，保证纯前端 dev 也能跑。
 */
export async function loadPlugins() {
  // 调试出口放在最前面：中途出任何意外也能在控制台用 __plugins 看到状态
  if (typeof window !== 'undefined') {
    window.__plugins = { list: PLUGIN_LIST, errors: PLUGIN_ERRORS, apps: PLUGIN_APPS, reload: loadPlugins, status: 'loading' }
  }
  const server = await serverManifests()
  const list = server || localManifests()

  const registered = []
  PLUGIN_ERRORS.value = []
  for (const m of list) {
    if (!m || !m.id) continue
    if (m.enabled === false) continue
    try {
      // 后端清单里的 dist 可能在本地没有源码入口，loadPluginComponent 内部已处理两种渠道
      if (registerOne(m)) registered.push(m.id)
      else PLUGIN_ERRORS.value.push({ id: m.id, error: '清单缺少 id 或 app 入口' })
    } catch (e) {
      PLUGIN_ERRORS.value.push({ id: m.id, error: e.message || String(e) })
      console.warn('[plugins] 注册失败', m.id, e)
    }
  }

  // 上一轮注册过、这一轮没有的（被禁用 / 目录被删除）→ 注销，避免"关掉了还显示在桌面"
  const nextIds = new Set(registered)
  for (const id of _registeredIds) {
    if (!nextIds.has(id)) unregisterApp(id)
  }
  _registeredIds = nextIds

  PLUGIN_LIST.value = list.filter((m) => m && m.id)

  if (registered.length) {
    console.log(`[plugins] 已加载 ${registered.length} 个插件：${registered.join(', ')}`)
  }
  if (PLUGIN_ERRORS.value.length) {
    console.warn('[plugins] 失败明细：', PLUGIN_ERRORS.value)
  }

  // 调试出口状态回写：浏览器控制台里输 __plugins 即可看到清单 / 错误 / 已注册应用
  if (typeof window !== 'undefined' && window.__plugins) {
    window.__plugins.status = 'done'
    window.__plugins.registered = registered
  }
  return registered
}

/** 卸载某插件（将来做热插拔 / 禁用时调用） */
export function unloadPlugin(id) {
  unregisterApp(id)
  PLUGIN_LIST.value = PLUGIN_LIST.value.filter((m) => m.id !== id)
}
