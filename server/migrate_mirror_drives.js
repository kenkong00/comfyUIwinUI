// 存量归位：把已经躺在磁盘上的历史文件，按「盘符 + 文件夹层级」搬进镜像目录，
// 让硬盘上的目录结构真正和 UI 里看到的一模一样（阶段5 的存量部分）。
//
// 新写入的文件从阶段5 上线起就自动落在镜像目录里，本脚本只处理之前的历史文件。
//
// 用法（必须用 node v24，系统默认 node22 与 better-sqlite3 的 ABI 不匹配）：
//   演练（默认，不改任何东西，只打印将做什么）：
//     "C:\Program Files\nodejs\node.exe" server/migrate_mirror_drives.js [数据库路径]
//   执行（先自动备份再改）：
//     "C:\Program Files\nodejs\node.exe" server/migrate_mirror_drives.js [数据库路径] --apply
//   移动而非复制（省一半磁盘写入，但源目录会被清空；默认 --copy 更安全）：
//     ... --apply --move
//
// 数据库路径缺省为 server/data.db。运行前请先停止后端服务（避免 WAL 写锁冲突）。

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(process.cwd(), 'data.db');
const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes('--apply');
const DO_MOVE = ARGS.includes('--move');
const SERVER_DIR = path.dirname(DB_PATH);
const GALLERY_DIR = path.join(SERVER_DIR, 'gallery');
const USER_DATA_DIR = (() => {
  const envRoot = String(process.env.STORAGE_ROOT || '').trim();
  if (envRoot) return path.resolve(envRoot);
  return path.join(SERVER_DIR, 'user_data');
})();

const DOC_EXT = {
  novel: 'novel.json', storyboard: 'storyboard.json', json: 'json', workflow: 'json',
  rule: 'rule.txt', prompt: 'prompt.json', function: 'function.json', text: 'txt',
};
const DOC_TYPES = new Set(Object.keys(DOC_EXT));

console.log('▶ 数据库:', DB_PATH);
console.log('▶ 存储根:', USER_DATA_DIR);
console.log('▶ 模式:', APPLY ? (DO_MOVE ? '执行（移动）' : '执行（复制）') : '演练（不写入）');
if (!fs.existsSync(DB_PATH)) { console.error('✗ 数据库文件不存在'); process.exit(1); }

// 1. 备份（仅执行模式）
if (APPLY) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${DB_PATH}.bak.${ts}`;
  for (const suf of ['', '-wal', '-shm']) {
    const f = DB_PATH + suf;
    if (fs.existsSync(f)) fs.copyFileSync(f, bak + suf);
  }
  console.log('▶ 已备份到:', bak);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 老库可能还没跑过启动迁移，缺列时先补
function ensureColumn(table, col, ddl) {
  try { db.prepare(`SELECT ${col} FROM ${table} LIMIT 1`).get(); }
  catch { db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`); console.log(`  ✓ 补列 ${table}.${col}`); }
}
ensureColumn('file_library_categories', 'drive_letter', "drive_letter TEXT DEFAULT ''");
ensureColumn('file_library_files', 'content_path', "content_path TEXT DEFAULT ''");

// ---------- 工具 ----------
function sanitizeName(name) {
  if (typeof name !== 'string') return '';
  const c = name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s{2,}/g, ' ').trim();
  return c.replace(/[. ]+$/, '');
}
function mirrorBase(name, ext) {
  let b = sanitizeName(name || '未命名') || '未命名';
  const e = String(ext || '').toLowerCase();
  if (e && b.toLowerCase().endsWith(`.${e}`)) b = b.slice(0, -(e.length + 1)) || '未命名';
  return b;
}
function pickName(dirAbs, base, ext, srcAbs) {
  const suffix = ext ? `.${ext}` : '';
  const plain = `${base}${suffix}`;
  // 源字节已经就在目标位置（存量已归位）→ 保持不动，不要生成「名字 (2)」
  if (srcAbs && path.normalize(srcAbs) === path.normalize(path.join(dirAbs, plain))) return plain;
  let n = plain;
  if (!fs.existsSync(path.join(dirAbs, n))) return n;
  for (let i = 2; i < 1000; i++) {
    n = `${base} (${i})${suffix}`;
    if (!fs.existsSync(path.join(dirAbs, n))) return n;
  }
  return `${base}_${Date.now()}${suffix}`;
}
// 绝对路径 → 相对存储根（POSIX）
function relFrom(abs) { return path.relative(USER_DATA_DIR, abs).replace(/\\/g, '/'); }
// 解析历史 file_path：@userdata: 前缀 → 存储根；否则 → gallery
function resolveRaw(raw) {
  if (!raw) return null;
  const s = String(raw);
  if (s.startsWith('@userdata:')) {
    const rel = s.slice('@userdata:'.length);
    const abs = path.isAbsolute(rel) ? rel : path.join(USER_DATA_DIR, rel);
    return fs.existsSync(abs) ? abs : null;
  }
  const abs = path.join(GALLERY_DIR, s);
  if (fs.existsSync(abs)) return abs;
  const byName = path.join(GALLERY_DIR, path.basename(s));
  return fs.existsSync(byName) ? byName : null;
}

