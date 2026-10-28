// 存量迁移：把 file_library_files.thumbnail_data 里的 base64 缩略图解码落盘为 sidecar 文件，
// 数据库只保留 thumbnail_path（相对路径指针），随后清空 thumbnail_data 并 VACUUM 收缩库体积。
//
// 用法（必须用 node v24，系统默认 node22 与 better-sqlite3 的 ABI 不匹配）：
//   "C:\Program Files\nodejs\node.exe" server/migrate_thumbnails_to_disk.js [数据库路径]
// 数据库路径缺省为 server/data.db。运行前请先停止后端服务（避免 WAL 写锁冲突）。
//
// 该脚本会自动先备份 data.db(.bak.<时间戳>) 再改，可重复运行（已外置的行会跳过）。

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.argv[2] || path.join(process.cwd(), 'data.db');
const USER_DATA_DIR = path.join(path.dirname(DB_PATH), 'user_data');
const THUMB_EXT = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', gif: 'gif', bmp: 'bmp' };

function human(n) { return (n / 1024 / 1024).toFixed(2) + ' MB'; }

console.log('▶ 数据库:', DB_PATH);
if (!fs.existsSync(DB_PATH)) { console.error('✗ 数据库文件不存在'); process.exit(1); }

// 1. 备份（含 WAL/SHM，保证一致性）
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const bak = `${DB_PATH}.bak.${ts}`;
for (const suf of ['', '-wal', '-shm']) {
  const f = DB_PATH + suf;
  if (fs.existsSync(f)) fs.copyFileSync(f, bak + suf);
}
console.log('▶ 已备份到:', bak, '(.bak/.bak-wal/.bak-shm)');

// 2. 打开库
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 确保列存在（老库可能还没跑过启动迁移）
try { db.prepare('SELECT thumbnail_path FROM file_library_files LIMIT 1').get(); }
catch (e) { db.exec("ALTER TABLE file_library_files ADD COLUMN thumbnail_path TEXT DEFAULT ''"); }

const beforeBytes = fs.statSync(DB_PATH).size;

// 3. 遍历需要外置的行
const rows = db.prepare("SELECT id, user_id, format, thumbnail_data, thumbnail_path FROM file_library_files WHERE thumbnail_data IS NOT NULL AND thumbnail_data <> ''").all();
console.log(`▶ 待外置缩略图行数: ${rows.length}`);

let done = 0, skip = 0, err = 0, freedBytes = 0;
const updPath = db.prepare('UPDATE file_library_files SET thumbnail_path = ?, thumbnail_data = ? WHERE id = ?');

for (const r of rows) {
  // 已外置过则跳过
  if (r.thumbnail_path) { skip++; continue; }
  try {
    const m = String(r.thumbnail_data).match(/^data:image\/[^;]+;base64,(.+)$/);
    const b64 = m ? m[1] : String(r.thumbnail_data);
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) { skip++; continue; }
    const ext = THUMB_EXT[(r.format || 'png').toLowerCase()] || 'png';
    const dir = path.join(USER_DATA_DIR, String(r.user_id), '.thumbs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const rel = `@userdata:${r.user_id}/.thumbs/${r.id}.${ext}`;
    fs.writeFileSync(path.join(USER_DATA_DIR, String(r.user_id), '.thumbs', `${r.id}.${ext}`), buf);
    freedBytes += buf.length;
    updPath.run(rel, '', r.id);
    done++;
  } catch (e) {
    err++;
    if (err <= 5) console.error('  ✗ 行', r.id, e.message);
  }
}

console.log(`▶ 已外置: ${done}  跳过(已外置/空): ${skip}  失败: ${err}`);

// 4. 收缩库体积
console.log('▶ 执行 VACUUM ...');
db.exec('VACUUM');
db.close();

const afterBytes = fs.statSync(DB_PATH).size;
console.log('▶ 库体积:', human(beforeBytes), '→', human(afterBytes), `(${(100 * (1 - afterBytes / beforeBytes)).toFixed(1)}% 减少)`);
console.log('✓ 迁移完成。缩略图 sidecar 位于:', path.join(USER_DATA_DIR, '<用户>', '.thumbs'));
