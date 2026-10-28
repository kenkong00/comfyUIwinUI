/**
 * 存量文件重名去重：同目录同名按 Windows 规则顺延为「xxx (2)」，并同步改硬盘文件名。
 * 先改库再改磁盘（若反过来，磁盘文件短暂消失会被反向监听当成删除、误进回收站）。
 *
 *   node dedupe_existing_filenames.js ./data.db          # 演练
 *   node dedupe_existing_filenames.js ./data.db --apply  # 执行
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DB_PATH = process.argv[2] || './data.db';
const APPLY = process.argv.includes('--apply');
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const USER_DATA = path.join(SERVER_DIR, 'user_data');

const KNOWN_EXT = [
  'storyboard.json', 'novel.json', 'prompt.json', 'function.json', 'rule.txt', 'workflow.json',
  'json', 'txt', 'novel', 'md', 'csv',
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg',
  'mp4', 'webm', 'mov', 'avi', 'mp3', 'wav', 'ogg',
];
function baseName(name) {
  let base = String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
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

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
console.log(`▶ ${APPLY ? '执行' : '演练'}：${path.resolve(DB_PATH)}`);
if (APPLY) {
  const bak = `${DB_PATH}.bak.dedupe.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(DB_PATH, bak);
  console.log(`▶ 已备份: ${bak}`);
}

const groups = db.prepare(`
  SELECT user_id, category_id, IFNULL(folder_id,0) fid, LOWER(name) ln, COUNT(*) c
  FROM file_library_files WHERE is_deleted = 0
  GROUP BY user_id, category_id, fid, ln HAVING c > 1
`).all();
console.log(`重名组 ${groups.length} 组`);

let changed = 0, renamedFs = 0;
for (const g of groups) {
  const rows = db.prepare(`SELECT * FROM file_library_files
    WHERE user_id = ? AND category_id = ? AND IFNULL(folder_id,0) = ? AND LOWER(name) = ? AND is_deleted = 0 ORDER BY id`)
    .all(g.user_id, g.category_id, g.fid, g.ln);
  // 同目录已有名字（含文件夹）都要避开
  const taken = new Set(db.prepare(`SELECT name FROM file_library_files
    WHERE user_id = ? AND category_id = ? AND IFNULL(folder_id,0) = ? AND is_deleted = 0`)
    .all(g.user_id, g.category_id, g.fid).map(r => String(r.name || '').toLowerCase()));
  for (const r of db.prepare(`SELECT name FROM file_library_folders
    WHERE user_id = ? AND category_id = ? AND IFNULL(parent_id,0) = ?`)
    .all(g.user_id, g.category_id, g.fid)) taken.add(String(r.name || '').toLowerCase());

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const base = row.name;
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    let newName = base; let n = 2;
    while (taken.has(newName.toLowerCase())) newName = `${stem} (${n++})${ext}`;
    taken.add(newName.toLowerCase());

    const key = ['image', 'video', 'audio'].includes(row.file_type) ? 'file_path' : 'content_path';
    const oldRel = row[key];
    let newRel = oldRel;
    if (oldRel && oldRel.startsWith('@userdata:')) {
      const rel = oldRel.slice(10);
      const dirPart = path.posix.dirname(rel);
      const oldFile = path.posix.basename(rel);
      const suffix = oldFile.slice(baseName(oldFile).length); // 如 .novel.json / .txt
      newRel = `@userdata:${dirPart}/${baseName(newName)}${suffix}`;
    }
    console.log(`  #${row.id} 「${row.name}」→「${newName}」`);
    if (!APPLY) continue;
    db.prepare(`UPDATE file_library_files SET name = ?, ${key} = ? WHERE id = ?`).run(newName, newRel, row.id);
    changed++;
    // 库改完再动磁盘：此时旧路径已不在库里，监听看到文件消失也不会误删
    if (oldRel && oldRel.startsWith('@userdata:') && oldRel !== newRel) {
      const oldAbs = path.join(USER_DATA, oldRel.slice(10));
      const newAbs = path.join(USER_DATA, newRel.slice(10));
      try {
        if (fs.existsSync(oldAbs) && !fs.existsSync(newAbs)) { fs.renameSync(oldAbs, newAbs); renamedFs++; }
        else if (fs.existsSync(oldAbs) && fs.existsSync(newAbs)) console.log(`    ⚠ 目标已存在，跳过磁盘改名`);
      } catch (e) { console.log(`    ✗ 磁盘改名失败：${e.code || e.message}`); }
    }
  }
}
console.log(`\n${APPLY ? `✅ 已改名 ${changed} 条，磁盘同步 ${renamedFs} 个` : 'ℹ️ 演练结束，加 --apply 执行'}`);
db.close();
