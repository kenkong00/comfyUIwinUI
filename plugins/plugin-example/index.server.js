// plugins/plugin-example/index.server.js
// 插件后端入口：导出 register(ctx)，返回一个 Express Router（也可以返回 null 表示只要前端）。
//
// ctx 由内核注入（server/plugin-sdk.js），可用能力：
//   ctx.db            主 SQLite 实例（better-sqlite3）
//   ctx.table(name)   带前缀的表名：'jobs' -> 'pl_example_jobs'
//   ctx.ensureTable(name, ddl)  幂等建表，ddl 里写 {table} 会自动替换成带前缀的表名
//   ctx.config.get/set(key, value)   插件私有配置（存本插件 data/config.json）
//   ctx.dataDir       插件私有数据目录
//   ctx.auth          需要登录的中间件
//   ctx.router()      新建 Router
//   ctx.log / ctx.warn
//
// 注意：项目 package.json 是 "type": "module"，所以入口请用 ESM 写法；
// 若要用 CommonJS，把文件名改成 .cjs 即可。

export function register(ctx) {
  const router = ctx.router()

  // 建自己的表（表名自动加 pl_example_ 前缀，不会和别的插件/内核冲突）
  ctx.ensureTable(
    'notes',
    `CREATE TABLE IF NOT EXISTS {table} (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       text TEXT,
       created_at TEXT DEFAULT (datetime('now','localtime'))
     )`
  )

  // 健康检查：前端用它验证后端插件链路是否通
  router.get('/ping', (req, res) => {
    res.json({
      success: true,
      plugin: ctx.id,
      version: ctx.version,
      time: new Date().toISOString(),
    })
  })

  // 一个完整的增删查示例
  router.get('/notes', (req, res) => {
    try {
      const rows = ctx.db.prepare(`SELECT * FROM ${ctx.table('notes')} ORDER BY id DESC LIMIT 50`).all()
      res.json({ success: true, data: rows })
    } catch (e) {
      res.status(500).json({ success: false, error: e.message })
    }
  })

  router.post('/notes', (req, res) => {
    try {
      const text = String(req.body?.text || '').slice(0, 2000)
      if (!text) return res.status(400).json({ success: false, error: 'text 不能为空' })
      const info = ctx.db.prepare(`INSERT INTO ${ctx.table('notes')} (text) VALUES (?)`).run(text)
      res.json({ success: true, data: { id: info.lastInsertRowid, text } })
    } catch (e) {
      res.status(500).json({ success: false, error: e.message })
    }
  })

  router.delete('/notes/:id', (req, res) => {
    try {
      ctx.db.prepare(`DELETE FROM ${ctx.table('notes')} WHERE id = ?`).run(Number(req.params.id))
      res.json({ success: true })
    } catch (e) {
      res.status(500).json({ success: false, error: e.message })
    }
  })

  ctx.log('后端路由已注册')
  return router
}

export default register
