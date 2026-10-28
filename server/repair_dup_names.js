// 同目录重名修复：把任何「同一父目录下重名」的项顺延编号（文件与文件夹互相占位）。
// 铁律：同一目录里绝不允许同名 —— 否则硬盘上两个记录会挤进同一个真实路径，其中一个等于消失。
// 演练：node server/repair_dup_names.js
// 执行：node server/repair_dup_names.js --apply
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

const APPLY = process.argv.includes('--apply')
const DB_PATH = path.join(process.cwd(), 'server', 'data.db')
const LOG = path.join(process.cwd(), '.temp', 'repair-dup-names.log')
const LINES = []
const log = (s) => { LINES.push(String(s)) }
function flush() { try { fs.writeFileSync(LOG, LINES.join('\n'), 'utf8') } catch {} }

async function main() {
  const db = new Database(DB_PATH, APPLY ? undefined : { readonly: true })
  const users = db.prepare('SELECT id, username FROM users').all()
  log(`▶ 模式: ${APPLY ? '执行' : '演练'}   用户数: ${users.length}`)

  let groups = 0
  for (const u of users) {
    log(`\n— 用户 ${u.username} (id=${u.id}) —`)
    const df = db.prepare(`SELECT IFNULL(category_id,0) AS c, IFNULL(parent_id,0) AS p, LOWER(name) AS k, COUNT(*) AS n
      FROM file_library_folders WHERE user_id = ? AND is_deleted = 0
      GROUP BY c, p, k HAVING n > 1`).all(u.id)
    const dl = db.prepare(`SELECT IFNULL(category_id,0) AS c, IFNULL(folder_id,0) AS p, LOWER(name) AS k, COUNT(*) AS n
      FROM file_library_files WHERE user_id = ? AND is_deleted = 0
      GROUP BY c, p, k HAVING n > 1`).all(u.id)
    const cross = db.prepare(`SELECT f.id AS fid, d.id AS did, f.name AS fname
      FROM file_library_files f
      JOIN file_library_folders d ON d.user_id = f.user_id AND d.is_deleted = 0
        AND IFNULL(d.category_id,0) = IFNULL(f.category_id,0)
        AND IFNULL(d.parent_id,0) = IFNULL(f.folder_id,0)
        AND LOWER(d.name) = LOWER(f.name)
      WHERE f.user_id = ? AND f.is_deleted = 0`).all(u.id)
    for (const g of df) {
      const rows = db.prepare('SELECT id, name FROM file_library_folders WHERE user_id = ? AND is_deleted = 0 AND IFNULL(category_id,0)=? AND IFNULL(parent_id,0)=? AND LOWER(name)=? ORDER BY id').all(u.id, g.c, g.p, g.k)
      groups++
      log(`  [文件夹重名] ${g.k} × ${rows.length} → ${rows.map((r) => `#${r.id}:${r.name}`).join(' | ')}`)
    }
    for (const g of dl) {
      const rows = db.prepare('SELECT id, name FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND IFNULL(category_id,0)=? AND IFNULL(folder_id,0)=? AND LOWER(name)=? ORDER BY id').all(u.id, g.c, g.p, g.k)
      groups++
      log(`  [文件重名] ${g.k} × ${rows.length} → ${rows.map((r) => `#${r.id}:${r.name}`).join(' | ')}`)
    }
    for (const c of cross) {
      groups++
      log(`  [文件与文件夹撞名] 文件 #${c.fid}:${c.fname} ↔ 文件夹 #${c.did}`)
    }
    if (!df.length && !dl.length && !cross.length) log('  （无重名）')
  }
  log(`\n▶ 共发现 ${groups} 组重名`)
  if (!APPLY) { log('（演练结束，加 --apply 才会改名）'); return }
  if (!groups) { log('无需修复'); return }

  const { dedupeAllNames } = await import('./database.js')
  let total = 0
  for (const u of users) {
    const renamed = dedupeAllNames(u.id) || []
    total += renamed.length
    log(`\n— 用户 ${u.username} 已改名 ${renamed.length} 项 —`)
    for (const r of renamed.slice(0, 30)) log(`  ${r.kind} #${r.id} → ${r.name}`)
  }
  log(`\n▶ 修复完成：共 ${total} 项改名`)
}

main().catch((e) => log('脚本异常: ' + ((e && e.stack) || e))).finally(() => { flush(); process.exit(0) })
