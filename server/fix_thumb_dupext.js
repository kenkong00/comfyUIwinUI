import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

const DB = path.join(process.cwd(), 'server', 'data.db')
const UD = path.join(process.cwd(), 'server', 'user_data')
const LOG = path.join(process.cwd(), '.temp', 'thumb-dedup-ext.txt')
const L = []
const log = (s) => L.push(String(s))

const db = new Database(DB)
const EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
const rows = db.prepare("SELECT id, thumbnail_path FROM file_library_files WHERE thumbnail_path LIKE '@userdata:%'").all()
let n = 0
for (const r of rows) {
  const rel = String(r.thumbnail_path).slice('@userdata:'.length)
  const abs = path.join(UD, ...rel.split('/'))
  const base = path.basename(abs)
  const m = base.match(/^(.*)\.(png|jpe?g|webp|gif|bmp)\.(png|jpe?g|webp|gif|bmp)$/i)
  if (!m) continue
  const clean = `${m[1]}.${m[3]}`
  const dstAbs = path.join(path.dirname(abs), clean)
  if (fs.existsSync(dstAbs)) continue
  if (!fs.existsSync(abs)) continue
  fs.renameSync(abs, dstAbs)
  const newRel = `@userdata:${rel.split('/').slice(0, -1).concat(clean).join('/')}`
  db.prepare('UPDATE file_library_files SET thumbnail_path = ? WHERE id = ?').run(newRel, r.id)
  n++
  log(`  ${base}  →  ${clean}`)
}
log(`双后缀整理: ${n} 个`)
fs.writeFileSync(LOG, L.join('\n'), 'utf8')
process.exit(0)
