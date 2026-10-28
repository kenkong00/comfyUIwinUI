// server/plugin-loader.js
// 插件加载器 —— 本项目等价于 ComfyUI 的 `init_external_custom_nodes()` + `load_custom_node()`。
//
// 职责：
//   1. 扫描 plugins/<dir>/plugin.json        （发现）
//   2. 读 plugins-state.json 判断启用/禁用    （开关）
//   3. 动态 import server.entry，拿回 Router   （注册）
//   4. 挂到清单声明的 route 上                （挂载）
//   5. 暴露 /api/plugins 管理接口 + /plugins 静态资源（供前端运行时拉 dist）
//
// 注意：后端路由的挂载发生在 api-server 启动时；启用/禁用改动需重启 api-server 才生效
// （前端 UI 会在响应里带 needRestart 提示）。

import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { pathToFileURL } from 'url'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const PLUGINS_DIR = path.join(__dirname, '..', 'plugins')
const STATE_FILE = path.join(__dirname, 'plugins-state.json')

// 内核版本：插件清单可用 coreVersion 声明兼容范围
export const CORE_VERSION = '1.0.0'

const REQUIRED_FIELDS = ['id', 'name']

// ---------------------------------------------------------------------------
// 状态文件：{ "<pluginId>": { enabled: true } }
// ---------------------------------------------------------------------------
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}
function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8')
    return true
  } catch (e) {
    console.warn('[plugins] 状态文件写入失败:', e.message)
    return false
  }
}

// ---------------------------------------------------------------------------
// 发现：扫描 plugins/ 下每个子目录的 plugin.json
// ---------------------------------------------------------------------------
export function discover() {
  if (!fs.existsSync(PLUGINS_DIR)) return []
  const state = readState()
  const out = []
  for (const dir of fs.readdirSync(PLUGINS_DIR)) {
    const abs = path.join(PLUGINS_DIR, dir)
    if (!fs.statSync(abs).isDirectory()) continue
    if (dir.startsWith('.') || dir === 'node_modules') continue

    const mfPath = path.join(abs, 'plugin.json')
    if (!fs.existsSync(mfPath)) continue
    let mf
    try {
      mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'))
    } catch (e) {
      console.warn(`[plugins] ${dir}/plugin.json 解析失败: ${e.message}`)
      continue
    }
    const missing = REQUIRED_FIELDS.filter((f) => !mf[f])
    if (missing.length) {
      console.warn(`[plugins] ${dir} 清单缺少必填字段: ${missing.join(', ')}`)
      continue
    }
    const st = state[mf.id] || {}
    out.push({
      ...mf,
      _dir: dir,
      enabled: st.enabled !== false,
      installedAt: st.installedAt || null,
    })
  }
  // 同名 id 只保留第一个，避免冲突
  const seen = new Set()
  return out.filter((m) => (seen.has(m.id) ? false : seen.add(m.id)))
}

// ---------------------------------------------------------------------------
// 挂载：把每个启用插件的 server.entry 挂成 Express 路由
// ---------------------------------------------------------------------------
export async function mountPlugins(app, { db, authMiddleware }) {
  const list = discover()
  const mounted = []
  const failed = []

  for (const m of list) {
    if (!m.enabled) continue
    const entryRel = m.server?.entry
    if (!entryRel) continue

    const entryAbs = path.join(PLUGINS_DIR, m._dir, entryRel)
    if (!fs.existsSync(entryAbs)) {
      failed.push({ id: m.id, error: `server.entry 不存在: ${entryRel}` })
      continue
    }
    try {
      const mod = await import(pathToFileURL(entryAbs).href)
      const { createPluginContext } = await import('./plugin-sdk.js')
      const ctx = createPluginContext(m, {
        pluginsDir: PLUGINS_DIR,
        db,
        authMiddleware,
        saveState: writeState,
      })
      const fn = typeof mod.register === 'function' ? mod.register : mod.default
      if (typeof fn !== 'function') {
        failed.push({ id: m.id, error: '入口未导出 register(ctx) 或 default(ctx)' })
        continue
      }
      const router = await fn(ctx)
      if (!router) continue
      const route = m.server.route || `/api/p/${m.id}`
      app.use(route, router)
      mounted.push({ id: m.id, route })
      console.log(`[plugins] ✓ ${m.name || m.id} → ${route}`)
    } catch (e) {
      failed.push({ id: m.id, error: e.message || String(e) })
      console.error(`[plugins] ✗ ${m.id} 加载失败:`, e.message)
    }
  }

  return { list, mounted, failed }
}

