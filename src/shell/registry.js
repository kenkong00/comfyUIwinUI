// src/shell/registry.js
// 应用注册表的「状态层」——刻意做成零业务依赖的叶子模块。
//
// 为什么单独拆出来：
//   apps.js（内置应用）→ SettingsPanel → PluginManager → pluginRegistry → apps.js
//   会形成 ESM 循环依赖，表现为模块求值顺序错乱 / 白屏。
//   把「插件注册表状态」抽到这个谁都不依赖的模块，循环自然断开：
//     apps.js ──┐
//               ├─→ registry.js（叶子，只依赖 vue）
//   pluginRegistry.js ─┘
//
// 对外行为不变：apps.js 会把这里的东西 re-export 出去，老代码 import 路径无需改动。
import { shallowReactive, ref } from 'vue'

// 插件注册进来的应用
export const PLUGIN_APPS = shallowReactive({})

// 注册表版本号：注册/注销时自增，供"列出全部应用"的 computed 依赖
export const registryVersion = ref(0)

// 内置应用查找函数，由 apps.js 注入（避免本模块反向依赖 apps.js）
let _builtinLookup = () => null
export function setBuiltinLookup(fn) {
  if (typeof fn === 'function') _builtinLookup = fn
}

/** 注册一个应用。插件优先：插件注册成功后覆盖同名内置项 */
export function registerApp(id, def) {
  if (!id || !def || !def.component) return false
  PLUGIN_APPS[id] = { ...def, _plugin: true }
  registryVersion.value++
  return true
}

export function unregisterApp(id) {
  if (!PLUGIN_APPS[id]) return false
  delete PLUGIN_APPS[id]
  registryVersion.value++
  return true
}

/** 取应用定义：先查插件，再查内置 */
export function getApp(id) {
  return PLUGIN_APPS[id] || _builtinLookup(id) || null
}

export function pluginAppIds() {
  return Object.keys(PLUGIN_APPS)
}
