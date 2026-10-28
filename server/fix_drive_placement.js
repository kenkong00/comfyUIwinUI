/**
 * 盘符归位修正（针对 migrate_user_dirs.js 第③步的漏网情况）：
 *   判据不看 category_id 与父文件夹是否一致，而是看「文件真实落盘位置所在的盘符」
 *   与「category_id 对应的盘符」是否一致，不一致就把文件搬到正确盘符目录。
 *
 *   node fix_drive_placement.js ./data.db           # 演练
 *   node fix_drive_placement.js ./data.db --apply   # 执行
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DB_PATH = process.argv[2] || './data.db';
const APPLY = process.argv.includes('--apply');
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA = path.join(SERVER_DIR, 'user_data');

const DOC_EXT = {
  novel: 'novel.json', storyboard: 'storyboard.json', json: 'json', workflow: 'json',
  rule: 'rule.txt', prompt: 'prompt.json', function: 'function.json', text: 'txt',
};
const KNOWN_EXT = [
  'storyboard.json', 'novel.json', 'prompt.json', 'function.json', 'rule.txt', 'workflow.json',
  'json', 'txt', 'novel', 'md', 'csv',
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg',
  'mp4', 'webm', 'mov', 'avi', 'mp3', 'wav', 'ogg',
];
const sanitize = (n) => String(n || '').replace(/[\\/:*?"<>|]/g, '_').trim();
function baseName(name) {
  let base = sanitize(name) || '未命名';
  let changed = true;
  while (changed) {
    changed = false;
    const low = base.toLowerCase();
    for (const k of KNOWN_EXT) {
      if (low.endsWith(`.${k}`) && base.length > k.length + 1) { base = base.slice(0, -(k.length + 1)); changed = true; break; }
    }
  }
  return base || '未命名';
}
function pickName(dirAbs, base, ext) {
  const suffix = ext ? `.${ext}` : '';
  const plain = `${base}${suffix}`;
  if (!fs.existsSync(path.join(dirAbs, plain))) return plain;
  for (let i = 2; i < 1000; i++) {
    const n = `${base} (${i})${suffix}`;
    if (!fs.existsSync(path.join(dirAbs, n))) return n;
  }
  return `${base}_${Date.now()}${suffix}`;
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
console.log(`▶ 模式: ${APPLY ? '执行' : '演练'}  ${path.resolve(DB_PATH)}`);
if (APPLY) {
  const bak = `${DB_PATH}.bak.drivefix.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(DB_PATH, bak);
  console.log(`▶ 已备份: ${bak}`);
}

const driveLetterOf = (catId) => {
  if (!catId) return 'C';
  const c = db.prepare('SELECT drive_letter, name, is_system FROM file_library_categories WHERE id = ?').get(catId);
  if (!c) return 'C';
  if (c.drive_letter) return c.drive_letter;
  if (c.is_system === 1 && c.name === '总库') return 'C';
  return 'C';
};
function chainOf(folderId) {
  const names = [];
  let cur = folderId; let guard = 0;
  while (cur && guard++ < 100) {
    const f = db.prepare('SELECT name, parent_id FROM file_library_folders WHERE id = ?').get(cur);
    if (!f) break;
    names.unshift(f.name); cur = f.parent_id;
  }
  return names;
}
const dirNameOf = (uid) => {
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(uid);
  return sanitize(u && u.username) || `user_${String(uid).slice(0, 8)}`;
};

const rows = db.prepare(`
  SELECT id, user_id, name, file_type, category_id, folder_id, file_path, content_path, format
  FROM file_library_files WHERE is_deleted = 0
`).all();

let bad = 0, fixed = 0, missing = 0;
for (const r of rows) {
  const key = ['image', 'video', 'audio'].includes(r.file_type) ? 'file_path' : 'content_path';
  const cur = r[key];
  if (!cur || !cur.startsWith('@userdata:')) continue;
  const rel = cur.slice(10);
  const seg = rel.split('/');
  if (seg.length < 3 || !/^[A-Z]$/.test(seg[1] || '')) continue; // 不是盘符镜像区（.thumbs/.docs 等）
  const wantLetter = driveLetterOf(r.category_id);
  if (seg[1] === wantLetter) continue;
  bad++;
  const srcAbs = path.join(USER_DATA, rel);
  const dstDir = path.join(USER_DATA, dirNameOf(r.user_id), wantLetter, ...(r.folder_id ? chainOf(r.folder_id) : []));
  console.log(`  #${r.id} 「${r.name}」 ${seg[1]}: → ${wantLetter}:  ${path.relative(USER_DATA, dstDir)}`);
  if (!APPLY) continue;
  if (!fs.existsSync(srcAbs)) { missing++; console.log(`    ⚠ 源文件不存在，仅更新分类`); continue; }
  const ext = key === 'file_path'
    ? (r.format || path.extname(srcAbs).replace('.', '') || 'png').toLowerCase()
    : (DOC_EXT[r.file_type] || 'txt');
  try {
    if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
    const dstAbs = path.join(dstDir, pickName(dstDir, baseName(r.name), ext));
    fs.copyFileSync(srcAbs, dstAbs);
    db.prepare(`UPDATE file_library_files SET ${key} = ? WHERE id = ?`)
      .run(`@userdata:${path.relative(USER_DATA, dstAbs).replace(/\\/g, '/')}`, r.id);
    fixed++;
  } catch (e) { console.log(`    ✗ ${e.message.slice(0, 70)}`); }
}
console.log(`\n盘符不符合计 ${bad} 条${APPLY ? `，已归位 ${fixed} 条${missing ? `，源缺失 ${missing} 条` : ''}` : '（演练未改动）'}`);
db.close();