// ---------------------------------------------------------------------------
// 管理接口 + 静态资源
// ---------------------------------------------------------------------------
export function installPluginRoutes(app) {
  // 插件目录静态资源：前端运行期拉 dist/index.mjs 用
  app.use('/plugins', expressStatic(PLUGINS_DIR))

  app.get('/api/plugins', (req, res) => {
    try {
      const list = discover()
      res.json({ success: true, data: list, coreVersion: CORE_VERSION })
    } catch (e) {
      res.status(500).json({ success: false, error: e.message })
    }
  })

  app.post('/api/plugins/:id/enabled', (req, res) => {
    try {
      const id = decodeURIComponent(req.params.id)
      const state = readState()
      state[id] = { ...(state[id] || {}), enabled: req.body?.enabled !== false }
      writeState(state)
      res.json({
        success: true,
        data: { id, enabled: state[id].enabled },
        needRestart: true,
      })
    } catch (e) {
      res.status(500).json({ success: false, error: e.message })
    }
  })

  app.delete('/api/plugins/:id', (req, res) => {
    try {
      const id = decodeURIComponent(req.params.id)
      const hit = discover().find((m) => m.id === id)
      if (!hit) return res.status(404).json({ success: false, error: '插件不存在' })
      fs.rmSync(path.join(PLUGINS_DIR, hit._dir), { recursive: true, force: true })
      const state = readState()
      delete state[id]
      writeState(state)
      res.json({ success: true, data: { id, removed: true }, needRestart: true })
    } catch (e) {
      res.status(500).json({ success: false, error: e.message })
    }
  })

  // 安装：{ fromDir } 本地目录导入 | { url } 下载 zip 解压
  app.post('/api/plugins/install', async (req, res) => {
    try {
      const { fromDir, url } = req.body || {}
      if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true })
      let target
      if (fromDir) {
        const src = path.resolve(String(fromDir))
        if (!fs.existsSync(src)) return res.status(400).json({ success: false, error: '源目录不存在' })
        target = path.join(PLUGINS_DIR, path.basename(src))
        fs.cpSync(src, target, { recursive: true })
      } else if (url) {
        const tmpZip = path.join(os.tmpdir(), `plugin-${Date.now()}.zip`)
        const r = await fetch(url)
        if (!r.ok) return res.status(400).json({ success: false, error: `下载失败 ${r.status}` })
        fs.writeFileSync(tmpZip, Buffer.from(await r.arrayBuffer()))
        const staging = path.join(PLUGINS_DIR, `.staging-${Date.now()}`)
        fs.mkdirSync(staging, { recursive: true })
        await extractZip(tmpZip, staging)
        fs.unlinkSync(tmpZip)
        const inner = unwrapSingleDir(staging)
        const mf = readManifest(inner)
        if (!mf) {
          fs.rmSync(staging, { recursive: true, force: true })
          return res.status(400).json({ success: false, error: '包内找不到 plugin.json' })
        }
        target = path.join(PLUGINS_DIR, mf.id)
        fs.rmSync(target, { recursive: true, force: true })
        fs.cpSync(inner, target, { recursive: true })
        fs.rmSync(staging, { recursive: true, force: true })
      } else {
        return res.status(400).json({ success: false, error: '需要 fromDir 或 url' })
      }

      const mf = readManifest(target)
      if (!mf) return res.status(400).json({ success: false, error: 'plugin.json 缺失或不合法' })
      const state = readState()
      state[mf.id] = { ...(state[mf.id] || {}), enabled: true, installedAt: new Date().toISOString() }
      writeState(state)
      res.json({ success: true, data: mf, needRestart: true })
    } catch (e) {
      res.status(500).json({ success: false, error: e.message })
    }
  })
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function expressStatic(dir) {
  // 延迟 require，避免本文件被纯工具脚本引用时强依赖 express
  const express = require('express')
  return express.static(dir, { maxAge: 0, setHeaders: (r) => r.setHeader('Cache-Control', 'no-store') })
}

function readManifest(dir) {
  try {
    const mf = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'))
    return REQUIRED_FIELDS.every((f) => mf[f]) ? mf : null
  } catch {
    return null
  }
}

// zip 里通常有一层顶层目录，剥掉它
function unwrapSingleDir(root) {
  const entries = fs.readdirSync(root).filter((n) => !n.startsWith('.'))
  if (entries.length === 1) {
    const only = path.join(root, entries[0])
    if (fs.statSync(only).isDirectory()) return only
  }
  return root
}

function extractZip(zipPath, targetDir) {
  return new Promise((resolve, reject) => {
    // Windows 10+ / macOS / Linux 均有 tar；Windows 的 tar.exe 基于 libarchive，可直接解 zip
    const p = spawn('tar', ['-xf', zipPath, '-C', targetDir], { stdio: 'ignore' })
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`解压失败 (tar exit ${code})`))))
  })
}

export default { discover, mountPlugins, installPluginRoutes, PLUGINS_DIR }
