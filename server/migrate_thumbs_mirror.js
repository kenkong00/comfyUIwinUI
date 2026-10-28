/**
 * 缩略图归位迁移：把旧格局里全部平铺在一个目录的缩略图
 *     <用户>/.thumbs/<id>.<ext>          ← 上万张后打开该文件夹极卡，且认不出对应哪张图
 * 迁移到按「盘符 + 文件夹层级」镜像的新格局：
 *     <用户>/缩略图/<盘符>/<文件夹链>/<文件名>.<ext>
 *
 * 这样做的好处：
 *   1) 与大图的 <用户>/<盘符>/… 层级完全一致 → 在硬盘里能对照着找到缩略图；
 *   2) 独立挂在「缩略图」根下，和大图不在同一棵树 → 把大图的盘符目录整个剪切走，
 *      小图依旧完好留在硬盘与数据库里（isMirrorRel 也不会把它当镜像文件参与对账）；
 *   3) 文件被摊到各个盘符/子目录中，不会再出现单目录成千上万文件的卡顿。
 *
 * 用法（better-sqlite3 要与 Node 版本匹配）：
 *   node server/migrate_thumbs_mirror.js ./data.db           # 演练（只读，不改任何东西）
 *   node server/migrate_thumbs_mirror.js ./data.db --apply   # 真正执行
 * 建议先停掉后端服务（避免 WAL 写锁），脚本会自动备份 data.db 且可重复运行。
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DB_PATH = process.argv[2] || './data.db';
const APPLY = process.argv.includes('--apply');
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA = path.join(SERVER_DIR, 'user_data');
const THUMB_ROOT = '缩略图';
const THUMB_EXT = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', gif: 'gif', bmp: 'bmp' };

const sanitizeFolderName = (name) => {
  if (typeof name !== 'string') return '';
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s{2,}/g, ' ').trim();
  return cleaned.replace(/[. ]+$/, ''); // 去掉尾随点或空格（Windows 不允许）
};

// 控制台经 PowerShell 回传常出现中文乱码，这里同步写一份 UTF-8 日志便于查看
const LOG_PATH = path.join(SERVER_DIR, '..', '.temp', 'migrate-thumbs.log');
const LOG_LINES = [];
const log = (...args) => {
  const line = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
  LOG_LINES.push(line);
  console.log(line); // 保持原生输出（不可写 log，否则递归）
};
const flushLog = () => {
  try { fs.writeFileSync(LOG_PATH, LOG_LINES.join('\n'), 'utf8'); } catch { /* 忽略 */ }
};
process.on('exit', flushLog);

log(`▶ 模式: ${APPLY ? '执行' : '演练'}  ${path.resolve(DB_PATH)}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

if (APPLY) {
  const bak = `${DB_PATH}.bak.thumbsmirror.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(DB_PATH, bak);
  log(`▶ 已备份: ${bak}`);
}

// ---------- 与 database.js 保持一致的命名/路径规则 ----------
function driveLetterOf(userId, categoryId) {
  if (!categoryId) return 'C';
  try {
    const row = db.prepare('SELECT name, is_system, drive_letter FROM file_library_categories WHERE id = ?').get(categoryId);
    if (!row) return 'C';
    if (row.drive_letter) return row.drive_letter;
    if (row.is_system === 1 && row.name === '总库') return 'C';
  } catch { /* 忽略 */ }
  return 'C';
}

function folderChain(folderId) {
  const names = [];
  let cur = folderId;
  let guard = 0;
  while (cur && guard++ < 100) {
    const f = db.prepare('SELECT name, parent_id FROM file_library_folders WHERE id = ?').get(cur);
    if (!f) break;
    names.unshift(f.name);
    cur = f.parent_id;
  }
  return names;
}

const __udCache = new Map();
function userDirName(userId) {
  if (!userId) return 'default';
  const key = String(userId);
  if (__udCache.has(key)) return __udCache.get(key);
  let final = `user_${key.slice(0, 8)}`;
  try {
    const row = db.prepare('SELECT username FROM users WHERE id = ?').get(key);
    let name = sanitizeFolderName(row && row.username ? String(row.username) : '') || '';
    if (name) {
      const clash = db.prepare('SELECT COUNT(*) c FROM users WHERE username = ? AND id <> ?').get(name, key).c;
      if (clash > 0) name = `${name}_${key.slice(0, 6)}`;
    }
    if (name) final = name;
  } catch { /* 忽略 */ }
  __udCache.set(key, final);
  return final;
}