// 盘符分配（与 database.js 的 ensureDriveLetters 保持一致：总库=C，其余 D..Z 且删除不复用）
const driveByCat = new Map();
function buildDrives() {
  const users = db.prepare('SELECT DISTINCT user_id FROM file_library_categories').all();
  for (const { user_id } of users) {
    const cats = db.prepare('SELECT id, name, is_system, drive_letter FROM file_library_categories WHERE user_id = ? ORDER BY sort_order, id').all(user_id);
    let code = 68;
    for (const c of cats) {
      if (c.is_system === 1 && c.name === '总库') { driveByCat.set(c.id, 'C'); continue; }
      if (c.drive_letter) { driveByCat.set(c.id, c.drive_letter); code = Math.max(code, c.drive_letter.charCodeAt(0) + 1); continue; }
      if (code > 90) { driveByCat.set(c.id, 'C'); continue; }
      driveByCat.set(c.id, String.fromCharCode(code++));
    }
  }
}
buildDrives();
function letterOf(categoryId) {
  if (!categoryId) {
    const sys = db.prepare("SELECT id FROM file_library_categories WHERE is_system = 1 ORDER BY id LIMIT 1").get();
    return sys ? (driveByCat.get(sys.id) || 'C') : 'C';
  }
  return driveByCat.get(categoryId) || 'C';
}

// 文件夹层级名链
const chainCache = new Map();
function chainOf(folderId) {
  if (chainCache.has(folderId)) return chainCache.get(folderId);
  const names = [];
  let cur = folderId; let guard = 0;
  while (cur && guard++ < 100) {
    const f = db.prepare('SELECT name, parent_id FROM file_library_folders WHERE id = ?').get(cur);
    if (!f) break;
    names.unshift(f.name);
    cur = f.parent_id;
  }
  chainCache.set(folderId, names);
  return names;
}
function mirrorDir(userId, categoryId, folderId) {
  const parts = [USER_DATA_DIR, String(userId), letterOf(categoryId)];
  if (folderId) parts.push(...chainOf(folderId));
  return path.join(...parts);
}

// ---------- ① 建目录 ----------
let dirsCreated = 0;
const users = db.prepare('SELECT DISTINCT user_id FROM file_library_categories').all().map((r) => r.user_id);
for (const u of db.prepare('SELECT DISTINCT user_id FROM file_library_folders').all()) if (!users.includes(u.user_id)) users.push(u.user_id);
for (const u of db.prepare('SELECT DISTINCT user_id FROM file_library_files').all()) if (!users.includes(u.user_id)) users.push(u.user_id);

for (const userId of users) {
  for (const c of db.prepare('SELECT id, name, is_system FROM file_library_categories WHERE user_id = ?').all(userId)) {
    const d = path.join(USER_DATA_DIR, String(userId), letterOf(c.id));
    if (!fs.existsSync(d)) {
      if (APPLY) { fs.mkdirSync(d, { recursive: true }); dirsCreated++; }
      else dirsCreated++;
    }
  }
  for (const f of db.prepare('SELECT id, category_id FROM file_library_folders WHERE user_id = ? AND is_deleted = 0').all(userId)) {
    const d = mirrorDir(userId, f.category_id, f.id);
    if (!fs.existsSync(d)) {
      if (APPLY) { fs.mkdirSync(d, { recursive: true }); dirsCreated++; }
      else dirsCreated++;
    }
  }
}
console.log(`▶ 目录：将创建 ${dirsCreated} 个（盘符目录 + 文件夹层级）`);

