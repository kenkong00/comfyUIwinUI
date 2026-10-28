/**
 * 盘符镜像修正迁移
 *   1) 用户根目录：<uuid> → <用户名>（资源管理器里能按人查找）
 *   2) 同目录同名文件夹：按 Windows 规则自动顺延为「xxx (2)」
 *   3) 文件 category_id 错配（在文件夹内新建却落到总库）→ 改回父文件夹所属盘符并把文件搬过去
 *   4) 空内容文档（新建的文本文档）补落盘，使硬盘上立即可见
 *
 * 用法：
 *   node migrate_user_dirs.js ./data.db          # 演练，只打印计划
 *   node migrate_user_dirs.js ./data.db --apply   # 执行（自动备份）
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DB_PATH = process.argv[2] || './data.db';
const APPLY = process.argv.includes('--apply');
const SKIP_DIRS = process.argv.includes('--skip-dirs'); // ① 已做完时跳过（避免重复合并）
// 必须用 fileURLToPath 解码，否则中文/空格路径会变成 %20 / %E6%93%8D…
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

function sanitize(n) {
  return String(n || '').replace(/[\\/:*?"<>|]/g, '_').trim();
}
function baseName(name) {
  let base = sanitize(name) || '未命名';
  let changed = true;
  while (changed) {
    changed = false;
    const low = base.toLowerCase();
    for (const k of KNOWN_EXT) {
      if (low.endsWith(`.${k}`) && base.length > k.length + 1) {
        base = base.slice(0, -(k.length + 1));
        changed = true;
        break;
      }
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

const log = (s) => console.log(s);
log(`▶ 模式   : ${APPLY ? '执行 (--apply)' : '演练（不改动）'}`);
log(`▶ 数据库 : ${path.resolve(DB_PATH)}`);
log(`▶ 存储根 : ${USER_DATA}`);

if (APPLY) {
  const bak = `${DB_PATH}.bak.userdir.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(DB_PATH, bak);
  log(`▶ 已备份 : ${bak}`);
}

// —— 1) 用户根目录重命名 ——
log('\n=== ① 用户根目录 <uuid> → <用户名> ===');
const users = db.prepare('SELECT id, username FROM users').all();
const dirFix = []; // { oldName, newName, userId }
for (const u of users) {
  const target = sanitize(u.username) || `user_${String(u.id).slice(0, 8)}`;
  const oldAbs = path.join(USER_DATA, String(u.id));
  const newAbs = path.join(USER_DATA, target);
  const hasOld = fs.existsSync(oldAbs);
  const hasNew = fs.existsSync(newAbs);
  if (SKIP_DIRS) {
    log(`  跳过（--skip-dirs）：${target}`);
    dirFix.push({ userId: u.id, oldName: String(u.id), newName: target, pathsOnly: true });
    continue;
  }
  if (hasOld && !hasNew) {
    log(`  计划：目录 ${String(u.id).slice(0, 8)}… → ${target}`);
    dirFix.push({ userId: u.id, oldName: String(u.id), newName: target });
    if (APPLY) {
      try { fs.renameSync(oldAbs, newAbs); log(`    ✅ 目录已改名`); }
      catch (e) { log(`    ✗ 失败：${e.message}`); dirFix.pop(); }
    }
  } else if (hasOld && hasNew && String(u.id) !== target) {
    // 目标目录已存在（多为旧版遗留的 user_data/admin/downloads）→ 合并而非覆盖
    let n = 0;
    const entries = fs.readdirSync(oldAbs);
    log(`  计划：目标 ${target} 已存在 → 合并 ${entries.length} 项（${String(u.id).slice(0, 8)}…）`);
    if (APPLY) {
      for (const e of entries) {
        const s = path.join(oldAbs, e);
        let d = path.join(newAbs, e);
        if (fs.existsSync(d)) d = path.join(newAbs, `${e}_merged`);
        try { fs.renameSync(s, d); n++; } catch (err) { log(`    ✗ ${e}: ${err.message}`); }
      }
      try { if (fs.readdirSync(oldAbs).length === 0) fs.rmdirSync(oldAbs); } catch {}
      log(`    ✅ 已合并 ${n} 项`);
    }
    dirFix.push({ userId: u.id, oldName: String(u.id), newName: target });
  } else if (hasNew) {
    log(`  跳过：目录 ${target} 已存在且无旧目录`);
    if (String(u.id) !== target) dirFix.push({ userId: u.id, oldName: String(u.id), newName: target, pathsOnly: true });
  } else {
    log(`  跳过：用户 ${target} 尚无目录`);
  }
}

// 同步库内路径前缀
if (APPLY && dirFix.length) {
  let total = 0;
  for (const f of dirFix) {
    const oldP = `@userdata:${f.oldName}/`;
    const newP = `@userdata:${f.newName}/`;
    const tables = [
      ['file_library_files', ['file_path', 'thumbnail_path', 'content_path']],
      ['users', ['avatar_path']],
      ['characters', ['avatar_path']],
    ];
    for (const [t, cols] of tables) {
      for (const c of cols) {
        try {
          const r = db.prepare(`UPDATE ${t} SET ${c} = ? || substr(${c}, ?) WHERE ${c} LIKE ?`)
            .run(newP, String(oldP.length + 1), `${oldP}%`);
          total += r.changes;
        } catch {}
      }
    }
  }
  log(`  ✅ 库内路径前缀已同步 ${total} 处`);
} else if (dirFix.length) {
  let cnt = 0;
  for (const f of dirFix) {
    const oldP = `@userdata:${f.oldName}/`;
    for (const [t, cols] of [['file_library_files', ['file_path', 'thumbnail_path', 'content_path']], ['users', ['avatar_path']], ['characters', ['avatar_path']]]) {
      for (const c of cols) {
        try { cnt += db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE ${c} LIKE ?`).get(`${oldP}%`).c; } catch {}
      }
    }
  }
  log(`  将同步库内路径 ${cnt} 条`);
}

// 旧目录名 → 新目录名（① 改名后，库内路径前缀还没同步，定位源文件时要先映射）
const prefixMap = new Map();
for (const f of dirFix) prefixMap.set(f.oldName, f.newName);
function materialize(cur) {
  if (!cur) return null;
  if (cur.startsWith('@userdata:')) {
    let rel = cur.slice(10);
    const seg = rel.split('/')[0];
    if (prefixMap.has(seg)) rel = prefixMap.get(seg) + rel.slice(seg.length);
    return path.join(USER_DATA, rel);
  }
  return path.join(SERVER_DIR, 'gallery', cur);
}

// 用户名 → 目录名（迁移后生效）
const dirNameOf = (userId) => {
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  return sanitize(u && u.username) || `user_${String(userId).slice(0, 8)}`;
};

// —— 2) 同目录同名文件夹去重 ——
log('\n=== ② 同目录同名文件夹（Windows 规则）===');
const driveLetterOf = (catId) => {
  if (!catId) return 'C';
  const c = db.prepare('SELECT drive_letter, name, is_system FROM file_library_categories WHERE id = ?').get(catId);
  if (!c) return 'C';
  if (c.drive_letter) return c.drive_letter;
  if (c.is_system === 1 && c.name === '总库') return 'C';
  return 'C';
};
function folderChain(folderId, db) {
  const names = [];
  let cur = folderId; let guard = 0;
  while (cur && guard++ < 100) {
    const f = db.prepare('SELECT name, parent_id FROM file_library_folders WHERE id = ?').get(cur);
    if (!f) break;
    names.unshift(f.name);
    cur = f.parent_id;
  }
  return names;
}
const dupFolders = db.prepare(`
  SELECT user_id, category_id, IFNULL(parent_id,0) pid, LOWER(name) lname, COUNT(*) c
  FROM file_library_folders GROUP BY user_id, category_id, pid, lname HAVING c > 1
`).all();
log(`  发现重名组 ${dupFolders.length} 组`);
let renamed = 0;
for (const g of dupFolders) {
  const rows = db.prepare('SELECT id, name FROM file_library_folders WHERE user_id = ? AND category_id = ? AND IFNULL(parent_id,0) = ? AND LOWER(name) = ? ORDER BY id')
    .all(g.user_id, g.category_id, g.pid, g.lname);
  const taken = new Set([rows[0].name.toLowerCase()]);
  for (let i = 1; i < rows.length; i++) {
    let n = 2; let cand = `${rows[i].name} (${n})`;
    while (taken.has(cand.toLowerCase())) cand = `${rows[i].name} (${++n})`;
    taken.add(cand.toLowerCase());
    log(`  计划：文件夹 id=${rows[i].id} 「${rows[i].name}」→「${cand}」`);
    if (APPLY) {
      const dirAbs = path.join(USER_DATA, dirNameOf(g.user_id), driveLetterOf(g.category_id),
        ...(g.pid ? folderChain(g.pid, db) : []));
      const oldP = path.join(dirAbs, rows[i].name);
      const newP = path.join(dirAbs, cand);
      if (fs.existsSync(oldP) && !fs.existsSync(newP)) {
        try { fs.renameSync(oldP, newP); log(`    ✅ 磁盘目录已改名`); } catch (e) { log(`    ✗ ${e.message}`); }
      }
      db.prepare('UPDATE file_library_folders SET name = ? WHERE id = ?').run(cand, rows[i].id);
      renamed++;
    }
  }
}
log(`  ${APPLY ? `已重命名 ${renamed} 个` : '（演练，未改动）'}`);

// —— 3) 文件 category_id 错配修正 ——
log('\n=== ③ 文件盘符错配（在文件夹内新建却落到总库）===');
const misplaced = db.prepare(`
  SELECT f.id, f.user_id, f.name, f.file_type, f.category_id, f.folder_id, f.file_path, f.content_path, f.format,
         fo.category_id AS folder_cat
  FROM file_library_files f
  JOIN file_library_folders fo ON fo.id = f.folder_id
  WHERE f.is_deleted = 0 AND fo.category_id <> f.category_id
`).all();
log(`  发现错配 ${misplaced.length} 条`);
let moved = 0;
for (const r of misplaced) {
  const dirAbs = path.join(USER_DATA, dirNameOf(r.user_id), driveLetterOf(r.folder_cat), ...folderChain(r.folder_id, db));
  log(`  计划：#${r.id} 「${r.name}」 ${driveLetterOf(r.category_id)}: → ${driveLetterOf(r.folder_cat)}:`);
  if (!APPLY) continue;
  const isBin = ['image', 'video', 'audio'].includes(r.file_type);
  const key = isBin ? 'file_path' : 'content_path';
  const cur = r[key];
  if (!cur) { db.prepare('UPDATE file_library_files SET category_id = ? WHERE id = ?').run(r.folder_cat, r.id); continue; }
  const srcAbs = materialize(cur);
  if (!fs.existsSync(srcAbs)) { db.prepare('UPDATE file_library_files SET category_id = ? WHERE id = ?').run(r.folder_cat, r.id); continue; }
  const ext = isBin ? (r.format || path.extname(srcAbs).replace('.', '') || 'png').toLowerCase() : (DOC_EXT[r.file_type] || 'txt');
  try {
    if (!fs.existsSync(dirAbs)) fs.mkdirSync(dirAbs, { recursive: true });
    const dstAbs = path.join(dirAbs, pickName(dirAbs, baseName(r.name), ext));
    fs.copyFileSync(srcAbs, dstAbs);
    const rel = `@userdata:${path.relative(USER_DATA, dstAbs).replace(/\\/g, '/')}`;
    db.prepare(`UPDATE file_library_files SET ${key} = ?, category_id = ? WHERE id = ?`).run(rel, r.folder_cat, r.id);
    moved++;
  } catch (e) { log(`    ✗ ${e.message}`); }
}
log(`  ${APPLY ? `已归位 ${moved} 个` : '（演练，未改动）'}`);

// —— 4) 空内容文档补落盘 ——
log('\n=== ④ 未落盘文档（新建后硬盘上看不到）===');
const noPath = db.prepare(`
  SELECT id, user_id, name, file_type, category_id, folder_id FROM file_library_files
  WHERE is_deleted = 0 AND content_path = '' AND file_type IN ('novel','storyboard','json','workflow','rule','prompt','function','text')
`).all();
log(`  发现 ${noPath.length} 条`);
let wrote = 0;
for (const r of noPath) {
  const dirAbs = path.join(USER_DATA, dirNameOf(r.user_id), driveLetterOf(r.category_id), ...(r.folder_id ? folderChain(r.folder_id, db) : []));
  const ext = DOC_EXT[r.file_type] || 'txt';
  const dstAbs = path.join(dirAbs, pickName(dirAbs, baseName(r.name), ext));
  log(`  计划：#${r.id} 「${r.name}」→ ${path.relative(USER_DATA, dstAbs)}`);
  if (APPLY) {
    try {
      if (!fs.existsSync(dirAbs)) fs.mkdirSync(dirAbs, { recursive: true });
      fs.writeFileSync(dstAbs, '', 'utf8');
      db.prepare('UPDATE file_library_files SET content_path = ? WHERE id = ?')
        .run(`@userdata:${path.relative(USER_DATA, dstAbs).replace(/\\/g, '/')}`, r.id);
      wrote++;
    } catch (e) { log(`    ✗ ${e.message}`); }
  }
}
log(`  ${APPLY ? `已落盘 ${wrote} 个` : '（演练，未改动）'}`);

log(`\n${APPLY ? '✅ 迁移执行完成' : 'ℹ️ 演练结束：加 --apply 才会真正改动'}`);
db.close();