// 目标文件名是否已被「别的记录」占用（同一名字在不同文件间冲突时才需要消歧）
function ownedByOther(rel, selfId) {
  try {
    const other = db.prepare('SELECT id FROM file_library_files WHERE thumbnail_path = ? AND id <> ?').get(rel, selfId);
    return !!other;
  } catch {
    return false;
  }
}

// 计算某行缩略图的新落盘位置（与 database.js 的 thumbLocation 规则一致）
function newThumbTarget(r, ext) {
  const parts = [USER_DATA, userDirName(r.user_id), THUMB_ROOT, driveLetterOf(r.user_id, r.category_id)];
  if (r.folder_id) parts.push(...folderChain(r.folder_id));
  const dir = path.join(...parts);
  // 与 database.js 的 thumbLocation 保持一致：名字已带同后缀时不再重复追加
  const rawName = sanitizeFolderName(r.name) || String(r.id);
  const base = rawName.toLowerCase().endsWith(`.${ext}`) ? rawName.slice(0, -(ext.length + 1)) : rawName;
  const relOf = (fname) => `@userdata:${path.relative(USER_DATA, path.join(dir, fname)).replace(/\\/g, '/')}`;
  let fname = `${base}.${ext}`;
  if (ownedByOther(relOf(fname), r.id)) fname = `${base}.${r.id}.${ext}`;
  return { abs: path.join(dir, fname), rel: relOf(fname) };
}

// ---------- 开始迁移 ----------
const rows = db.prepare(`
  SELECT id, user_id, category_id, folder_id, name, format, thumbnail_path
  FROM file_library_files
  WHERE is_deleted = 0 AND thumbnail_path <> '' AND thumbnail_path LIKE '%/.thumbs/%'
`).all();

log(`▶ 待归位缩略图行数: ${rows.length}`);

let moved = 0, missing = 0, err = 0, skipped = 0;
const dirFILECount = new Map(); // 目标目录 -> 文件数（用于统计分散效果）
const touchedUsers = new Set();

for (const r of rows) {
  // 已经归位到新格局的行跳过（可重复运行）
  if (!r.thumbnail_path.includes('/.thumbs/')) { skipped++; continue; }
  try {
    const oldRel = r.thumbnail_path.slice('@userdata:'.length);
    const srcAbs = path.join(USER_DATA, ...oldRel.split('/'));
    const ext = (path.extname(srcAbs).replace('.', '') || 'png').toLowerCase();
    const tgt = newThumbTarget(r, ext);
    touchedUsers.add(userDirName(r.user_id));

    if (!fs.existsSync(srcAbs)) {
      missing++;
      log(`  ⚠ #${r.id} 源文件不存在：${oldRel}`);
      continue;
    }
    if (path.resolve(srcAbs) === path.resolve(tgt.abs)) { skipped++; continue; }

    if (APPLY) {
      if (!fs.existsSync(path.dirname(tgt.abs))) fs.mkdirSync(path.dirname(tgt.abs), { recursive: true });
      try {
        fs.renameSync(srcAbs, tgt.abs); // 同盘改名即可，成本低
      } catch (e) {
        fs.copyFileSync(srcAbs, tgt.abs);
        fs.unlinkSync(srcAbs);
      }
      db.prepare('UPDATE file_library_files SET thumbnail_path = ? WHERE id = ?').run(tgt.rel, r.id);
    }
    dirFILECount.set(path.dirname(tgt.abs), (dirFILECount.get(path.dirname(tgt.abs)) || 0) + 1);
    moved++;
    if (moved <= 8) log(`  #${r.id} ${oldRel}\n     → ${tgt.rel}`);
  } catch (e) {
    err++;
    if (err <= 5) log(`  ✗ #${r.id} ${e.message.slice(0, 90)}`);
  }
}

// 旧目录空了就删掉残壳
let removedDirs = 0;
if (APPLY) {
  for (const u of touchedUsers) {
    const d = path.join(USER_DATA, u, '.thumbs');
    try {
      if (fs.existsSync(d) && fs.readdirSync(d).length === 0) { fs.rmdirSync(d); removedDirs++; }
    } catch { /* 忽略 */ }
  }
}

const dirs = [...dirFILECount.keys()];
const maxPerDir = Math.max(0, ...dirFILECount.values());
log(`\n▶ 归位: ${moved}  缺失: ${missing}  失败: ${err}  跳过: ${skipped}`);
log(`▶ 摊薄效果：由 1 个平铺目录 → ${dirs.length} 个目录，最多的目录 ${maxPerDir} 个文件`);
if (APPLY) log(`▶ 已清理空的旧 .thumbs 目录: ${removedDirs}`);
else log('（演练未改动任何数据，确认无误后加 --apply 执行）');
db.close();
