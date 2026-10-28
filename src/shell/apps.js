// src/shell/apps.js
// 应用注册表：Shell 的唯一事实来源。
//   APPS         —— 内置（内核自带）应用，构建期静态注册
//   PLUGIN_APPS  —— 插件应用，运行期由 pluginRegistry 动态注册（等价于 ComfyUI 的 custom_nodes）
// 两者对上层（wm.open / WindowFrame / 任务栏）完全等价：统一用 getApp(id) 取。
import { pluginAppIds } from '@/shell/registry'
import ExplorerApp from '@/components/apps/ExplorerApp.vue'
import SettingsPanel from '@/components/settings/SettingsPanel.vue'
import ChatPanel from '@/components/chat/ChatPanel.vue'
import TaskLibrary from '@/components/generation/TaskLibrary.vue'
import SingleGenerate from '@/components/generation/SingleGenerate.vue'
import UIView from '@/components/ui/UIView.vue'
import CharacterPanel from '@/components/character/CharacterPanel.vue'
import TagManager from '@/components/generation/TagManager.vue'
import UserProfile from '@/components/user/UserProfile.vue'
import ConversationHistory from '@/components/chat/ConversationHistory.vue'

// 以下应用已迁移为插件，由 plugins/ 目录提供、运行期动态注册（id 保持不变）：
//   notepad  → plugins/plugin-notepad      文本文档
//   photos   → plugins/plugin-photos       照片
//   media    → plugins/plugin-media        媒体播放器
//   json     → plugins/plugin-json         工作流查看器
//   workflow → plugins/plugin-workflow     工作流节点编辑器
//   storyboard → plugins/plugin-storyboard 分镜生成
//   novel    → plugins/plugin-novel        小说阅读器
//   recycle  → plugins/plugin-recycle      回收站
//   membership → plugins/plugin-membership 会员中心
// 内核保留项 = 桌面外壳本体（文件管理 / 设置 / AI 对话 / 任务 / 生成 / UI 设计 / 角色 / 标签 / 账户 / 历史）。

// 图标名见 icons.js
export const APPS = {
  explorer:   { name: '文件资源管理器', icon: 'explorer',   component: ExplorerApp,         multi: true,  pin: 1, w: 1000, h: 660 },
  studio:     { name: '功能库',         icon: 'studio',     component: SingleGenerate,      multi: true,  pin: 1, w: 1100, h: 720 },
  tasks:      { name: '任务中心',       icon: 'tasks',      component: TaskLibrary,         multi: false, pin: 1, w: 1080, h: 700 },
  chat:       { name: 'AI 对话',        icon: 'chat',       component: ChatPanel,           multi: true,  pin: 1, w: 980,  h: 700 },
  uidesigner: { name: 'UI 设计器',      icon: 'uidesigner', component: UIView,              multi: true,  pin: 1, w: 1180, h: 760 },
  // photos / media / json / workflow / storyboard / novel —— 已迁移为插件（见上方清单）
  settings:   { name: '设置',           icon: 'settings',   component: SettingsPanel,       multi: false, pin: 1, w: 1000, h: 700 },
  character:  { name: '角色管理',       icon: 'character',  component: CharacterPanel,      multi: true,  pin: 0, w: 1040, h: 700 },
  // storyboard / novel —— 已迁移为插件（见上方清单）
  tag:        { name: '标签库',         icon: 'tag',        component: TagManager,          multi: true,  pin: 0, w: 960,  h: 640 },
  profile:    { name: '账户',           icon: 'profile',    component: UserProfile,         multi: false, pin: 0, w: 900,  h: 640 },
  history:    { name: '对话历史',       icon: 'history',    component: ConversationHistory, multi: true,  pin: 0, w: 1000, h: 680 },
  // recycle / membership —— 已迁移为插件（见上方清单）
}

// 任务栏固定顺序
export const PINNED_TASKBAR = ['explorer', 'studio', 'tasks', 'chat', 'uidesigner', 'storyboard', 'novel', 'notepad', 'membership', 'settings']
// 开始菜单"已固定"顺序
export const PINNED_START = ['explorer', 'studio', 'tasks', 'chat', 'uidesigner', 'storyboard', 'novel', 'notepad', 'photos', 'character', 'membership', 'settings', 'recycle']
// 开始菜单"所有应用"（旧导航兜底）
export const ALL_APPS = [
  'explorer', 'studio', 'tasks', 'chat', 'uidesigner', 'notepad', 'photos',
  'media', 'json', 'workflow', 'character', 'storyboard', 'novel', 'tag', 'settings', 'profile', 'membership', 'history', 'recycle',
]

// ============================================================
// 插件应用注册表（运行期动态部分）
// ============================================================
// 状态本身放在 src/shell/registry.js（零依赖叶子模块），这里原样 re-export，
// 老代码 `import { PLUGIN_APPS, registerApp } from '@/shell/apps'` 不用改。
// 目的：断开 apps.js → SettingsPanel → PluginManager → pluginRegistry → apps.js 的循环依赖。
export {
  PLUGIN_APPS,
  registryVersion,
  registerApp,
  unregisterApp,
  getApp,
} from '@/shell/registry'
import { setBuiltinLookup } from '@/shell/registry'

// 把自己（内置应用）登记进查找链，getApp 才能「先插件后内置」
setBuiltinLookup((id) => APPS[id] || null)

// 全部 appId（内置 + 插件），去重且保持内置顺序在前
export function allAppIds() {
  return [...new Set([...ALL_APPS, ...pluginAppIds()])]
}
