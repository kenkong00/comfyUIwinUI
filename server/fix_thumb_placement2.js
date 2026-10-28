// 复用服务端唯一权威实现（driveLetterOf / thumbLocation），避免自己重算导致盘符不一致
import { relocateThumbMirror } from './database.js'
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

const APPLY = process.argv.includes('--apply')
const DB_PATH = path.join(process.cwd(), 'server', 'data.db')
const LOG = path.join(process.cwd(), '.temp', 'fix-thumb-placement2.log')
const LINES = []
const log = (s) => { LINES.push(String(s)); }
function flush() { try { fs.writeFileSync(LOG, LINES.join('\n'), 'utf8') } catch {} }

async function main() {
  const db = new Database(DB_PATH, APPLY ? undefined : { readonly: true })
  const rows = db.prepare("SELECT id, user_id, name, category_id, folder_id, thumbnail_path FROM file_library_files WHERE is_deleted = 0 AND thumbnail_path LIKE '@userdata:%'").all()
  log(`▶ 模式: ${APPLY ? '执行' : '演练'}   记录数: ${rows.length}`)
  let done = 0, missing = 0
  const dbW = APPLY ? db : null
  for (const r of rows) {
    const rel = String(r.thumbnail_path).slice('@userdata:'.length)
    const abs = path.join(process.cwd(), 'server', 'user_data', ...rel.split('/'))
    if (!fs.existsSync(abs)) { missing++; continue }
    if (APPLY) {
      const before = String(r.thumbnail_path)
      const changed = relocateThumbMirror(r.user_id, r.id)
      if (changed) { done++; if (done <= 8) log(`  [归位] ${before}  →  ${dbW.prepare('SELECT thumbnail_path FROM file_library_files WHERE id = ?').get(r.id).thumbnail_path}`) }
    } else {
      // 演练：只报告"是否需要搬"由 applying 逻辑内部判定，这里用直接只读对比文件位置
      done++ // 占位，真实统计在应用模式才有意义
    }
  }
  log('')
  log(APPLY ? `▶ 结果: 实际搬家 ${done} 条，源文件缺失 ${missing} 条` : `▶ 演练结束（执行模式才统计明细）；未搬\|缺失源文件 ${missing} 条`)
}

main().catch((e) => log('脚本异常: ' + (e && e.stack || e))).finally(() => { flush(); process.exit(0) })
