// server/plugin-sdk.js
// 插件上下文（PluginContext）：内核暴露给插件的能力集合。
//
// 设计原则（对齐 ComfyUI 的 custom_nodes 契约）：
//   - 插件只拿到「内核主动给的东西」，拿不到整个 app / 内核源码引用
//   - 一切能力都在这个 ctx 上，将来要收紧权限只改这一处
//   - ctx 上带 pluginId 前缀，DB 表、配置、数据目录天然隔离，不会互相踩

import fs from 'fs'
import path from 'path'
import express from 'express'

/**
 * 创建插件上下文
 * @param {object} manifest 插件清单（plugin.json 内容）
 * @param {object} opts     { pluginsDir, db, authMiddleware, state, saveState }
 */
export function createPluginContext(manifest, opts) {
  const { pluginsDir, db, authMiddleware, saveState } = opts
  const id = manifest.id
  const dir = path.join(pluginsDir, manifest._dir || id)
  const dataDir = path.join(dir, 'data')

  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  } catch (e) {
    console.warn(`[plugins] ${id} 数据目录创建失败: ${e.message}`)
  }

  const cfgPath = path.join(dataDir, 'config.json')
  function readCfg() {
    try {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    } catch {
      return {}
    }
  }
  function writeCfg(obj) {
    try {
      fs.writeFileSync(cfgPath, JSON.stringify(obj, null, 2), 'utf8')
      return true
    } catch (e) {
      console.warn(`[plugins] ${id} 配置写入失败: ${e.message}`)
      return false
    }
  }

  // 表名强制加前缀，杜绝插件之间 / 插件与内核的命名冲突
  const prefix = `pl_${String(id).replace(/[^a-zA-Z0-9_]/g, '_')}_`

  return {
    // ---- 身份 ----
    id,
    name: manifest.name || id,
    version: manifest.version || '0.0.0',
    dir,
    dataDir,

    // ---- 日志 ----
    log: (...a) => console.log(`[plugin:${id}]`, ...a),
    warn: (...a) => console.warn(`[plugin:${id}]`, ...a),

    // ---- 数据库 ----
    db,
    /** 插件表名自动加前缀：ctx.table('jobs') -> pl_<id>_jobs */
    table: (name) => `${prefix}${name}`,
    /** 建表（幂等）：ctx.ensureTable('jobs', 'CREATE TABLE IF NOT EXISTS ...') */
    ensureTable(name, ddl) {
      try {
        db.exec(ddl.replace(/\{table\}/g, `${prefix}${name}`))
        return `${prefix}${name}`
      } catch (e) {
        console.warn(`[plugin:${id}] 建表失败 ${name}: ${e.message}`)
        return null
      }
    },

    // ---- 插件私有配置（存插件目录 data/config.json）----
    config: {
      get(key, def = null) {
        const v = readCfg()[key]
        return v === undefined ? def : v
      },
      set(key, value) {
        const c = readCfg()
        c[key] = value
        return writeCfg(c)
      },
      all: () => readCfg(),
      remove(key) {
        const c = readCfg()
        delete c[key]
        return writeCfg(c)
      },
    },

    // ---- HTTP ----
    /** 新建一个独立 Router，return 出去由内核挂载到清单里声明的 route 上 */
    router: () => express.Router(),
    /** 需要登录才能访问的中间件 */
    auth: authMiddleware,
    express,

    // ---- 全局开关持久化（启用/禁用状态由内核管，插件可读不可改）----
    isEnabled: () => true,
    _saveState: saveState,
  }
}

export default createPluginContext
