import { createApp } from 'vue'
import { pinia } from './stores'
import './style.css'
import './shell/shell.css'
import App from './App.vue'
import { loadPlugins } from './shell/pluginRegistry'

// 全局错误兜底：白屏类问题（渲染异常 / 未捕获 Promise）在控制台之外留一份可见证据。
// 错误写进 localStorage.__lastError，并在页面上顶一条红条，避免"只剩白屏无从下手"。
window.addEventListener('error', (e) => {
  try {
    const msg = `${e.message || 'error'} @ ${(e.filename || '').split('/').pop()}:${e.lineno || 0}`
    localStorage.setItem('__lastError', msg)
  } catch { /* ignore */ }
})
window.addEventListener('unhandledrejection', (e) => {
  try {
    const r = e.reason
    localStorage.setItem('__lastError', 'unhandledrejection: ' + ((r && r.message) || String(r)))
  } catch { /* ignore */ }
})

// 全局主题引导（桌面模式下 Sidebar 不挂载，这里兜底初始化）
const savedTheme = localStorage.getItem('app-theme') || 'light'
document.documentElement.setAttribute('data-theme', savedTheme)

const app = createApp(App)
app.use(pinia)
app.mount('#app')

// 开发期调试出口：控制台可直接 __wm.open('photos') 打开任意应用（含插件）验证渲染
if (import.meta.env.DEV) {
  import('./shell/wm.js').then((m) => { window.__wm = m.useWm() })
}

// 若挂载后 #app 仍为空（渲染中途崩了），给用户一条看得见的提示而不是纯白屏
setTimeout(() => {
  const el = document.getElementById('app')
  if (el && !el.innerHTML.trim()) {
    const info = localStorage.getItem('__lastError') || '未知错误（打开控制台查看）'
    const box = document.createElement('div')
    box.style.cssText =
      'position:fixed;left:12px;right:12px;top:12px;z-index:99999;padding:12px 14px;' +
      'background:#fff3f2;border:1px solid #e8b7b2;border-radius:8px;color:#8a2f27;' +
      'font:13px/1.7 system-ui,"Microsoft YaHei",sans-serif'
    box.textContent = '页面渲染失败：' + info
    document.body.appendChild(box)
  }
}, 1500)

// 插件发现与注册：不阻塞首屏，挂载后再加载。
// 注册完成后 registryVersion 自增 → 桌面图标 / 开始菜单 / 搜索列表自动重算（见 apps.js）。
loadPlugins().catch((e) => console.error('[plugins] 初始化失败:', e))