// ---------- ② 文件归位 ----------
const rows = db.prepare('SELECT * FROM file_library_files WHERE is_deleted = 0 ORDER BY id').all();
let moved = 0, skipped = 0, failed = 0, bytes = 0;
const planned = [];

for (const r of rows) {
  const userId = r.user_id;
  const dirAbs = mirrorDir(userId, r.category_id, r.folder_id);
  let changed = false;

  // 二进制（图片 / 视频 / 音频）
  if (['image', 'video', 'audio'].includes(r.file_type) && r.file_path) {
    const srcAbs = resolveRaw(r.file_path);
    if (srcAbs) {
      const ext = String(r.format || path.extname(srcAbs).replace('.', '') || 'png').toLowerCase();
      const dstAbs = path.join(dirAbs, pickName(dirAbs, mirrorBase(r.name, ext), ext, srcAbs));
      if (path.normalize(srcAbs) !== path.normalize(dstAbs)) {
        planned.push({ kind: 'binary', id: r.id, src: srcAbs, dst: dstAbs });
        bytes += (fs.statSync(srcAbs).size || 0);
        changed = true;
      }
    }
  }
  // 文档型正文
  if (DOC_TYPES.has(r.file_type)) {
    const ext = DOC_EXT[r.file_type] || 'txt';
    const srcAbs = r.content_path ? resolveRaw(r.content_path) : null;
    const dstAbs = path.join(dirAbs, pickName(dirAbs, mirrorBase(r.name, ext), ext, srcAbs));
    const hasText = r.content && String(r.content).length > 0;
    if (srcAbs && path.normalize(srcAbs) !== path.normalize(dstAbs)) {
      planned.push({ kind: 'doc', id: r.id, src: srcAbs, dst: dstAbs });
      changed = true;
    } else if (!srcAbs && hasText) {
      planned.push({ kind: 'doc-new', id: r.id, text: String(r.content), dst: dstAbs });
      changed = true;
    }
  }
  if (!changed) skipped++;
}

console.log(`▶ 文件：待归位 ${planned.length}  已就位/无需处理 ${skipped}`);
console.log(`▶ 预计写入 ${(bytes / 1024 / 1024).toFixed(1)} MB${DO_MOVE ? '（移动模式，不额外占用空间）' : '（复制模式，源目录仍保留）'}`);

if (!APPLY) {
  for (const p of planned.slice(0, 15)) {
    if (p.src) console.log(`   #${p.id} ${p.src}\n      → ${p.dst}`);
    else console.log(`   #${p.id} [正文落盘] → ${p.dst}`);
  }
  if (planned.length > 15) console.log(`   ... 另有 ${planned.length - 15} 项`);
  console.log('\n✓ 演练结束，未做任何改动。确认无误后加 --apply 执行。');
  db.close();
  process.exit(0);
}

const updFile = db.prepare('UPDATE file_library_files SET file_path = ? WHERE id = ?');
const updDoc = db.prepare('UPDATE file_library_files SET content_path = ? WHERE id = ?');
const tx = db.transaction(() => {
  for (const p of planned) {
    try {
      const dir = path.dirname(p.dst);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (p.kind === 'doc-new') {
        fs.writeFileSync(p.dst, p.text, 'utf8');
        updDoc.run(`@userdata:${relFrom(p.dst)}`, p.id);
      } else if (fs.existsSync(p.src)) {
        if (DO_MOVE) {
          try { fs.renameSync(p.src, p.dst); }
          catch { fs.copyFileSync(p.src, p.dst); fs.unlinkSync(p.src); }
        } else {
          fs.copyFileSync(p.src, p.dst);
        }
        if (p.kind === 'binary') updFile.run(`@userdata:${relFrom(p.dst)}`, p.id);
        else updDoc.run(`@userdata:${relFrom(p.dst)}`, p.id);
      } else {
        failed++;
        continue;
      }
      moved++;
    } catch (e) {
      failed++;
      if (failed <= 5) console.error('  ✗ 行', p.id, e.message);
    }
  }
});
tx();

console.log(`▶ 归位完成: ${moved}  失败: ${failed}`);
db.close();
console.log('✓ 完成。现在 user_data/<用户>/<盘符>/ 下的目录结构应与 UI 中完全一致。');
if (!DO_MOVE) console.log('  提示：源目录（server/gallery/<用户>/ 与 .docs/）里的旧文件未删除，确认无误后可手动清理。');
