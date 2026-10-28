import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 读取 server/.env（可选，无需第三方依赖）：用于配置存储根等。
// 例：在 server/.env 写入  STORAGE_ROOT=D:/rpg_user_data
// 即可把用户生成的图片 / 小说 / 头像等全部大文件指向更大硬盘 / NAS，DB 只存相对路径指针。
try {
  const envFile = join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    const txt = fs.readFileSync(envFile, 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && process.env[k] === undefined) process.env[k] = v;
    }
  }
} catch (e) { /* .env 缺失或解析失败不阻塞 */ }

const DB_PATH = join(__dirname, 'data.db');
const JWT_SECRET = 'ai-character-platform-local-secret-2024';
const JWT_EXPIRES_IN = '7d'; // 7天过期

// 创建数据库连接
const db = new Database(DB_PATH);

// 启用 WAL 模式（更好的并发性能）
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(`📦 数据库已启动: ${DB_PATH}`);

// ============================================
// 数据库表初始化
// ============================================

// ---- 文件库复制辅助：同目录内生成唯一名称（避免 Windows 式重名冲突） ----
function uniqueFileName(db, userId, folderId, name) {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name; let n = 1;
  while (true) {
    const row = folderId == null
      ? db.prepare('SELECT id FROM file_library_files WHERE user_id = ? AND folder_id IS NULL AND name = ? AND is_deleted = 0').get(userId, candidate)
      : db.prepare('SELECT id FROM file_library_files WHERE user_id = ? AND folder_id = ? AND name = ? AND is_deleted = 0').get(userId, folderId, candidate);
    if (!row) return candidate;
    candidate = `${stem} (${n})${ext}`;
    n++;
  }
}
function uniqueFolderName(db, userId, parentId, name) {
  let candidate = name; let n = 1;
  while (true) {
    const row = parentId == null
      ? db.prepare('SELECT id FROM file_library_folders WHERE user_id = ? AND parent_id IS NULL AND name = ? AND is_deleted = 0').get(userId, candidate)
      : db.prepare('SELECT id FROM file_library_folders WHERE user_id = ? AND parent_id = ? AND name = ? AND is_deleted = 0').get(userId, parentId, candidate);
    if (!row) return candidate;
    candidate = `${name} (${n})`;
    n++;
  }
}

// 1. 用户表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT DEFAULT '',
    avatar_path TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 1b. 会员体系列迁移（membership_tier / quota_json）
try { db.prepare('SELECT membership_tier FROM users LIMIT 1').get(); }
catch (e) { db.exec("ALTER TABLE users ADD COLUMN membership_tier TEXT DEFAULT 'free'"); }
try { db.prepare('SELECT quota_json FROM users LIMIT 1').get(); }
catch (e) { db.exec("ALTER TABLE users ADD COLUMN quota_json TEXT DEFAULT '{}'"); }

// 2. 用户配置表
db.exec(`
  CREATE TABLE IF NOT EXISTS user_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    config_type TEXT NOT NULL,
    config_data TEXT NOT NULL DEFAULT '{}',
    version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, config_type)
  )
`);

// 迁移：确保没有 CHECK 约束限制 config_type
try {
  // 先删除可能存在的临时表
  db.exec(`DROP TABLE IF EXISTS user_configs_new`);
  
  // 创建新表（无 CHECK 约束，允许任何 config_type）
  db.exec(`
    CREATE TABLE user_configs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      config_type TEXT NOT NULL,
      config_data TEXT NOT NULL DEFAULT '{}',
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, config_type)
    )
  `);
  
  // 复制数据
  db.exec(`INSERT INTO user_configs_new SELECT * FROM user_configs`);
  // 删除旧表
  db.exec(`DROP TABLE user_configs`);
  // 重命名新表
  db.exec(`ALTER TABLE user_configs_new RENAME TO user_configs`);
  console.log('✓ user_configs 表迁移完成（移除 CHECK 约束）');
} catch (e) {
  // 如果失败，删除新表
  db.exec(`DROP TABLE IF EXISTS user_configs_new`);
  console.log('user_configs 表无需迁移或迁移失败:', e.message);
}

// 3. 角色表
db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    avatar_path TEXT DEFAULT '',
    system_prompt TEXT DEFAULT '',
    personality TEXT DEFAULT '{}',
    background_story TEXT DEFAULT '',
    preferred_model TEXT DEFAULT '',
    model_parameters TEXT DEFAULT '{}',
    generation_workflow TEXT,
    image_settings TEXT DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 4. 对话历史表
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
    title TEXT DEFAULT '',
    messages TEXT NOT NULL DEFAULT '[]',
    message_count INTEGER DEFAULT 0,
    token_count_estimate INTEGER DEFAULT 0,
    is_pinned INTEGER DEFAULT 0,
    is_bookmarked INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 5. 生成的图片记录表
db.exec(`
  CREATE TABLE IF NOT EXISTS generated_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT DEFAULT '',
    prompt TEXT NOT NULL,
    negative_prompt TEXT DEFAULT '',
    workflow_used TEXT,
    generation_parameters TEXT DEFAULT '{}',
    model_used TEXT DEFAULT '',
    width INTEGER DEFAULT 512,
    height INTEGER DEFAULT 512,
    file_size INTEGER DEFAULT 0,
    format TEXT DEFAULT 'png',
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// 6. 会话/登录日志表
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  )
`);

// 创建索引
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_images_user_id ON generated_images(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
`);

// 7. Workflow categories table
db.exec(`
  CREATE TABLE IF NOT EXISTS workflow_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 8. Workflow APIs table
db.exec(`
  CREATE TABLE IF NOT EXISTS workflow_apis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER DEFAULT 0,
    name TEXT NOT NULL DEFAULT '未命名工作流',
    filename TEXT DEFAULT '',
    workflow_data TEXT NOT NULL DEFAULT '{}',
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 9. Batch generation jobs table
db.exec(`
  CREATE TABLE IF NOT EXISTS batch_generation_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'uncategorized',
    name TEXT DEFAULT '',
    workflow_api_id INTEGER DEFAULT 0,
    storyboards TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    current_index INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    completed_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    results TEXT DEFAULT '[]',
    error TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Add indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_workflow_categories_user_id ON workflow_categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_apis_user_id ON workflow_apis(user_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_apis_category_id ON workflow_apis(category_id);
  CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_id ON batch_generation_jobs(user_id);
`);

// 10. Storyboard categories table (for JSON management)
db.exec(`
  CREATE TABLE IF NOT EXISTS storyboard_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 11. Storyboard JSON files table
db.exec(`
  CREATE TABLE IF NOT EXISTS storyboard_jsons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER DEFAULT 0,
    name TEXT NOT NULL DEFAULT '未命名',
    filename TEXT DEFAULT '',
    json_data TEXT NOT NULL DEFAULT '[]',
    prompt_count INTEGER DEFAULT 0,
    is_valid INTEGER DEFAULT 1,
    validation_message TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 12. Generation tasks table (package of JSON files + workflow)
db.exec(`
  CREATE TABLE IF NOT EXISTS generation_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER DEFAULT 0,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    workflow_api_id INTEGER DEFAULT 0,
    storyboard_json_ids TEXT NOT NULL DEFAULT '[]',
    total_count INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 13. Task categories table
db.exec(`
  CREATE TABLE IF NOT EXISTS task_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 13b. Function categories table (功能库分类表)
db.exec(`
  CREATE TABLE IF NOT EXISTS function_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 13c. Functions table (功能库：保存配置好的功能单元)
// config_json 包含: { tabId, functionName, promptText, insertedPromptIds, selectedWorkflowId, comfyuiConfigId, inputImages, videoParams, imageParams, needsImage, imageNodeIds, dimensionNodeIds }
db.exec(`
  CREATE TABLE IF NOT EXISTS functions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER DEFAULT 0,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    tab_id TEXT NOT NULL DEFAULT 'text2img',
    config_json TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 迁移：为 functions 添加 is_active 列（0=未激活 1=已激活；只有激活的功能出现在右键"用功能库生成"里）
try {
  db.prepare('SELECT is_active FROM functions LIMIT 1').get();
} catch (e) {
  db.exec("ALTER TABLE functions ADD COLUMN is_active INTEGER DEFAULT 0");
  console.log('✓ functions 表添加 is_active 列');
}

// 迁移：为 generation_tasks 添加目标目录列（右键一键生成：图片直接落到文件所在目录，
// 而不是固定写进总库(C:)下以任务名命名的顶级文件夹）
try {
  db.prepare('SELECT target_category_id FROM generation_tasks LIMIT 1').get();
} catch (e) {
  db.exec("ALTER TABLE generation_tasks ADD COLUMN target_category_id INTEGER DEFAULT 0");
  db.exec("ALTER TABLE generation_tasks ADD COLUMN target_folder_id INTEGER DEFAULT NULL");
  console.log('✓ generation_tasks 表添加 target_category_id / target_folder_id 列');
}

// 迁移：清理旧版系统"未分类"功能分类。
// 已存在普通"未分类"→ 其下功能并入普通分类后删除系统分类；否则把系统分类转为普通分类（可改名/删除）。
try {
  const sysUncatCats = db.prepare("SELECT * FROM function_categories WHERE is_system = 1 AND name = '未分类'").all();
  for (const sc of sysUncatCats) {
    const normal = db.prepare("SELECT id FROM function_categories WHERE user_id = ? AND (is_system = 0 OR is_system IS NULL) AND name = '未分类' ORDER BY id LIMIT 1").get(sc.user_id);
    if (normal) {
      db.prepare('UPDATE functions SET category_id = ? WHERE category_id = ?').run(normal.id, sc.id);
      db.prepare('DELETE FROM function_categories WHERE id = ?').run(sc.id);
    } else {
      db.prepare('UPDATE function_categories SET is_system = 0 WHERE id = ?').run(sc.id);
    }
  }
  if (sysUncatCats.length) console.log(`✓ 已清理 ${sysUncatCats.length} 个系统"未分类"功能分类（并入普通未分类或转为普通分类）`);
} catch (e) {
  console.error('function_categories 系统"未分类"迁移失败:', e.message);
}

// 迁移：为 generation_tasks 添加 execution_status 列（idle=待命/executing=执行中/completed=已完成）
try {
  db.prepare('SELECT execution_status FROM generation_tasks LIMIT 1').get();
} catch (e) {
  db.exec("ALTER TABLE generation_tasks ADD COLUMN execution_status TEXT DEFAULT 'idle'");
  console.log('✓ generation_tasks 表添加 execution_status 列');
}

// 迁移：为 generation_tasks 添加 error_message 列（存储执行错误信息）
try {
  db.prepare('SELECT error_message FROM generation_tasks LIMIT 1').get();
} catch (e) {
  db.exec("ALTER TABLE generation_tasks ADD COLUMN error_message TEXT DEFAULT ''");
  console.log('✓ generation_tasks 表添加 error_message 列');
}

// 14. Rule categories table (规则分类表)
db.exec(`
  CREATE TABLE IF NOT EXISTS rule_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 15. Rules table (规则表，MD格式内容)
db.exec(`
  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER DEFAULT 0,
    name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    type TEXT DEFAULT 'general',
    description TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 16. Teams table (团队表，替代 profiles)
db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    member_config TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 17. Gallery categories table (艺术图库分类表)
db.exec(`
  CREATE TABLE IF NOT EXISTS gallery_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 18. Gallery images table (艺术图库图片表，原图存磁盘+缩略图base64存库)
db.exec(`
  CREATE TABLE IF NOT EXISTS gallery_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER DEFAULT 0,
    name TEXT NOT NULL DEFAULT '未命名',
    description TEXT DEFAULT '',
    file_path TEXT NOT NULL,
    thumbnail_data TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    format TEXT DEFAULT 'png',
    sort_order INTEGER DEFAULT 0,
    is_favorite INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 19. Character categories table (角色分类表)
db.exec(`
  CREATE TABLE IF NOT EXISTS character_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 20. Team categories table (团队分类表)
db.exec(`
  CREATE TABLE IF NOT EXISTS team_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 21. AI 配置分类表（API配置列表的分类）
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_config_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 22. AI 配置表（多个 API 配置，一个为激活状态）
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER DEFAULT 0,
    name TEXT NOT NULL DEFAULT '未命名配置',
    provider TEXT DEFAULT 'siliconflow',
    api_key TEXT DEFAULT '',
    api_url TEXT DEFAULT '',
    model TEXT DEFAULT '',
    use_proxy INTEGER DEFAULT 0,
    proxy_port TEXT DEFAULT '7890',
    enable_thinking INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 为已存在的 ai_configs 表添加模型参数字段（使用 try-catch 防止重复添加）
const aiConfigColumns = [
  ['temperature', 'REAL DEFAULT 0.8'],
  ['top_p', 'REAL DEFAULT 1.0'],
  ['max_tokens', 'INTEGER DEFAULT 4000'],
  ['frequency_penalty', 'REAL DEFAULT 0'],
  ['presence_penalty', 'REAL DEFAULT 0'],
  ['image_max_tokens', 'INTEGER DEFAULT 2000']
];
for (const [col, def] of aiConfigColumns) {
  try { db.exec(`ALTER TABLE ai_configs ADD COLUMN ${col} ${def}`); } catch(e) { /* 列已存在 */ }
}

// 23. ComfyUI 配置分类表
db.exec(`
  CREATE TABLE IF NOT EXISTS comfyui_config_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 24. ComfyUI 配置表（多个 ComfyUI 连接配置，一个为激活状态）
db.exec(`
  CREATE TABLE IF NOT EXISTS comfyui_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER DEFAULT 0,
    name TEXT NOT NULL DEFAULT '未命名配置',
    comfyui_url TEXT DEFAULT 'http://127.0.0.1:8188',
    download_dir TEXT DEFAULT '',
    auto_download INTEGER DEFAULT 0,
    filename_prefix TEXT DEFAULT 'ComfyUI',
    is_active INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 25. 提示词分类表（提示词管理）
db.exec(`
  CREATE TABLE IF NOT EXISTS prompt_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 26. 提示词表（单个提示词搜集管理，可关联图库图片）
db.exec(`
  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER DEFAULT 0,
    name TEXT NOT NULL DEFAULT '未命名',
    content TEXT NOT NULL DEFAULT '',
    gallery_image_id INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 27. 文件库分类表（相当于硬盘分区）
db.exec(`
  CREATE TABLE IF NOT EXISTS file_library_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 迁移：文件库分类新增 drive_letter（盘符字母，固化下来，删除分类后该字母不复用）
try { db.prepare('SELECT drive_letter FROM file_library_categories LIMIT 1').get(); }
catch (e) { db.exec("ALTER TABLE file_library_categories ADD COLUMN drive_letter TEXT DEFAULT ''"); console.log('✓ file_library_categories 表添加 drive_letter 列'); }

// 固化盘符：为每个尚未分配 drive_letter 的分类分配稳定字母（总库=C 由前端特殊处理，这里跳过）。
// 分配后持久化，删除某个分类不会让后面的盘符前移，保证磁盘目录结构稳定。
function ensureDriveLetters() {
  const users = db.prepare('SELECT DISTINCT user_id FROM file_library_categories').all();
  for (const { user_id } of users) {
    const cats = db.prepare("SELECT id, name, is_system, drive_letter FROM file_library_categories WHERE user_id = ? ORDER BY sort_order, id").all(user_id);
    let code = 68; // D
    for (const c of cats) {
      // 总库固定占用 C（旧实现直接跳过导致其 drive_letter 恒为空）
      if (c.is_system === 1 && c.name === '总库') {
        if (!c.drive_letter) db.prepare('UPDATE file_library_categories SET drive_letter = ? WHERE id = ?').run('C', c.id);
        continue;
      }
      if (c.drive_letter) { // 已分配则保持，仅推进指针避免冲突
        const lc = (c.drive_letter || 'C').charCodeAt(0);
        if (lc >= code && lc <= 90) code = Math.max(code, lc + 1);
        continue;
      }
      if (code > 90) break;
      const letter = String.fromCharCode(code++);
      db.prepare('UPDATE file_library_categories SET drive_letter = ? WHERE id = ?').run(letter, c.id);
    }
  }
}
ensureDriveLetters();

// 28. 文件库文件夹表（嵌套文件夹）
db.exec(`
  CREATE TABLE IF NOT EXISTS file_library_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL DEFAULT 0,
    parent_id INTEGER,
    name TEXT NOT NULL,
    is_callable INTEGER DEFAULT 0,
    display_file_id INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 29. 文件库文件表（统一文件：图片/视频/音频/提示词/JSON/工作流/规则）
db.exec(`
  CREATE TABLE IF NOT EXISTS file_library_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER DEFAULT 0,
    folder_id INTEGER,
    name TEXT NOT NULL DEFAULT '未命名',
    description TEXT DEFAULT '',
    file_type TEXT NOT NULL DEFAULT 'image',
    file_path TEXT DEFAULT '',
    thumbnail_data TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    format TEXT DEFAULT '',
    content TEXT DEFAULT '',
    filename TEXT DEFAULT '',
    prompt_count INTEGER DEFAULT 0,
    is_valid INTEGER DEFAULT 1,
    validation_message TEXT DEFAULT '',
    rule_type TEXT DEFAULT 'general',
    display_file_id INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 迁移：文件库文件新增 thumbnail_path（缩略图磁盘相对路径，外置以减小数据库体积）
try { db.prepare('SELECT thumbnail_path FROM file_library_files LIMIT 1').get(); }
catch (e) { db.exec("ALTER TABLE file_library_files ADD COLUMN thumbnail_path TEXT DEFAULT ''"); console.log('✓ file_library_files 表添加 thumbnail_path 列'); }

// 30. 文件库标签表
db.exec(`
  CREATE TABLE IF NOT EXISTS file_library_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#4a9eff',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 31. 文件-标签关联表
db.exec(`
  CREATE TABLE IF NOT EXISTS file_library_file_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL REFERENCES file_library_files(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES file_library_tags(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(file_id, tag_id)
  )
`);

// 迁移：为 generation_tasks 添加 category_id 列（如果不存在）
try {
  db.prepare('SELECT category_id FROM generation_tasks LIMIT 1').get();
} catch (e) {
  db.exec('ALTER TABLE generation_tasks ADD COLUMN category_id INTEGER DEFAULT 0');
  console.log('✓ generation_tasks 表添加 category_id 列');
}

// 迁移：为 generation_tasks 添加状态/进度列
const taskNewCols = [
  ['status', "TEXT DEFAULT 'pending'"],
  ['total_prompts', 'INTEGER DEFAULT 0'],
  ['progress_index', 'INTEGER DEFAULT 0'],
  ['completed_at', 'TEXT DEFAULT ""'],
  ['reviewed', 'INTEGER DEFAULT 0'],
  ['function_configs', 'TEXT DEFAULT "[]"']
];
for (const [col, def] of taskNewCols) {
  try {
    db.prepare(`SELECT ${col} FROM generation_tasks LIMIT 1`).get();
  } catch (e) {
    db.exec(`ALTER TABLE generation_tasks ADD COLUMN ${col} ${def}`);
    console.log(`✓ generation_tasks 表添加 ${col} 列`);
  }
}

// 迁移：扩展 characters 表（新增性别、性格、规则引用、功能配置、AI配置覆盖字段）
const charNewCols = [
  ['gender', 'TEXT DEFAULT ""'],
  ['personality_text', 'TEXT DEFAULT ""'],
  ['rule_refs', 'TEXT DEFAULT "{}"'],
  ['function_config', 'TEXT DEFAULT "{}"'],
  ['ai_config_override', 'TEXT DEFAULT "{}"']
];
for (const [col, def] of charNewCols) {
  try {
    db.prepare(`SELECT ${col} FROM characters LIMIT 1`).get();
  } catch (e) {
    db.exec(`ALTER TABLE characters ADD COLUMN ${col} ${def}`);
    console.log(`✓ characters 表添加 ${col} 列`);
  }
}

// 迁移：为 characters 和 teams 表添加 category_id 列
try {
  db.prepare('SELECT category_id FROM characters LIMIT 1').get();
} catch (e) {
  db.exec('ALTER TABLE characters ADD COLUMN category_id INTEGER DEFAULT 0');
  console.log('✓ characters 表添加 category_id 列');
}
try {
  db.prepare('SELECT category_id FROM teams LIMIT 1').get();
} catch (e) {
  db.exec('ALTER TABLE teams ADD COLUMN category_id INTEGER DEFAULT 0');
  console.log('✓ teams 表添加 category_id 列');
}

// 迁移：为 conversations 表添加 category_id 列
try {
  db.prepare('SELECT category_id FROM conversations LIMIT 1').get();
} catch (e) {
  db.exec('ALTER TABLE conversations ADD COLUMN category_id INTEGER DEFAULT 0');
  console.log('✓ conversations 表添加 category_id 列');
}

// 对话分类表
db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_system INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// 迁移标记表（用于幂等迁移）
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )
`);

// v5 重构迁移：清空旧 profiles/characters 数据
try {
  const migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v5_rebuild'").get();
  if (!migrated) {
    console.log('🔄 开始 v5 重构数据迁移...');
    db.prepare("DELETE FROM user_configs WHERE config_type IN ('character_profiles','character_state')").run();
    db.prepare("DELETE FROM characters").run();
    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v5_rebuild')").run();
    console.log('✅ v5 重构迁移完成：已清空旧 profiles/characters 数据');
  }
} catch (e) {
  console.warn('v5 迁移检查失败:', e.message);
}

// v6 配置列表化迁移：从 user_configs 的 ai_config / comfyui_settings 种子数据到新的列表表
try {
  const v6Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v6_config_lists'").get();
  if (!v6Migrated) {
    console.log('🔄 开始 v6 配置列表化迁移...');

    // 获取所有有 ai_config 或 comfyui_settings 配置的用户
    const usersToMigrate = db.prepare(
      "SELECT DISTINCT user_id FROM user_configs WHERE config_type IN ('ai_config','comfyui_settings')"
    ).all();

    for (const { user_id } of usersToMigrate) {
      // === AI 配置种子 ===
      const aiRow = db.prepare("SELECT config_data FROM user_configs WHERE user_id = ? AND config_type = 'ai_config'").get(user_id);
      const aiCount = db.prepare("SELECT COUNT(*) as c FROM ai_configs WHERE user_id = ?").get(user_id).c;
      if (aiRow && aiCount === 0) {
        let aiData = {};
        try { aiData = JSON.parse(aiRow.config_data || '{}'); } catch {}
        // 确保系统分类"未分类"存在
        let aiCat = db.prepare("SELECT id FROM ai_config_categories WHERE user_id = ? AND is_system = 1").get(user_id);
        if (!aiCat) {
          const r = db.prepare("INSERT INTO ai_config_categories (user_id, name, is_system) VALUES (?, ?, 1)").run(user_id, '未分类');
          aiCat = { id: r.lastInsertRowid };
        }
        db.prepare(`INSERT INTO ai_configs (user_id, category_id, name, provider, api_key, api_url, model, use_proxy, proxy_port, enable_thinking, is_active, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`).run(
          user_id, aiCat.id, '默认配置',
          aiData.provider || 'siliconflow',
          aiData.apiKey || '',
          aiData.apiUrl || 'https://api.siliconflow.cn/v1',
          aiData.model || '',
          aiData.useProxy ? 1 : 0,
          aiData.proxyPort || '7890',
          aiData.enableThinking ? 1 : 0
        );
        console.log(`✓ 用户 ${user_id} 的 AI 配置已种子化`);
      }

      // === ComfyUI 配置种子 ===
      const comfyRow = db.prepare("SELECT config_data FROM user_configs WHERE user_id = ? AND config_type = 'comfyui_settings'").get(user_id);
      const comfyCount = db.prepare("SELECT COUNT(*) as c FROM comfyui_configs WHERE user_id = ?").get(user_id).c;
      if (comfyRow && comfyCount === 0) {
        let comfyData = {};
        try { comfyData = JSON.parse(comfyRow.config_data || '{}'); } catch {}
        let comfyCat = db.prepare("SELECT id FROM comfyui_config_categories WHERE user_id = ? AND is_system = 1").get(user_id);
        if (!comfyCat) {
          const r = db.prepare("INSERT INTO comfyui_config_categories (user_id, name, is_system) VALUES (?, ?, 1)").run(user_id, '未分类');
          comfyCat = { id: r.lastInsertRowid };
        }
        db.prepare(`INSERT INTO comfyui_configs (user_id, category_id, name, comfyui_url, download_dir, auto_download, filename_prefix, is_active, sort_order)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`).run(
          user_id, comfyCat.id, '默认配置',
          comfyData.comfyuiUrl || 'http://127.0.0.1:8188',
          comfyData.downloadDir || '',
          comfyData.autoDownload ? 1 : 0,
          'ComfyUI'
        );
        console.log(`✓ 用户 ${user_id} 的 ComfyUI 配置已种子化`);
      }
    }

    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v6_config_lists')").run();
    console.log('✅ v6 配置列表化迁移完成');
  }
} catch (e) {
  console.warn('v6 迁移检查失败:', e.message);
}

// 迁移：任务审核状态初始化（旧任务默认审核通过，避免全部消失）
try {
  const taskReviewMigrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v6_task_review_init'").get();
  if (!taskReviewMigrated) {
    // 将所有已有任务标记为已审核（reviewed=1）和已批准状态（status='approved'），避免破坏现有批量任务流程
    db.prepare("UPDATE generation_tasks SET reviewed = 1, status = 'approved' WHERE reviewed = 0 AND (status IS NULL OR status = 'pending' OR status = '')").run();
    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v6_task_review_init')").run();
    console.log('✓ 任务审核状态初始化完成（旧任务默认已审核）');
  }
} catch (e) {
  console.warn('任务审核初始化失败:', e.message);
}

// 迁移 v7：提示词分类清理 + ai_configs 添加 is_callable 字段
try {
  const v7Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v7_prompts_and_callable'").get();
  if (!v7Migrated) {
    console.log('🔄 开始 v7 迁移：提示词分类清理 + is_callable 字段');

    // 1. 将指向旧系统"未分类"分类的提示词改为 category_id=0（虚拟未分类）
    try {
      const systemCats = db.prepare("SELECT id FROM prompt_categories WHERE is_system = 1").all();
      if (systemCats.length > 0) {
        const placeholders = systemCats.map(() => '?').join(',');
        const ids = systemCats.map(c => c.id);
        db.prepare(`UPDATE prompts SET category_id = 0 WHERE category_id IN (${placeholders})`).run(...ids);
        // 删除旧的系统分类
        db.prepare("DELETE FROM prompt_categories WHERE is_system = 1").run();
        console.log(`✓ 已清理 ${systemCats.length} 个旧系统分类，相关提示词移至未分类`);
      }
    } catch (e) { console.warn('清理系统分类失败:', e.message); }

    // 2. 为 ai_configs 添加 is_callable 字段（用于开始对话的模型选择）
    try {
      db.prepare('SELECT is_callable FROM ai_configs LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE ai_configs ADD COLUMN is_callable INTEGER DEFAULT 0');
      console.log('✓ ai_configs 表添加 is_callable 列');
    }

    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v7_prompts_and_callable')").run();
    console.log('✅ v7 迁移完成');
  }
} catch (e) {
  console.warn('v7 迁移检查失败:', e.message);
}

// v8 迁移：generation_tasks 添加 inserted_prompt_ids 字段
try {
  const v8Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v8_task_prompt_ids'").get();
  if (!v8Migrated) {
    try { db.prepare('SELECT inserted_prompt_ids FROM generation_tasks LIMIT 1').get(); }
    catch (e) {
      db.exec('ALTER TABLE generation_tasks ADD COLUMN inserted_prompt_ids TEXT DEFAULT "[]"');
      console.log('✓ generation_tasks 表添加 inserted_prompt_ids 列');
    }
    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v8_task_prompt_ids')").run();
    console.log('✅ v8 迁移完成');
  }
} catch (e) {
  console.warn('v8 迁移检查失败:', e.message);
}

// v9 迁移：统一文件库 —— 将图库/提示词/JSON/工作流/规则迁移到统一文件表，并更新所有引用
try {
  const v9Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v9_file_library'").get();
  if (!v9Migrated) {
    console.log('🔄 开始 v9 统一文件库迁移...');
    const users = db.prepare('SELECT id FROM users').all();

    for (const { id: userId } of users) {
      // 1. 创建默认分区
      let cat = db.prepare("SELECT id FROM file_library_categories WHERE user_id = ? AND is_system = 1").get(userId);
      if (!cat) {
        const r = db.prepare("INSERT INTO file_library_categories (user_id, name, is_system, sort_order) VALUES (?, ?, 1, 0)").run(userId, '总库');
        cat = { id: r.lastInsertRowid };
      }
      const catId = cat.id;

      // 2. 创建根文件夹
      const rootFolders = {};
      const folderDefs = [
        ['image', '图片'], ['prompt', '提示词'], ['json', 'JSON'],
        ['workflow', '工作流'], ['rule', '规则']
      ];
      for (const [ftype, fname] of folderDefs) {
        let folder = db.prepare("SELECT id FROM file_library_folders WHERE user_id = ? AND category_id = ? AND parent_id IS NULL AND name = ?").get(userId, catId, fname);
        if (!folder) {
          const r = db.prepare("INSERT INTO file_library_folders (user_id, category_id, parent_id, name, is_callable, sort_order) VALUES (?, ?, NULL, ?, 1, 0)").run(userId, catId, fname);
          folder = { id: r.lastInsertRowid };
        }
        rootFolders[ftype] = folder.id;
      }

      // 3. 迁移 gallery_images → file_library_files (type=image)
      const imgIdMap = {};
      const images = db.prepare('SELECT * FROM gallery_images WHERE user_id = ?').all(userId);
      for (const img of images) {
        const existing = db.prepare('SELECT id FROM file_library_files WHERE user_id = ? AND file_type = ? AND name = ? AND file_path = ?').get(userId, 'image', img.name, img.file_path);
        if (existing) { imgIdMap[img.id] = existing.id; continue; }
        const r = db.prepare(`INSERT INTO file_library_files (user_id, category_id, folder_id, name, description, file_type, file_path, thumbnail_data, file_size, width, height, format, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'image', ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          userId, catId, rootFolders.image, img.name, img.description || '',
          img.file_path, img.thumbnail_data || '', img.file_size || 0, img.width || 0, img.height || 0, img.format || '',
          img.sort_order || 0, img.created_at, img.updated_at
        );
        imgIdMap[img.id] = r.lastInsertRowid;
      }

      // 4. 迁移 prompts → file_library_files (type=prompt)
      const promptIdMap = {};
      const prompts = db.prepare('SELECT * FROM prompts WHERE user_id = ?').all(userId);
      for (const p of prompts) {
        const existing = db.prepare('SELECT id FROM file_library_files WHERE user_id = ? AND file_type = ? AND name = ? AND content = ?').get(userId, 'prompt', p.name, p.content);
        if (existing) { promptIdMap[p.id] = existing.id; continue; }
        const displayId = p.gallery_image_id && imgIdMap[p.gallery_image_id] ? imgIdMap[p.gallery_image_id] : 0;
        const r = db.prepare(`INSERT INTO file_library_files (user_id, category_id, folder_id, name, description, file_type, content, display_file_id, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, '', 'prompt', ?, ?, ?, ?, ?)`).run(
          userId, catId, rootFolders.prompt, p.name, p.content, displayId, p.sort_order || 0, p.created_at, p.updated_at
        );
        promptIdMap[p.id] = r.lastInsertRowid;
      }

      // 5. 迁移 storyboard_jsons → file_library_files (type=json)
      const jsonIdMap = {};
      const jsons = db.prepare('SELECT * FROM storyboard_jsons WHERE user_id = ?').all(userId);
      for (const j of jsons) {
        const existing = db.prepare('SELECT id FROM file_library_files WHERE user_id = ? AND file_type = ? AND name = ? AND content = ?').get(userId, 'json', j.name, j.json_data);
        if (existing) { jsonIdMap[j.id] = existing.id; continue; }
        const r = db.prepare(`INSERT INTO file_library_files (user_id, category_id, folder_id, name, description, file_type, content, filename, prompt_count, is_valid, validation_message, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, '', 'json', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          userId, catId, rootFolders.json, j.name, j.json_data, j.filename || '', j.prompt_count || 0, j.is_valid, j.validation_message || '',
          j.sort_order || 0, j.created_at, j.updated_at
        );
        jsonIdMap[j.id] = r.lastInsertRowid;
      }

      // 6. 迁移 workflow_apis → file_library_files (type=workflow)
      const wfIdMap = {};
      const wfs = db.prepare('SELECT * FROM workflow_apis WHERE user_id = ?').all(userId);
      for (const w of wfs) {
        const existing = db.prepare('SELECT id FROM file_library_files WHERE user_id = ? AND file_type = ? AND name = ? AND content = ?').get(userId, 'workflow', w.name, w.workflow_data);
        if (existing) { wfIdMap[w.id] = existing.id; continue; }
        const r = db.prepare(`INSERT INTO file_library_files (user_id, category_id, folder_id, name, description, file_type, content, filename, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'workflow', ?, ?, ?, ?, ?)`).run(
          userId, catId, rootFolders.workflow, w.name, w.description || '', w.workflow_data, w.filename || '',
          w.sort_order || 0, w.created_at, w.updated_at
        );
        wfIdMap[w.id] = r.lastInsertRowid;
      }

      // 7. 迁移 rules → file_library_files (type=rule)
      const ruleIdMap = {};
      const rules = db.prepare('SELECT * FROM rules WHERE user_id = ?').all(userId);
      for (const rl of rules) {
        const existing = db.prepare('SELECT id FROM file_library_files WHERE user_id = ? AND file_type = ? AND name = ? AND content = ?').get(userId, 'rule', rl.name, rl.content);
        if (existing) { ruleIdMap[rl.id] = existing.id; continue; }
        const r = db.prepare(`INSERT INTO file_library_files (user_id, category_id, folder_id, name, description, file_type, content, rule_type, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'rule', ?, ?, ?, ?, ?)`).run(
          userId, catId, rootFolders.rule, rl.name, rl.description || '', rl.content, rl.type || 'general',
          rl.sort_order || 0, rl.created_at, rl.updated_at
        );
        ruleIdMap[rl.id] = r.lastInsertRowid;
      }

      // 8. 更新 generation_tasks 引用
      const tasks = db.prepare('SELECT * FROM generation_tasks WHERE user_id = ?').all(userId);
      for (const t of tasks) {
        const updates = [];
        const params = [];
        // workflow_api_id
        if (t.workflow_api_id && wfIdMap[t.workflow_api_id]) {
          updates.push('workflow_api_id = ?');
          params.push(wfIdMap[t.workflow_api_id]);
        }
        // storyboard_json_ids
        if (t.storyboard_json_ids && t.storyboard_json_ids !== '[]') {
          try {
            const oldIds = JSON.parse(t.storyboard_json_ids);
            const newIds = oldIds.map(oid => jsonIdMap[oid] || 0).filter(x => x);
            if (newIds.length) { updates.push('storyboard_json_ids = ?'); params.push(JSON.stringify(newIds)); }
          } catch {}
        }
        // inserted_prompt_ids
        if (t.inserted_prompt_ids && t.inserted_prompt_ids !== '[]') {
          try {
            const oldIds = JSON.parse(t.inserted_prompt_ids);
            const newIds = oldIds.map(oid => promptIdMap[oid] || 0).filter(x => x);
            if (newIds.length) { updates.push('inserted_prompt_ids = ?'); params.push(JSON.stringify(newIds)); }
          } catch {}
        }
        if (updates.length) { params.push(t.id); db.prepare(`UPDATE generation_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params); }
      }

      // 9. 更新 characters 引用
      const chars = db.prepare('SELECT * FROM characters WHERE user_id = ?').all(userId);
      for (const c of chars) {
        // function_config
        if (c.function_config && c.function_config !== '{}') {
          try {
            const fc = JSON.parse(c.function_config);
            let changed = false;
            if (fc.imageGen && fc.imageGen.workflowApiId && wfIdMap[fc.imageGen.workflowApiId]) {
              fc.imageGen.workflowApiId = wfIdMap[fc.imageGen.workflowApiId]; changed = true;
            }
            if (changed) db.prepare('UPDATE characters SET function_config = ? WHERE id = ?').run(JSON.stringify(fc), c.id);
          } catch {}
        }
        // rule_refs
        if (c.rule_refs && c.rule_refs !== '{}') {
          try {
            const rr = JSON.parse(c.rule_refs);
            let changed = false;
            for (const key of ['behaviorRuleIds', 'imageRuleIds', 'chatRuleIds', 'dialogueRuleIds']) {
              if (Array.isArray(rr[key])) {
                const newIds = rr[key].map(oid => ruleIdMap[oid] || 0).filter(x => x);
                if (newIds.length !== rr[key].length || newIds.some((v, i) => v !== rr[key][i])) { rr[key] = newIds; changed = true; }
              }
            }
            if (changed) db.prepare('UPDATE characters SET rule_refs = ? WHERE id = ?').run(JSON.stringify(rr), c.id);
          } catch {}
        }
      }
      console.log(`✓ 用户 ${userId} 文件库迁移完成`);
    }

    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v9_file_library')").run();
    console.log('✅ v9 统一文件库迁移完成');
  }
} catch (e) {
  console.warn('v9 迁移检查失败:', e.message);
}

// v10 迁移：文件库回收站 + 标签分类
try {
  const v10Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v10_recycle_tag_cats'").get();
  if (!v10Migrated) {
    console.log('🔄 开始 v10 迁移：回收站 + 标签分类...');
    // 1. file_library_folders 添加 is_deleted / deleted_at
    try { db.prepare('SELECT is_deleted FROM file_library_folders LIMIT 1').get(); }
    catch (e) { db.exec('ALTER TABLE file_library_folders ADD COLUMN is_deleted INTEGER DEFAULT 0'); }
    try { db.prepare('SELECT deleted_at FROM file_library_folders LIMIT 1').get(); }
    catch (e) { db.exec('ALTER TABLE file_library_folders ADD COLUMN deleted_at TEXT DEFAULT ""'); }
    // 2. file_library_files 添加 is_deleted / deleted_at
    try { db.prepare('SELECT is_deleted FROM file_library_files LIMIT 1').get(); }
    catch (e) { db.exec('ALTER TABLE file_library_files ADD COLUMN is_deleted INTEGER DEFAULT 0'); }
    try { db.prepare('SELECT deleted_at FROM file_library_files LIMIT 1').get(); }
    catch (e) { db.exec('ALTER TABLE file_library_files ADD COLUMN deleted_at TEXT DEFAULT ""'); }
    // 3. file_library_tags 添加 category_id
    try { db.prepare('SELECT category_id FROM file_library_tags LIMIT 1').get(); }
    catch (e) { db.exec('ALTER TABLE file_library_tags ADD COLUMN category_id INTEGER DEFAULT 0'); }
    // 4. 新建标签分类表
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_library_tag_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `);
    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v10_recycle_tag_cats')").run();
    console.log('✅ v10 迁移完成：回收站字段 + 标签分类表');
  }
} catch (e) {
  console.warn('v10 迁移检查失败:', e.message);
}

// v11 迁移：默认分区改名为"总库"
try {
  const v11Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v11_rename_default_category'").get();
  if (!v11Migrated) {
    db.prepare("UPDATE file_library_categories SET name = '总库' WHERE name = '默认分区' AND is_system = 1").run();
    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v11_rename_default_category')").run();
    console.log('✅ v11 迁移完成：默认分区改名为总库');
  }
} catch (e) {
  console.warn('v11 迁移检查失败:', e.message);
}

// v12 迁移：task_categories 增加 category_type 字段（'json' | 'function'），区分 JSON 类与功能类任务的分类
try {
  const v12Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v12_task_category_type'").get();
  if (!v12Migrated) {
    try { db.prepare('SELECT category_type FROM task_categories LIMIT 1').get(); }
    catch (e) {
      db.exec("ALTER TABLE task_categories ADD COLUMN category_type TEXT NOT NULL DEFAULT 'json'");
      console.log("✓ task_categories 表添加 category_type 列");
    }
    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v12_task_category_type')").run();
    console.log('✅ v12 迁移完成');
  }
} catch (e) {
  console.warn('v12 迁移检查失败:', e.message);
}

// v13 迁移：generation_tasks 增加 comfyui_config_id 字段（JSON 类任务的任务级 ComfyUI 配置）
try {
  const v13Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v13_task_comfyui_config'").get();
  if (!v13Migrated) {
    try { db.prepare('SELECT comfyui_config_id FROM generation_tasks LIMIT 1').get(); }
    catch (e) {
      db.exec('ALTER TABLE generation_tasks ADD COLUMN comfyui_config_id INTEGER DEFAULT 0');
      console.log('✓ generation_tasks 表添加 comfyui_config_id 列');
    }
    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v13_task_comfyui_config')").run();
    console.log('✅ v13 迁移完成');
  }
  } catch (e) {
    console.warn('v13 迁移检查失败:', e.message);
}

// v14 迁移：拆除 v9 自动生成的"按文件类型"根文件夹（图片 / 提示词 / JSON / 工作流 / 规则）
// 这些目录是迁移产物，会把用户自己的分类结构打乱（资源管理器里"按类型分文件夹"）。
// 做法：把目录内的文件直接挂回所属分类（folder_id = NULL），再删除这些空目录。文件本身不删除。
try {
  const v14Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v14_drop_type_folders'").get();
  if (!v14Migrated) {
    console.log('🔄 开始 v14 迁移：拆除按类型自动生成的根目录...');
    const TYPE_FOLDER_NAMES = ['图片', '提示词', 'JSON', '工作流', '规则'];
    let movedFiles = 0, removedFolders = 0;

    const typeFolders = db.prepare(
      `SELECT id, user_id, category_id FROM file_library_folders
       WHERE parent_id IS NULL AND is_callable = 1 AND name IN (${TYPE_FOLDER_NAMES.map(() => '?').join(',')})`
    ).all(...TYPE_FOLDER_NAMES);

    const updateFile = db.prepare('UPDATE file_library_files SET folder_id = NULL WHERE folder_id = ? AND user_id = ?');
    const countSubs = db.prepare('SELECT COUNT(*) as c FROM file_library_folders WHERE parent_id = ? AND user_id = ?');
    const countFiles = db.prepare('SELECT COUNT(*) as c FROM file_library_files WHERE folder_id = ? AND user_id = ? AND is_deleted = 0');

    for (const f of typeFolders) {
      // 子文件夹里的文件不动（保留原有结构），只把直属文件挂回分类
      const sub = countSubs.get(f.id, f.user_id).c;
      const files = countFiles.get(f.id, f.user_id).c;
      if (sub > 0) continue; // 有子文件夹说明是用户自建的同类目录，跳过以免误伤
      movedFiles += updateFile.run(f.id, f.user_id).changes;
      db.prepare('DELETE FROM file_library_folders WHERE id = ? AND user_id = ?').run(f.id, f.user_id);
      removedFolders++;
      if (files) console.log(`  · 已解散目录 #${f.id}（${files} 个文件）`);
    }

    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v14_drop_type_folders')").run();
    console.log(`✅ v14 迁移完成：解散 ${removedFolders} 个类型目录，${movedFiles} 个文件回到分类根`);
  }
} catch (e) {
  console.warn('v14 迁移检查失败:', e.message);
}

// v15 迁移：把 file_type='json' 但内容实际是 ComfyUI 工作流的文件改成 'workflow'。
// 背景：从磁盘导入的 .json 此前一律存成 json 类型，导致：
//  1) 双击打开进的是 JSON 查看器而不是工作流节点编辑器；
//  2) "使用工作流（单选）"等按 file_type='workflow' 过滤的选择器里看不到这些文件。
// 识别规则与前端 src/utils/workflowDetect.js 一致（API 格式 / UI 格式）。
try {
  const v15Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v15_json_to_workflow'").get();
  if (!v15Migrated) {
    console.log('🔄 开始 v15 迁移：json → workflow 类型修正...');
    const candidates = db.prepare(
      "SELECT id, name, content FROM file_library_files WHERE file_type = 'json' AND is_deleted = 0 AND content IS NOT NULL AND content LIKE '%class_type%'"
    ).all();
    const isComfyWorkflow = (text) => {
      try {
        const o = JSON.parse(text);
        if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
        if (Array.isArray(o.nodes) && o.nodes.some((n) => n && typeof n === 'object' && (n.type || n.class_type))) return true;
        const keys = Object.keys(o);
        if (!keys.length) return false;
        let nodeCount = 0;
        for (const k of keys) {
          const v = o[k];
          if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.class_type === 'string') nodeCount++;
        }
        return nodeCount > 0 && nodeCount >= Math.ceil(keys.length * 0.6);
      } catch { return false; }
    };
    const fix = db.prepare("UPDATE file_library_files SET file_type = 'workflow' WHERE id = ?");
    let fixed = 0;
    for (const f of candidates) {
      if (isComfyWorkflow(f.content)) { fix.run(f.id); fixed++; }
    }
    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v15_json_to_workflow')").run();
    console.log(`✅ v15 迁移完成：${fixed} 个 JSON 工作流文件已改为 workflow 类型`);
  }
} catch (e) {
  console.warn('v15 迁移检查失败:', e.message);
}

// v16 迁移：修复盘符（分类）数据混乱 —— 这是"生成的图不在总库 / 路径层级不对"的根因。
// 问题：
//  1) 存在 9 个重名的系统分类"总库"（id 1~8、16）和 2 个"UI库"（14、17）。
//     旧版"保存到文件库"每次可能随机挑一个"总库"建文件夹，导致任务结果散落在
//     幽灵"总库"里 —— 资源管理器的 C: 只显示权威总库（最小 id）的内容，其余全不可见。
//  2) 大量文件/文件夹 category_id=0 或指向已不存在的分类（孤儿项），任何盘符都不显示。
//  3) 子文件夹的 category_id 与父文件夹不一致。
// 做法：合并重名系统分类 → 修复子文件夹归属 → 修复文件归属 → 孤儿挂到权威总库 → 删除重复分类。
try {
  const v16Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v16_fix_categories'").get();
  if (!v16Migrated) {
    console.log('🔄 开始 v16 迁移：修复重复/孤儿分类...');

    // --- 1. 合并重名系统分类（is_system=1），保留最小 id 为权威 ---
    const dupGroups = db.prepare(`
      SELECT TRIM(name) AS n, MIN(id) AS keep, GROUP_CONCAT(id) AS all_ids
      FROM file_library_categories WHERE is_system = 1
      GROUP BY TRIM(name) HAVING COUNT(*) > 1
    `).all();
    let mergedCats = 0;
    for (const g of dupGroups) {
      const others = g.all_ids.split(',').map(Number).filter((id) => id !== g.keep);
      for (const oid of others) {
        db.prepare('UPDATE file_library_folders SET category_id = ? WHERE category_id = ?').run(g.keep, oid);
        db.prepare('UPDATE file_library_files SET category_id = ? WHERE category_id = ?').run(g.keep, oid);
        db.prepare('DELETE FROM file_library_categories WHERE id = ?').run(oid);
        mergedCats++;
        console.log(`  · 合并重复分类「${g.n}」#${oid} → #${g.keep}`);
      }
    }

    // --- 2. 子文件夹归属跟随父文件夹（自顶向下反复收敛）---
    let fixedFolders = 0;
    for (let round = 0; round < 50; round++) {
      const r = db.prepare(`
        UPDATE file_library_folders SET category_id = (
          SELECT p.category_id FROM file_library_folders p WHERE p.id = file_library_folders.parent_id
        )
        WHERE parent_id IS NOT NULL AND is_deleted = 0 AND category_id != (
          SELECT p.category_id FROM file_library_folders p WHERE p.id = file_library_folders.parent_id
        )
      `).run();
      fixedFolders += r.changes;
      if (r.changes === 0) break;
    }

    // --- 3. 文件归属跟随所在文件夹 ---
    const fixedFiles = db.prepare(`
      UPDATE file_library_files SET category_id = (
        SELECT f.category_id FROM file_library_folders f WHERE f.id = file_library_files.folder_id
      )
      WHERE folder_id IS NOT NULL AND is_deleted = 0 AND category_id != COALESCE((
        SELECT f.category_id FROM file_library_folders f WHERE f.id = file_library_files.folder_id
      ), category_id)
    `).run().changes;

    // --- 4. 孤儿（category_id=0 或分类不存在）的根级项挂到权威总库 ---
    const mainCat = db.prepare("SELECT id FROM file_library_categories WHERE is_system = 1 ORDER BY id LIMIT 1").get();
    if (mainCat) {
      const orphanFixedFolders = db.prepare(`
        UPDATE file_library_folders SET category_id = ?
        WHERE parent_id IS NULL AND is_deleted = 0 AND (
          category_id = 0 OR category_id IS NULL OR category_id NOT IN (SELECT id FROM file_library_categories)
        )
      `).run(mainCat.id).changes;
      const orphanFixedFiles = db.prepare(`
        UPDATE file_library_files SET category_id = ?
        WHERE folder_id IS NULL AND is_deleted = 0 AND (
          category_id = 0 OR category_id IS NULL OR category_id NOT IN (SELECT id FROM file_library_categories)
        )
      `).run(mainCat.id).changes;
      console.log(`  · 孤儿项挂到总库#${mainCat.id}：文件夹 ${orphanFixedFolders} 个，文件 ${orphanFixedFiles} 个`);
    }

    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v16_fix_categories')").run();
    console.log(`✅ v16 迁移完成：合并 ${mergedCats} 个重复分类，修正 ${fixedFolders} 个子文件夹 / ${fixedFiles} 个文件归属`);
  }
} catch (e) {
  console.warn('v16 迁移检查失败:', e.message);
}

// v17 迁移：把权威"总库"归还给真正持有数据的用户。
// 背景：v16 合并后权威总库(id 最小)的 user_id 是一个陈旧的本地账号（local_user_*），
// 而实际数据全部属于 admin —— 导致 admin 名下没有"总库"，前端把 UI库 当成 C: 的内容
// （C: 和 I: 显示同一份数据），save-to-library 也把任务文件夹建进了 UI库。
try {
  const v17Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v17_fix_zongku_owner'").get();
  if (!v17Migrated) {
    console.log('🔄 开始 v17 迁移：修正总库归属...');
    const zongku = db.prepare("SELECT id, user_id FROM file_library_categories WHERE is_system = 1 AND TRIM(name) = '总库' ORDER BY id LIMIT 1").get();
    if (zongku) {
      // 归属 = 在这个总库里拥有最多文件夹/文件的用户
      const owner = db.prepare(`
        SELECT user_id FROM (
          SELECT user_id, COUNT(*) c FROM file_library_folders WHERE category_id = ? AND is_deleted = 0 GROUP BY user_id
          UNION ALL
          SELECT user_id, COUNT(*) c FROM file_library_files WHERE category_id = ? AND is_deleted = 0 GROUP BY user_id
        ) GROUP BY user_id ORDER BY SUM(c) DESC LIMIT 1
      `).get(zongku.id, zongku.id);
      if (owner && owner.user_id !== zongku.user_id) {
        db.prepare('UPDATE file_library_categories SET user_id = ? WHERE id = ?').run(owner.user_id, zongku.id);
        console.log(`  · 总库 #${zongku.id} 归属 ${zongku.user_id.slice(0, 8)}… → ${owner.user_id.slice(0, 8)}…`);
      }
    }
    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v17_fix_zongku_owner')").run();
    console.log('✅ v17 迁移完成');
  }
} catch (e) {
  console.warn('v17 迁移检查失败:', e.message);
}

// 判断文本是否为「Json 分镜」格式（与前端 src/utils/storyboardDetect.js 同一套规则）：
// 1. [{id, content|prompt|text|提示词}]  2. {storyboards:[...]}  3. 其它对象数组分镜形状
function isStoryboardFileContent(text) {
  if (!text || typeof text !== 'string' || text.length > 20 * 1024 * 1024) return false;
  const t = text.trim();
  if (!t.startsWith('[') && !t.startsWith('{')) return false;
  let o;
  try { o = JSON.parse(t); } catch { return false; }
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    if (Array.isArray(o.storyboards)) o = o.storyboards;
    else return false;
  }
  if (!Array.isArray(o) || o.length === 0) return false;
  const pick = (it) => {
    if (!it || typeof it !== 'object' || Array.isArray(it)) return null;
    for (const k of ['content', 'prompt', 'text', '提示词']) {
      if (typeof it[k] === 'string' && it[k].trim()) return it[k];
    }
    const vals = Object.values(it).filter((v) => typeof v === 'string' && v.trim());
    return vals.length ? vals.join('\n') : null;
  };
  for (const it of o) { if (pick(it) === null) return false; }
  return true;
}

// v18 迁移：把 file_type='json' 但内容实际是分镜格式的文件统一归类为 file_type='storyboard'。
// 背景：历史导入/新建的分镜 json 很多停留在通用 json 类型，导致资源管理器右键
// "用功能库生成"按文件类型匹配功能时识别不到（分镜功能只服务 storyboard 文件）。
try {
  const v18Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v18_storyboard_retype'").get();
  if (!v18Migrated) {
    console.log('🔄 开始 v18 迁移：历史 json 分镜文件归类为 storyboard...');
    const candidates = db.prepare("SELECT id, name, content FROM file_library_files WHERE file_type = 'json' AND is_deleted = 0 AND (content LIKE '[%' OR content LIKE '{%')").all();
    let n = 0;
    for (const row of candidates) {
      if (!row.content || typeof row.content !== 'string') continue;
      if (isStoryboardFileContent(row.content)) {
        db.prepare("UPDATE file_library_files SET file_type = 'storyboard', updated_at = datetime('now') WHERE id = ?").run(row.id);
        n++;
      }
    }
    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v18_storyboard_retype')").run();
    console.log(`✅ v18 迁移完成：${n} 个 json 文件归类为 storyboard`);
  }
} catch (e) {
  console.warn('v18 迁移检查失败:', e.message);
}

// v19 迁移：文档型文件正文外置（content 落盘到 user_data/<用户>/.docs/，库只存 content_path）
// 注意：本块在模块顶层执行，不能引用文件靠后定义的 const（TDZ），故文档类型集合与写盘逻辑就地内联
try {
  const v19Migrated = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v19_doc_content_externalize'").get();
  if (!v19Migrated) {
    try { db.prepare('SELECT content_path FROM file_library_files LIMIT 1').get(); }
    catch (e) { db.exec("ALTER TABLE file_library_files ADD COLUMN content_path TEXT DEFAULT ''"); }
    const docTypes = new Set(['novel', 'storyboard', 'json', 'workflow', 'rule', 'prompt', 'function', 'text']);
    const extMap = { novel: 'novel.json', storyboard: 'storyboard.json', json: 'json', workflow: 'json', rule: 'rule.txt', prompt: 'prompt.json', function: 'function.json', text: 'txt' };
    const docRows = db.prepare("SELECT id, user_id, file_type, content FROM file_library_files WHERE is_deleted = 0 AND content IS NOT NULL AND content <> ''").all();
    let moved = 0;
    for (const r of docRows) {
      if (!docTypes.has(r.file_type)) continue; // 只外置文档型，二进制/图片不处理
      let cp = '';
      try {
        if (r.content) {
          const dir = join(__dirname, 'user_data', String(r.user_id), '.docs');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const ext = extMap[r.file_type] || 'txt';
          const abs = join(dir, `${r.id}.${ext}`);
          fs.writeFileSync(abs, String(r.content), 'utf8');
          cp = `@userdata:${r.user_id}/.docs/${r.id}.${ext}`;
        }
      } catch (e) {}
      if (cp) {
        db.prepare('UPDATE file_library_files SET content_path = ?, content = ? WHERE id = ?').run(cp, '', r.id);
        moved++;
      }
    }
    db.prepare("INSERT INTO schema_migrations (version) VALUES ('v19_doc_content_externalize')").run();
    console.log(`✅ v19 迁移完成：文档型正文外置 ${moved} 个到磁盘（user_data/<用户>/.docs/）`);
  }
} catch (e) {
  console.warn('v19 迁移检查失败:', e.message);
}

// v20 迁移：头像外置（users / characters 加 avatar_path；现有 base64 头像落盘）
// 内联实现以规避 const 暂时性死区（迁移块位于 helper 定义之前）
try {
  const v20Ver = 'v20_avatar_externalize';
  const v20Done = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(v20Ver);
  if (!v20Done) {
    try { db.prepare('SELECT avatar_path FROM users LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE users ADD COLUMN avatar_path TEXT DEFAULT ''"); }
    try { db.prepare('SELECT avatar_path FROM characters LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE characters ADD COLUMN avatar_path TEXT DEFAULT ''"); }
    const avExtOf = (b64) => { const m = String(b64).match(/^data:image\/([^;]+);base64,/); const AV_MAP = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', gif: 'gif', bmp: 'bmp' }; return m ? (AV_MAP[m[1].toLowerCase()] || m[1].toLowerCase()) : ''; };
    const writeAv = (uid, id, b64, kind) => {
      if (!b64 || !b64.startsWith('data:image/')) return '';
      const m = b64.match(/^data:image\/[^;]+;base64,(.+)$/); if (!m) return '';
      const ext = avExtOf(b64);
      const dir = join(__dirname, 'user_data', String(uid), 'avatars');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      try { fs.writeFileSync(join(dir, `${kind}_${id}.${ext}`), Buffer.from(m[1], 'base64')); } catch { return ''; }
      return `@userdata:${uid}/avatars/${kind}_${id}.${ext}`;
    };
    let avN = 0;
    for (const u of db.prepare("SELECT id, avatar_url FROM users WHERE avatar_url LIKE 'data:image/%'").all()) {
      const rel = writeAv(u.id, u.id, u.avatar_url, 'user');
      if (rel) { db.prepare('UPDATE users SET avatar_path = ?, avatar_url = ? WHERE id = ?').run(rel, '', u.id); avN++; }
    }
    for (const c of db.prepare("SELECT id, user_id, avatar_url FROM characters WHERE avatar_url LIKE 'data:image/%'").all()) {
      const rel = writeAv(c.user_id, c.id, c.avatar_url, 'char');
      if (rel) { db.prepare('UPDATE characters SET avatar_path = ?, avatar_url = ? WHERE id = ?').run(rel, '', c.id); avN++; }
    }
    db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(v20Ver);
    console.log(`✅ v20 迁移完成：头像外置 ${avN} 个到磁盘（user_data/<用户>/avatars/）`);
  }
} catch (e) {
  console.warn('v20 迁移检查失败:', e.message);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_storyboard_categories_user_id ON storyboard_categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_storyboard_jsons_user_id ON storyboard_jsons(user_id);
  CREATE INDEX IF NOT EXISTS idx_storyboard_jsons_category_id ON storyboard_jsons(category_id);
  CREATE INDEX IF NOT EXISTS idx_generation_tasks_user_id ON generation_tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_generation_tasks_category_id ON generation_tasks(category_id);
  CREATE INDEX IF NOT EXISTS idx_task_categories_user_id ON task_categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_rule_categories_user_id ON rule_categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_rules_user_id ON rules(user_id);
  CREATE INDEX IF NOT EXISTS idx_rules_category_id ON rules(category_id);
  CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id);
  CREATE INDEX IF NOT EXISTS idx_gallery_categories_user_id ON gallery_categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_gallery_images_user_id ON gallery_images(user_id);
  CREATE INDEX IF NOT EXISTS idx_gallery_images_category_id ON gallery_images(category_id);
  CREATE INDEX IF NOT EXISTS idx_character_categories_user_id ON character_categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_team_categories_user_id ON team_categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_ai_config_categories_user_id ON ai_config_categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_ai_configs_user_id ON ai_configs(user_id);
  CREATE INDEX IF NOT EXISTS idx_ai_configs_category_id ON ai_configs(category_id);
  CREATE INDEX IF NOT EXISTS idx_comfyui_config_categories_user_id ON comfyui_config_categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_comfyui_configs_user_id ON comfyui_configs(user_id);
  CREATE INDEX IF NOT EXISTS idx_comfyui_configs_category_id ON comfyui_configs(category_id);
  CREATE INDEX IF NOT EXISTS idx_prompt_categories_user_id ON prompt_categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);
  CREATE INDEX IF NOT EXISTS idx_file_library_categories_user_id ON file_library_categories(user_id);
  CREATE INDEX IF NOT EXISTS idx_file_library_folders_user_id ON file_library_folders(user_id);
  CREATE INDEX IF NOT EXISTS idx_file_library_folders_category_id ON file_library_folders(category_id);
  CREATE INDEX IF NOT EXISTS idx_file_library_folders_parent_id ON file_library_folders(parent_id);
  CREATE INDEX IF NOT EXISTS idx_file_library_files_user_id ON file_library_files(user_id);
  CREATE INDEX IF NOT EXISTS idx_file_library_files_category_id ON file_library_files(category_id);
  CREATE INDEX IF NOT EXISTS idx_file_library_files_folder_id ON file_library_files(folder_id);
  CREATE INDEX IF NOT EXISTS idx_file_library_files_user_folder ON file_library_files(user_id, folder_id, is_deleted);
  CREATE INDEX IF NOT EXISTS idx_file_library_files_user_cat_folder ON file_library_files(user_id, category_id, folder_id, is_deleted);
  CREATE INDEX IF NOT EXISTS idx_file_library_files_file_type ON file_library_files(file_type);
  CREATE INDEX IF NOT EXISTS idx_file_library_tags_user_id ON file_library_tags(user_id);
  CREATE INDEX IF NOT EXISTS idx_file_library_file_tags_file_id ON file_library_file_tags(file_id);
  CREATE INDEX IF NOT EXISTS idx_file_library_file_tags_tag_id ON file_library_file_tags(tag_id);
  CREATE INDEX IF NOT EXISTS idx_prompts_category_id ON prompts(category_id);
`);

console.log('✅ 数据库表创建完成');

// 确保图库存储目录存在
const GALLERY_DIR = join(__dirname, 'gallery');
if (!fs.existsSync(GALLERY_DIR)) {
  fs.mkdirSync(GALLERY_DIR, { recursive: true });
  console.log(`📁 创建图库存储目录: ${GALLERY_DIR}`);
}

// 用户数据目录（@userdata: 相对路径的基准盘位置）
// 可通过 STORAGE_ROOT 环境变量 / server/.env 指向更大硬盘 / NAS（换盘无需改代码）。
const USER_DATA_DIR = (() => {
  try {
    const root = String(process.env.STORAGE_ROOT || '').trim();
    if (root) {
      const abs = path.resolve(root);
      if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
      console.log(`📁 用户数据存储根(STORAGE_ROOT): ${abs}`);
      return abs;
    }
  } catch (e) { /* 回退默认 */ }
  const def = join(__dirname, 'user_data');
  if (!fs.existsSync(def)) fs.mkdirSync(def, { recursive: true });
  return def;
})();

// ============================================
// 文件库磁盘路径解析（跨电脑 / 换盘符兜底）
// --------------------------------------------
// 背景：早期版本把生成图片的绝对路径直接写进 file_path
// （如 @userdata:I:\TREA work\xxx\server\user_data\admin\downloads\...）。
// 项目被搬到另一台电脑 / 另一个盘符后，这个路径在本机不存在，
// 于是列表里只剩 DB 里的缩略图能看，点开大图一律 404。
// 这里做多重兜底把历史路径翻译成本机真实路径。
// ============================================
const __userDataIndexCache = { at: 0, map: null };

function pushCandidate(list, v) {
  if (!v) return;
  const n = path.normalize(v);
  if (!list.includes(n)) list.push(n);
}

// 兜底最后一招：按文件名在 user_data 下全量索引一次（结果缓存 5 分钟）
function lookupByName(fileName) {
  if (!fileName) return null;
  const now = Date.now();
  if (!__userDataIndexCache.map || now - __userDataIndexCache.at > 5 * 60 * 1000) {
    const map = new Map();
    const walk = (dir, depth) => {
      if (depth > 8) return;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full, depth + 1);
        else if (!map.has(e.name)) map.set(e.name, full);
      }
    };
    try { walk(USER_DATA_DIR, 0); } catch {}
    __userDataIndexCache.map = map;
    __userDataIndexCache.at = now;
  }
  return __userDataIndexCache.map.get(fileName) || null;
}

/**
 * 把 file_library_files.file_path 解析成本机真实存在的文件绝对路径。
 * @param {string} raw 数据库里的 file_path
 * @param {object} opts { search: 是否允许按文件名兜底搜索（删除类操作请传 false） }
 * @returns {string|null}
 */
export function resolveStoredPath(raw, opts = {}) {
  if (!raw) return null;
  const allowSearch = opts.search !== false;
  const isUserData = String(raw).startsWith('@userdata:');
  const stored = isUserData ? String(raw).slice('@userdata:'.length) : String(raw);

  const candidates = [];
  if (isUserData) {
    const abs = path.isAbsolute(stored) ? stored : join(USER_DATA_DIR, stored);
    pushCandidate(candidates, abs);
    // ① 换盘符：I:\TREA work\... → 本机盘符\TREA work\...
    const localRoot = path.parse(__dirname).root;
    const storedRoot = path.parse(abs).root;
    if (storedRoot && localRoot && storedRoot.toLowerCase() !== localRoot.toLowerCase()) {
      pushCandidate(candidates, join(localRoot, abs.slice(storedRoot.length)));
    }
    // ② 以 user_data/ 之后的相对部分，拼到本机的 user_data 目录
    const unix = abs.replace(/\\/g, '/');
    const uIdx = unix.toLowerCase().lastIndexOf('/user_data/');
    if (uIdx >= 0) pushCandidate(candidates, join(USER_DATA_DIR, unix.slice(uIdx + '/user_data/'.length)));
    // ③ 以 server/ 之后的相对部分，拼到本项目目录
    const sIdx = unix.toLowerCase().lastIndexOf('/server/');
    if (sIdx >= 0) pushCandidate(candidates, join(path.resolve(__dirname, '..'), unix.slice(sIdx + '/server/'.length)));
  } else {
    pushCandidate(candidates, join(GALLERY_DIR, stored));
    if (path.isAbsolute(stored)) pushCandidate(candidates, stored);
  }

  for (const c of candidates) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c; } catch {}
  }
  if (isUserData && allowSearch) {
    const hit = lookupByName(path.basename(stored));
    if (hit) return hit;
  }
  return null;
}

// ============================================
// 缩略图外置：把缩略图写成磁盘 sidecar，数据库只存相对路径指针
// 统一放在 user_data/<用户>/.thumbs/<id>.<ext>，用 @userdata: 前缀解析（换盘/换机自动重定位）
// ============================================
const THUMB_EXT = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', gif: 'gif', bmp: 'bmp' };

// 写入缩略图 sidecar。优先用前端提供的 base64（已压缩），否则从源文件复制。
// 返回 @userdata: 相对路径；失败返回 ''（不阻塞主流程）。
// —— 用户根目录名：用「用户名」而不是 uuid，便于在资源管理器里按人查找 ——
// user_data/<用户名>/<盘符>/… ；用户名不可用（重名/非法字符/查不到）时回退 user_<uuid前8位>
const __userDirCache = new Map();
function userDirName(userId) {
  if (!userId) return 'default';
  const key = String(userId);
  if (__userDirCache.has(key)) return __userDirCache.get(key);
  let name = '';
  try {
    const row = db.prepare('SELECT username FROM users WHERE id = ?').get(key);
    name = sanitizeFolderName(row && row.username ? String(row.username) : '') || '';
  } catch (e) { if (process.env.UDIR_DEBUG) console.log('[udir] query err:', e.message); }
  // 用户名可能被别人占用（不同 userId 同名）→ 加短 uuid 尾巴保证唯一
  let final = name;
  try {
    if (name) {
      const clash = db.prepare('SELECT COUNT(*) c FROM users WHERE username = ? AND id <> ?').get(name, key).c;
      if (clash > 0) final = `${name}_${key.slice(0, 6)}`;
    }
  } catch {}
  if (!final) final = `user_${key.slice(0, 8)}`;
  __userDirCache.set(key, final);
  return final;
}
// 磁盘目录名 → userId（供反向监听回查；兼容旧的 uuid 目录名）
function userIdByDirName(dirName) {
  if (!dirName) return null;
  try {
    const byName = db.prepare('SELECT id FROM users WHERE username = ?').get(String(dirName));
    if (byName) return byName.id;
    const byId = db.prepare('SELECT id FROM users WHERE id = ?').get(String(dirName));
    if (byId) return byId.id;
  } catch {}
  return null;
}
// 用户名被修改时，把硬盘上的用户根目录一起改名（内含盘符/缩略图/文档/头像）
function renameUserDirIfNeeded(userId) {
  try {
    const want = userDirName(userId);
    const root = USER_DATA_DIR;
    if (!fs.existsSync(root)) return;
    const cur = join(root, want);
    if (fs.existsSync(cur)) return; // 新名字已就位
    // 找出属于该用户的旧目录（uuid 名 或 旧用户名）
    const cands = [String(userId)];
    try {
      const old = db.prepare('SELECT username FROM users WHERE id = ?').get(String(userId));
      if (old && old.username && old.username !== want) cands.push(sanitizeFolderName(old.username));
    } catch {}
    for (const c of cands) {
      if (!c || c === want) continue;
      const src = join(root, c);
      if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
        fs.renameSync(src, cur);
        // 同步修正库内路径前缀
        const prefix = `@userdata:${c}/`;
        const next = `@userdata:${want}/`;
        for (const t of ['file_library_files', 'users', 'characters']) {
          const cols = t === 'file_library_files'
            ? ['file_path', 'thumbnail_path', 'content_path']
            : ['avatar_path'];
          for (const col of cols) {
            try {
              db.prepare(`UPDATE ${t} SET ${col} = ? || substr(${col}, ?) WHERE ${col} LIKE ?`)
                .run(next, String(prefix.length + 1), `${prefix}%`);
            } catch {}
          }
        }
        console.log(`📁 用户根目录已随用户名更新：${c} → ${want}`);
        return;
      }
    }
  } catch {}
}

// —— 缩略图落盘格局（新）——
// 旧格局：<用户>/.thumbs/<id>.<ext> —— 全部平铺在同一个目录里，上万张后打开文件夹极卡，
//         而且只能按文件 id 命名，在硬盘里根本认不出对应哪张图。
// 新格局：<用户>/缩略图/<盘符>/<文件夹链>/<文件名>.<ext>
//   · 与大图的 <用户>/<盘符>/… 镜像层级一致，肉眼即可对照着找；
//   · 独立挂在「缩略图」根下，和大图不在同一棵树：把大图的盘符目录整个剪切走，
//     小图依旧完好留在硬盘与数据库里（isMirrorRel 也不会把它当成镜像文件参与对账）。
const THUMB_ROOT = '缩略图';

// 计算某条文件记录的缩略图落盘位置；查不到记录返回 null（调用方回退旧扁平布局）
function thumbLocation(userId, id, format) {
  try {
    const row = db.prepare('SELECT category_id, folder_id, name FROM file_library_files WHERE id = ?').get(id);
    if (!row) return null;
    const ext = THUMB_EXT[(format || 'png').toLowerCase()] || 'png';
    const parts = [USER_DATA_DIR, userDirName(userId), THUMB_ROOT, driveDirOf(userId, row.category_id)];
    if (row.folder_id) parts.push(...folderChain(row.folder_id));
    const dir = join(...parts);
    // 文件名通常与缩略图后缀同源（如 xxx.png → xxx.png.jpg 会很别扭），
    // 名字里已带同后缀时先去掉，保证硬盘上是「某个文件.png」而不是「某个文件.png.png」
    const rawName = sanitizeFolderName(row.name) || String(id);
    const base = rawName.toLowerCase().endsWith(`.${ext}`) ? rawName.slice(0, -(ext.length + 1)) : rawName;
    const mk = (fname) => {
      const abs = join(dir, fname);
      const rel = `@userdata:${path.relative(USER_DATA_DIR, abs).replace(/\\/g, '/')}`;
      return { abs, rel };
    };
    let cand = mk(`${base}.${ext}`);
    // 同名且已被其它记录占用 → 追加行 id 保证唯一（绝不覆盖别人的缩略图）
    try {
      const other = db.prepare('SELECT id FROM file_library_files WHERE thumbnail_path = ? AND id <> ?').get(cand.rel, id);
      if (other) cand = mk(`${base}.${id}.${ext}`);
    } catch { /* 忽略查询失败，按无冲突处理 */ }
    return cand;
  } catch (e) {
    return null;
  }
}

export function saveThumbSidecar(userId, id, format, base64OrNull, srcAbsOrNull) {
  try {
    const loc = thumbLocation(userId, id, format);
    if (!loc) return '';
    if (!fs.existsSync(path.dirname(loc.abs))) fs.mkdirSync(path.dirname(loc.abs), { recursive: true });
    if (base64OrNull) {
      const m = String(base64OrNull).match(/^data:image\/[^;]+;base64,(.+)$/);
      const buf = Buffer.from(m ? m[1] : String(base64OrNull), 'base64');
      if (!buf || !buf.length) return '';
      fs.writeFileSync(loc.abs, buf);
    } else if (srcAbsOrNull && fs.existsSync(srcAbsOrNull)) {
      fs.copyFileSync(srcAbsOrNull, loc.abs);
    } else {
      return '';
    }
    return loc.rel;
  } catch (e) {
    return '';
  }
}

// Windows 文件夹/文件名非法字符清洗（\ / : * ? " < > |），用于盘符与文件夹命名
export function sanitizeFolderName(name) {
  if (typeof name !== 'string') return '';
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s{2,}/g, ' ').trim();
  return cleaned.replace(/[. ]+$/, ''); // 去掉尾随点或空格（Windows 不允许）
}

// ============================================
// 文档型正文外置：把小说/分镜/提示词/工作流/规则/功能/文本等正文本地落盘，
// 数据库只存 content_path 相对路径指针（@userdata: 前缀），读取时再回填 content。
// 这样无论 1 千还是 1 万本小说，DB 只多存几字节的路径，正文全在磁盘。
// ============================================
const DOC_EXT = {
  novel: 'novel.json',
  storyboard: 'storyboard.json',
  json: 'json',
  workflow: 'json',
  rule: 'rule.txt',
  prompt: 'prompt.json',
  function: 'function.json',
  text: 'txt',
};
const DOC_TYPES = new Set(Object.keys(DOC_EXT));

export function isDocType(fileType) {
  return DOC_TYPES.has(fileType);
}

// 写正文到磁盘，返回 @userdata: 相对路径；失败返回 ''（不阻塞主流程）
export function saveDocContent(userId, id, content, fileType) {
  try {
    if (content === null || content === undefined || content === '') return '';
    const dir = join(USER_DATA_DIR, userDirName(userId), '.docs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = DOC_EXT[fileType] || 'txt';
    const rel = `@userdata:${userDirName(userId)}/.docs/${id}.${ext}`;
    const abs = join(USER_DATA_DIR, userDirName(userId), '.docs', `${id}.${ext}`);
    fs.writeFileSync(abs, String(content), 'utf8');
    return rel;
  } catch (e) {
    return '';
  }
}

// 读取正文：优先从磁盘 content_path（外置后），失败回退到数据库里的 legacy content 字段（迁移前）
export function readDocContent(userId, contentPath, fallbackContent) {
  if (contentPath) {
    try {
      const abs = resolveStoredPath(contentPath);
      if (abs && fs.existsSync(abs)) {
        return fs.readFileSync(abs, 'utf8');
      }
    } catch (e) { /* 磁盘文件缺失，回退 legacy */ }
  }
  return fallbackContent || '';
}

// ============================================================
// 阶段5：盘符目录镜像（虚拟盘符 C–I ↔ 硬盘真实文件夹 1:1）
// ------------------------------------------------------------
// user_data/<用户>/ 下真实出现 C/ D/ E/ … 盘符目录，盘符内文件夹层级
// 与 UI 完全一致，文件以「显示名 + 扩展名」落盘。
// 数据库只存 @userdata:<用户>/<盘符>/<层级>/<文件名> 这类相对路径。
// 任何镜像失败都不阻塞业务（catch 后静默回退）。
// ============================================================

// 分类 → 盘符字母（总库固定 C；字母缺失时先固化再取）
function driveLetterOf(userId, categoryId) {
  try {
    if (!categoryId) return 'C';
    let row = db.prepare('SELECT name, is_system, drive_letter FROM file_library_categories WHERE id = ?').get(categoryId);
    if (!row) return 'C';
    if (!row.drive_letter) {
      try { ensureDriveLetters(); } catch {}
      row = db.prepare('SELECT name, is_system, drive_letter FROM file_library_categories WHERE id = ?').get(categoryId);
    }
    if (row && row.drive_letter) return row.drive_letter;
    if (row && row.is_system === 1 && row.name === '总库') return 'C';
    return 'C';
  } catch {
    return 'C';
  }
}

// 盘符目录在硬盘上的「真实文件夹名」= 盘符字母 + 分类名（如 C-总库、D-图片库）。
// 这样在 user_data/<用户名>/ 下能直接看出每个盘符目录对应哪个分类，
// 而不是一堆只有 C/D/E… 的字母文件夹（用户反馈看不出是哪个盘）。
// 注意：分类改名时硬盘文件夹要跟着改名（见 update 分类接口 renameDriveDir）。
function driveDirOfRow(row) {
  const letter = (row && row.drive_letter) || (row && row.is_system === 1 && row.name === '总库' ? 'C' : 'C');
  const name = sanitizeFolderName((row && row.name) ? String(row.name) : '') || '';
  return name ? `${letter}-${name}` : letter;
}
function driveDirOf(userId, categoryId) {
  try {
    if (!categoryId) return 'C';
    let row = db.prepare('SELECT name, is_system, drive_letter FROM file_library_categories WHERE id = ?').get(categoryId);
    if (!row) return driveDirOfRow(null);
    if (!row.drive_letter) {
      try { ensureDriveLetters(); } catch {}
      row = db.prepare('SELECT name, is_system, drive_letter FROM file_library_categories WHERE id = ?').get(categoryId);
    }
    return driveDirOfRow(row);
  } catch {
    return 'C';
  }
}

// 判断 user_data 下的相对路径是否落在盘符镜像区内（<用户>/<盘符>/…，盘符段可为「字母」或「字母-名称」）
function isMirrorRel(rel) {
  const parts = String(rel || '').split('/').filter(Boolean);
  return parts.length >= 2 && /^[A-Z](-[^/\\]+)?$/.test(parts[1]);
}

// 文件夹层级名链（祖先 → 自身）
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

// Windows 规则：同一目录下不允许出现同名文件夹。
// 新建 / 改名时自动顺延为「新建文件夹 (2)」「(3)」，避免硬盘上两个 DB 记录挤进同一个真实目录。
function uniqueFolderNameInCategory(userId, categoryId, parentId, rawName, excludeId) {
  const base = sanitizeFolderName(rawName) || '新建文件夹';
  const pid = Number(parentId) || 0;
  // 注意：必须过滤 is_deleted —— 之前版本没过滤，回收站里的旧「新建文件夹 (2)(3)…」
  // 依然占位，于是序号一路累增（删得越多跳得越远，看起来像从 8 开始）。
  const rows = db.prepare('SELECT id, name FROM file_library_folders WHERE user_id = ? AND category_id = ? AND IFNULL(parent_id, 0) = ? AND is_deleted = 0')
    .all(userId, Number(categoryId) || 0, pid);
  const taken = new Set();
  for (const r of rows) {
    if (excludeId && Number(r.id) === Number(excludeId)) continue;
    taken.add(String(r.name || '').toLowerCase());
  }
  // 同目录的文件名同样占位（Windows 下文件夹与文件也不能重名）
  for (const r of db.prepare('SELECT id, name FROM file_library_files WHERE user_id = ? AND category_id = ? AND IFNULL(folder_id, 0) = ? AND is_deleted = 0').all(userId, Number(categoryId) || 0, pid)) {
    taken.add(String(r.name || '').toLowerCase());
  }
  if (!taken.has(base.toLowerCase())) return base;
  // 名字本身已带「 (4)」这种序号时，接着往上数（→「 (5)」），
  // 否则会出现「新建文件夹 (4) (2)」这种越堆越长的套娃命名。
  const m = base.match(/^(.*) \((\d+)\)$/);
  const stem = m ? m[1] : base;
  const start = m ? Number(m[2]) + 1 : 2;
  for (let i = start; i < start + 1000; i++) {
    const n = `${stem} (${i})`;
    if (!taken.has(n.toLowerCase())) return n;
  }
  return `${stem}_${Date.now()}`;
}

// Windows 规则：同一目录下不允许同名文件，也不允许文件与文件夹重名。
// 新建 / 改名 / 复制 / 移动时自动顺延为「xxx (2)」（不覆盖，避免丢数据）。
function uniqueFileNameInFolder(userId, categoryId, folderId, rawName, excludeId) {
  const base = String(rawName || '未命名');
  const cid = Number(categoryId) || 0;
  const fid = Number(folderId) || 0;
  const taken = new Set();
  for (const r of db.prepare('SELECT id, name FROM file_library_files WHERE user_id = ? AND category_id = ? AND IFNULL(folder_id, 0) = ? AND is_deleted = 0').all(userId, cid, fid)) {
    if (excludeId && Number(r.id) === Number(excludeId)) continue;
    taken.add(String(r.name || '').toLowerCase());
  }
  // 同目录的文件夹名同样占位（Windows 下文件与文件夹也不能重名）
  for (const r of db.prepare('SELECT id, name FROM file_library_folders WHERE user_id = ? AND category_id = ? AND IFNULL(parent_id, 0) = ?').all(userId, cid, fid)) {
    taken.add(String(r.name || '').toLowerCase());
  }
  if (!taken.has(base.toLowerCase())) return base;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  // 同文件夹命名：已有「 (2)」这种序号时接着往上数，避免出现「xx (2) (2).png」
  const m = stem.match(/^(.*) \((\d+)\)$/);
  const core = m ? m[1] : stem;
  const start = m ? Number(m[2]) + 1 : 2;
  for (let i = start; i < start + 1000; i++) {
    const n = `${core} (${i})${ext}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
  return `${core}_${Date.now()}${ext}`;
}

// ============================================================
// 还原 / 对账：同一目录内绝不允许同名（铁律）
// ============================================================
// 从回收站还原时，目标目录里可能已经存在同名项（删掉「新建文件夹 4」后又新建了一个 4 号）。
// 原则是「已在目录里的优先，还原回来的让位」：把还原回来的那条自动顺延为「xxx (2)」，
// 既不覆盖已有内容，也绝不允许两份同名项挤进同一个 Windows 目录（那样其中一个在硬盘上会直接消失）。

// 还原一条文件后校正名字：返回新名字（没冲突则返回 null）
function restoreFileUnique(userId, fileId) {
  const f = db.prepare('SELECT id, name, category_id, folder_id FROM file_library_files WHERE id = ? AND user_id = ?').get(parseInt(fileId), userId);
  if (!f) return null;
  const nm = uniqueFileNameInFolder(userId, f.category_id, f.folder_id, f.name, f.id);
  if (nm === f.name) return null;
  db.prepare("UPDATE file_library_files SET name = ?, updated_at = datetime('now') WHERE id = ?").run(nm, f.id);
  // 名字变了，硬盘上的大图 / 正文 / 小图要跟着一起改，否则库里一个名、硬盘上一个名
  try {
    materializeFileMirrors(userId, [f.id], { keepContent: true });
    relocateThumbMirror(userId, f.id);
  } catch { /* 镜像失败不影响改名结果 */ }
  return nm;
}

// 还原一个文件夹后校正名字：返回新名字（没冲突则返回 null）
function restoreFolderUnique(userId, folderId) {
  const f = db.prepare('SELECT * FROM file_library_folders WHERE id = ? AND user_id = ?').get(parseInt(folderId), userId);
  if (!f) return null;
  const nm = uniqueFolderNameInCategory(userId, f.category_id, f.parent_id, f.name, f.id);
  if (nm === f.name) return null;
  db.prepare("UPDATE file_library_folders SET name = ?, updated_at = datetime('now') WHERE id = ?").run(nm, f.id);
  try {
    // 注意：这里不能简单地把旧目录整个 rename 成新目录。
    // 重名时两条记录往往共用同一个物理目录，整体搬走会把留在原位的那条（目录的正主）内容一起带走。
    // 正确做法：先按新名字建出自己的目录树，再把「自己名下的文件」搬进新家，别人的东西不动。
    const after = { ...f, name: nm };
    const tree = collectFolderIds(f.id);
    for (const fid of tree) {
      const fr = db.prepare('SELECT * FROM file_library_folders WHERE id = ?').get(fid);
      if (fr) ensureFolderDir(userId, Number(fid) === Number(f.id) ? after : fr);
    }
    const fids = fileIdsInFolders(userId, tree);
    materializeFileMirrors(userId, fids, { keepContent: true }); // 字节跟着搬进新目录
    rebaseFileMirrorPaths(userId, fids);                         // 库里的路径指针重算
    relocateThumbMirrors(userId, fids);                          // 小图同步
  } catch { /* 镜像失败不影响改名结果 */ }
  return nm;
}

// 全库对账：把任何同目录重名（含文件与文件夹撞名）都顺延编号。
// 既用于「全部还原」，也用于修复历史遗留的重名数据。
export function dedupeAllNames(userId) {
  const renamed = [];
  const norm = (v) => String(v || '').toLowerCase();
  // 1) 文件夹之间重名：保留 id 最小的，其余顺延
  for (const g of db.prepare(`SELECT category_id, IFNULL(parent_id, 0) AS pid, LOWER(name) AS k, COUNT(*) AS c
      FROM file_library_folders WHERE user_id = ? AND is_deleted = 0 GROUP BY category_id, pid, k HAVING c > 1`).all(userId)) {
    const rows = db.prepare('SELECT id FROM file_library_folders WHERE user_id = ? AND is_deleted = 0 AND category_id = ? AND IFNULL(parent_id, 0) = ? AND LOWER(name) = ? ORDER BY id')
      .all(userId, g.category_id, g.pid, g.k);
    for (const r of rows.slice(1)) {
      const nm = restoreFolderUnique(userId, r.id);
      if (nm) renamed.push({ kind: 'folder', id: r.id, name: nm });
    }
  }
  // 2) 文件之间重名：同上
  for (const g of db.prepare(`SELECT category_id, IFNULL(folder_id, 0) AS pid, LOWER(name) AS k, COUNT(*) AS c
      FROM file_library_files WHERE user_id = ? AND is_deleted = 0 GROUP BY category_id, pid, k HAVING c > 1`).all(userId)) {
    const rows = db.prepare('SELECT id FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND category_id = ? AND IFNULL(folder_id, 0) = ? AND LOWER(name) = ? ORDER BY id')
      .all(userId, g.category_id, g.pid, g.k);
    for (const r of rows.slice(1)) {
      const nm = restoreFileUnique(userId, r.id);
      if (nm) renamed.push({ kind: 'file', id: r.id, name: nm });
    }
  }
  // 3) 文件与文件夹撞名（上两步各自表内唯一，抓不到这种跨类型冲突）：让文件让位
  for (const c of db.prepare(`SELECT f.id AS fid FROM file_library_files f
      JOIN file_library_folders d ON d.user_id = f.user_id AND d.is_deleted = 0
        AND IFNULL(d.category_id, 0) = IFNULL(f.category_id, 0)
        AND IFNULL(d.parent_id, 0) = IFNULL(f.folder_id, 0)
        AND LOWER(d.name) = LOWER(f.name)
      WHERE f.user_id = ? AND f.is_deleted = 0 ORDER BY f.id`).all(userId)) {
    const nm = restoreFileUnique(userId, c.fid);
    if (nm) renamed.push({ kind: 'file', id: c.fid, name: nm });
  }
  return renamed;
}

// ============================================================
// 粘贴冲突处理（Windows 风格：替换目标 / 保留两者并自动编号）
// ============================================================

// 在目标目录里找同名项（文件与文件夹互相占位，与 Windows 一致）
function findNameConflict(userId, categoryId, folderId, name, excludeFileId) {
  const cid = Number(categoryId) || 0;
  const fid = Number(folderId) || 0;
  const key = String(name || '').toLowerCase();
  const f = db.prepare('SELECT id, name, file_type, file_size, updated_at, created_at FROM file_library_files WHERE user_id = ? AND category_id = ? AND IFNULL(folder_id, 0) = ? AND LOWER(name) = ? AND is_deleted = 0')
    .get(userId, cid, fid, key);
  if (f && !(excludeFileId && Number(f.id) === Number(excludeFileId))) {
    return { kind: 'file', id: f.id, name: f.name, file_type: f.file_type, file_size: f.file_size || 0, updated_at: f.updated_at || f.created_at || '' };
  }
  const d = db.prepare('SELECT id, name, updated_at, created_at FROM file_library_folders WHERE user_id = ? AND category_id = ? AND IFNULL(parent_id, 0) = ? AND LOWER(name) = ? AND is_deleted = 0')
    .get(userId, cid, fid, key);
  if (d) return { kind: 'folder', id: d.id, name: d.name, file_size: 0, updated_at: d.updated_at || d.created_at || '' };
  return null;
}

// 把「被替换」的目标项移入回收站（文件连带外置资产；文件夹连整棵子树）
function trashConflictTarget(userId, kind, id) {
  const now = new Date().toISOString();
  if (kind === 'folder') {
    const ids = [parseInt(id)];
    const stack = [parseInt(id)];
    while (stack.length) {
      const cur = stack.pop();
      for (const c of db.prepare('SELECT id FROM file_library_folders WHERE parent_id = ? AND is_deleted = 0').all(cur)) { ids.push(c.id); stack.push(c.id); }
    }
    const ph = ids.map(() => '?').join(',');
    const files = db.prepare(`SELECT * FROM file_library_files WHERE folder_id IN (${ph}) AND user_id = ? AND is_deleted = 0`).all(...ids, userId);
    db.prepare(`UPDATE file_library_folders SET is_deleted = 1, deleted_at = ? WHERE id IN (${ph}) AND user_id = ?`).run(now, ...ids, userId);
    db.prepare(`UPDATE file_library_files SET is_deleted = 1, deleted_at = ? WHERE folder_id IN (${ph}) AND user_id = ?`).run(now, ...ids, userId);
    for (const f of files) purgeStoredFiles(f);
    return true;
  }
  const row = db.prepare('SELECT * FROM file_library_files WHERE id = ? AND user_id = ?').get(parseInt(id), userId);
  if (!row) return false;
  db.prepare('UPDATE file_library_files SET is_deleted = 1, deleted_at = ? WHERE id = ?').run(now, row.id);
  purgeStoredFiles(row);
  return true;
}

// 逐项决策：decisions 显式指定优先，否则用全局 conflict（默认 rename = 自动编号，永不覆盖）
function pasteDecision(decisions, id, globalMode) {
  const hit = Array.isArray(decisions) ? decisions.find((d) => Number(d.id) === Number(id)) : null;
  const v = hit ? String(hit.action || '').toLowerCase() : '';
  if (v === 'overwrite' || v === 'replace') return 'overwrite';
  if (v === 'skip') return 'skip';
  if (v === 'rename' || v === 'keep-both' || v === 'keepboth') return 'rename';
  return String(globalMode || '').toLowerCase() === 'overwrite' ? 'overwrite' : 'rename';
}

// 空目录回收：往上级删掉搬空的目录，直到 stopDir 为止（避免在硬盘上留下一串空壳）
function pruneEmptyDirsUp(fromDir, stopDir) {
  try {
    let cur = path.normalize(fromDir);
    const stop = path.normalize(stopDir);
    while (cur && cur.startsWith(stop) && cur !== stop) {
      if (!fs.existsSync(cur)) break;
      if (fs.readdirSync(cur).length) break;
      fs.rmdirSync(cur);
      cur = path.dirname(cur);
    }
  } catch { /* 清理失败无所谓 */ }
}

// —— 缩略图跟随搬迁 ——
// 文件被移动到别的盘符/文件夹、或改名之后，硬盘上的大图会跟着搬（syncFileMirror），
// 但缩略图此前没人管 → 出现「大图已经进了子文件夹，小图还留在根目录」的错位。
// 这里按当前 {盘符, 文件夹链, 名字} 重算小图位置，把文件挪过去并同步 DB 指针。
export function relocateThumbMirror(userId, id) {
  try {
    const row = db.prepare('SELECT thumbnail_path FROM file_library_files WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row || !row.thumbnail_path) return false;
    const tp = String(row.thumbnail_path);
    // 只搬已外置到磁盘的；base64 内联不需要搬
    if (!tp.startsWith('@userdata:')) return false;
    const ext = (path.extname(tp).replace('.', '') || 'png').toLowerCase();
    const loc = thumbLocation(userId, id, ext);
    if (!loc) return false;
    if (loc.rel === tp) {
      // 位置没变，但要确保文件真的还在（被手工删掉就清掉失效指针）
      if (!fs.existsSync(loc.abs)) db.prepare('UPDATE file_library_files SET thumbnail_path = ? WHERE id = ?').run('', id);
      return false;
    }
    const srcAbs = resolveStoredPath(tp, { search: false });
    if (!srcAbs || !fs.existsSync(srcAbs)) return false; // 源丢了就别把 DB 改指到不存在的位置
    fs.mkdirSync(path.dirname(loc.abs), { recursive: true });
    const moved = moveBytesTo(srcAbs, loc.abs);
    if (!moved && !fs.existsSync(loc.abs)) return false;
    db.prepare('UPDATE file_library_files SET thumbnail_path = ? WHERE id = ?').run(loc.rel, id);
    pruneEmptyDirsUp(path.dirname(srcAbs), join(USER_DATA_DIR, userDirName(userId), THUMB_ROOT));
    return true;
  } catch {
    return false;
  }
}
export function relocateThumbMirrors(userId, ids) {
  let n = 0;
  for (const id of (ids || [])) { try { if (relocateThumbMirror(userId, id)) n++; } catch {} }
  return n;
}

// 复制缩略图 sidecar（复制文件时必须跟着复制，否则副本没有缩略图）
function copyThumbSidecar(userId, newId, srcThumbPath) {
  if (!newId || !srcThumbPath) return '';
  try {
    const srcAbs = resolveStoredPath(srcThumbPath, { search: false });
    if (!srcAbs || !fs.existsSync(srcAbs)) return '';
    const ext = (path.extname(srcAbs).replace('.', '') || 'png').toLowerCase();
    const loc = thumbLocation(userId, newId, ext);
    if (!loc) {
      // 查不到新行（极少数场景）时回退旧扁平布局，保证副本也有缩略图
      const dir = join(USER_DATA_DIR, userDirName(userId), '.thumbs');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const dst = join(dir, `${newId}.${ext}`);
      fs.copyFileSync(srcAbs, dst);
      return `@userdata:${userDirName(userId)}/.thumbs/${newId}.${ext}`;
    }
    if (!fs.existsSync(path.dirname(loc.abs))) fs.mkdirSync(path.dirname(loc.abs), { recursive: true });
    fs.copyFileSync(srcAbs, loc.abs);
    return loc.rel;
  } catch {
    return '';
  }
}

// 把一行文件记录复制成新记录（含磁盘二进制 / 正文 / 缩略图），返回新 ID
function copyFileRowInto(userId, f, cid, folderId, newName) {
  let relPath = f.file_path || '';
  if (f.file_path && ['image', 'video', 'audio'].includes(f.file_type)) {
    try {
      const srcPath = resolveStoredPath(f.file_path, { search: false });
      if (srcPath) {
        const ext = f.format || 'png';
        const userDir = join(GALLERY_DIR, userId);
        if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
        const newFile = `${uuidv4()}.${ext}`;
        fs.copyFileSync(srcPath, join(userDir, newFile));
        relPath = `${userId}/${newFile}`;
      }
    } catch (e) { /* 复制失败则保留原引用 */ }
  }
  const result = db.prepare(`INSERT INTO file_library_files (user_id, category_id, folder_id, name, description, file_type, file_path, thumbnail_data, thumbnail_path, file_size, width, height, format, content, content_path, filename, rule_type, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
    userId, cid, folderId, newName || f.name, f.description || '', f.file_type,
    relPath, f.thumbnail_data || '', '', f.file_size || 0, f.width || 0, f.height || 0, f.format || '',
    '', '', f.filename || '', f.rule_type || 'general'
  );
  const newId = result.lastInsertRowid;
  const tp = copyThumbSidecar(userId, newId, f.thumbnail_path);
  // 文档型正文必须跟着复制，否则副本打开是空的（正文早已外置到磁盘，f.content 恒为空）
  let cp = '';
  if (DOC_TYPES.has(f.file_type)) {
    const txt = readDocContent(userId, f.content_path, f.content);
    if (txt) cp = saveDocContent(userId, newId, txt, f.file_type) || '';
  }
  if (cp || tp) db.prepare('UPDATE file_library_files SET content_path = ?, thumbnail_path = ?, content = ? WHERE id = ?').run(cp, tp, '', newId);
  return newId;
}

// 把源文件夹的内容合并进已存在的同名目标文件夹（Windows「合并文件夹」语义）
// 内部二级冲突一律自动编号，绝不在用户看不见的层级里静默覆盖
function mergeFolderInto(userId, srcId, dstId, catId) {
  const files = db.prepare('SELECT * FROM file_library_files WHERE folder_id = ? AND user_id = ? AND is_deleted = 0').all(srcId, userId);
  for (const f of files) {
    const clash = findNameConflict(userId, catId, dstId, f.name, null);
    const nm = clash ? uniqueFileNameInFolder(userId, catId, dstId, f.name, null) : f.name;
    copyFileRowInto(userId, f, catId, dstId, nm);
  }
  const subs = db.prepare('SELECT * FROM file_library_folders WHERE parent_id = ? AND user_id = ? AND is_deleted = 0').all(srcId, userId);
  for (const sf of subs) {
    const clash = findNameConflict(userId, catId, dstId, sf.name, null);
    if (clash && clash.kind === 'folder') {
      mergeFolderInto(userId, sf.id, clash.id, catId);
    } else {
      const nm = clash ? uniqueFolderNameInCategory(userId, catId, dstId, sf.name, null) : sf.name;
      const nf = db.prepare('INSERT INTO file_library_folders (user_id, category_id, parent_id, name, is_callable) VALUES (?, ?, ?, ?, ?)')
        .run(userId, catId, dstId, nm, sf.is_callable ? 1 : 0);
      mergeFolderInto(userId, sf.id, nf.lastInsertRowid, catId);
    }
  }
}

// 文件 / 文件夹在镜像中的目录绝对路径
function mirrorDirAbs(userId, categoryId, folderId) {
  const parts = [USER_DATA_DIR, userDirName(userId), driveDirOf(userId, categoryId)];
  if (folderId) parts.push(...folderChain(folderId));
  return join(...parts);
}

// 用「父级链 + 自身名字」拼目录（搬家时必须显式传旧名字，不能回查数据库，否则旧路径会被算成新名字）
function mirrorDirAbsOf(userId, row) {
  const parts = [USER_DATA_DIR, userDirName(userId), driveDirOf(userId, row.category_id)];
  if (row.parent_id) parts.push(...folderChain(row.parent_id));
  if (row.name) parts.push(row.name);
  return join(...parts);
}

// 绝对路径 → 相对 user_data 的 POSIX 形式
function mirrorRelFrom(absPath) {
  return path.relative(USER_DATA_DIR, absPath).replace(/\\/g, '/');
}

// 显示名 → 合法文件主名（去掉尾随的重复扩展名，避免出现「小说.txt.txt」）
function mirrorBaseName(name, ext) {
  let base = sanitizeFolderName(name || '未命名') || '未命名';
  // 显示名常常自带扩展名（如「新建小说.novel」「分镜.json」），若不去掉会叠成
  // 「新建小说.novel.novel.json」「分镜.json.storyboard.json」这种双扩展名。
  const known = [
    'storyboard.json', 'novel.json', 'prompt.json', 'function.json', 'rule.txt', 'workflow.json',
    'json', 'txt', 'novel', 'md', 'csv',
    'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg',
    'mp4', 'webm', 'mov', 'avi', 'mp3', 'wav', 'ogg',
  ];
  let changed = true;
  while (changed) {
    changed = false;
    const low = base.toLowerCase();
    for (const k of known) {
      if (low.endsWith(`.${k}`) && base.length > k.length + 1) {
        base = base.slice(0, -(k.length + 1));
        changed = true;
        break;
      }
    }
  }
  return base || '未命名';
}

// 选一个不与现有文件冲突的镜像文件名（Windows 风格「名字 (2).ext」）
function pickMirrorName(dirAbs, base, ext, srcAbs) {
  const suffix = ext ? `.${ext}` : '';
  const plain = `${base}${suffix}`;
  const plainAbs = join(dirAbs, plain);
  // 源文件已在该位置（仅改名其它字段时）：保持不动
  if (srcAbs && path.normalize(srcAbs) === path.normalize(plainAbs)) return plain;
  if (!fs.existsSync(plainAbs)) return plain;
  for (let i = 2; i < 1000; i++) {
    const n = `${base} (${i})${suffix}`;
    if (!fs.existsSync(join(dirAbs, n))) return n;
  }
  return `${base}_${Date.now()}${suffix}`;
}

// 把字节搬到镜像位置（复制 + 删源，跨盘失败时保留源文件）
function moveBytesTo(srcAbs, dstAbs) {
  try {
    if (!fs.existsSync(srcAbs)) return false;
    fs.copyFileSync(srcAbs, dstAbs);
    try { fs.unlinkSync(srcAbs); } catch {}
    return true;
  } catch {
    return fs.existsSync(dstAbs);
  }
}

// 把一个文件的磁盘字节同步到镜像路径，返回待更新的 { file_path, content_path }（未变动为 null）
function syncFileMirror(userId, row, opts = {}) {
  const out = { file_path: null, content_path: null };
  try {
    const dirAbs = mirrorDirAbs(userId, row.category_id, row.folder_id);
    if (!fs.existsSync(dirAbs)) fs.mkdirSync(dirAbs, { recursive: true });

    // 二进制大图 / 视频 / 音频
    if (['image', 'video', 'audio'].includes(row.file_type) && row.file_path) {
      const srcAbs = resolveStoredPath(row.file_path, { search: false });
      if (srcAbs) {
        const ext = String(row.format || path.extname(srcAbs).replace('.', '') || 'png').toLowerCase();
        const dstAbs = join(dirAbs, pickMirrorName(dirAbs, mirrorBaseName(row.name, ext), ext, srcAbs));
        if (path.normalize(srcAbs) !== path.normalize(dstAbs)) moveBytesTo(srcAbs, dstAbs);
        out.file_path = `@userdata:${mirrorRelFrom(dstAbs)}`;
      }
    }
    // 文档型正文（小说 / 分镜 / 提示词 / 工作流 / 规则 …）
    if (DOC_TYPES.has(row.file_type)) {
      const ext = DOC_EXT[row.file_type] || 'txt';
      const srcAbs = row.content_path ? resolveStoredPath(row.content_path, { search: false }) : null;
      const base = mirrorBaseName(row.name, ext);
      const finalName = pickMirrorName(dirAbs, base, ext, srcAbs);
      const dstAbs = join(dirAbs, finalName);
      if (srcAbs && fs.existsSync(srcAbs)) {
        if (path.normalize(srcAbs) !== path.normalize(dstAbs)) moveBytesTo(srcAbs, dstAbs);
      }
      // 关键修复：保存正文时必须「覆盖写盘」。
      // 旧逻辑只在目标文件「不存在」时才写 opts.content；一旦硬盘上已有同名文件
      // （也就是第 2 次及以后的每次保存），这里只会做 moveBytesTo —— 路径没变等于什么都没做，
      // 结果就是：数据库 updated_at 变了、接口返回成功、但正文永远停在第一次保存的版本，
      // 也就是「小说改了保存不了」。
      // 用独立开关 overwriteContent 而不是靠 opts.content != null 判断：
      // materializeFileMirrors 迁移时会传入读出来的正文，读取失败即为 ''，
      // 若在此处无条件覆盖会把用户正文擦成空 —— 那种场景必须保持只搬不写。
      if (opts.overwriteContent) {
        fs.writeFileSync(dstAbs, String(opts.content == null ? '' : opts.content), 'utf8');
      } else if (!(srcAbs && fs.existsSync(srcAbs))) {
        // 空内容也要落盘：新建的文本文档必须立刻在硬盘上可见，而不是等第一次保存
        fs.writeFileSync(dstAbs, opts.content == null ? '' : String(opts.content), 'utf8');
      }
      // 重名被自动加了「 (2)」时，把序号同步回显示名，保证 UI 与硬盘一致
      if (finalName !== `${base}.${ext}`) {
        const m = finalName.match(/ \((\d+)\)\.[^.]+(?:\.[^.]+)*$/);
        if (m) out.fileName = `${String(row.name || base)} (${m[1]})`;
      }
      if (fs.existsSync(dstAbs)) out.content_path = `@userdata:${mirrorRelFrom(dstAbs)}`;
    }
  } catch { /* 镜像失败不阻塞业务 */ }
  return out;
}

// 直接把字节写进盘符镜像目录，返回 @userdata: 相对路径（失败返回 ''）
function writeBytesToMirror(userId, categoryId, folderId, name, ext, bytes) {
  try {
    const dirAbs = mirrorDirAbs(userId, categoryId, folderId || null);
    if (!fs.existsSync(dirAbs)) fs.mkdirSync(dirAbs, { recursive: true });
    const fileName = pickMirrorName(dirAbs, mirrorBaseName(name, ext), ext, null);
    const abs = join(dirAbs, fileName);
    fs.writeFileSync(abs, bytes);
    return `@userdata:${mirrorRelFrom(abs)}`;
  } catch {
    return '';
  }
}

// 把一批文件的磁盘字节按当前层级归位到镜像目录（复制 / 批量移动 / 存量迁移共用）
export function materializeFileMirrors(userId, ids, opts = {}) {
  let done = 0;
  for (const id of ids) {
    try {
      const f = db.prepare('SELECT * FROM file_library_files WHERE id = ? AND user_id = ?').get(id, userId);
      if (!f) continue;
      const content = opts.keepContent ? undefined : (DOC_TYPES.has(f.file_type) ? readDocContent(userId, f.content_path, f.content) : undefined);
      const out = syncFileMirror(userId, f, { content });
      const sets = []; const vals = [];
      if (out.file_path && out.file_path !== f.file_path) { sets.push('file_path = ?'); vals.push(out.file_path); }
      if (out.content_path && out.content_path !== f.content_path) {
        sets.push('content_path = ?');
        vals.push(out.content_path);
        // 正文已落盘，库内 content 列清空（除非要求保留）
        if (!opts.keepContent) { sets.push('content = ?'); vals.push(''); }
      }
      if (sets.length) {
        vals.push(id);
        db.prepare(`UPDATE file_library_files SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        done++;
      }
    } catch { /* 单个失败不影响其余 */ }
  }
  return done;
}

// 递归收集文件夹 ID（含自身），带环保护
function collectFolderIds(rootId) {
  const ids = [];
  const seen = new Set();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    ids.push(cur);
    for (const c of db.prepare('SELECT id FROM file_library_folders WHERE parent_id = ?').all(cur)) stack.push(c.id);
  }
  return ids;
}

// 取某用户一批文件夹内的活跃文件 ID
function fileIdsInFolders(userId, folderIds) {
  if (!folderIds.length) return [];
  const ph = folderIds.map(() => '?').join(',');
  return db.prepare(`SELECT id FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND folder_id IN (${ph})`).all(userId, ...folderIds).map((r) => r.id);
}

// 目录搬家后，按「文件名不变、目录重算」修正其下所有文件的镜像路径
function rebaseFileMirrorPaths(userId, fileIds) {
  let changed = 0;
  try {
    for (const id of fileIds) {
      const f = db.prepare('SELECT id, category_id, folder_id, file_path, content_path FROM file_library_files WHERE id = ? AND user_id = ?').get(id, userId);
      if (!f) continue;
      const dirRel = mirrorRelFrom(mirrorDirAbs(userId, f.category_id, f.folder_id));
      const sets = [];
      const vals = [];
      for (const key of ['file_path', 'content_path']) {
        const v = f[key];
        if (!v || !v.startsWith('@userdata:')) continue;
        const rel = v.slice('@userdata:'.length);
        if (!isMirrorRel(rel)) continue;
        const next = `@userdata:${dirRel}/${path.basename(rel)}`;
        if (next !== v) { sets.push(`${key} = ?`); vals.push(next); }
      }
      if (sets.length) {
        vals.push(id);
        db.prepare(`UPDATE file_library_files SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        changed++;
      }
    }
  } catch { /* 不影响业务 */ }
  return changed;
}

// 确保文件夹的镜像目录存在
function ensureFolderDir(userId, folderRow) {
  try {
    const dirAbs = mirrorDirAbsOf(userId, folderRow);
    if (!fs.existsSync(dirAbs)) fs.mkdirSync(dirAbs, { recursive: true });
    return dirAbs;
  } catch {
    return null;
  }
}

// 目录整体复制（跨盘 / 跨卷 rename 失败时的退路）
function copyDirRecursive(srcAbs, dstAbs) {
  fs.mkdirSync(dstAbs, { recursive: true });
  for (const e of fs.readdirSync(srcAbs, { withFileTypes: true })) {
    const s = join(srcAbs, e.name);
    const d = join(dstAbs, e.name);
    if (e.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

// 重命名 / 移动文件夹后，整体搬移镜像目录
function moveFolderDir(userId, oldRow, newRow) {
  try {
    const oldAbs = mirrorDirAbsOf(userId, oldRow);
    const newAbs = mirrorDirAbsOf(userId, newRow);
    if (path.normalize(oldAbs) === path.normalize(newAbs)) return newAbs;
    if (!fs.existsSync(oldAbs)) {
      if (!fs.existsSync(newAbs)) fs.mkdirSync(newAbs, { recursive: true });
      return newAbs;
    }
    const parent = path.dirname(newAbs);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.renameSync(oldAbs, newAbs);
    return newAbs;
  } catch {
    // 跨盘符 / 跨卷 rename 会失败（EXDEV），退化为「整体复制 + 尽力清理源目录」
    try {
      const oldAbs = mirrorDirAbsOf(userId, oldRow);
      const newAbs = mirrorDirAbsOf(userId, newRow);
      copyDirRecursive(oldAbs, newAbs);
      try { fs.rmSync(oldAbs, { recursive: true, force: true }); } catch {}
      return newAbs;
    } catch {
      return null;
    }
  }
}

// 启动时按数据库结构一次性补齐所有盘符目录与文件夹目录
export function ensureMirrorTree() {
  let created = 0;
  try {
    try { ensureDriveLetters(); } catch {} // 先补齐盘符字母，否则新分类没有目录可建
    const userSet = new Set();
    for (const t of ['file_library_categories', 'file_library_folders', 'file_library_files']) {
      for (const r of db.prepare(`SELECT DISTINCT user_id FROM ${t}`).all()) userSet.add(r.user_id);
    }
    for (const userId of userSet) {
      for (const c of db.prepare('SELECT id, name, is_system, drive_letter FROM file_library_categories WHERE user_id = ?').all(userId)) {
        const letter = c.drive_letter || (c.is_system === 1 && c.name === '总库' ? 'C' : null);
        if (!letter) continue;
        const d = join(USER_DATA_DIR, userDirName(userId), driveDirOfRow(c));
        if (!fs.existsSync(d)) { fs.mkdirSync(d, { recursive: true }); created++; }
      }
      for (const f of db.prepare('SELECT id, category_id FROM file_library_folders WHERE user_id = ? AND is_deleted = 0').all(userId)) {
        const d = mirrorDirAbs(userId, f.category_id, f.id);
        if (!fs.existsSync(d)) { fs.mkdirSync(d, { recursive: true }); created++; }
      }
    }
  } catch (e) {
    console.warn('盘符镜像目录创建失败:', e.message);
  }
  if (created) console.log(`📂 盘符镜像：已补齐 ${created} 个目录（user_data/<用户>/<盘符>/…）`);
  return created;
}

// 永久删除时清掉空的镜像目录（自底向上删除空目录，不碰盘符根目录）
export function pruneEmptyMirrorDirs(dirAbs, userId) {
  try {
    const root = join(USER_DATA_DIR, userDirName(userId));
    let cur = path.normalize(dirAbs);
    let guard = 0;
    while (guard++ < 50) {
      if (!cur.startsWith(root)) break;
      const rel = path.relative(root, cur).replace(/\\/g, '/');
      if (!rel || rel === '.' || !isMirrorRel(`${userId}/${rel}`)) break; // 不到盘符根
      let empty = false;
      try { empty = fs.existsSync(cur) && fs.readdirSync(cur).length === 0; } catch { empty = false; }
      if (!empty) break;
      try { fs.rmdirSync(cur); } catch { break; }
      cur = path.dirname(cur);
    }
  } catch { /* 忽略 */ }
}

// 永久删除时，把磁盘文件移入回收站（server/.trash/<user>/）而非直接销毁，
// 与 UI 回收站打通：清空回收站后文件仍在 .trash 保留一段时间（启动自动清理）。
function moveToTrash(absPath, userId) {
  if (!absPath) return;
  if (!fs.existsSync(absPath)) return;
  try {
    const trashDir = join(__dirname, '.trash', String(userId || 'shared'));
    if (!fs.existsSync(trashDir)) fs.mkdirSync(trashDir, { recursive: true });
    const base = path.basename(absPath);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    let dest = join(trashDir, `${stamp}__${base}`);
    let n = 1;
    while (fs.existsSync(dest)) { dest = join(trashDir, `${stamp}__${n}__${base}`); n++; }
    fs.renameSync(absPath, dest);
  } catch (e) {
    // 兜底：直接删除，保证主流程不阻塞
    try { fs.unlinkSync(absPath); } catch {}
  }
}

// 彻底删除文件时，清理其在磁盘上的外置资产：缩略图 sidecar / 文档正文（移入 .trash）
export function purgeStoredFiles(fileRow) {
  for (const key of ['thumbnail_path', 'content_path']) {
    const raw = fileRow && fileRow[key];
    if (!raw) continue;
    try {
      const abs = resolveStoredPath(raw, { search: false });
      if (abs) moveToTrash(abs, fileRow && fileRow.user_id);
    } catch {}
  }
}

// ============================================
// 头像外置：把头像 base64 写成磁盘文件，数据库只存相对路径指针；
// 读取时再回传 data URL（前端 <img :src> 直接可用，零前端改动）。
// 统一放在 user_data/<用户>/avatars/<kind>_<id>.<ext>，用 @userdata: 前缀解析。
// ============================================
const AVATAR_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };

// 写头像到磁盘，返回 @userdata: 相对路径；非 base64 或失败返回 ''（不阻塞主流程）
export function saveAvatarFile(userId, id, base64, kind) {
  try {
    if (!base64 || typeof base64 !== 'string' || !base64.startsWith('data:image/')) return '';
    const m = base64.match(/^data:image\/([^;]+);base64,(.+)$/);
    if (!m) return '';
    const ext = (AVATAR_MIME[m[1].toLowerCase()] ? m[1].toLowerCase() : 'png').replace('jpeg', 'jpg');
    const dir = join(USER_DATA_DIR, userDirName(userId), 'avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const rel = `@userdata:${userDirName(userId)}/avatars/${kind}_${id}.${ext}`;
    const abs = join(USER_DATA_DIR, userDirName(userId), 'avatars', `${kind}_${id}.${ext}`);
    fs.writeFileSync(abs, Buffer.from(m[2], 'base64'));
    return rel;
  } catch (e) {
    return '';
  }
}

// 读取头像为 data URL：优先从磁盘 avatar_path，失败回退 legacy avatar_url（迁移前可能是 base64）
export function readAvatarDataUrl(userId, avatarPath, fallbackAvatarUrl) {
  if (avatarPath) {
    try {
      const abs = resolveStoredPath(avatarPath);
      if (abs && fs.existsSync(abs)) {
        const buf = fs.readFileSync(abs);
        const ext = (path.extname(abs).replace('.', '') || 'png').toLowerCase();
        const mime = AVATAR_MIME[ext] || 'image/png';
        return `data:${mime};base64,${buf.toString('base64')}`;
      }
    } catch (e) { /* 磁盘文件缺失，回退 legacy */ }
  }
  return fallbackAvatarUrl || '';
}

// 删除某个头像磁盘文件（替换 / 清空时调用）
export function deleteAvatarFile(avatarPath) {
  if (!avatarPath) return;
  try {
    const abs = resolveStoredPath(avatarPath, { search: false });
    if (abs) fs.unlinkSync(abs);
  } catch {}
}

// ============================================
// 工具函数
// ============================================

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function response(success, data = null, error = null) {
  return { success, data, error };
}

// 校验分镜JSON并提取提示词
function validateAndExtractPrompts(jsonData) {
  let parsed = jsonData;
  if (typeof jsonData === 'string') {
    try {
      parsed = JSON.parse(jsonData);
    } catch (e) {
      return { valid: false, prompts: [], message: 'JSON格式错误: ' + e.message };
    }
  }

  const prompts = [];
  if (Array.isArray(parsed)) {
    parsed.forEach(item => {
      if (item && typeof item === 'object' && item.prompt) {
        prompts.push(item.prompt);
      } else if (typeof item === 'string') {
        prompts.push(item);
      }
    });
  } else if (parsed && typeof parsed === 'object') {
    if (parsed.prompt) {
      prompts.push(parsed.prompt);
    } else if (Array.isArray(parsed.storyboards)) {
      parsed.storyboards.forEach(sb => {
        if (sb && sb.prompt) prompts.push(sb.prompt);
      });
    }
  }

  if (prompts.length === 0) {
    return { valid: false, prompts: [], message: '未找到有效的分镜提示词' };
  }
  return { valid: true, prompts, message: `共 ${prompts.length} 个分镜` };
}

// ============================================
// 认证相关 API
// ============================================

export const authAPI = {
  // 注册
  register: (req, res) => {
    try {
      const { username, email, password } = req.body;
      
      if (!username || !email || !password) {
        return res.json(response(false, null, '用户名、邮箱和密码都不能为空'));
      }

      if (password.length < 4) {
        return res.json(response(false, null, '密码至少4位'));
      }

      // 检查是否已存在
      const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
      if (existingUser) {
        return res.json(response(false, null, '用户名或邮箱已被注册'));
      }

      const userId = uuidv4();
      const passwordHash = hashPassword(password);

      db.prepare(`
        INSERT INTO users (id, username, email, password_hash)
        VALUES (?, ?, ?, ?)
      `).run(userId, username, email, passwordHash);

      // 为新用户创建默认配置
      db.prepare(`
        INSERT INTO user_configs (user_id, config_type, config_data)
        VALUES (?, 'global_settings', '{"theme":"light","language":"zh-CN","autoSave":true}')
      `).run(userId);

      db.prepare(`
        INSERT INTO user_configs (user_id, config_type, config_data)
        VALUES (?, 'ai_providers', '{"providers":[]}')
      `).run(userId);

      const user = db.prepare('SELECT id, username, email, avatar_url, membership_tier, created_at FROM users WHERE id = ?').get(userId);

      // 自动登录，生成 token
      const token = generateToken({ userId: user.id, username: user.username });
      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO sessions (id, user_id, token, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, user.id, token, expiresAt);

      return res.json(response(true, {
        user,
        token,
        sessionId
      }));

    } catch (error) {
      console.error('注册失败:', error);
      return res.json(response(false, null, '注册失败: ' + error.message));
    }
  },

  // 登录
  login: (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.json(response(false, null, '用户名和密码不能为空'));
      }

      // 支持用邮箱或用户名登录
      const user = db.prepare(
        'SELECT * FROM users WHERE username = ? OR email = ?'
      ).get(username, username);

      if (!user || !comparePassword(password, user.password_hash)) {
        return res.json(response(false, null, '用户名或密码错误'));
      }

      // 生成 token
      const token = generateToken({ userId: user.id, username: user.username });
      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare(`
        INSERT INTO sessions (id, user_id, token, expires_at)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, user.id, token, expiresAt);

      return res.json(response(true, {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar_url: readAvatarDataUrl(user.id, user.avatar_path, user.avatar_url),
          created_at: user.created_at
        },
        token,
        sessionId
      }));

    } catch (error) {
      console.error('登录失败:', error);
      return res.json(response(false, null, '登录失败: ' + error.message));
    }
  },

  // 验证 token
  verifyToken: (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.json(response(false, null, '未提供认证令牌'));
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return res.json(response(false, null, '认证令牌无效或已过期'));
      }

      // 检查 session 是否有效
      const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > datetime(\'now\')').get(token);
      if (!session) {
        return res.json(response(false, null, '会话已过期，请重新登录'));
      }

      const user = db.prepare('SELECT id, username, email, avatar_url, avatar_path FROM users WHERE id = ?').get(decoded.userId);
      
      return res.json(response(true, {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar_url: readAvatarDataUrl(user.id, user.avatar_path, user.avatar_url)
        }
      }));

    } catch (error) {
      console.error('验证失败:', error);
      return res.json(response(false, null, '验证失败'));
    }
  },

  // 登出
  logout: (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (token) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      }

      return res.json(response(true, null, '已退出登录'));

    } catch (error) {
      return res.json(response(false, null, '退出失败'));
    }
  }
};

// ============================================
// 会员体系：套餐定义 + 配额计算 + 账户 API
// ============================================
const MEMBERSHIP_TIERS = {
  free:     { key: 'free',     label: '免费版', price: '¥0',     storageBytes: 1 * 1024 * 1024 * 1024,  monthlyGenerations: 50,   concurrentTasks: 1,  maxWorkflows: 3 },
  standard: { key: 'standard', label: '标准版', price: '¥39/月', storageBytes: 10 * 1024 * 1024 * 1024, monthlyGenerations: 500,  concurrentTasks: 3,  maxWorkflows: 20 },
  pro:      { key: 'pro',      label: '专业版', price: '¥99/月', storageBytes: 100 * 1024 * 1024 * 1024, monthlyGenerations: 5000, concurrentTasks: 10, maxWorkflows: 100 },
};

function getTierDef(tier) {
  return MEMBERSHIP_TIERS[tier] || MEMBERSHIP_TIERS.free;
}

// 计算某用户的会员套餐 + 实时用量（存储/本月任务/并发任务/文件数/工作流数）
function getMembership(userId) {
  const u = db.prepare('SELECT membership_tier, quota_json FROM users WHERE id = ?').get(userId);
  const tier = (u && u.membership_tier) || 'free';
  const def = getTierDef(tier);
  let overrides = {};
  try { overrides = u && u.quota_json ? JSON.parse(u.quota_json) : {}; } catch (e) { overrides = {}; }
  const quota = { ...def, ...(overrides.quota || {}) };

  const storageRow = db.prepare("SELECT COALESCE(SUM(file_size),0) AS s FROM file_library_files WHERE user_id = ? AND is_deleted = 0").get(userId);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const genRow = db.prepare("SELECT COUNT(*) AS c FROM batch_generation_jobs WHERE user_id = ? AND created_at >= ?").get(userId, monthStart.toISOString());
  let activeRow = { c: 0 };
  try { const r = db.prepare("SELECT COUNT(*) AS c FROM batch_generation_jobs WHERE user_id = ? AND status NOT IN ('completed','failed','cancelled')").get(userId); if (r) activeRow = r; } catch (e) { /* 列可能不存在 */ }
  const fileCount = db.prepare('SELECT COUNT(*) AS c FROM file_library_files WHERE user_id = ? AND is_deleted = 0').get(userId);
  const wfCount = db.prepare("SELECT COUNT(*) AS c FROM file_library_files WHERE user_id = ? AND file_type = 'workflow' AND is_deleted = 0").get(userId);

  const usage = {
    storageBytes: storageRow ? storageRow.s : 0,
    monthlyGenerations: genRow ? genRow.c : 0,
    concurrentTasks: activeRow ? activeRow.c : 0,
    fileCount: fileCount ? fileCount.c : 0,
    workflowCount: wfCount ? wfCount.c : 0,
  };
  // 存储不再受限（本地单机），-1 = 无限
  quota.storageBytes = -1;
  return { tier, tierLabel: def.label, price: def.price, quota, usage, tiers: MEMBERSHIP_TIERS };
}

// 配额校验：type ∈ storage | generation | concurrent | workflow
function checkQuota(userId, type) {
  const m = getMembership(userId);
  if (type === 'storage') {
    // 本地单机部署：存储空间不设上限（ComfyUI 批量生图一次就可能 10GB+）。
    // limit = -1 表示无限，界面显示"无限"。
    return { ok: true, used: m.usage.storageBytes, limit: -1, reason: '' };
  }
  if (type === 'generation') {
    const ok = m.usage.monthlyGenerations < m.quota.monthlyGenerations;
    return { ok, used: m.usage.monthlyGenerations, limit: m.quota.monthlyGenerations, reason: ok ? '' : '本月批量任务已达上限' };
  }
  if (type === 'concurrent') {
    const ok = m.usage.concurrentTasks < m.quota.concurrentTasks;
    return { ok, used: m.usage.concurrentTasks, limit: m.quota.concurrentTasks, reason: ok ? '' : '并发任务已达上限' };
  }
  if (type === 'workflow') {
    const ok = m.usage.workflowCount < m.quota.maxWorkflows;
    return { ok, used: m.usage.workflowCount, limit: m.quota.maxWorkflows, reason: ok ? '' : '工作流数量已达上限' };
  }
  return { ok: true, reason: '' };
}

export const accountAPI = {
  me: (req, res) => {
    try {
      const userId = req.userId;
      const u = db.prepare('SELECT id, username, email, avatar_url, avatar_path, membership_tier, created_at FROM users WHERE id = ?').get(userId);
      if (!u) return res.json(response(false, null, '用户不存在'));
      u.avatar_url = readAvatarDataUrl(u.id, u.avatar_path, u.avatar_url);
      return res.json(response(true, { user: u, membership: getMembership(userId) }));
    } catch (e) { return res.json(response(false, null, e.message)); }
  },
  updateMembership: (req, res) => {
    try {
      const userId = req.userId;
      const { tier } = req.body || {};
      if (!MEMBERSHIP_TIERS[tier]) return res.json(response(false, null, '无效的套餐类型'));
      db.prepare("UPDATE users SET membership_tier = ?, quota_json = '{}', updated_at = datetime('now') WHERE id = ?").run(tier, userId);
      return res.json(response(true, { membership: getMembership(userId) }));
    } catch (e) { return res.json(response(false, null, e.message)); }
  },
  usage: (req, res) => {
    try { return res.json(response(true, getMembership(req.userId))); }
    catch (e) { return res.json(response(false, null, e.message)); }
  },
  check: (req, res) => {
    try { return res.json(response(true, checkQuota(req.userId, req.query.type || 'generation'))); }
    catch (e) { return res.json(response(false, null, e.message)); }
  },
};

// ============================================
// 用户信息 API
// ============================================

export const userAPI = {
  // 获取当前用户信息
  getCurrentUser: (req, res) => {
    try {
      const userId = req.userId;
      
      const user = db.prepare('SELECT id, username, email, avatar_url, avatar_path, created_at FROM users WHERE id = ?').get(userId);
      
      if (!user) {
        return res.json(response(false, null, '用户不存在'));
      }

      user.avatar_url = readAvatarDataUrl(user.id, user.avatar_path, user.avatar_url);
      return res.json(response(true, user));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 更新用户资料
  updateProfile: (req, res) => {
    try {
      const userId = req.userId;
      const { username, avatar_url } = req.body;

      if (username) {
        const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, userId);
        if (existing) {
          return res.json(response(false, null, '用户名已被使用'));
        }
        
        db.prepare('UPDATE users SET username = ?, updated_at = datetime(\'now\') WHERE id = ?').run(username, userId);
        // 硬盘上的用户根目录名跟随用户名一起改（内含盘符目录/缩略图/文档/头像）
        try { __userDirCache.delete(String(userId)); renameUserDirIfNeeded(userId); } catch {}
      }

      if (avatar_url !== undefined) {
        if (typeof avatar_url === 'string' && avatar_url.startsWith('data:image/')) {
          // 头像外置到磁盘，DB 只存相对路径指针（avatar_path），avatar_url 列清空
          const old = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId);
          const rel = saveAvatarFile(userId, userId, avatar_url, 'user');
          if (rel) {
            deleteAvatarFile(old && old.avatar_path);
            db.prepare('UPDATE users SET avatar_path = ?, avatar_url = ?, updated_at = datetime(\'now\') WHERE id = ?').run(rel, '', userId);
          } else {
            db.prepare('UPDATE users SET avatar_url = ?, updated_at = datetime(\'now\') WHERE id = ?').run(avatar_url, userId);
          }
        } else {
          // 非 base64（清空头像 / 设为文本）则删掉磁盘残留并置空
          const old = db.prepare('SELECT avatar_path FROM users WHERE id = ?').get(userId);
          deleteAvatarFile(old && old.avatar_path);
          db.prepare('UPDATE users SET avatar_path = ?, avatar_url = ?, updated_at = datetime(\'now\') WHERE id = ?').run('', avatar_url || '', userId);
        }
      }

      const user = db.prepare('SELECT id, username, email, avatar_url, avatar_path FROM users WHERE id = ?').get(userId);
      if (user) user.avatar_url = readAvatarDataUrl(user.id, user.avatar_path, user.avatar_url);
      return res.json(response(true, user));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 修改密码
  changePassword: (req, res) => {
    try {
      const userId = req.userId;
      const { oldPassword, newPassword } = req.body;

      if (!oldPassword || !newPassword) {
        return res.json(response(false, null, '请输入旧密码和新密码'));
      }

      if (newPassword.length < 4) {
        return res.json(response(false, null, '新密码至少4位'));
      }

      const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
      if (!user) {
        return res.json(response(false, null, '用户不存在'));
      }

      if (!comparePassword(oldPassword, user.password_hash)) {
        return res.json(response(false, null, '旧密码不正确'));
      }

      const newHash = hashPassword(newPassword);
      db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newHash, userId);

      return res.json(response(true, null, '密码修改成功'));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 角色管理 API
// ============================================

export const characterAPI = {
  // 获取所有角色
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      
      const characters = db.prepare('SELECT * FROM characters WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      for (const c of characters) c.avatar_url = readAvatarDataUrl(userId, c.avatar_path, c.avatar_url);
      
      return res.json(response(true, characters));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 获取单个角色
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;

      const character = db.prepare('SELECT * FROM characters WHERE id = ? AND user_id = ?').get(id, userId);
      
      if (!character) {
        return res.json(response(false, null, '角色不存在'));
      }

      character.avatar_url = readAvatarDataUrl(userId, character.avatar_path, character.avatar_url);
      return res.json(response(true, character));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 创建角色
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name, description, avatar_url, system_prompt, personality, ...rest } = req.body;

      if (!name) {
        return res.json(response(false, null, '角色名称不能为空'));
      }

      // 头像外置：base64 落盘，DB 只存 avatar_path；非 base64（如路径/空）原样保留
      let avatarPath = '';
      let avatarCol = avatar_url || '';
      if (typeof avatar_url === 'string' && avatar_url.startsWith('data:image/')) {
        avatarPath = saveAvatarFile(userId, 0, avatar_url, 'char'); // id 在插入后回填
        avatarCol = '';
      }

      const result = db.prepare(`
        INSERT INTO characters (user_id, name, description, avatar_url, avatar_path, system_prompt, personality, preferred_model, model_parameters, generation_workflow, image_settings, background_story, gender, personality_text, rule_refs, function_config, ai_config_override, category_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId, name, description || '', avatarCol, avatarPath,
        system_prompt || '', JSON.stringify(personality || {}),
        rest.preferred_model || '', JSON.stringify(rest.model_parameters || {}),
        rest.generation_workflow ? JSON.stringify(rest.generation_workflow) : null,
        rest.image_settings ? JSON.stringify(rest.image_settings) : null,
        rest.background_story || '',
        rest.gender || '',
        rest.personality_text || '',
        JSON.stringify(rest.rule_refs || {}),
        JSON.stringify(rest.function_config || {}),
        JSON.stringify(rest.ai_config_override || {}),
        rest.category_id || 0
      );

      const newId = result.lastInsertRowid;
      // 头像文件名用了 id 占位 0，插入后重命名到真实 id（避免占位冲突）
      if (avatarPath && avatarPath.includes('char_0.')) {
        try {
          const dir = join(USER_DATA_DIR, userDirName(userId), 'avatars');
          const ext = avatarPath.split('.').pop();
          const oldAbs = join(dir, `char_0.${ext}`);
          const newAbs = join(dir, `char_${newId}.${ext}`);
          if (fs.existsSync(oldAbs)) { fs.renameSync(oldAbs, newAbs); }
          const rel = `@userdata:${userDirName(userId)}/avatars/char_${newId}.${ext}`;
          db.prepare('UPDATE characters SET avatar_path = ? WHERE id = ?').run(rel, newId);
          avatarPath = rel;
        } catch (e) { /* 重命名失败不阻塞 */ }
      }

      const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(newId);
      if (character) character.avatar_url = readAvatarDataUrl(userId, character.avatar_path, character.avatar_url);
      return res.json(response(true, character));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 更新角色
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;

      // 检查角色归属
      const existing = db.prepare('SELECT id FROM characters WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) {
        return res.json(response(false, null, '角色不存在或无权限'));
      }

      // 动态构建更新语句（头像 avatar_url 单独处理，下面落盘外置）
      const allowedFields = ['name', 'description', 'avatar_url', 'system_prompt', 'personality', 'preferred_model', 'model_parameters', 'generation_workflow', 'image_settings', 'is_favorite', 'is_archived', 'background_story', 'gender', 'personality_text', 'rule_refs', 'function_config', 'ai_config_override', 'category_id'];
      // 对象类型字段需要 JSON.stringify
      const objectFields = ['personality', 'model_parameters', 'generation_workflow', 'image_settings', 'rule_refs', 'function_config', 'ai_config_override'];
      const sets = [];
      const values = [];

      for (const [key, value] of Object.entries(updates)) {
        if (key === 'avatar_url') continue; // 头像单独处理
        if (allowedFields.includes(key)) {
          if (objectFields.includes(key)) {
            sets.push(`${key} = ?`);
            values.push(typeof value === 'string' ? value : JSON.stringify(value));
          } else {
            sets.push(`${key} = ?`);
            values.push(value);
          }
        }
      }

      // 头像外置：base64 落盘，DB 只存 avatar_path；非 base64（清空/路径）则删磁盘并置空
      if (updates.avatar_url !== undefined) {
        const old = db.prepare('SELECT avatar_path FROM characters WHERE id = ?').get(id);
        if (typeof updates.avatar_url === 'string' && updates.avatar_url.startsWith('data:image/')) {
          const rel = saveAvatarFile(userId, id, updates.avatar_url, 'char');
          if (rel) {
            deleteAvatarFile(old && old.avatar_path);
            sets.push('avatar_path = ?'); values.push(rel);
            sets.push('avatar_url = ?'); values.push('');
          } else {
            sets.push('avatar_url = ?'); values.push(updates.avatar_url);
          }
        } else {
          deleteAvatarFile(old && old.avatar_path);
          sets.push('avatar_path = ?'); values.push('');
          sets.push('avatar_url = ?'); values.push(updates.avatar_url || '');
        }
      }

      if (sets.length > 0) {
        sets.push('updated_at = datetime(\'now\')');
        values.push(id); // WHERE id
        
        db.prepare(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      }

      const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(id);
      if (character) character.avatar_url = readAvatarDataUrl(userId, character.avatar_path, character.avatar_url);
      return res.json(response(true, character));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 删除角色
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;

      const old = db.prepare('SELECT avatar_path FROM characters WHERE id = ? AND user_id = ?').get(id, userId);
      deleteAvatarFile(old && old.avatar_path);

      const result = db.prepare('DELETE FROM characters WHERE id = ? AND user_id = ?').run(id, userId);
      
      if (result.changes === 0) {
        return res.json(response(false, null, '角色不存在或无权限'));
      }

      return res.json(response(true, { deleted: result.changes }));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 批量导入角色
  importBatch: (req, res) => {
    try {
      const userId = req.userId;
      const { characters } = req.body;

      if (!Array.isArray(characters) || characters.length === 0) {
        return res.json(response(false, null, '角色数据为空'));
      }

      const insertStmt = db.prepare(`
        INSERT INTO characters (user_id, name, description, avatar_url, system_prompt, personality)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const importMany = db.transaction((chars) => {
        for (const char of chars) {
          insertStmt.run(
            userId, char.name, char.description || '', 
            char.avatar_url || '', char.system_prompt || '',
            JSON.stringify(char.personality || {})
          );
        }
      });

      importMany(characters);
      return res.json(response(true, { imported: characters.length }));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 导出所有角色
  exportAll: (req, res) => {
    try {
      const userId = req.userId;
      
      const characters = db.prepare('SELECT * FROM characters WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      return res.json(response(true, characters));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 配置管理 API
// ============================================

export const configAPI = {
  // 获取配置
  get: (req, res) => {
    try {
      const userId = req.userId;
      const { type } = req.query;

      let config;
      if (type) {
        const row = db.prepare('SELECT * FROM user_configs WHERE user_id = ? AND config_type = ?').get(userId, type);
        // 返回解析后的 config_data 对象（而非原始行），与无 type 分支保持一致
        if (row && row.config_data) {
          try { config = JSON.parse(row.config_data); } catch { config = {}; }
        } else {
          config = {};
        }
      } else {
        const configs = db.prepare('SELECT * FROM user_configs WHERE user_id = ?').all(userId);
        config = configs.reduce((acc, c) => {
          acc[c.config_type] = JSON.parse(c.config_data);
          return acc;
        }, {});
      }

      return res.json(response(true, config));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 保存/更新配置
  save: (req, res) => {
    try {
      const userId = req.userId;
      const { config_type, config_data } = req.body;

      if (!config_type || !config_data) {
        return res.json(response(false, null, 'config_type 和 config_data 不能为空'));
      }

      const dataStr = typeof config_data === 'string' ? config_data : JSON.stringify(config_data);

      db.prepare(`
        INSERT INTO user_configs (user_id, config_type, config_data, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, config_type) DO UPDATE SET 
          config_data = excluded.config_data,
          updated_at = datetime('now')
      `).run(userId, config_type, dataStr);

      return res.json(response(true, { message: '配置已保存' }));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 对话管理 API
// ============================================

export const conversationAPI = {
  // 获取对话列表
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id } = req.query;

      let sql = `SELECT * FROM conversations WHERE user_id = ?`;
      const params = [userId];
      if (category_id !== undefined && category_id !== 'all') {
        sql += ` AND category_id = ?`;
        params.push(Number(category_id));
      }
      sql += ` ORDER BY updated_at DESC`;

      const conversations = db.prepare(sql).all(...params);

      return res.json(response(true, conversations));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 获取单个对话详情
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;

      const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, userId);
      
      if (!conversation) {
        return res.json(response(false, null, '对话不存在'));
      }

      return res.json(response(true, conversation));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 创建对话
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { character_id, title, messages, category_id } = req.body;

      const result = db.prepare(`
        INSERT INTO conversations (user_id, character_id, title, messages, message_count, category_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        userId, character_id || null, title || '新对话',
        JSON.stringify(messages || []),
        Array.isArray(messages) ? messages.length : 0,
        category_id || 0
      );

      const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, conversation));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 更新对话（添加消息等）
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { messages, title, is_pinned, is_bookmarked, category_id } = req.body;

      const existing = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) {
        return res.json(response(false, null, '对话不存在或无权限'));
      }

      const sets = [];
      const values = [];

      if (messages !== undefined) {
        sets.push('messages = ?, message_count = ?, updated_at = datetime(\'now\')');
        values.push(JSON.stringify(messages), Array.isArray(messages) ? messages.length : 0);
      }
      if (title !== undefined) {
        sets.push('title = ?');
        values.push(title);
      }
      if (is_pinned !== undefined) {
        sets.push('is_pinned = ?');
        values.push(is_pinned ? 1 : 0);
      }
      if (is_bookmarked !== undefined) {
        sets.push('is_bookmarked = ?');
        values.push(is_bookmarked ? 1 : 0);
      }
      if (category_id !== undefined) {
        sets.push('category_id = ?');
        values.push(Number(category_id));
      }

      if (sets.length > 0) {
        values.push(id);
        db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      }

      const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
      return res.json(response(true, conversation));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 删除对话（同时清理硬盘中保存的图片/视频文件）
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;

      // 先查询对话，提取 messages 中保存的文件路径
      const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, userId);
      if (!conv) {
        return res.json(response(false, null, '对话不存在或无权限'));
      }

      // 解析 messages，收集所有 savedFiles 文件路径
      let msgs = conv.messages;
      if (typeof msgs === 'string') {
        try { msgs = JSON.parse(msgs) } catch { msgs = [] }
      }
      if (!Array.isArray(msgs)) msgs = [];

      const filesToDelete = [];
      msgs.forEach(m => {
        if (m && Array.isArray(m.savedFiles)) {
          m.savedFiles.forEach(p => {
            if (typeof p === 'string' && p.trim()) filesToDelete.push(p)
          })
        }
        // 用户上传的图片（base64 形式不删除文件，但若有 path 字段则删除）
        if (m && Array.isArray(m.images)) {
          m.images.forEach(img => {
            if (img && typeof img.path === 'string' && img.path.trim()) filesToDelete.push(img.path)
          })
        }
      })

      // 删除硬盘文件（忽略错误，避免因文件不存在导致删除失败）
      const deletedFiles = []
      const failedFiles = []
      filesToDelete.forEach(filepath => {
        try {
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath)
            deletedFiles.push(filepath)
          }
        } catch (e) {
          failedFiles.push({ filepath, error: e.message })
        }
      })

      const result = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(id, userId);

      return res.json(response(true, { deleted: result.changes, deletedFiles, failedFiles }));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 对话分类 API
// ============================================
export const conversationCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const categories = db.prepare('SELECT * FROM conversation_categories WHERE user_id = ? ORDER BY sort_order, id').all(userId);
      return res.json(response(true, categories));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO conversation_categories (user_id, name) VALUES (?, ?)').run(userId, name);
      const category = db.prepare('SELECT * FROM conversation_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name } = req.body;
      db.prepare('UPDATE conversation_categories SET name = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(name, id, userId);
      const category = db.prepare('SELECT * FROM conversation_categories WHERE id = ?').get(id);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      // 删除分类时，将该分类下的对话移到未分类(0)
      db.prepare('UPDATE conversations SET category_id = 0 WHERE category_id = ? AND user_id = ?').run(id, userId);
      db.prepare('DELETE FROM conversation_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: 1 }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 图片管理 API
// ============================================

export const imageAPI = {
  // 获取图片列表
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { character_id, conversation_id, page = 1, limit = 20 } = req.query;

      let query = 'SELECT * FROM generated_images WHERE user_id = ?';
      const params = [userId];

      if (character_id) {
        query += ' AND character_id = ?';
        params.push(character_id);
      }
      if (conversation_id) {
        query += ' AND conversation_id = ?';
        params.push(conversation_id);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, (page - 1) * limit);

      const images = db.prepare(query).all(...params);
      const total = db.prepare('SELECT COUNT(*) as count FROM generated_images WHERE user_id = ?').get(userId);

      return res.json(response(true, {
        images,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total.count,
          totalPages: Math.ceil(total.count / limit)
        }
      }));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 保存图片记录
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { character_id, conversation_id, image_url, thumbnail_url, prompt, negative_prompt, workflow_used, generation_parameters, model_used, width, height, format } = req.body;

      if (!image_url || !prompt) {
        return res.json(response(false, null, 'image_url 和 prompt 不能为空'));
      }

      const result = db.prepare(`
        INSERT INTO generated_images (user_id, character_id, conversation_id, image_url, thumbnail_url, prompt, negative_prompt, workflow_used, generation_parameters, model_used, width, height, format)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId, character_id || null, conversation_id || null,
        image_url, thumbnail_url || '', prompt, negative_prompt || '',
        workflow_used ? JSON.stringify(workflow_used) : null,
        generation_parameters ? JSON.stringify(generation_parameters) : null,
        model_used || '', width || 512, height || 512, format || 'png'
      );

      const image = db.prepare('SELECT * FROM generated_images WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, image));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },

  // 删除图片
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;

      const result = db.prepare('DELETE FROM generated_images WHERE id = ? AND user_id = ?').run(id, userId);
      
      if (result.changes === 0) {
        return res.json(response(false, null, '图片不存在或无权限'));
      }

      return res.json(response(true, { deleted: result.changes }));

    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// Workflow 分类 API
// ============================================

export const workflowCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const categories = db.prepare('SELECT * FROM workflow_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      return res.json(response(true, categories));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name, icon } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO workflow_categories (user_id, name, icon) VALUES (?, ?, ?)').run(userId, name, icon || '');
      const category = db.prepare('SELECT * FROM workflow_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, icon, sort_order } = req.body;
      const existing = db.prepare('SELECT id FROM workflow_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      const sets = []; const values = [];
      if (name !== undefined) { sets.push('name = ?'); values.push(name); }
      if (icon !== undefined) { sets.push('icon = ?'); values.push(icon); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE workflow_categories SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const category = db.prepare('SELECT * FROM workflow_categories WHERE id = ?').get(id);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      // Set workflows in this category to category_id=0
      db.prepare('UPDATE workflow_apis SET category_id = 0 WHERE category_id = ? AND user_id = ?').run(id, userId);
      const result = db.prepare('DELETE FROM workflow_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// Workflow API 管理
// ============================================

export const workflowAPIAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id } = req.query;
      let query = 'SELECT * FROM workflow_apis WHERE user_id = ?';
      const params = [userId];
      if (category_id) { query += ' AND category_id = ?'; params.push(category_id); }
      query += ' ORDER BY sort_order, created_at DESC';
      const workflows = db.prepare(query).all(...params);
      return res.json(response(true, workflows));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const workflow = db.prepare('SELECT * FROM workflow_apis WHERE id = ? AND user_id = ?').get(id, userId);
      if (!workflow) return res.json(response(false, null, '工作流不存在'));
      return res.json(response(true, workflow));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, name, filename, workflow_data, description } = req.body;
      if (!workflow_data) return res.json(response(false, null, '工作流数据不能为空'));
      const dataStr = typeof workflow_data === 'string' ? workflow_data : JSON.stringify(workflow_data);
      const result = db.prepare('INSERT INTO workflow_apis (user_id, category_id, name, filename, workflow_data, description) VALUES (?, ?, ?, ?, ?, ?)').run(
        userId, category_id || 0, name || '未命名工作流', filename || '', dataStr, description || ''
      );
      const workflow = db.prepare('SELECT * FROM workflow_apis WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, workflow));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT id FROM workflow_apis WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '工作流不存在'));
      const allowedFields = ['category_id', 'name', 'filename', 'workflow_data', 'description', 'sort_order', 'is_active'];
      const sets = []; const values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          if (key === 'workflow_data') {
            sets.push('workflow_data = ?');
            values.push(typeof value === 'string' ? value : JSON.stringify(value));
          } else {
            sets.push(`${key} = ?`);
            values.push(value);
          }
        }
      }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE workflow_apis SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const workflow = db.prepare('SELECT * FROM workflow_apis WHERE id = ?').get(id);
      return res.json(response(true, workflow));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const result = db.prepare('DELETE FROM workflow_apis WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要删除的工作流'));
      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM workflow_apis WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchCategory: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, category_id } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择工作流'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE workflow_apis SET category_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(category_id, ...ids, userId);
      return res.json(response(true, { updated: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 批量生成任务 API
// ============================================

export const batchJobAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const jobs = db.prepare('SELECT * FROM batch_generation_jobs WHERE user_id = ? ORDER BY created_at DESC').all(userId);
      return res.json(response(true, jobs));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const job = db.prepare('SELECT * FROM batch_generation_jobs WHERE id = ? AND user_id = ?').get(id, userId);
      if (!job) return res.json(response(false, null, '任务不存在'));
      return res.json(response(true, job));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { category, name, workflow_api_id, storyboards } = req.body;
      if (!storyboards || !Array.isArray(storyboards) || storyboards.length === 0) return res.json(response(false, null, '分镜数据不能为空'));
      // 会员并发任务配额校验
      const cq = checkQuota(userId, 'concurrent');
      if (!cq.ok) return res.json(response(false, null, `${cq.reason}（${cq.used}/${cq.limit}），请升级会员或等待任务完成`));
      // 会员本月批量任务配额校验
      const gq = checkQuota(userId, 'generation');
      if (!gq.ok) return res.json(response(false, null, `${gq.reason}（${gq.used}/${gq.limit}），请升级会员后再提交`));
      const result = db.prepare('INSERT INTO batch_generation_jobs (user_id, category, name, workflow_api_id, storyboards, total_count) VALUES (?, ?, ?, ?, ?, ?)').run(
        userId, category || 'uncategorized', name || '', workflow_api_id || 0, JSON.stringify(storyboards), storyboards.length
      );
      const job = db.prepare('SELECT * FROM batch_generation_jobs WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, job));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT id FROM batch_generation_jobs WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '任务不存在'));
      const allowedFields = ['status', 'current_index', 'completed_count', 'failed_count', 'results', 'error'];
      const sets = []; const values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          if (key === 'results') {
            sets.push('results = ?');
            values.push(JSON.stringify(value));
          } else {
            sets.push(`${key} = ?`);
            values.push(value);
          }
        }
      }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE batch_generation_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      return res.json(response(true, { updated: true }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const result = db.prepare('DELETE FROM batch_generation_jobs WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 分镜JSON分类 API
// ============================================

export const storyboardCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      let categories = db.prepare('SELECT * FROM storyboard_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      // 确保未分类存在
      if (categories.length === 0) {
        const result = db.prepare('INSERT INTO storyboard_categories (user_id, name, is_system) VALUES (?, ?, ?)').run(userId, '未分类', 1);
        categories = db.prepare('SELECT * FROM storyboard_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      }
      return res.json(response(true, categories));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO storyboard_categories (user_id, name) VALUES (?, ?)').run(userId, name);
      const category = db.prepare('SELECT * FROM storyboard_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, sort_order } = req.body;
      const existing = db.prepare('SELECT * FROM storyboard_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system && name && name !== existing.name) {
        return res.json(response(false, null, '系统分类不能重命名'));
      }
      const sets = []; const values = [];
      if (name !== undefined) { sets.push('name = ?'); values.push(name); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE storyboard_categories SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const category = db.prepare('SELECT * FROM storyboard_categories WHERE id = ?').get(id);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM storyboard_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system) return res.json(response(false, null, '系统分类不能删除'));
      // 将该分类下的JSON转到未分类
      const uncategorized = db.prepare('SELECT id FROM storyboard_categories WHERE user_id = ? AND is_system = 1').get(userId);
      const uncategorizedId = uncategorized ? uncategorized.id : 0;
      db.prepare('UPDATE storyboard_jsons SET category_id = ? WHERE category_id = ? AND user_id = ?').run(uncategorizedId, id, userId);
      const result = db.prepare('DELETE FROM storyboard_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 分镜JSON文件 API
// ============================================

export const storyboardJsonAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id } = req.query;
      let query = 'SELECT id, user_id, category_id, name, filename, prompt_count, is_valid, validation_message, sort_order, created_at, updated_at FROM storyboard_jsons WHERE user_id = ?';
      const params = [userId];
      if (category_id !== undefined && category_id !== 'all') {
        query += ' AND category_id = ?';
        params.push(category_id);
      }
      query += ' ORDER BY sort_order, created_at DESC';
      const jsons = db.prepare(query).all(...params);
      return res.json(response(true, jsons));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const json = db.prepare('SELECT * FROM storyboard_jsons WHERE id = ? AND user_id = ?').get(id, userId);
      if (!json) return res.json(response(false, null, '文件不存在'));
      return res.json(response(true, json));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, name, filename, json_data } = req.body;
      if (json_data === undefined || json_data === null) return res.json(response(false, null, 'JSON数据不能为空'));
      const dataStr = typeof json_data === 'string' ? json_data : JSON.stringify(json_data);
      const validation = validateAndExtractPrompts(dataStr);
      const result = db.prepare('INSERT INTO storyboard_jsons (user_id, category_id, name, filename, json_data, prompt_count, is_valid, validation_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        userId, category_id || 0, name || filename || '未命名', filename || '', dataStr, validation.prompts.length, validation.valid ? 1 : 0, validation.message
      );
      const json = db.prepare('SELECT * FROM storyboard_jsons WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, json));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT * FROM storyboard_jsons WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '文件不存在'));
      const sets = []; const values = [];
      if (updates.category_id !== undefined) { sets.push('category_id = ?'); values.push(updates.category_id); }
      if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
      if (updates.filename !== undefined) { sets.push('filename = ?'); values.push(updates.filename); }
      if (updates.json_data !== undefined) {
        const dataStr = typeof updates.json_data === 'string' ? updates.json_data : JSON.stringify(updates.json_data);
        const validation = validateAndExtractPrompts(dataStr);
        sets.push('json_data = ?', 'prompt_count = ?', 'is_valid = ?', 'validation_message = ?');
        values.push(dataStr, validation.prompts.length, validation.valid ? 1 : 0, validation.message);
      }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE storyboard_jsons SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const json = db.prepare('SELECT * FROM storyboard_jsons WHERE id = ?').get(id);
      return res.json(response(true, json));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const result = db.prepare('DELETE FROM storyboard_jsons WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要删除的文件'));
      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM storyboard_jsons WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchCategory: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, category_id } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择文件'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE storyboard_jsons SET category_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(category_id, ...ids, userId);
      return res.json(response(true, { updated: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchValidate: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择文件'));
      const placeholders = ids.map(() => '?').join(',');
      const jsons = db.prepare(`SELECT id, json_data FROM storyboard_jsons WHERE id IN (${placeholders}) AND user_id = ?`).all(...ids, userId);
      const results = jsons.map(j => {
        const validation = validateAndExtractPrompts(j.json_data);
        db.prepare('UPDATE storyboard_jsons SET prompt_count = ?, is_valid = ?, validation_message = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
          validation.prompts.length, validation.valid ? 1 : 0, validation.message, j.id
        );
        return { id: j.id, valid: validation.valid, prompt_count: validation.prompts.length, message: validation.message };
      });
      return res.json(response(true, results));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 生成任务 API
// ============================================

export const generationTaskAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { status, category_id, reviewed } = req.query;
      let query = 'SELECT * FROM generation_tasks WHERE user_id = ?';
      const params = [userId];
      if (status) { query += ' AND status = ?'; params.push(status); }
      if (reviewed !== undefined) { query += ' AND reviewed = ?'; params.push(reviewed === '1' ? 1 : 0); }
      if (category_id) { query += ' AND category_id = ?'; params.push(category_id); }
      query += ' ORDER BY sort_order, created_at DESC';
      const tasks = db.prepare(query).all(...params);
      return res.json(response(true, tasks));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(id, userId);
      if (!task) return res.json(response(false, null, '任务不存在'));
      return res.json(response(true, task));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name, description, workflow_api_id, storyboard_json_ids, category_id, inserted_prompt_ids, function_configs, comfyui_config_id, target_category_id, target_folder_id } = req.body;
      if (!name) return res.json(response(false, null, '任务名称不能为空'));
      const ids = Array.isArray(storyboard_json_ids) ? storyboard_json_ids : [];
      const funcConfigs = Array.isArray(function_configs) ? function_configs : [];
      if (ids.length === 0 && funcConfigs.length === 0) return res.json(response(false, null, '请选择分镜JSON文件或功能任务单元'));
      const idsStr = JSON.stringify(ids);
      const promptIdsStr = JSON.stringify(Array.isArray(inserted_prompt_ids) ? inserted_prompt_ids : []);
      const funcConfigsStr = JSON.stringify(funcConfigs);
      const totalCount = ids.length + funcConfigs.length;
      const result = db.prepare('INSERT INTO generation_tasks (user_id, category_id, name, description, workflow_api_id, storyboard_json_ids, inserted_prompt_ids, function_configs, total_count, status, reviewed, comfyui_config_id, target_category_id, target_folder_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        userId, category_id || 0, name, description || '', workflow_api_id || 0, idsStr, promptIdsStr, funcConfigsStr, totalCount, 'pending', 0, comfyui_config_id || 0, target_category_id || 0, target_folder_id || null
      );
      const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, task));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '任务不存在'));
      const sets = []; const values = [];
      if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
      if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
      if (updates.workflow_api_id !== undefined) { sets.push('workflow_api_id = ?'); values.push(updates.workflow_api_id); }
      if (updates.comfyui_config_id !== undefined) { sets.push('comfyui_config_id = ?'); values.push(updates.comfyui_config_id || 0); }
      if (updates.category_id !== undefined) { sets.push('category_id = ?'); values.push(updates.category_id); }
      if (updates.sort_order !== undefined) { sets.push('sort_order = ?'); values.push(updates.sort_order); }
      if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
      if (updates.execution_status !== undefined) { sets.push('execution_status = ?'); values.push(updates.execution_status); }
      if (updates.reviewed !== undefined) { sets.push('reviewed = ?'); values.push(updates.reviewed ? 1 : 0); }
      if (updates.progress_index !== undefined) { sets.push('progress_index = ?'); values.push(updates.progress_index); }
      if (updates.total_prompts !== undefined) { sets.push('total_prompts = ?'); values.push(updates.total_prompts); }
      if (updates.completed_at !== undefined) { sets.push('completed_at = ?'); values.push(updates.completed_at); }
      if (updates.error_message !== undefined) { sets.push('error_message = ?'); values.push(updates.error_message); }
      if (updates.storyboard_json_ids !== undefined) {
        const ids = Array.isArray(updates.storyboard_json_ids) ? updates.storyboard_json_ids : JSON.parse(updates.storyboard_json_ids);
        sets.push('storyboard_json_ids = ?');
        values.push(JSON.stringify(ids));
      }
      if (updates.inserted_prompt_ids !== undefined) {
        const pids = Array.isArray(updates.inserted_prompt_ids) ? updates.inserted_prompt_ids : JSON.parse(updates.inserted_prompt_ids);
        sets.push('inserted_prompt_ids = ?');
        values.push(JSON.stringify(pids));
      }
      if (updates.function_configs !== undefined) {
        const fcs = Array.isArray(updates.function_configs) ? updates.function_configs : JSON.parse(updates.function_configs);
        sets.push('function_configs = ?');
        values.push(JSON.stringify(fcs));
      }
      // 重新计算 total_count（基于 storyboard_json_ids + function_configs）
      if (updates.storyboard_json_ids !== undefined || updates.function_configs !== undefined) {
        const idsCount = Array.isArray(updates.storyboard_json_ids) ? updates.storyboard_json_ids.length : (existing.storyboard_json_ids ? JSON.parse(existing.storyboard_json_ids).length : 0);
        const fcsCount = Array.isArray(updates.function_configs) ? updates.function_configs.length : (existing.function_configs ? JSON.parse(existing.function_configs).length : 0);
        sets.push('total_count = ?');
        values.push(idsCount + fcsCount);
      }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE generation_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ?').get(id);
      return res.json(response(true, task));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 审核任务（标记为已审核并设为 approved 状态，使其出现在批量任务中）
  review: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '任务不存在'));
      db.prepare("UPDATE generation_tasks SET reviewed = 1, status = 'approved', updated_at = datetime('now') WHERE id = ?").run(id);
      const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ?').get(id);
      return res.json(response(true, task));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 撤销审核
  unreview: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '任务不存在'));
      db.prepare("UPDATE generation_tasks SET reviewed = 0, status = 'pending', updated_at = datetime('now') WHERE id = ?").run(id);
      const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ?').get(id);
      return res.json(response(true, task));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 标记完成（从批量任务移除，进入"已完成任务"分类）
  complete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '任务不存在'));
      db.prepare("UPDATE generation_tasks SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
      const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ?').get(id);
      return res.json(response(true, task));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 更新进度（用于断点续传）
  updateProgress: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { progress_index, total_prompts } = req.body;
      const existing = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '任务不存在'));
      const sets = ["updated_at = datetime('now')"]; const values = [];
      if (progress_index !== undefined) { sets.push('progress_index = ?'); values.push(progress_index); }
      if (total_prompts !== undefined) { sets.push('total_prompts = ?'); values.push(total_prompts); }
      values.push(id);
      db.prepare(`UPDATE generation_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ?').get(id);
      return res.json(response(true, task));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 批量更新排序
  batchSort: (req, res) => {
    try {
      const userId = req.userId;
      const { items } = req.body; // [{id, sort_order}]
      if (!Array.isArray(items) || items.length === 0) return res.json(response(false, null, '请提供排序数据'));
      const stmt = db.prepare("UPDATE generation_tasks SET sort_order = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?");
      const tx = db.transaction(() => {
        for (const it of items) {
          stmt.run(it.sort_order, it.id, userId);
        }
      });
      tx();
      return res.json(response(true, { updated: items.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要删除的任务'));
      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM generation_tasks WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchCategory: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, category_id } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择任务'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE generation_tasks SET category_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(category_id, ...ids, userId);
      return res.json(response(true, { updated: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchReview: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择任务'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE generation_tasks SET reviewed = 1, status = 'approved', updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { updated: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const result = db.prepare('DELETE FROM generation_tasks WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 任务分类 API
// ============================================

export const taskCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_type } = req.query;
      // 确保两类都有"未分类"系统分类
      const types = category_type ? [category_type] : ['json', 'function'];
      for (const t of types) {
        const hasSys = db.prepare('SELECT id FROM task_categories WHERE user_id = ? AND is_system = 1 AND category_type = ?').get(userId, t);
        if (!hasSys) {
          db.prepare('INSERT INTO task_categories (user_id, name, is_system, category_type) VALUES (?, ?, 1, ?)').run(userId, '未分类', t);
        }
      }
      let cats;
      if (category_type) {
        cats = db.prepare('SELECT * FROM task_categories WHERE user_id = ? AND category_type = ? ORDER BY sort_order, created_at').all(userId, category_type);
      } else {
        cats = db.prepare('SELECT * FROM task_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      }
      return res.json(response(true, cats));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name, category_type } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const catType = (category_type === 'function') ? 'function' : 'json';
      const result = db.prepare('INSERT INTO task_categories (user_id, name, category_type) VALUES (?, ?, ?)').run(userId, name, catType);
      const cat = db.prepare('SELECT * FROM task_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, cat));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name } = req.body;
      const existing = db.prepare('SELECT * FROM task_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system === 1) return res.json(response(false, null, '系统分类不能修改'));
      db.prepare('UPDATE task_categories SET name = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, id);
      const cat = db.prepare('SELECT * FROM task_categories WHERE id = ?').get(id);
      return res.json(response(true, cat));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM task_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system === 1) return res.json(response(false, null, '系统分类不能删除'));
      // 找到同类型的"未分类"分类，将任务转移过去
      let uncategorized = db.prepare('SELECT * FROM task_categories WHERE user_id = ? AND is_system = 1 AND category_type = ?').get(userId, existing.category_type);
      if (!uncategorized) {
        const result = db.prepare('INSERT INTO task_categories (user_id, name, is_system, category_type) VALUES (?, ?, 1, ?)').run(userId, '未分类', existing.category_type);
        uncategorized = db.prepare('SELECT * FROM task_categories WHERE id = ?').get(result.lastInsertRowid);
      }
      db.prepare('UPDATE generation_tasks SET category_id = ? WHERE category_id = ? AND user_id = ?').run(uncategorized.id, id, userId);
      db.prepare('DELETE FROM task_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: true }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 功能库分类 API
// ============================================

export const functionCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      // 不再自动创建系统"未分类"：普通分类"未分类"可正常改名/删除，
      // 未归属分类的功能由 category_id=0（虚拟未分类）承接。
      const cats = db.prepare('SELECT * FROM function_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      return res.json(response(true, cats));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO function_categories (user_id, name) VALUES (?, ?)').run(userId, name);
      const cat = db.prepare('SELECT * FROM function_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, cat));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name } = req.body;
      const existing = db.prepare('SELECT * FROM function_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system === 1) return res.json(response(false, null, '系统分类不能修改'));
      db.prepare('UPDATE function_categories SET name = ?, updated_at = datetime(\'now\') WHERE id = ?').run(name, id);
      const cat = db.prepare('SELECT * FROM function_categories WHERE id = ?').get(id);
      return res.json(response(true, cat));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM function_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system === 1) return res.json(response(false, null, '系统分类不能删除'));
      // 转移目标：普通"未分类"分类优先；没有则用虚拟未分类(category_id=0)
      const normalUncat = db.prepare("SELECT id FROM function_categories WHERE user_id = ? AND (is_system = 0 OR is_system IS NULL) AND name = '未分类' ORDER BY id LIMIT 1").get(userId);
      const targetId = normalUncat ? normalUncat.id : 0;
      db.prepare('UPDATE functions SET category_id = ? WHERE category_id = ? AND user_id = ?').run(targetId, id, userId);
      db.prepare('DELETE FROM function_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: true }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 功能库 API
// ============================================

export const functionAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id } = req.query;
      let query = 'SELECT * FROM functions WHERE user_id = ?';
      const params = [userId];
      if (category_id) { query += ' AND category_id = ?'; params.push(category_id); }
      query += ' ORDER BY sort_order, created_at DESC';
      const funcs = db.prepare(query).all(...params);
      return res.json(response(true, funcs));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const func = db.prepare('SELECT * FROM functions WHERE id = ? AND user_id = ?').get(id, userId);
      if (!func) return res.json(response(false, null, '功能不存在'));
      return res.json(response(true, func));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name, description, tab_id, category_id, config_json } = req.body;
      if (!name) return res.json(response(false, null, '功能名称不能为空'));
      const configStr = typeof config_json === 'string' ? config_json : JSON.stringify(config_json || {});
      const result = db.prepare('INSERT INTO functions (user_id, category_id, name, description, tab_id, config_json) VALUES (?, ?, ?, ?, ?, ?)').run(
        userId, category_id || 0, name, description || '', tab_id || 'text2img', configStr
      );
      const func = db.prepare('SELECT * FROM functions WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, func));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT * FROM functions WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '功能不存在'));
      const sets = []; const values = [];
      if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
      if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
      if (updates.tab_id !== undefined) { sets.push('tab_id = ?'); values.push(updates.tab_id); }
      if (updates.category_id !== undefined) { sets.push('category_id = ?'); values.push(updates.category_id); }
      if (updates.sort_order !== undefined) { sets.push('sort_order = ?'); values.push(updates.sort_order); }
      if (updates.is_active !== undefined) { sets.push('is_active = ?'); values.push(updates.is_active ? 1 : 0); }
      if (updates.config_json !== undefined) {
        const cfg = typeof updates.config_json === 'string' ? updates.config_json : JSON.stringify(updates.config_json);
        sets.push('config_json = ?'); values.push(cfg);
      }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE functions SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const func = db.prepare('SELECT * FROM functions WHERE id = ?').get(id);
      return res.json(response(true, func));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const result = db.prepare('DELETE FROM functions WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要删除的功能'));
      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM functions WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchCategory: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, category_id } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择功能'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE functions SET category_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(category_id, ...ids, userId);
      return res.json(response(true, { updated: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 规则分类 API
// ============================================

export const ruleCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      let categories = db.prepare('SELECT * FROM rule_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      // 确保未分类存在
      if (categories.length === 0) {
        db.prepare('INSERT INTO rule_categories (user_id, name, is_system) VALUES (?, ?, ?)').run(userId, '未分类', 1);
        categories = db.prepare('SELECT * FROM rule_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      } else {
        const hasUncategorized = categories.some(c => c.is_system === 1);
        if (!hasUncategorized) {
          db.prepare('INSERT INTO rule_categories (user_id, name, is_system) VALUES (?, ?, ?)').run(userId, '未分类', 1);
          categories = db.prepare('SELECT * FROM rule_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
        }
      }
      return res.json(response(true, categories));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO rule_categories (user_id, name) VALUES (?, ?)').run(userId, name);
      const category = db.prepare('SELECT * FROM rule_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, sort_order } = req.body;
      const existing = db.prepare('SELECT * FROM rule_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system && name && name !== existing.name) {
        return res.json(response(false, null, '系统分类不能重命名'));
      }
      const sets = []; const values = [];
      if (name !== undefined) { sets.push('name = ?'); values.push(name); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE rule_categories SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const category = db.prepare('SELECT * FROM rule_categories WHERE id = ?').get(id);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM rule_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system) return res.json(response(false, null, '系统分类不能删除'));
      // 将该分类下的规则转到未分类
      const uncategorized = db.prepare('SELECT id FROM rule_categories WHERE user_id = ? AND is_system = 1').get(userId);
      const uncategorizedId = uncategorized ? uncategorized.id : 0;
      db.prepare('UPDATE rules SET category_id = ? WHERE category_id = ? AND user_id = ?').run(uncategorizedId, id, userId);
      const result = db.prepare('DELETE FROM rule_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 规则 API
// ============================================

export const ruleAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, type } = req.query;
      let query = 'SELECT * FROM rules WHERE user_id = ?';
      const params = [userId];
      if (category_id !== undefined && category_id !== 'all') {
        query += ' AND category_id = ?';
        params.push(category_id);
      }
      if (type) {
        query += ' AND type = ?';
        params.push(type);
      }
      query += ' ORDER BY sort_order, created_at DESC';
      const rules = db.prepare(query).all(...params);
      return res.json(response(true, rules));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const rule = db.prepare('SELECT * FROM rules WHERE id = ? AND user_id = ?').get(id, userId);
      if (!rule) return res.json(response(false, null, '规则不存在'));
      return res.json(response(true, rule));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, name, content, type, description } = req.body;
      if (!name) return res.json(response(false, null, '规则名称不能为空'));
      const result = db.prepare('INSERT INTO rules (user_id, category_id, name, content, type, description) VALUES (?, ?, ?, ?, ?, ?)').run(
        userId, category_id || 0, name, content || '', type || 'general', description || ''
      );
      const rule = db.prepare('SELECT * FROM rules WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, rule));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT id FROM rules WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '规则不存在'));
      const allowedFields = ['category_id', 'name', 'content', 'type', 'description', 'sort_order', 'is_active'];
      const sets = []; const values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          sets.push(`${key} = ?`);
          values.push(value);
        }
      }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE rules SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const rule = db.prepare('SELECT * FROM rules WHERE id = ?').get(id);
      return res.json(response(true, rule));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const result = db.prepare('DELETE FROM rules WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要删除的规则'));
      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM rules WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchCategory: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, category_id } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择规则'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE rules SET category_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(category_id, ...ids, userId);
      return res.json(response(true, { updated: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchImport: (req, res) => {
    try {
      const userId = req.userId;
      const { rules } = req.body;
      if (!Array.isArray(rules) || rules.length === 0) return res.json(response(false, null, '导入数据为空'));
      const insertStmt = db.prepare('INSERT INTO rules (user_id, category_id, name, content, type) VALUES (?, ?, ?, ?, ?)');
      const importMany = db.transaction((items) => {
        for (const item of items) {
          insertStmt.run(userId, item.category_id || 0, item.name || '未命名规则', item.content || '', item.type || 'general');
        }
      });
      importMany(rules);
      return res.json(response(true, { imported: rules.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 团队 API
// ============================================

export const teamAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const teams = db.prepare('SELECT * FROM teams WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      return res.json(response(true, teams));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const team = db.prepare('SELECT * FROM teams WHERE id = ? AND user_id = ?').get(id, userId);
      if (!team) return res.json(response(false, null, '团队不存在'));
      return res.json(response(true, team));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name, description, member_config, category_id } = req.body;
      if (!name) return res.json(response(false, null, '团队名称不能为空'));
      const memberStr = Array.isArray(member_config) ? JSON.stringify(member_config) : (member_config || '[]');
      const result = db.prepare('INSERT INTO teams (user_id, name, description, member_config, category_id) VALUES (?, ?, ?, ?, ?)').run(
        userId, name, description || '', memberStr, category_id || 0
      );
      const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, team));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT id FROM teams WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '团队不存在'));
      const allowedFields = ['name', 'description', 'member_config', 'sort_order', 'category_id'];
      const sets = []; const values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          if (key === 'member_config') {
            sets.push('member_config = ?');
            values.push(Array.isArray(value) ? JSON.stringify(value) : (value || '[]'));
          } else {
            sets.push(`${key} = ?`);
            values.push(value);
          }
        }
      }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE teams SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
      return res.json(response(true, team));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const result = db.prepare('DELETE FROM teams WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// 导出数据库实例（用于直接操作）
export default db;

// ============================================
// 艺术图库分类 API
// ============================================

export const galleryCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      let categories = db.prepare('SELECT * FROM gallery_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      // 确保未分类存在
      if (categories.length === 0) {
        db.prepare('INSERT INTO gallery_categories (user_id, name, is_system) VALUES (?, ?, ?)').run(userId, '未分类', 1);
        categories = db.prepare('SELECT * FROM gallery_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      } else {
        const hasUncategorized = categories.some(c => c.is_system === 1);
        if (!hasUncategorized) {
          db.prepare('INSERT INTO gallery_categories (user_id, name, is_system) VALUES (?, ?, ?)').run(userId, '未分类', 1);
          categories = db.prepare('SELECT * FROM gallery_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
        }
      }
      return res.json(response(true, categories));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO gallery_categories (user_id, name) VALUES (?, ?)').run(userId, name);
      const category = db.prepare('SELECT * FROM gallery_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, sort_order } = req.body;
      const existing = db.prepare('SELECT * FROM gallery_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system && name && name !== existing.name) {
        return res.json(response(false, null, '系统分类不能重命名'));
      }
      const sets = []; const values = [];
      if (name !== undefined) { sets.push('name = ?'); values.push(name); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE gallery_categories SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const category = db.prepare('SELECT * FROM gallery_categories WHERE id = ?').get(id);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM gallery_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system) return res.json(response(false, null, '系统分类不能删除'));
      // 将该分类下的图片转到未分类
      const uncategorized = db.prepare('SELECT id FROM gallery_categories WHERE user_id = ? AND is_system = 1').get(userId);
      const uncategorizedId = uncategorized ? uncategorized.id : 0;
      db.prepare('UPDATE gallery_images SET category_id = ? WHERE category_id = ? AND user_id = ?').run(uncategorizedId, id, userId);
      const result = db.prepare('DELETE FROM gallery_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 艺术图库图片 API
// ============================================

export const galleryImageAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id } = req.query;
      let query = 'SELECT * FROM gallery_images WHERE user_id = ?';
      const params = [userId];
      if (category_id !== undefined && category_id !== 'all') {
        query += ' AND category_id = ?';
        params.push(category_id);
      }
      query += ' ORDER BY sort_order, created_at DESC';
      const images = db.prepare(query).all(...params);
      return res.json(response(true, images));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const image = db.prepare('SELECT * FROM gallery_images WHERE id = ? AND user_id = ?').get(id, userId);
      if (!image) return res.json(response(false, null, '图片不存在'));
      return res.json(response(true, image));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getFile: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const image = db.prepare('SELECT * FROM gallery_images WHERE id = ? AND user_id = ?').get(id, userId);
      if (!image) return res.status(404).json({ success: false, error: '图片不存在' });
      const filePath = join(GALLERY_DIR, image.file_path);
      if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: '文件不存在' });
      const buffer = fs.readFileSync(filePath);
      const ext = image.format || 'png';
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
      res.type(mimeMap[ext] || 'image/png').send(buffer);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, name, description, image_base64, thumbnail_base64, width, height, format, file_size } = req.body;
      if (!image_base64) return res.json(response(false, null, '图片数据不能为空'));
      // 解析 base64
      const matches = image_base64.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) return res.json(response(false, null, '图片格式无效'));
      const imgFormat = format || matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      // 用户目录
      const userDir = join(GALLERY_DIR, userId);
      if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
      const fileName = `${uuidv4()}.${imgFormat}`;
      const relPath = `${userId}/${fileName}`;
      const absPath = join(userDir, fileName);
      fs.writeFileSync(absPath, buffer);
      const result = db.prepare(`INSERT INTO gallery_images (user_id, category_id, name, description, file_path, thumbnail_data, file_size, width, height, format)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        userId, category_id || 0, name || '未命名', description || '',
        relPath, thumbnail_base64 || '', file_size || buffer.length,
        width || 0, height || 0, imgFormat
      );
      const image = db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, image));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT id FROM gallery_images WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '图片不存在'));
      const allowedFields = ['category_id', 'name', 'description', 'sort_order', 'is_favorite'];
      const sets = []; const values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          sets.push(`${key} = ?`);
          values.push(value);
        }
      }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE gallery_images SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const image = db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id);
      return res.json(response(true, image));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM gallery_images WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '图片不存在'));
      // 删除磁盘文件
      try {
        const filePath = join(GALLERY_DIR, existing.file_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (e) { console.warn('删除图库文件失败:', e.message); }
      const result = db.prepare('DELETE FROM gallery_images WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要删除的图片'));
      // 删除磁盘文件
      const placeholders = ids.map(() => '?').join(',');
      const images = db.prepare(`SELECT * FROM gallery_images WHERE id IN (${placeholders}) AND user_id = ?`).all(...ids, userId);
      for (const img of images) {
        try {
          const filePath = join(GALLERY_DIR, img.file_path);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) { console.warn('删除图库文件失败:', e.message); }
      }
      const result = db.prepare(`DELETE FROM gallery_images WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchCategory: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, category_id } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择图片'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE gallery_images SET category_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(category_id, ...ids, userId);
      return res.json(response(true, { updated: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 角色分类 API
// ============================================

export const characterCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      let categories = db.prepare('SELECT * FROM character_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      if (categories.length === 0) {
        db.prepare('INSERT INTO character_categories (user_id, name, is_system) VALUES (?, ?, ?)').run(userId, '未分类', 1);
        categories = db.prepare('SELECT * FROM character_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      } else {
        const hasUncategorized = categories.some(c => c.is_system === 1);
        if (!hasUncategorized) {
          db.prepare('INSERT INTO character_categories (user_id, name, is_system) VALUES (?, ?, ?)').run(userId, '未分类', 1);
          categories = db.prepare('SELECT * FROM character_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
        }
      }
      return res.json(response(true, categories));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO character_categories (user_id, name) VALUES (?, ?)').run(userId, name);
      const category = db.prepare('SELECT * FROM character_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, sort_order } = req.body;
      const existing = db.prepare('SELECT * FROM character_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system && name && name !== existing.name) {
        return res.json(response(false, null, '系统分类不能重命名'));
      }
      const sets = []; const values = [];
      if (name !== undefined) { sets.push('name = ?'); values.push(name); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE character_categories SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const category = db.prepare('SELECT * FROM character_categories WHERE id = ?').get(id);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM character_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system) return res.json(response(false, null, '系统分类不能删除'));
      const uncategorized = db.prepare('SELECT id FROM character_categories WHERE user_id = ? AND is_system = 1').get(userId);
      const uncategorizedId = uncategorized ? uncategorized.id : 0;
      db.prepare('UPDATE characters SET category_id = ? WHERE category_id = ? AND user_id = ?').run(uncategorizedId, id, userId);
      const result = db.prepare('DELETE FROM character_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 团队分类 API
// ============================================

export const teamCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      let categories = db.prepare('SELECT * FROM team_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      if (categories.length === 0) {
        db.prepare('INSERT INTO team_categories (user_id, name, is_system) VALUES (?, ?, ?)').run(userId, '未分类', 1);
        categories = db.prepare('SELECT * FROM team_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      } else {
        const hasUncategorized = categories.some(c => c.is_system === 1);
        if (!hasUncategorized) {
          db.prepare('INSERT INTO team_categories (user_id, name, is_system) VALUES (?, ?, ?)').run(userId, '未分类', 1);
          categories = db.prepare('SELECT * FROM team_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
        }
      }
      return res.json(response(true, categories));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO team_categories (user_id, name) VALUES (?, ?)').run(userId, name);
      const category = db.prepare('SELECT * FROM team_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, sort_order } = req.body;
      const existing = db.prepare('SELECT * FROM team_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system && name && name !== existing.name) {
        return res.json(response(false, null, '系统分类不能重命名'));
      }
      const sets = []; const values = [];
      if (name !== undefined) { sets.push('name = ?'); values.push(name); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE team_categories SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const category = db.prepare('SELECT * FROM team_categories WHERE id = ?').get(id);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM team_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system) return res.json(response(false, null, '系统分类不能删除'));
      const uncategorized = db.prepare('SELECT id FROM team_categories WHERE user_id = ? AND is_system = 1').get(userId);
      const uncategorizedId = uncategorized ? uncategorized.id : 0;
      db.prepare('UPDATE teams SET category_id = ? WHERE category_id = ? AND user_id = ?').run(uncategorizedId, id, userId);
      const result = db.prepare('DELETE FROM team_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// AI 配置分类 API
// ============================================

export const aiConfigCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      let categories = db.prepare('SELECT * FROM ai_config_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      if (categories.length === 0) {
        db.prepare('INSERT INTO ai_config_categories (user_id, name, is_system) VALUES (?, ?, 1)').run(userId, '未分类');
        categories = db.prepare('SELECT * FROM ai_config_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      } else {
        const hasUncategorized = categories.some(c => c.is_system === 1);
        if (!hasUncategorized) {
          db.prepare('INSERT INTO ai_config_categories (user_id, name, is_system) VALUES (?, ?, 1)').run(userId, '未分类');
          categories = db.prepare('SELECT * FROM ai_config_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
        }
      }
      return res.json(response(true, categories));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO ai_config_categories (user_id, name) VALUES (?, ?)').run(userId, name);
      const category = db.prepare('SELECT * FROM ai_config_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, sort_order } = req.body;
      const existing = db.prepare('SELECT * FROM ai_config_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system && name && name !== existing.name) {
        return res.json(response(false, null, '系统分类不能重命名'));
      }
      const sets = []; const values = [];
      if (name !== undefined) { sets.push('name = ?'); values.push(name); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE ai_config_categories SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const category = db.prepare('SELECT * FROM ai_config_categories WHERE id = ?').get(id);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM ai_config_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system) return res.json(response(false, null, '系统分类不能删除'));
      const uncategorized = db.prepare('SELECT id FROM ai_config_categories WHERE user_id = ? AND is_system = 1').get(userId);
      const uncategorizedId = uncategorized ? uncategorized.id : 0;
      db.prepare('UPDATE ai_configs SET category_id = ? WHERE category_id = ? AND user_id = ?').run(uncategorizedId, id, userId);
      const result = db.prepare('DELETE FROM ai_config_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// AI 配置 API（多配置列表，一个为激活状态）
// ============================================

export const aiConfigAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id } = req.query;
      let query = 'SELECT * FROM ai_configs WHERE user_id = ?';
      const params = [userId];
      if (category_id) { query += ' AND category_id = ?'; params.push(category_id); }
      query += ' ORDER BY sort_order, created_at DESC';
      const configs = db.prepare(query).all(...params);
      return res.json(response(true, configs));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const config = db.prepare('SELECT * FROM ai_configs WHERE id = ? AND user_id = ?').get(id, userId);
      if (!config) return res.json(response(false, null, '配置不存在'));
      return res.json(response(true, config));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 获取当前激活的配置
  getActive: (req, res) => {
    try {
      const userId = req.userId;
      let config = db.prepare('SELECT * FROM ai_configs WHERE user_id = ? AND is_active = 1').get(userId);
      if (!config) {
        // 若没有激活配置，自动激活第一个
        const first = db.prepare('SELECT * FROM ai_configs WHERE user_id = ? ORDER BY sort_order, created_at DESC LIMIT 1').get(userId);
        if (first) {
          db.prepare('UPDATE ai_configs SET is_active = 1 WHERE id = ?').run(first.id);
          config = first;
        }
      }
      return res.json(response(true, config));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, name, provider, api_key, api_url, model, use_proxy, proxy_port, enable_thinking, temperature, top_p, max_tokens, frequency_penalty, presence_penalty, image_max_tokens } = req.body;
      const result = db.prepare(`INSERT INTO ai_configs (user_id, category_id, name, provider, api_key, api_url, model, use_proxy, proxy_port, enable_thinking, temperature, top_p, max_tokens, frequency_penalty, presence_penalty, image_max_tokens)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        userId, category_id || 0, name || '未命名配置',
        provider || 'siliconflow', api_key || '', api_url || '', model || '',
        use_proxy ? 1 : 0, proxy_port || '7890', enable_thinking ? 1 : 0,
        temperature ?? 0.8, top_p ?? 1.0, max_tokens ?? 4000,
        frequency_penalty ?? 0, presence_penalty ?? 0, image_max_tokens ?? 2000
      );
      const config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, config));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT id FROM ai_configs WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '配置不存在'));
      const allowedFields = ['category_id', 'name', 'provider', 'api_key', 'api_url', 'model', 'use_proxy', 'proxy_port', 'enable_thinking', 'sort_order', 'is_active', 'is_callable', 'temperature', 'top_p', 'max_tokens', 'frequency_penalty', 'presence_penalty', 'image_max_tokens'];
      const sets = []; const values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          if (key === 'use_proxy' || key === 'enable_thinking' || key === 'is_active' || key === 'is_callable') {
            sets.push(`${key} = ?`); values.push(value ? 1 : 0);
          } else {
            sets.push(`${key} = ?`); values.push(value);
          }
        }
      }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE ai_configs SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(id);
      return res.json(response(true, config));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 设置为激活配置（取消其他激活）
  setActive: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT id FROM ai_configs WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '配置不存在'));
      db.prepare('UPDATE ai_configs SET is_active = 0 WHERE user_id = ?').run(userId);
      db.prepare('UPDATE ai_configs SET is_active = 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);
      const config = db.prepare('SELECT * FROM ai_configs WHERE id = ?').get(id);
      return res.json(response(true, config));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const result = db.prepare('DELETE FROM ai_configs WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要删除的配置'));
      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM ai_configs WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchCategory: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, category_id } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择配置'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE ai_configs SET category_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(category_id, ...ids, userId);
      return res.json(response(true, { updated: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 批量设置可调用状态（用于开始对话的模型选择）
  batchSetCallable: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, is_callable } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择配置'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE ai_configs SET is_callable = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(is_callable ? 1 : 0, ...ids, userId);
      return res.json(response(true, { updated: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// ComfyUI 配置分类 API
// ============================================

export const comfyuiConfigCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      let categories = db.prepare('SELECT * FROM comfyui_config_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      if (categories.length === 0) {
        db.prepare('INSERT INTO comfyui_config_categories (user_id, name, is_system) VALUES (?, ?, 1)').run(userId, '未分类');
        categories = db.prepare('SELECT * FROM comfyui_config_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      } else {
        const hasUncategorized = categories.some(c => c.is_system === 1);
        if (!hasUncategorized) {
          db.prepare('INSERT INTO comfyui_config_categories (user_id, name, is_system) VALUES (?, ?, 1)').run(userId, '未分类');
          categories = db.prepare('SELECT * FROM comfyui_config_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
        }
      }
      return res.json(response(true, categories));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO comfyui_config_categories (user_id, name) VALUES (?, ?)').run(userId, name);
      const category = db.prepare('SELECT * FROM comfyui_config_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, sort_order } = req.body;
      const existing = db.prepare('SELECT * FROM comfyui_config_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system && name && name !== existing.name) {
        return res.json(response(false, null, '系统分类不能重命名'));
      }
      const sets = []; const values = [];
      if (name !== undefined) { sets.push('name = ?'); values.push(name); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE comfyui_config_categories SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const category = db.prepare('SELECT * FROM comfyui_config_categories WHERE id = ?').get(id);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM comfyui_config_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system) return res.json(response(false, null, '系统分类不能删除'));
      const uncategorized = db.prepare('SELECT id FROM comfyui_config_categories WHERE user_id = ? AND is_system = 1').get(userId);
      const uncategorizedId = uncategorized ? uncategorized.id : 0;
      db.prepare('UPDATE comfyui_configs SET category_id = ? WHERE category_id = ? AND user_id = ?').run(uncategorizedId, id, userId);
      const result = db.prepare('DELETE FROM comfyui_config_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// ComfyUI 配置 API（多配置列表，一个为激活状态）
// ============================================

export const comfyuiConfigAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id } = req.query;
      let query = 'SELECT * FROM comfyui_configs WHERE user_id = ?';
      const params = [userId];
      if (category_id) { query += ' AND category_id = ?'; params.push(category_id); }
      query += ' ORDER BY sort_order, created_at DESC';
      const configs = db.prepare(query).all(...params);
      return res.json(response(true, configs));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const config = db.prepare('SELECT * FROM comfyui_configs WHERE id = ? AND user_id = ?').get(id, userId);
      if (!config) return res.json(response(false, null, '配置不存在'));
      return res.json(response(true, config));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getActive: (req, res) => {
    try {
      const userId = req.userId;
      let config = db.prepare('SELECT * FROM comfyui_configs WHERE user_id = ? AND is_active = 1').get(userId);
      if (!config) {
        const first = db.prepare('SELECT * FROM comfyui_configs WHERE user_id = ? ORDER BY sort_order, created_at DESC LIMIT 1').get(userId);
        if (first) {
          db.prepare('UPDATE comfyui_configs SET is_active = 1 WHERE id = ?').run(first.id);
          config = first;
        }
      }
      return res.json(response(true, config));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, name, comfyui_url, download_dir, auto_download, filename_prefix } = req.body;
      const result = db.prepare(`INSERT INTO comfyui_configs (user_id, category_id, name, comfyui_url, download_dir, auto_download, filename_prefix)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        userId, category_id || 0, name || '未命名配置',
        comfyui_url || 'http://127.0.0.1:8188', download_dir || '',
        auto_download ? 1 : 0, filename_prefix || 'ComfyUI'
      );
      const config = db.prepare('SELECT * FROM comfyui_configs WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, config));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT id FROM comfyui_configs WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '配置不存在'));
      const allowedFields = ['category_id', 'name', 'comfyui_url', 'download_dir', 'auto_download', 'filename_prefix', 'sort_order', 'is_active'];
      const sets = []; const values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          if (key === 'auto_download' || key === 'is_active') {
            sets.push(`${key} = ?`); values.push(value ? 1 : 0);
          } else {
            sets.push(`${key} = ?`); values.push(value);
          }
        }
      }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE comfyui_configs SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const config = db.prepare('SELECT * FROM comfyui_configs WHERE id = ?').get(id);
      return res.json(response(true, config));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  setActive: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT id FROM comfyui_configs WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '配置不存在'));
      db.prepare('UPDATE comfyui_configs SET is_active = 0 WHERE user_id = ?').run(userId);
      db.prepare('UPDATE comfyui_configs SET is_active = 1, updated_at = datetime(\'now\') WHERE id = ?').run(id);
      const config = db.prepare('SELECT * FROM comfyui_configs WHERE id = ?').get(id);
      return res.json(response(true, config));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 切换激活状态（支持多个同时激活，不重置其他配置）
  toggleActive: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM comfyui_configs WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '配置不存在'));
      const newActive = existing.is_active ? 0 : 1;
      db.prepare('UPDATE comfyui_configs SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newActive, id);
      const config = db.prepare('SELECT * FROM comfyui_configs WHERE id = ?').get(id);
      return res.json(response(true, config));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 获取所有激活的 ComfyUI 配置（多个）
  getActiveList: (req, res) => {
    try {
      const userId = req.userId;
      let configs = db.prepare('SELECT * FROM comfyui_configs WHERE user_id = ? AND is_active = 1 ORDER BY sort_order, created_at DESC').all(userId);
      // 若没有激活的，自动激活第一个（保证全局默认可用）
      if (!configs || configs.length === 0) {
        const first = db.prepare('SELECT * FROM comfyui_configs WHERE user_id = ? ORDER BY sort_order, created_at DESC LIMIT 1').get(userId);
        if (first) {
          db.prepare('UPDATE comfyui_configs SET is_active = 1 WHERE id = ?').run(first.id);
          configs = [first];
        }
      }
      return res.json(response(true, configs || []));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const result = db.prepare('DELETE FROM comfyui_configs WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要删除的配置'));
      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM comfyui_configs WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchCategory: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, category_id } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择配置'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE comfyui_configs SET category_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(category_id, ...ids, userId);
      return res.json(response(true, { updated: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 提示词分类 API
// ============================================

export const promptCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      // 不再自动创建系统"未分类"分类，前端使用 id=0 作为虚拟"未分类"
      // 仅返回用户自定义分类（过滤掉可能存在的旧系统分类）
      const categories = db.prepare('SELECT * FROM prompt_categories WHERE user_id = ? AND (is_system = 0 OR is_system IS NULL) ORDER BY sort_order, created_at').all(userId);
      return res.json(response(true, categories));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO prompt_categories (user_id, name) VALUES (?, ?)').run(userId, name);
      const category = db.prepare('SELECT * FROM prompt_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, sort_order } = req.body;
      const existing = db.prepare('SELECT * FROM prompt_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system && name && name !== existing.name) {
        return res.json(response(false, null, '系统分类不能重命名'));
      }
      const sets = []; const values = [];
      if (name !== undefined) { sets.push('name = ?'); values.push(name); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE prompt_categories SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const category = db.prepare('SELECT * FROM prompt_categories WHERE id = ?').get(id);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM prompt_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      if (existing.is_system) return res.json(response(false, null, '系统分类不能删除'));
      // 删除分类时，将其下提示词移动到虚拟"未分类"(category_id=0)
      db.prepare('UPDATE prompts SET category_id = 0 WHERE category_id = ? AND user_id = ?').run(id, userId);
      const result = db.prepare('DELETE FROM prompt_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 提示词 API
// ============================================

export const promptAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id } = req.query;
      let query = 'SELECT * FROM prompts WHERE user_id = ?';
      const params = [userId];
      if (category_id) { query += ' AND category_id = ?'; params.push(category_id); }
      query += ' ORDER BY sort_order, created_at DESC';
      const prompts = db.prepare(query).all(...params);
      return res.json(response(true, prompts));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const prompt = db.prepare('SELECT * FROM prompts WHERE id = ? AND user_id = ?').get(id, userId);
      if (!prompt) return res.json(response(false, null, '提示词不存在'));
      return res.json(response(true, prompt));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, name, content, gallery_image_id } = req.body;
      if (!name) return res.json(response(false, null, '名称不能为空'));
      const result = db.prepare('INSERT INTO prompts (user_id, category_id, name, content, gallery_image_id) VALUES (?, ?, ?, ?, ?)').run(
        userId, category_id || 0, name, content || '', gallery_image_id || 0
      );
      const prompt = db.prepare('SELECT * FROM prompts WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, prompt));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT id FROM prompts WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '提示词不存在'));
      const allowedFields = ['category_id', 'name', 'content', 'gallery_image_id', 'sort_order'];
      const sets = []; const values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          sets.push(`${key} = ?`); values.push(value);
        }
      }
      if (sets.length > 0) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE prompts SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const prompt = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
      return res.json(response(true, prompt));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const result = db.prepare('DELETE FROM prompts WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要删除的提示词'));
      const placeholders = ids.map(() => '?').join(',');
      const result = db.prepare(`DELETE FROM prompts WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchCategory: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, category_id } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择提示词'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE prompts SET category_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(category_id, ...ids, userId);
      return res.json(response(true, { updated: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 批量导入：items = [{ name, content }]
  batchImport: (req, res) => {
    try {
      const userId = req.userId;
      const { items, category_id } = req.body;
      if (!Array.isArray(items) || items.length === 0) return res.json(response(false, null, '请提供导入数据'));
      const stmt = db.prepare('INSERT INTO prompts (user_id, category_id, name, content) VALUES (?, ?, ?, ?)');
      const tx = db.transaction(() => {
        for (const it of items) {
          stmt.run(userId, category_id || 0, it.name || '未命名', it.content || '');
        }
      });
      tx();
      return res.json(response(true, { imported: items.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 文件库分类 API（硬盘分区）
// ============================================

// 分类改名时：把硬盘上的「盘符目录」（字母-名称）一并改名，并同步更新库内所有
// file_path / thumbnail_path / content_path 的前缀。
// 关键：必须在磁盘改名前挂起反向磁盘监听（pauseDiskWatch），否则监听会把这次内部移动
// 误判成「外部删除」把文件软删进回收站。顺序：挂起监听 → 改名磁盘目录（带重试 + 失败回滚）
// → 同批改库内 name 与路径前缀 → 恢复监听。磁盘改名若失败则整体不落库，保证数据一致。
function renameDriveDir(userId, existing, newName) {
  const oldDir = driveDirOfRow(existing);
  const newDir = driveDirOfRow({ drive_letter: existing.drive_letter, name: newName });
  const ud = userDirName(userId);
  const sleep = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };
  const tryRename = (src, dst) => {
    if (!fs.existsSync(src)) return false;
    if (fs.existsSync(dst)) return false; // 目标已存在（字母唯一，理论上不会发生）：放弃，避免覆盖
    for (let i = 1; i <= 8; i++) {
      try { fs.renameSync(src, dst); return true; } catch (e) { if (i === 8) throw e; sleep(250 * i); }
    }
    return false;
  };
  // 名称虽变但 sanitize 后盘符目录名不变（如只改了非法字符）→ 只更新库内 name，无需动硬盘
  if (oldDir === newDir) {
    db.prepare("UPDATE file_library_categories SET name = ?, updated_at = datetime('now') WHERE id = ?").run(newName, existing.id);
    return { renamed: false };
  }
  pauseDiskWatch();
  try {
    const mainSrc = join(USER_DATA_DIR, ud, oldDir), mainDst = join(USER_DATA_DIR, ud, newDir);
    const thumbSrc = join(USER_DATA_DIR, ud, THUMB_ROOT, oldDir), thumbDst = join(USER_DATA_DIR, ud, THUMB_ROOT, newDir);
    const didMain = tryRename(mainSrc, mainDst);
    if (didMain) {
      try {
        tryRename(thumbSrc, thumbDst); // 缩略图目录可能不存在（该分类没存过图），属正常
      } catch (e) {
        try { fs.renameSync(mainDst, mainSrc); } catch {} // 缩略图改名失败 → 回滚主目录，整体不落库
        throw e;
      }
    }
    // 库内：分类名 + 该用户下所有文件 / 缩略图 / 正文路径前缀，一次性同批更新
    const up = db.prepare(`UPDATE file_library_files SET
      file_path = REPLACE(file_path, ?, ?),
      thumbnail_path = REPLACE(thumbnail_path, ?, ?),
      content_path = REPLACE(content_path, ?, ?)
      WHERE user_id = ? AND (file_path LIKE ? OR thumbnail_path LIKE ? OR content_path LIKE ?)`);
    up.run(
      `@userdata:${ud}/${oldDir}/`, `@userdata:${ud}/${newDir}/`,
      `@userdata:${ud}/${THUMB_ROOT}/${oldDir}/`, `@userdata:${ud}/${THUMB_ROOT}/${newDir}/`,
      `@userdata:${ud}/${oldDir}/`, `@userdata:${ud}/${newDir}/`,
      userId,
      `@userdata:${ud}/${oldDir}/%`, `@userdata:${ud}/${THUMB_ROOT}/${oldDir}/%`, `@userdata:${ud}/${oldDir}/%`
    );
    db.prepare("UPDATE file_library_categories SET name = ?, updated_at = datetime('now') WHERE id = ?").run(newName, existing.id);
    return { renamed: true };
  } finally {
    resumeDiskWatch();
  }
}

export const fileLibraryCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      let categories = db.prepare('SELECT * FROM file_library_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      if (categories.length === 0) {
        const r = db.prepare("INSERT INTO file_library_categories (user_id, name, is_system, sort_order) VALUES (?, ?, 1, 0)").run(userId, '总库');
        categories = db.prepare('SELECT * FROM file_library_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      }
      // 确保固定系统分类"UI库"存在（UI管理上传的图片统一存于此分类根目录）
      if (!categories.some(c => c.name === 'UI库' && c.is_system === 1)) {
        db.prepare("INSERT INTO file_library_categories (user_id, name, is_system, sort_order) VALUES (?, 'UI库', 1, 1)").run(userId);
        categories = db.prepare('SELECT * FROM file_library_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      }
      // 为每个分类附加文件数和文件夹数
      for (const cat of categories) {
        cat.file_count = db.prepare('SELECT COUNT(*) as c FROM file_library_files WHERE category_id = ? AND user_id = ?').get(cat.id, userId).c;
        cat.folder_count = db.prepare('SELECT COUNT(*) as c FROM file_library_folders WHERE category_id = ? AND user_id = ?').get(cat.id, userId).c;
        // 阶段5：确保每个盘符在硬盘上都有真实目录（用户在资源管理器里误删也会自动补齐）
        try {
          const d = join(USER_DATA_DIR, userDirName(userId), driveDirOfRow(cat));
          if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
        } catch {}
      }
      return res.json(response(true, categories));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const rawName = (req.body && req.body.name) || '';
      const name = sanitizeFolderName(rawName);
      if (!name) return res.json(response(false, null, '分类名称不能为空或含非法字符'));
      // 分配下一个稳定盘符字母（D..Z，跳过已占用；删除分类后该字母不复用）
      const rows = db.prepare("SELECT drive_letter FROM file_library_categories WHERE user_id = ? AND drive_letter <> ''").all(userId);
      let nextCode = 68; // D
      if (rows.length) {
        const maxCode = Math.max(...rows.map(r => (r.drive_letter || 'C').charCodeAt(0)));
        nextCode = Math.min(maxCode + 1, 90);
      }
      const result = db.prepare('INSERT INTO file_library_categories (user_id, name, drive_letter) VALUES (?, ?, ?)').run(userId, name, String.fromCharCode(nextCode));
      const category = db.prepare('SELECT * FROM file_library_categories WHERE id = ?').get(result.lastInsertRowid);
      // 阶段5：新分类立刻在硬盘上出现对应的盘符目录（文件夹名 = 盘符字母 + 名称，如 D-图片库）
      try {
        const d = join(USER_DATA_DIR, userDirName(userId), driveDirOfRow(category));
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      } catch {}
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, sort_order } = req.body;
      const existing = db.prepare('SELECT * FROM file_library_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      const nameChanged = name !== undefined && name !== existing.name;
      if (nameChanged) {
        // 改名要同步硬盘盘符目录 + 库内路径前缀（renameDriveDir 内部挂起监听并原子处理，含 name 落库）
        renameDriveDir(userId, existing, name);
        if (sort_order !== undefined) {
          db.prepare("UPDATE file_library_categories SET sort_order = ?, updated_at = datetime('now') WHERE id = ?").run(sort_order, id);
        }
      } else {
        const sets = []; const values = [];
        if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
        if (sets.length) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE file_library_categories SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      }
      const category = db.prepare('SELECT * FROM file_library_categories WHERE id = ?').get(id);
      return res.json(response(true, category));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM file_library_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      // 系统分类（总库/UI库）不可删除
      if (existing.is_system === 1) {
        return res.json(response(false, null, '系统分类不能删除'));
      }
      // 检查是否有文件或文件夹
      const fileCount = db.prepare('SELECT COUNT(*) as c FROM file_library_files WHERE category_id = ? AND user_id = ?').get(id, userId).c;
      const folderCount = db.prepare('SELECT COUNT(*) as c FROM file_library_folders WHERE category_id = ? AND user_id = ?').get(id, userId).c;
      if (fileCount > 0 || folderCount > 0) {
        return res.json(response(false, null, '该分类下有文件或文件夹，不能删除'));
      }
      db.prepare('DELETE FROM file_library_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: 1 }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 文件库文件夹 API（嵌套文件夹）
// ============================================

export const fileLibraryFolderAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, parent_id } = req.query;
      let query = 'SELECT * FROM file_library_folders WHERE user_id = ? AND is_deleted = 0';
      const params = [userId];
      if (category_id !== undefined && category_id !== 'all') { query += ' AND category_id = ?'; params.push(category_id); }
      if (parent_id === 'null' || parent_id === undefined) { query += ' AND parent_id IS NULL'; }
      else if (parent_id !== 'all') { query += ' AND parent_id = ?'; params.push(parent_id); }
      query += ' ORDER BY sort_order, created_at';
      const folders = db.prepare(query).all(...params);
      // 附加子项数量
      for (const f of folders) {
        f.subfolder_count = db.prepare('SELECT COUNT(*) as c FROM file_library_folders WHERE parent_id = ? AND user_id = ? AND is_deleted = 0').get(f.id, userId).c;
        f.file_count = db.prepare('SELECT COUNT(*) as c FROM file_library_files WHERE folder_id = ? AND user_id = ? AND is_deleted = 0').get(f.id, userId).c;
      }
      return res.json(response(true, folders));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const folder = db.prepare('SELECT * FROM file_library_folders WHERE id = ? AND user_id = ?').get(id, userId);
      if (!folder) return res.json(response(false, null, '文件夹不存在'));
      return res.json(response(true, folder));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, parent_id, name, is_callable } = req.body;
      const folderName = sanitizeFolderName(name);
      if (!folderName) return res.json(response(false, null, '文件夹名称不能为空或含非法字符'));
      // category_id 缺省时：优先继承父文件夹的盘符，避免子文件夹跑到别的盘符去
      let catId = Number(category_id) || 0;
      if (!catId && parent_id) {
        const pf = db.prepare('SELECT category_id FROM file_library_folders WHERE id = ? AND user_id = ?').get(parent_id, userId);
        if (pf && pf.category_id) catId = pf.category_id;
      }
      if (!catId) catId = (db.prepare('SELECT id FROM file_library_categories WHERE user_id = ? AND is_system = 1 ORDER BY id LIMIT 1').get(userId) || {}).id || 0;
      // 同目录同名自动顺延（Windows 规则）
      const finalName = uniqueFolderNameInCategory(userId, catId, parent_id || null, folderName, null);
      const result = db.prepare('INSERT INTO file_library_folders (user_id, category_id, parent_id, name, is_callable) VALUES (?, ?, ?, ?, ?)').run(
        userId, catId, parent_id || null, finalName, is_callable ? 1 : 0
      );
      const folder = db.prepare('SELECT * FROM file_library_folders WHERE id = ?').get(result.lastInsertRowid);
      // 阶段5：同步在硬盘盘符目录下建出真实文件夹
      ensureFolderDir(userId, folder);
      return res.json(response(true, folder));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      const existing = db.prepare('SELECT * FROM file_library_folders WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '文件夹不存在'));
      // 阶段5：文件夹名最终会成为真实目录名，非法字符必须先清洗
      const safeUpdates = { ...updates };
      if (safeUpdates.name !== undefined) {
        const clean = sanitizeFolderName(safeUpdates.name);
        if (!clean) return res.json(response(false, null, '文件夹名称不能为空或含非法字符'));
        safeUpdates.name = clean;
      }
      const allowedFields = ['name', 'is_callable', 'display_file_id', 'sort_order', 'parent_id', 'category_id'];
      // 改名 / 搬家后落到哪个目录，决定同目录重名判定的范围
      const finalCat = safeUpdates.category_id !== undefined ? safeUpdates.category_id : existing.category_id;
      const finalParent = safeUpdates.parent_id !== undefined ? safeUpdates.parent_id : existing.parent_id;
      if (safeUpdates.name !== undefined) {
        safeUpdates.name = uniqueFolderNameInCategory(userId, finalCat, finalParent, safeUpdates.name, parseInt(id));
      }
      const sets = []; const values = [];
      for (const [key, value] of Object.entries(safeUpdates)) {
        if (allowedFields.includes(key)) { sets.push(`${key} = ?`); values.push(value); }
      }
      if (sets.length) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE file_library_folders SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const folder = db.prepare('SELECT * FROM file_library_folders WHERE id = ?').get(id);
      // 阶段5：改名 / 换父级 / 换盘符 → 硬盘上的目录同步搬家，并修正其下文件的镜像路径
      if (folder && (folder.name !== existing.name || folder.parent_id !== existing.parent_id || folder.category_id !== existing.category_id)) {
        moveFolderDir(userId, existing, folder);
        const fids = fileIdsInFolders(userId, collectFolderIds(parseInt(id)));
        rebaseFileMirrorPaths(userId, fids);
        // 文件夹搬家/改名后，其下所有文件的小图要重算位置
        relocateThumbMirrors(userId, fids);
      }
      return res.json(response(true, folder));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM file_library_folders WHERE id = ? AND user_id = ? AND is_deleted = 0').get(id, userId);
      if (!existing) return res.json(response(false, null, '文件夹不存在'));
      const now = new Date().toISOString();
      // 递归收集所有子文件夹 ID
      const collectDescendants = (parentId) => {
        const ids = [parentId];
        const stack = [parentId];
        while (stack.length) {
          const cur = stack.pop();
          const children = db.prepare('SELECT id FROM file_library_folders WHERE parent_id = ? AND is_deleted = 0').all(cur);
          for (const c of children) { ids.push(c.id); stack.push(c.id); }
        }
        return ids;
      };
      const allFolderIds = collectDescendants(parseInt(id));
      const placeholders = allFolderIds.map(() => '?').join(',');
      // 软删除文件夹
      db.prepare(`UPDATE file_library_folders SET is_deleted = 1, deleted_at = ? WHERE id IN (${placeholders}) AND user_id = ?`).run(now, ...allFolderIds, userId);
      // 软删除文件夹内的文件
      db.prepare(`UPDATE file_library_files SET is_deleted = 1, deleted_at = ? WHERE folder_id IN (${placeholders}) AND user_id = ?`).run(now, ...allFolderIds, userId);
      return res.json(response(true, { deleted: allFolderIds.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 批量删除文件夹（软删除）
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要删除的文件夹'));
      const now = new Date().toISOString();
      // 递归收集所有子文件夹 ID
      const collectDescendants = (parentId) => {
        const ids = [parentId];
        const stack = [parentId];
        while (stack.length) {
          const cur = stack.pop();
          const children = db.prepare('SELECT id FROM file_library_folders WHERE parent_id = ? AND is_deleted = 0').all(cur);
          for (const c of children) { ids.push(c.id); stack.push(c.id); }
        }
        return ids;
      };
      const allFolderIds = new Set();
      for (const id of ids) { for (const fid of collectDescendants(parseInt(id))) { allFolderIds.add(fid); } }
      const folderIdArr = [...allFolderIds];
      const placeholders = folderIdArr.map(() => '?').join(',');
      db.prepare(`UPDATE file_library_folders SET is_deleted = 1, deleted_at = ? WHERE id IN (${placeholders}) AND user_id = ?`).run(now, ...folderIdArr, userId);
      db.prepare(`UPDATE file_library_files SET is_deleted = 1, deleted_at = ? WHERE folder_id IN (${placeholders}) AND user_id = ?`).run(now, ...folderIdArr, userId);
      return res.json(response(true, { deleted: folderIdArr.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 批量移动文件夹
  batchMove: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, category_id, parent_id, conflict, decisions } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要移动的文件夹'));
      // 防止将文件夹移动到自己的子文件夹中（会形成环）
      const targetParentId = parent_id === 'null' || parent_id === 0 ? null : parseInt(parent_id);
      if (targetParentId !== null) {
        for (const id of ids) {
          const numId = parseInt(id);
          let cur = targetParentId;
          while (cur) {
            if (cur === numId) return res.json(response(false, null, '不能将文件夹移动到其子文件夹中'));
            const folder = db.prepare('SELECT parent_id FROM file_library_folders WHERE id = ?').get(cur);
            if (!folder) break;
            cur = folder.parent_id;
          }
        }
      }
      // 未显式指定盘符时，从目标父文件夹继承，避免搬完落到 C 盘去
      let catId = Number(category_id) || 0;
      if (!catId && targetParentId) {
        const pf = db.prepare('SELECT category_id FROM file_library_folders WHERE id = ?').get(targetParentId);
        if (pf && pf.category_id) catId = pf.category_id;
      }
      // 剪切粘贴：目标目录已有同名项时的决策 —— overwrite = 替换 / 合并，rename = 自动编号，skip = 跳过
      const moveIds = [];
      const mergedInto = [];
      for (const id of ids) {
        const fr = db.prepare('SELECT * FROM file_library_folders WHERE id = ? AND user_id = ? AND is_deleted = 0').get(parseInt(id), userId);
        if (!fr) continue;
        const clash = findNameConflict(userId, catId, targetParentId, fr.name, null);
        // 原地粘贴（源本来就在目标目录里）：命中的同名项是自己，不算冲突
        if (clash && clash.kind === 'folder' && Number(clash.id) === Number(fr.id)) { moveIds.push(parseInt(id)); continue; }
        const dec = pasteDecision(decisions, fr.id, conflict);
        if (clash && dec === 'skip') continue;
        if (clash && dec === 'overwrite' && clash.kind === 'folder') {
          // 覆盖同名文件夹 = Windows 的「合并」：源内容并入目标，源壳随之删除
          mergeFolderInto(userId, fr.id, clash.id, catId);
          trashConflictTarget(userId, 'folder', fr.id);
          mergedInto.push(clash.id);
          continue;
        }
        if (clash && dec === 'overwrite') {
          trashConflictTarget(userId, clash.kind, clash.id);
        } else if (clash) {
          db.prepare('UPDATE file_library_folders SET name = ? WHERE id = ?')
            .run(uniqueFolderNameInCategory(userId, catId, targetParentId, fr.name, parseInt(id)), parseInt(id));
        }
        moveIds.push(parseInt(id));
      }
      if (!moveIds.length) {
        const touched0 = new Set();
        for (const dstId of mergedInto) for (const fid of collectFolderIds(dstId)) touched0.add(fid);
        const fids0 = fileIdsInFolders(userId, [...touched0]);
        rebaseFileMirrorPaths(userId, fids0);
        relocateThumbMirrors(userId, fids0);
        return res.json(response(true, { updated: 0, merged: mergedInto.length, skipped: ids.length - mergedInto.length }));
      }
      // 阶段5：先记下搬家前的盘符 / 父级，稍后据此把硬盘目录搬到新位置
      const oldFolderRows = moveIds.map((i) => db.prepare('SELECT * FROM file_library_folders WHERE id = ?').get(parseInt(i))).filter(Boolean);
      const topPlaceholders = moveIds.map(() => '?').join(',');
      // 1. 更新顶层文件夹的 category_id 和 parent_id
      db.prepare(`UPDATE file_library_folders SET category_id = ?, parent_id = ?, updated_at = datetime('now') WHERE id IN (${topPlaceholders}) AND user_id = ?`).run(
        catId, targetParentId, ...moveIds, userId
      );
      // 2. 递归收集所有子文件夹，同步更新 category_id（parent_id 保持不变，层级关系不变）
      const collectDescendants = (parentId) => {
        const collected = [];
        const stack = [parentId];
        while (stack.length) {
          const cur = stack.pop();
          const children = db.prepare('SELECT id FROM file_library_folders WHERE parent_id = ? AND is_deleted = 0').all(cur);
          for (const c of children) { collected.push(c.id); stack.push(c.id); }
        }
        return collected;
      };
      const allSubFolderIds = [];
      for (const id of moveIds) {
        for (const subId of collectDescendants(parseInt(id))) {
          allSubFolderIds.push(subId);
        }
      }
      if (allSubFolderIds.length > 0) {
        const subPlaceholders = allSubFolderIds.map(() => '?').join(',');
        db.prepare(`UPDATE file_library_folders SET category_id = ?, updated_at = datetime('now') WHERE id IN (${subPlaceholders}) AND user_id = ?`).run(
          catId, ...allSubFolderIds, userId
        );
      }
      // 3. 收集所有相关文件夹（顶层 + 子文件夹）内的文件，更新 category_id
      const allFolderIds = [...moveIds.map(i => parseInt(i)), ...allSubFolderIds];
      const allFolderPlaceholders = allFolderIds.map(() => '?').join(',');
      db.prepare(`UPDATE file_library_files SET category_id = ?, updated_at = datetime('now') WHERE folder_id IN (${allFolderPlaceholders}) AND user_id = ?`).run(
        catId, ...allFolderIds, userId
      );
      // 阶段5：硬盘目录同步搬家 + 修正其下文件的镜像路径
      const touched = new Set();
      for (const oldRow of oldFolderRows) {
        const newRow = db.prepare('SELECT * FROM file_library_folders WHERE id = ?').get(oldRow.id);
        if (newRow) moveFolderDir(userId, oldRow, newRow);
        for (const fid of collectFolderIds(oldRow.id)) touched.add(fid);
      }
      for (const dstId of mergedInto) for (const fid of collectFolderIds(dstId)) touched.add(fid);
      const touchedFileIds = fileIdsInFolders(userId, [...touched]);
      rebaseFileMirrorPaths(userId, touchedFileIds);
      relocateThumbMirrors(userId, touchedFileIds);
      return res.json(response(true, { updated: moveIds.length, merged: mergedInto.length, skipped: ids.length - moveIds.length - mergedInto.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 复制文件夹（递归复制自身、子文件夹与文件；防止复制到自身或子孙内）
  copy: (req, res) => {
    try {
      const userId = req.userId;
      const { id, parent_id, category_id, conflict, decisions } = req.body;
      const src = db.prepare('SELECT * FROM file_library_folders WHERE id = ? AND user_id = ? AND is_deleted = 0').get(parseInt(id), userId);
      if (!src) return res.json(response(false, null, '源文件夹不存在'));
      const targetParent = parent_id ? parseInt(parent_id) : null;
      if (targetParent) {
        let cur = targetParent; let guard = 0;
        while (cur && guard++ < 200) {
          if (cur === parseInt(id)) return res.json(response(false, null, '不能将文件夹复制到其自身或子文件夹内'));
          const p = db.prepare('SELECT parent_id FROM file_library_folders WHERE id = ?').get(cur);
          if (!p) break;
          cur = p.parent_id;
        }
      }
      // 跨盘符复制时，副本（含内部文件/子文件夹）必须挂到目标盘符
      const targetCatRaw = (category_id !== undefined && category_id !== null && category_id !== '') ? parseInt(category_id) : null;
      let targetCat = Number.isFinite(targetCatRaw) ? targetCatRaw : null;
      if (targetCat === null && targetParent) {
        const pf = db.prepare('SELECT category_id FROM file_library_folders WHERE id = ?').get(targetParent);
        if (pf && pf.category_id) targetCat = pf.category_id;
      }
      const effCat = targetCat !== null ? targetCat : (src.category_id || 0);
      // 同名冲突的决策：overwrite = 替换 / 合并，rename = 保留两者并自动编号，skip = 跳过
      const dec = pasteDecision(decisions, src.id, conflict);
      let clash = findNameConflict(userId, effCat, targetParent, src.name, null);
      // 排除自身：原地复制时命中的同名项就是自己，绝不能把自己合并进自己（会无限递归）
      if (clash && clash.kind === 'folder' && Number(clash.id) === Number(src.id)) clash = null;
      if (clash && dec === 'skip') return res.json(response(true, { copied: 0, skipped: 1 }));
      if (clash && dec === 'overwrite' && clash.kind === 'folder') {
        // 覆盖到同名文件夹 = Windows 的「合并文件夹」：把源内容并进已有文件夹，内部冲突自动编号
        mergeFolderInto(userId, src.id, clash.id, effCat);
        try {
          const treeIds = collectFolderIds(clash.id);
          for (const fid of treeIds) {
            const fr = db.prepare('SELECT * FROM file_library_folders WHERE id = ?').get(fid);
            if (fr) ensureFolderDir(userId, fr);
          }
          materializeFileMirrors(userId, fileIdsInFolders(userId, treeIds));
        } catch { /* 镜像失败不影响合并结果 */ }
        return res.json(response(true, { copied: 1, id: clash.id, merged: true }));
      }
      let newName;
      if (clash && dec === 'overwrite') {
        trashConflictTarget(userId, clash.kind, clash.id);
        newName = src.name;
      } else {
        // 无外部冲突时也要过一遍取号：原地复制时名字已被自己占用，副本会自动编号
        newName = uniqueFolderNameInCategory(userId, effCat, targetParent, src.name, null);
      }
      const newFolder = db.prepare('INSERT INTO file_library_folders (user_id, category_id, parent_id, name, is_callable) VALUES (?, ?, ?, ?, ?)').run(
        userId, effCat, targetParent, newName, src.is_callable ? 1 : 0
      );
      const copyRecursive = (fromId, toId) => {
        const files = db.prepare('SELECT * FROM file_library_files WHERE folder_id = ? AND user_id = ? AND is_deleted = 0').all(fromId, userId);
        // 用统一的复制管线：二进制 / 正文 / 缩略图都会生成各自的副本
        // （此前直接沿用源的 thumbnail_path，副本与原件共享同一 sidecar，删掉其中一个另一个缩略图就没了）
        for (const f of files) copyFileRowInto(userId, f, effCat, toId, f.name);
        const subs = db.prepare('SELECT * FROM file_library_folders WHERE parent_id = ? AND user_id = ? AND is_deleted = 0').all(fromId, userId);
        for (const sf of subs) {
          const nf = db.prepare('INSERT INTO file_library_folders (user_id, category_id, parent_id, name, is_callable) VALUES (?, ?, ?, ?, ?)').run(userId, effCat, toId, sf.name, sf.is_callable ? 1 : 0);
          copyRecursive(sf.id, nf.lastInsertRowid);
        }
      };
      copyRecursive(parseInt(id), newFolder.lastInsertRowid);
      // 阶段5：副本在硬盘上同步建出目录层级，并把文件字节归位到镜像目录
      try {
        const treeIds = collectFolderIds(newFolder.lastInsertRowid);
        for (const fid of treeIds) {
          const fr = db.prepare('SELECT * FROM file_library_folders WHERE id = ?').get(fid);
          if (fr) ensureFolderDir(userId, fr);
        }
        materializeFileMirrors(userId, fileIdsInFolders(userId, treeIds));
      } catch { /* 镜像失败不影响复制结果 */ }
      return res.json(response(true, { copied: 1, id: newFolder.lastInsertRowid }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 文件库文件 API（统一文件管理）
// ============================================

export const fileLibraryFileAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, folder_id, file_type, parent_id, light } = req.query;
      // light=1：只返回列表展示需要的元数据，不含 thumbnail_data / content。
      // （打开一个 434 张图的文件夹，完整响应约 10MB+，light 模式降到几十 KB）
      const lite = light === '1' || light === 'true';
      const cols = lite
        ? 'id, user_id, category_id, folder_id, name, file_type, file_size, format, width, height, file_path, prompt_count, created_at, updated_at'
        : '*';
      let query = `SELECT ${cols} FROM file_library_files WHERE user_id = ? AND is_deleted = 0`;
      const params = [userId];
      if (category_id !== undefined && category_id !== 'all') { query += ' AND category_id = ?'; params.push(category_id); }
      if (folder_id === 'null' || folder_id === 'root') { query += ' AND folder_id IS NULL'; }
      else if (folder_id !== undefined && folder_id !== 'all') { query += ' AND folder_id = ?'; params.push(folder_id); }
      if (file_type && file_type !== 'all') { query += ' AND file_type = ?'; params.push(file_type); }
      query += ' ORDER BY sort_order, created_at DESC';
      const files = db.prepare(query).all(...params);
      // 文档型正文外置：full 模式（非 light）下从磁盘回填 content，保持前端兼容；
      // 限定结果集大小，避免超大目录 full 拉取时逐个读盘（规则/提示词/功能等文档列表通常很小）
      if (!lite && files.length <= 2000) {
        for (const f of files) {
          if (DOC_TYPES.has(f.file_type)) f.content = readDocContent(userId, f.content_path, f.content);
        }
      }
      if (lite) return res.json(response(true, files));
      // 附加标签：一次批量查询，避免逐个文件的 N+1
      const ids = files.map((f) => f.id);
      if (ids.length) {
        const ph = ids.map(() => '?').join(',');
        const rows = db.prepare(`SELECT ft.file_id AS _fid, t.* FROM file_library_tags t JOIN file_library_file_tags ft ON t.id = ft.tag_id WHERE ft.file_id IN (${ph})`).all(...ids);
        const map = new Map();
        for (const r of rows) {
          const { _fid, ...tag } = r;
          if (!map.has(_fid)) map.set(_fid, []);
          map.get(_fid).push(tag);
        }
        for (const f of files) f.tags = map.get(f.id) || [];
      }
      return res.json(response(true, files));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getById: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const file = db.prepare('SELECT * FROM file_library_files WHERE id = ? AND user_id = ?').get(id, userId);
      if (!file) return res.json(response(false, null, '文件不存在'));
      // 文档型正文外置：从磁盘 content_path 回填（回退 legacy content）
      if (DOC_TYPES.has(file.file_type)) file.content = readDocContent(userId, file.content_path, file.content);
      file.tags = db.prepare(`SELECT t.* FROM file_library_tags t JOIN file_library_file_tags ft ON t.id = ft.tag_id WHERE ft.file_id = ?`).all(file.id);
      return res.json(response(true, file));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  getFile: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const file = db.prepare('SELECT * FROM file_library_files WHERE id = ? AND user_id = ?').get(id, userId);
      if (!file) return res.status(404).json({ success: false, error: '文件不存在' });
      if (!file.file_path) return res.status(404).json({ success: false, error: '该文件无磁盘数据' });

      // 支持 @userdata: 前缀（用户目录文件，不复制到 GALLERY_DIR）；
      // 换电脑 / 换盘符后，历史绝对路径会自动重定位到本机真实位置
      // 注意：这里关掉「按文件名全局兜底搜索」——旧机器上的绝对路径在本机不存在时，
      // 全局搜索会按文件名撞到同名/同 base 的别的图，导致小说里插入的图片串成另一张。
      // 路径解析不到就返回 404，前端已写好退回缩略图的逻辑，绝不会显示错图。
      const filePath = resolveStoredPath(file.file_path, { search: false });
      if (!filePath) {
        // 原图在本机磁盘上不存在（典型：旧电脑生成的绝对路径，换机后失效）。
        // 这里不再直接 404，而是退回「这条记录自己的缩略图」——同样是按路径精确解析，
        // 不会像以前那样按文件名全局搜索撞到别的图（串图）。这样既消除了控制台 404 噪音，
        // 也省掉前端再补发一次缩略图请求。仅对图片类型生效，避免影响视频/文档等。
        if (file.file_type === 'image' && file.thumbnail_path) {
          const tf = resolveStoredPath(file.thumbnail_path, { search: false });
          if (tf && fs.existsSync(tf)) {
            const tbuf = fs.readFileSync(tf);
            return res.type('image/' + (file.format || 'png')).send(tbuf);
          }
        }
        return res.status(404).json({ success: false, error: '原图文件不存在（本机磁盘上找不到该大图，可能是在其它电脑生成的）' });
      }
      const buffer = fs.readFileSync(filePath);
      const ext = file.format || 'png';
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };
      res.type(mimeMap[ext] || 'application/octet-stream').send(buffer);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  },
  // 单文件缩略图（配合列表 light 模式按需加载，避免一次拉回几十 MB）
  getThumb: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const row = db.prepare('SELECT thumbnail_data, thumbnail_path, format FROM file_library_files WHERE id = ? AND user_id = ?').get(id, userId);
      // 优先从磁盘 sidecar 读取（缩略图已外置）
      // 同样关掉全局搜索兜底，避免缩略图路径失效时回退到同名别的缩略图造成串图
      if (row && row.thumbnail_path) {
        const fp = resolveStoredPath(row.thumbnail_path, { search: false });
        if (fp && fs.existsSync(fp)) {
          const buf = fs.readFileSync(fp);
          const b64 = `data:image/${row.format || 'png'};base64,${buf.toString('base64')}`;
          return res.json(response(true, b64));
        }
      }
      // 兼容历史数据：仍在库内的 base64（迁移脚本运行后会被清空）
      if (row && row.thumbnail_data) return res.json(response(true, row.thumbnail_data));
      return res.json(response(false, null, '无缩略图'));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { category_id, folder_id, name, description, file_type, content, filename, rule_type, image_base64, thumbnail_base64, width, height, format, file_size } = req.body;
      if (!file_type) return res.json(response(false, null, '文件类型不能为空'));
      // 会员存储配额校验（导入/新建文件前拦截）
      const sq = checkQuota(userId, 'storage');
      if (!sq.ok) return res.json(response(false, null, `${sq.reason}，请升级会员或清理回收站后重试`));
      // 内容是 ComfyUI 工作流的 .json 一律归为 workflow 类型（与前端 workflowDetect.js 规则一致），
      // 否则节点编辑器与"使用工作流"选择器都识别不到它。
      let effFileType = file_type;
      if (file_type === 'json' && content && typeof content === 'string' && content.includes('class_type')) {
        try {
          const o = JSON.parse(content);
          if (o && typeof o === 'object' && !Array.isArray(o)) {
            const keys = Object.keys(o);
            let nodeCount = 0;
            for (const k of keys) {
              const v = o[k];
              if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.class_type === 'string') nodeCount++;
            }
            const uiFormat = Array.isArray(o.nodes) && o.nodes.some((n) => n && typeof n === 'object' && (n.type || n.class_type));
            if (uiFormat || (nodeCount > 0 && nodeCount >= Math.ceil(keys.length * 0.6))) effFileType = 'workflow';
          }
        } catch { /* 不是合法 JSON，保持 json 类型 */ }
      }
      let relPath = '';
      let thumbPath = '';
      let fSize = file_size || 0;
      let fWidth = width || 0;
      let fHeight = height || 0;
      let fFormat = format || '';
      // 二进制文件（图片/视频/音频）写磁盘
      // 阶段5：直接落进盘符镜像目录 user_data/<用户>/<盘符>/<层级>/<显示名>.<ext>
      // 分类（盘符）判定优先级：显式传入 > 父文件夹所属分类 > 系统总库。
      // 旧实现里「在文件夹内新建」时会掉到系统总库，导致文件被写到别的盘符去。
      const sysCatId = (db.prepare('SELECT id FROM file_library_categories WHERE user_id = ? AND is_system = 1 ORDER BY id LIMIT 1').get(userId) || {}).id || 0;
      let effCategoryId = category_id || 0;
      if (!effCategoryId && folder_id) {
        const pf = db.prepare('SELECT category_id FROM file_library_folders WHERE id = ? AND user_id = ?').get(folder_id, userId);
        if (pf && pf.category_id) effCategoryId = pf.category_id;
      }
      if (!effCategoryId) effCategoryId = sysCatId;
      // Windows 规则：同一目录下不能有同名文件，也不能与文件夹同名 → 自动顺延「xxx (2)」
      const finalName = uniqueFileNameInFolder(userId, effCategoryId, folder_id || null, name || '未命名', null);
      if (image_base64 && ['image', 'video', 'audio'].includes(file_type)) {
        const matches = image_base64.match(/^data:(image|video|audio)\/(\w+);base64,(.+)$/);
        if (matches) {
          fFormat = fFormat || matches[2];
          const base64Data = matches[3];
          const buffer = Buffer.from(base64Data, 'base64');
          fSize = fSize || buffer.length;
          relPath = writeBytesToMirror(userId, effCategoryId, folder_id || null, finalName, fFormat, buffer);
          if (!relPath) { // 镜像写入失败时兜底回退到平铺图库，保证不丢文件
            const userDir = join(GALLERY_DIR, userId);
            if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
            const fileName = `${uuidv4()}.${fFormat}`;
            fs.writeFileSync(join(userDir, fileName), buffer);
            relPath = `${userId}/${fileName}`;
          }
        }
      }
      const result = db.prepare(`INSERT INTO file_library_files (user_id, category_id, folder_id, name, description, file_type, file_path, thumbnail_data, thumbnail_path, file_size, width, height, format, content, content_path, filename, rule_type, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).run(
        userId,
        effCategoryId,
        folder_id || null, finalName, description || '',
        effFileType, relPath, '', thumbPath, fSize, fWidth, fHeight, fFormat,
        '', '', filename || '', rule_type || 'general'
      );
      const newId = result.lastInsertRowid;
      // 缩略图外置：数据库只存相对路径，字节落盘到 user_data/<用户>/.thumbs/
      if (['image', 'video', 'audio'].includes(effFileType) && relPath) {
        const srcAbs = resolveStoredPath(relPath, { search: false });
        const tp = saveThumbSidecar(userId, newId, fFormat, thumbnail_base64 || null, srcAbs && fs.existsSync(srcAbs) ? srcAbs : null);
        if (tp) db.prepare('UPDATE file_library_files SET thumbnail_path = ? WHERE id = ?').run(tp, newId);
      }
      // 文档型正文外置：优先落进盘符镜像目录（硬盘上能直接看到同名文件），失败回退 .docs sidecar
      // 注意：即使 content 为空也要落盘，否则新建的文本文档在硬盘上看不到（要等第一次保存才出现）
      if (DOC_TYPES.has(effFileType)) {
        const mir = syncFileMirror(userId, { id: newId, category_id: effCategoryId, folder_id: folder_id || null, name: finalName, file_type: effFileType }, { content });
        const cp = mir.content_path || saveDocContent(userId, newId, content, effFileType);
        if (cp) db.prepare('UPDATE file_library_files SET content_path = ? WHERE id = ?').run(cp, newId);
        // 磁盘上若因重名加了「 (2)」，把最终文件名同步回库，保证 UI 与硬盘一致
        if (mir.fileName) db.prepare('UPDATE file_library_files SET name = ? WHERE id = ?').run(mir.fileName, newId);
      }
      const file = db.prepare('SELECT * FROM file_library_files WHERE id = ?').get(newId);
      if (DOC_TYPES.has(file.file_type)) file.content = readDocContent(userId, file.content_path, file.content);
      file.tags = [];
      return res.json(response(true, file));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const updates = req.body;
      // 阶段5：需要拿到完整行，才能在改名/移动时把硬盘文件一起搬走
      const existing = db.prepare('SELECT * FROM file_library_files WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '文件不存在'));
      const effCat = updates.category_id !== undefined ? updates.category_id : existing.category_id;
      const effFolder = updates.folder_id !== undefined ? updates.folder_id : existing.folder_id;
      // 改名（或移动到别的目录）后若与同目录已有项重名，自动顺延，保证 UI 与硬盘一致
      const effName = updates.name !== undefined
        ? uniqueFileNameInFolder(userId, effCat, effFolder, updates.name, parseInt(id))
        : existing.name;
      const allowedFields = ['category_id', 'folder_id', 'name', 'description', 'filename', 'rule_type', 'display_file_id', 'sort_order', 'prompt_count', 'is_valid', 'validation_message'];
      const sets = []; const values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) { sets.push(`${key} = ?`); values.push(key === 'name' ? effName : value); }
      }
      // 处理正文：文档型外置到磁盘（库只留 content_path），其它类型仍按原逻辑存 content
      if (updates.content !== undefined) {
        if (DOC_TYPES.has(existing.file_type)) {
          // 阶段5：正文优先落进盘符镜像目录（硬盘上直接可见），失败回退 .docs sidecar
          const cp = syncFileMirror(userId, { id: parseInt(id), category_id: effCat, folder_id: effFolder, name: effName, file_type: existing.file_type, content_path: existing.content_path }, { content: updates.content, overwriteContent: true }).content_path
            || saveDocContent(userId, id, updates.content, existing.file_type);
          sets.push('content_path = ?', 'content = ?');
          values.push(cp, '');
        } else {
          sets.push('content = ?');
          values.push(updates.content);
        }
      }
      // 更新二进制文件
      if (updates.image_base64 && ['image', 'video', 'audio'].includes(updates.file_type || '')) {
        const matches = updates.image_base64.match(/^data:(image|video|audio)\/(\w+);base64,(.+)$/);
        if (matches) {
          const fFormat = matches[2];
          const buffer = Buffer.from(matches[3], 'base64');
          // 阶段5：新字节直接写进盘符镜像目录（失败兜底平铺图库，绝不丢文件）
          let relPath = writeBytesToMirror(userId, effCat, effFolder, effName, fFormat, buffer);
          if (!relPath) {
            const userDir = join(GALLERY_DIR, userId);
            if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
            const fileName = `${uuidv4()}.${fFormat}`;
            fs.writeFileSync(join(userDir, fileName), buffer);
            relPath = `${userId}/${fileName}`;
          }
          // 删除旧文件
          if (existing.file_path && existing.file_path !== relPath) { try { const oldPath = resolveStoredPath(existing.file_path, { search: false }); if (oldPath) fs.unlinkSync(oldPath); } catch {} }
          sets.push('file_path = ?', 'file_size = ?', 'format = ?');
          values.push(relPath, buffer.length, fFormat);
        }
      }
      if (sets.length) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE file_library_files SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const file = db.prepare('SELECT * FROM file_library_files WHERE id = ?').get(id);
      // 阶段5：改名 / 换文件夹 / 换盘符 → 硬盘上的文件同步搬家
      if (file && (updates.name !== undefined || updates.folder_id !== undefined || updates.category_id !== undefined)) {
        const out = syncFileMirror(userId, file, {});
        const s2 = []; const v2 = [];
        if (out.file_path && out.file_path !== file.file_path) { s2.push('file_path = ?'); v2.push(out.file_path); }
        if (out.content_path && out.content_path !== file.content_path) { s2.push('content_path = ?'); v2.push(out.content_path); }
        if (s2.length) { v2.push(id); db.prepare(`UPDATE file_library_files SET ${s2.join(', ')} WHERE id = ?`).run(...v2); file.file_path = out.file_path || file.file_path; file.content_path = out.content_path || file.content_path; }
      }
      if (file && DOC_TYPES.has(file.file_type)) file.content = readDocContent(userId, file.content_path, file.content);
      // 改名 / 换文件夹 / 换盘符后，小图也要跟着挪到对应位置（否则大图搬了、小图留在原地）
      try { relocateThumbMirror(userId, parseInt(id)); } catch {}
      return res.json(response(true, file));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const existing = db.prepare('SELECT * FROM file_library_files WHERE id = ? AND user_id = ? AND is_deleted = 0').get(id, userId);
      if (!existing) return res.json(response(false, null, '文件不存在'));
      const now = new Date().toISOString();
      db.prepare('UPDATE file_library_files SET is_deleted = 1, deleted_at = ? WHERE id = ? AND user_id = ?').run(now, id, userId);
      return res.json(response(true, { deleted: 1 }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要删除的文件'));
      const placeholders = ids.map(() => '?').join(',');
      const now = new Date().toISOString();
      const result = db.prepare(`UPDATE file_library_files SET is_deleted = 1, deleted_at = ? WHERE id IN (${placeholders}) AND user_id = ? AND is_deleted = 0`).run(now, ...ids, userId);
      return res.json(response(true, { deleted: result.changes }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchMove: (req, res) => {
    try {
      const userId = req.userId;
      const { ids, category_id, folder_id, conflict, decisions } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择文件'));
      // 未显式给盘符时从目标文件夹继承，否则文件会被搬到 C 盘去
      let catId = Number(category_id) || 0;
      if (!catId && folder_id) {
        const pf = db.prepare('SELECT category_id FROM file_library_folders WHERE id = ?').get(folder_id);
        if (pf && pf.category_id) catId = pf.category_id;
      }
      // 剪切粘贴：目标目录若已有同名项，按决策处理 —— overwrite = 替换（旧的进回收站），rename = 自动编号
      const moveIds = [];
      for (const id of ids) {
        const f = db.prepare('SELECT id, name FROM file_library_files WHERE id = ? AND user_id = ?').get(parseInt(id), userId);
        if (!f) continue;
        const dec = pasteDecision(decisions, f.id, conflict);
        const clash = findNameConflict(userId, catId, folder_id || null, f.name, parseInt(id));
        if (clash && dec === 'skip') continue;
        if (clash && dec === 'overwrite') trashConflictTarget(userId, clash.kind, clash.id);
        else if (clash) db.prepare('UPDATE file_library_files SET name = ? WHERE id = ?').run(uniqueFileNameInFolder(userId, catId, folder_id || null, f.name, parseInt(id)), f.id);
        moveIds.push(parseInt(id));
      }
      if (!moveIds.length) return res.json(response(true, { updated: 0, skipped: ids.length }));
      const placeholders = moveIds.map(() => '?').join(',');
      db.prepare(`UPDATE file_library_files SET category_id = ?, folder_id = ?, updated_at = datetime('now') WHERE id IN (${placeholders}) AND user_id = ?`).run(
        catId, folder_id || null, ...moveIds, userId
      );
      // 阶段5：硬盘上的文件同步搬到新盘符 / 新文件夹
      materializeFileMirrors(userId, moveIds);
      // 小图必须跟着一起搬，否则会出现「大图已在子文件夹、小图还在根目录」的错位
      relocateThumbMirrors(userId, moveIds);
      return res.json(response(true, { updated: moveIds.length, skipped: ids.length - moveIds.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 查询可调用文件夹中指定类型的文件（供任务管理/角色设置使用）
  getCallableFiles: (req, res) => {
    try {
      const userId = req.userId;
      const { file_type } = req.query;
      // 找出所有 is_callable=1 的文件夹ID（递归收集子文件夹）
      const callableFolders = db.prepare('SELECT id, category_id FROM file_library_folders WHERE user_id = ? AND is_callable = 1').all(userId);
      if (callableFolders.length === 0) return res.json(response(true, []));
      // 递归收集所有子文件夹
      const allFolderIds = new Set();
      const collectChildren = (parentId) => {
        const children = db.prepare('SELECT id FROM file_library_folders WHERE parent_id = ?').all(parentId);
        for (const c of children) { allFolderIds.add(c.id); collectChildren(c.id); }
      };
      for (const f of callableFolders) { allFolderIds.add(f.id); collectChildren(f.id); }
      const folderIds = [...allFolderIds];
      const placeholders = folderIds.map(() => '?').join(',');
      let query = `SELECT * FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND folder_id IN (${placeholders})`;
      const params = [userId, ...folderIds];
      if (file_type && file_type !== 'all') { query += ' AND file_type = ?'; params.push(file_type); }
      query += ' ORDER BY name, created_at DESC';
      const files = db.prepare(query).all(...params);
      // 构建文件夹路径缓存（避免重复查询）
      const folderPathCache = new Map();
      const buildFolderPath = (folderId) => {
        if (folderPathCache.has(folderId)) return folderPathCache.get(folderId);
        const parts = [];
        let current = folderId;
        while (current) {
          const folder = db.prepare('SELECT id, name, parent_id, category_id FROM file_library_folders WHERE id = ?').get(current);
          if (!folder) break;
          parts.unshift(folder.name);
          current = folder.parent_id;
          if (parts.length > 50) break; // 防止死循环
        }
        const path = parts.join(' / ');
        folderPathCache.set(folderId, path);
        return path;
      };
      // 附加文件夹路径信息和标签
      for (const f of files) {
        f.tags = db.prepare(`SELECT t.* FROM file_library_tags t JOIN file_library_file_tags ft ON t.id = ft.tag_id WHERE ft.file_id = ?`).all(f.id);
        f.folder_path = f.folder_id ? buildFolderPath(f.folder_id) : '';
      }
      return res.json(response(true, files));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 获取文件夹路径（面包屑用）
  getFolderPath: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const path = [];
      let categoryId = null;
      let current = id;
      while (current) {
        const folder = db.prepare('SELECT id, name, category_id, parent_id FROM file_library_folders WHERE id = ? AND user_id = ?').get(current, userId);
        if (!folder) break;
        path.unshift({ id: folder.id, name: folder.name, type: 'folder' });
        if (!categoryId) categoryId = folder.category_id;
        current = folder.parent_id;
      }
      // 附加分类信息（含系统分类"总库"）
      if (categoryId) {
        const cat = db.prepare('SELECT id, name FROM file_library_categories WHERE id = ?').get(categoryId);
        if (cat) path.unshift({ id: cat.id, name: cat.name, type: 'category' });
      }
      return res.json(response(true, path));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 复制文件（保留原文件，在目标文件夹生成副本；含磁盘二进制）
  copy: (req, res) => {
    try {
      const userId = req.userId;
      // 复制文件：必须尊重前端传来的目标盘符 category_id（此前始终沿用源文件的 category_id，
      // 导致跨盘符复制的副本仍挂在原盘符下 —— 表现为"复制没生效"）
      const { ids, folder_id, category_id, conflict, decisions } = req.body;
      if (!Array.isArray(ids) || !ids.length) return res.json(response(false, null, '请选择要复制的文件'));
      const targetFolder = folder_id ? parseInt(folder_id) : null;
      const targetCategory = category_id !== undefined && category_id !== null && category_id !== '' ? parseInt(category_id) : null;
      // 未显式给盘符时从目标文件夹继承（旧逻辑沿用源盘符，跨盘复制会挂错盘）
      let effCat = (targetCategory !== null && !Number.isNaN(targetCategory)) ? targetCategory : null;
      if (effCat === null && targetFolder) {
        const pf = db.prepare('SELECT category_id FROM file_library_folders WHERE id = ?').get(targetFolder);
        if (pf && pf.category_id) effCat = pf.category_id;
      }
      if (targetFolder) {
        const tf = db.prepare('SELECT id FROM file_library_folders WHERE id = ? AND user_id = ? AND is_deleted = 0').get(targetFolder, userId);
        if (!tf) return res.json(response(false, null, '目标文件夹不存在'));
      }
      const newIds = [];
      for (const id of ids) {
        const f = db.prepare('SELECT * FROM file_library_files WHERE id = ? AND user_id = ? AND is_deleted = 0').get(parseInt(id), userId);
        if (!f) continue;
        const cid = effCat !== null ? effCat : (f.category_id || 0);
        // 同名冲突的决策：overwrite = 替换目标（旧的进回收站），rename = 保留两者并自动编号，skip = 跳过
        const dec = pasteDecision(decisions, f.id, conflict);
        // 排除自身：原地复制时「同名项」就是自己，不能把自己当成要覆盖的目标
        const clash = findNameConflict(userId, cid, targetFolder, f.name, f.id);
        if (clash && dec === 'skip') continue;
        let newName;
        if (clash && dec === 'overwrite') {
          trashConflictTarget(userId, clash.kind, clash.id);
          newName = f.name;
        } else {
          // 无外部冲突时也要过一遍取号：原地复制时名字已被自己占用，副本会自动编号
          newName = uniqueFileNameInFolder(userId, cid, targetFolder, f.name, null);
        }
        const newId = copyFileRowInto(userId, f, cid, targetFolder, newName);
        newIds.push(newId);
      }
      // 阶段5：副本同步落进目标盘符 / 文件夹的镜像目录
      materializeFileMirrors(userId, newIds);
      return res.json(response(true, { copied: newIds.length, ids: newIds }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 粘贴冲突预检 API（Windows「替换或跳过」对话框的数据源）
// ============================================

export const fileLibraryPasteAPI = {
  conflicts: (req, res) => {
    try {
      const userId = req.userId;
      const { items = [], folder_id, category_id } = req.body;
      const targetFolder = folder_id ? parseInt(folder_id) : null;
      let catId = Number(category_id) || 0;
      if (!catId && targetFolder) {
        const pf = db.prepare('SELECT category_id FROM file_library_folders WHERE id = ?').get(targetFolder);
        if (pf && pf.category_id) catId = pf.category_id;
      }
      const out = [];
      for (const it of Array.isArray(items) ? items : []) {
        const id = parseInt(it && it.id);
        if (!id) continue;
        const kind = String((it && it.kind) || 'file').toLowerCase() === 'folder' ? 'folder' : 'file';
        const src = kind === 'folder'
          ? db.prepare('SELECT id, name, updated_at, created_at FROM file_library_folders WHERE id = ? AND user_id = ? AND is_deleted = 0').get(id, userId)
          : db.prepare('SELECT id, name, file_type, file_size, updated_at, created_at FROM file_library_files WHERE id = ? AND user_id = ? AND is_deleted = 0').get(id, userId);
        if (!src) continue;
        const clash = findNameConflict(userId, catId, targetFolder, src.name, null);
        if (!clash) continue;
        // 原地粘贴：命中的同名项就是自己，不算冲突
        if (clash.kind === kind && Number(clash.id) === Number(id)) continue;
        out.push({
          kind, id, name: src.name,
          file_type: src.file_type || '', file_size: src.file_size || 0,
          updated_at: src.updated_at || src.created_at || '',
          target: clash,
        });
      }
      return res.json(response(true, { conflicts: out, category_id: catId, folder_id: targetFolder }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 文件库标签 API
// ============================================

export const fileLibraryTagAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const tags = db.prepare('SELECT *, (SELECT COUNT(*) FROM file_library_file_tags WHERE tag_id = file_library_tags.id) as file_count, (SELECT name FROM file_library_tag_categories WHERE id = file_library_tags.category_id) as category_name FROM file_library_tags WHERE user_id = ? ORDER BY sort_order, created_at').all(userId);
      return res.json(response(true, tags));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name, color, category_id } = req.body;
      if (!name) return res.json(response(false, null, '标签名称不能为空'));
      const result = db.prepare('INSERT INTO file_library_tags (user_id, name, color, category_id) VALUES (?, ?, ?, ?)').run(userId, name, color || '#4a9eff', category_id || 0);
      const tag = db.prepare('SELECT * FROM file_library_tags WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, tag));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, color, sort_order, category_id } = req.body;
      const existing = db.prepare('SELECT * FROM file_library_tags WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '标签不存在'));
      const sets = []; const values = [];
      if (name !== undefined) { sets.push('name = ?'); values.push(name); }
      if (color !== undefined) { sets.push('color = ?'); values.push(color); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
      if (category_id !== undefined) { sets.push('category_id = ?'); values.push(category_id); }
      if (sets.length) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE file_library_tags SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const tag = db.prepare('SELECT * FROM file_library_tags WHERE id = ?').get(id);
      return res.json(response(true, tag));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      db.prepare('DELETE FROM file_library_tags WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: 1 }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 为文件打标签
  tagFile: (req, res) => {
    try {
      const userId = req.userId;
      const { file_id, tag_id } = req.body;
      db.prepare('INSERT OR IGNORE INTO file_library_file_tags (file_id, tag_id) VALUES (?, ?)').run(file_id, tag_id);
      return res.json(response(true, { tagged: 1 }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 批量打标签
  batchTag: (req, res) => {
    try {
      const userId = req.userId;
      const { file_ids, tag_id } = req.body;
      if (!Array.isArray(file_ids) || file_ids.length === 0) return res.json(response(false, null, '请选择文件'));
      const stmt = db.prepare('INSERT OR IGNORE INTO file_library_file_tags (file_id, tag_id) VALUES (?, ?)');
      const tx = db.transaction(() => { for (const fid of file_ids) stmt.run(fid, tag_id); });
      tx();
      return res.json(response(true, { tagged: file_ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 移除文件标签
  untagFile: (req, res) => {
    try {
      const userId = req.userId;
      const { file_id, tag_id } = req.body;
      db.prepare('DELETE FROM file_library_file_tags WHERE file_id = ? AND tag_id = ?').run(file_id, tag_id);
      return res.json(response(true, { untagged: 1 }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  batchDelete: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择标签'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`DELETE FROM file_library_tags WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { deleted: ids.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 文件库回收站 API
// ============================================

export const fileLibraryRecycleAPI = {
  // 获取回收站内容（文件 + 文件夹）
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const files = db.prepare(`SELECT * FROM file_library_files WHERE user_id = ? AND is_deleted = 1 ORDER BY deleted_at DESC`).all(userId);
      for (const f of files) {
        f.tags = db.prepare(`SELECT t.* FROM file_library_tags t JOIN file_library_file_tags ft ON t.id = ft.tag_id WHERE ft.file_id = ?`).all(f.id);
      }
      const folders = db.prepare(`SELECT * FROM file_library_folders WHERE user_id = ? AND is_deleted = 1 ORDER BY deleted_at DESC`).all(userId);
      return res.json(response(true, { files, folders }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 恢复文件（批量）
  restoreFiles: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要恢复的文件'));
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`UPDATE file_library_files SET is_deleted = 0, deleted_at = '' WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      // 还原后目标目录里可能已经有同名项（删掉后又新建了一个同名的）→ 还原回来的这条顺延编号，绝不重名共存
      const renamed = [];
      for (const id of ids) {
        const nm = restoreFileUnique(userId, id);
        if (nm) renamed.push({ id: parseInt(id), name: nm });
      }
      return res.json(response(true, { restored: ids.length, renamed }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 恢复文件夹（批量，包含子文件夹和文件）
  restoreFolders: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要恢复的文件夹'));
      // 递归收集所有子文件夹 ID（包括已删除的）
      const collectDescendants = (parentId) => {
        const allIds = [parentId];
        const stack = [parentId];
        while (stack.length) {
          const cur = stack.pop();
          const children = db.prepare('SELECT id FROM file_library_folders WHERE parent_id = ?').all(cur);
          for (const c of children) { allIds.push(c.id); stack.push(c.id); }
        }
        return allIds;
      };
      const allFolderIds = new Set();
      for (const id of ids) { for (const fid of collectDescendants(parseInt(id))) { allFolderIds.add(fid); } }
      const folderIdArr = [...allFolderIds];
      const placeholders = folderIdArr.map(() => '?').join(',');
      db.prepare(`UPDATE file_library_folders SET is_deleted = 0, deleted_at = '' WHERE id IN (${placeholders}) AND user_id = ?`).run(...folderIdArr, userId);
      db.prepare(`UPDATE file_library_files SET is_deleted = 0, deleted_at = '' WHERE folder_id IN (${placeholders}) AND user_id = ?`).run(...folderIdArr, userId);
      // 目标目录里若已有同名文件夹（或同名文件），还原回来的这个改名为「xxx (2)」
      const renamed = [];
      for (const id of ids) {
        const nm = restoreFolderUnique(userId, id);
        if (nm) renamed.push({ id: parseInt(id), name: nm });
      }
      return res.json(response(true, { restored: folderIdArr.length, renamed }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 恢复全部
  restoreAll: (req, res) => {
    try {
      const userId = req.userId;
      db.prepare('UPDATE file_library_folders SET is_deleted = 0, deleted_at = "" WHERE user_id = ? AND is_deleted = 1').run(userId);
      db.prepare('UPDATE file_library_files SET is_deleted = 0, deleted_at = "" WHERE user_id = ? AND is_deleted = 1').run(userId);
      // 一次还原一大堆，重名概率很高：全库对账，把所有同目录同名都顺延编号
      const renamed = dedupeAllNames(userId);
      return res.json(response(true, { restored: 'all', renamed: renamed.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 彻底删除文件（批量，删除硬盘文件）
  purgeFiles: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要彻底删除的文件'));
      const placeholders = ids.map(() => '?').join(',');
      const files = db.prepare(`SELECT * FROM file_library_files WHERE id IN (${placeholders}) AND user_id = ?`).all(...ids, userId);
      const deletedDirs = new Set();
      for (const f of files) {
        if (f.file_path) {
          try {
            const filePath = resolveStoredPath(f.file_path, { search: false });
            if (filePath) {
              moveToTrash(filePath, userId);
              deletedDirs.add(dirname(filePath));
            }
          } catch {}
        }
        // 清理外置资产：缩略图 sidecar + 文档正文
        purgeStoredFiles(f);
      }
      // 清理空文件夹
      for (const dir of deletedDirs) {
        try {
          pruneEmptyMirrorDirs(dir, userId); // 阶段5：镜像目录空掉后向上回收（不越过盘符根）
          if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir);
          }
        } catch {}
      }
      db.prepare(`DELETE FROM file_library_files WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, userId);
      return res.json(response(true, { purged: files.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 彻底删除文件夹（批量，删除硬盘文件）
  purgeFolders: (req, res) => {
    try {
      const userId = req.userId;
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) return res.json(response(false, null, '请选择要彻底删除的文件夹'));
      const collectDescendants = (parentId) => {
        const allIds = [parentId];
        const stack = [parentId];
        while (stack.length) {
          const cur = stack.pop();
          const children = db.prepare('SELECT id FROM file_library_folders WHERE parent_id = ?').all(cur);
          for (const c of children) { allIds.push(c.id); stack.push(c.id); }
        }
        return allIds;
      };
      const allFolderIds = new Set();
      for (const id of ids) { for (const fid of collectDescendants(parseInt(id))) { allFolderIds.add(fid); } }
      const folderIdArr = [...allFolderIds];
      const placeholders = folderIdArr.map(() => '?').join(',');
      // 删除硬盘文件
      const files = db.prepare(`SELECT * FROM file_library_files WHERE folder_id IN (${placeholders}) AND user_id = ?`).all(...folderIdArr, userId);
      const deletedDirs = new Set();
      for (const f of files) {
        if (f.file_path) {
          try {
            const filePath = resolveStoredPath(f.file_path, { search: false });
            if (filePath) {
              moveToTrash(filePath, userId);
              deletedDirs.add(dirname(filePath));
            }
          } catch {}
        }
        // 清理外置资产：缩略图 sidecar + 文档正文
        purgeStoredFiles(f);
      }
      // 清理空文件夹
      for (const dir of deletedDirs) {
        try {
          pruneEmptyMirrorDirs(dir, userId); // 阶段5：镜像目录空掉后向上回收（不越过盘符根）
          if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir);
          }
        } catch {}
      }
      // 阶段5：彻底删除文件夹后，硬盘上的镜像目录一并移除（其中的文件已先移入 .trash）
      for (const id of ids) {
        try {
          const fr = db.prepare('SELECT * FROM file_library_folders WHERE id = ? AND user_id = ?').get(parseInt(id), userId);
          if (!fr) continue;
          const d = mirrorDirAbs(userId, fr.category_id, fr.id);
          if (fs.existsSync(d)) {
            fs.rmSync(d, { recursive: true, force: true });
            pruneEmptyMirrorDirs(path.dirname(d), userId);
          }
        } catch {}
      }
      db.prepare(`DELETE FROM file_library_files WHERE folder_id IN (${placeholders}) AND user_id = ?`).run(...folderIdArr, userId);
      db.prepare(`DELETE FROM file_library_folders WHERE id IN (${placeholders}) AND user_id = ?`).run(...folderIdArr, userId);
      return res.json(response(true, { purged: folderIdArr.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  // 清空回收站
  empty: (req, res) => {
    try {
      const userId = req.userId;
      const files = db.prepare('SELECT * FROM file_library_files WHERE user_id = ? AND is_deleted = 1').all(userId);
      const deletedDirs = new Set();
      for (const f of files) {
        if (f.file_path) {
          try {
            const filePath = resolveStoredPath(f.file_path, { search: false });
            if (filePath) {
              moveToTrash(filePath, userId);
              // 记录父目录，稍后清理空文件夹
              const parentDir = dirname(filePath);
              deletedDirs.add(parentDir);
            }
          } catch {}
        }
        // 清理外置资产：缩略图 sidecar + 文档正文
        purgeStoredFiles(f);
      }
      // 清理空文件夹（仅尝试删除已删除文件的父目录）
      for (const dir of deletedDirs) {
        try {
          pruneEmptyMirrorDirs(dir, userId); // 阶段5：镜像目录空掉后向上回收（不越过盘符根）
          if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir);
          }
        } catch {}
      }
      db.prepare('DELETE FROM file_library_files WHERE user_id = ? AND is_deleted = 1').run(userId);
      db.prepare('DELETE FROM file_library_folders WHERE user_id = ? AND is_deleted = 1').run(userId);
      return res.json(response(true, { emptied: files.length }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 文件库标签分类 API
// ============================================

export const fileLibraryTagCategoryAPI = {
  getAll: (req, res) => {
    try {
      const userId = req.userId;
      const cats = db.prepare(`SELECT *, (SELECT COUNT(*) FROM file_library_tags WHERE category_id = file_library_tag_categories.id) as tag_count FROM file_library_tag_categories WHERE user_id = ? ORDER BY sort_order, created_at`).all(userId);
      return res.json(response(true, cats));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  create: (req, res) => {
    try {
      const userId = req.userId;
      const { name } = req.body;
      if (!name) return res.json(response(false, null, '分类名称不能为空'));
      const result = db.prepare('INSERT INTO file_library_tag_categories (user_id, name) VALUES (?, ?)').run(userId, name);
      const cat = db.prepare('SELECT * FROM file_library_tag_categories WHERE id = ?').get(result.lastInsertRowid);
      return res.json(response(true, cat));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  update: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      const { name, sort_order } = req.body;
      const existing = db.prepare('SELECT * FROM file_library_tag_categories WHERE id = ? AND user_id = ?').get(id, userId);
      if (!existing) return res.json(response(false, null, '分类不存在'));
      const sets = []; const values = [];
      if (name !== undefined) { sets.push('name = ?'); values.push(name); }
      if (sort_order !== undefined) { sets.push('sort_order = ?'); values.push(sort_order); }
      if (sets.length) { sets.push("updated_at = datetime('now')"); values.push(id); db.prepare(`UPDATE file_library_tag_categories SET ${sets.join(', ')} WHERE id = ?`).run(...values); }
      const cat = db.prepare('SELECT * FROM file_library_tag_categories WHERE id = ?').get(id);
      return res.json(response(true, cat));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  },
  delete: (req, res) => {
    try {
      const userId = req.userId;
      const { id } = req.params;
      // 将该分类下的标签移到未分类
      db.prepare('UPDATE file_library_tags SET category_id = 0 WHERE category_id = ? AND user_id = ?').run(id, userId);
      db.prepare('DELETE FROM file_library_tag_categories WHERE id = ? AND user_id = ?').run(id, userId);
      return res.json(response(true, { deleted: 1 }));
    } catch (error) {
      return res.json(response(false, null, error.message));
    }
  }
};

// ============================================
// 启动自愈：把历史遗留的「别的电脑 / 别的盘符」绝对路径
// 重定位为本机真实路径，并改写成相对 user_data 的可移植形式。
// （表现：列表里只有缩略图能看，点开大图一律 404）
// ============================================
export function repairUserDataPaths() {
  try {
    const done = db.prepare("SELECT version FROM schema_migrations WHERE version = 'v9_userdata_paths'").get();
    if (done) return { skipped: true };
    const rows = db.prepare("SELECT id, file_path FROM file_library_files WHERE file_path LIKE '@userdata:%'").all();
    const upd = db.prepare('UPDATE file_library_files SET file_path = ? WHERE id = ?');
    let fixed = 0, missing = 0;
    for (const r of rows) {
      const real = resolveStoredPath(r.file_path);
      if (!real) { missing++; continue; }
      const rel = path.relative(USER_DATA_DIR, real).replace(/\\/g, '/');
      const next = (rel && !rel.startsWith('..') && !/^[A-Za-z]:/.test(rel)) ? `@userdata:${rel}` : `@userdata:${real}`;
      if (next !== r.file_path) { upd.run(next, r.id); fixed++; }
    }
    db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES ('v9_userdata_paths')").run();
    return { total: rows.length, fixed, missing };
  } catch (e) {
    console.warn('文件路径自愈失败:', e.message);
    return { error: e.message };
  }
}

// 延后执行，避免拖慢启动
setTimeout(() => {
  try {
    const r = repairUserDataPaths();
    if (r && !r.skipped && !r.error && (r.fixed || r.missing)) {
      console.log(`🔧 文件路径自愈：共 ${r.total} 条记录，已重定位 ${r.fixed} 条，本机仍缺失 ${r.missing} 条`);
    }
  } catch {}
}, 3000);

// ============================================================
// 阶段4：磁盘反向监听（磁盘 → 数据库）+ 启动对账 + 回收站 .trash 打通
// ------------------------------------------------------------
// 用户诉求：在硬盘目录里直接删除文件 / 文件夹，系统后台对应记录同样删除（进回收站，可恢复）；
// 阶段0-3 已完成「UI 删 → 落盘」，这里补足「硬盘删 → 后台删」这一半，并让回收站真正落到磁盘 .trash。
// 仅响应「删除」事件；新增 / 改名因无法判定分类与文件类型，不自动入库（避免误导入）。
// ============================================================
let __diskSyncStarted = false;
const __pendingDeletes = new Map(); // absPath -> 1（仅用 keys 去重，防抖批量处理）
let __diskSyncTimer = null;
// 改名 / 批量迁移期间临时挂起磁盘监听：这些操作本身会移动目录，
// 若让监听把它当成「外部删除」处理，会把正迁移的文件误删进回收站。挂起期间忽略所有 rename 事件。
let __diskWatchPaused = false;
function pauseDiskWatch() { __diskWatchPaused = true; }
function resumeDiskWatch() { __diskWatchPaused = false; }

// 判断被删项属于哪一类（gallery 二进制 / user_data 下的 .thumbs / .docs / avatars）
function __classifyDeleted(absPath) {
  const norm = path.normalize(absPath);
  const gal = GALLERY_DIR;
  const ud = USER_DATA_DIR;
  if (norm === gal || norm.startsWith(gal + path.sep)) {
    const rel = path.relative(gal, norm).replace(/\\/g, '/');
    const parts = rel.split('/').filter(Boolean);
    const userId = parts[0];
    // gallery 为平铺结构 userId/file：1 段=用户目录，>=2 段=文件
    return { kind: 'gallery', userId, rel, isDir: parts.length <= 1 };
  }
  if (norm === ud || norm.startsWith(ud + path.sep)) {
    const rel = path.relative(ud, norm).replace(/\\/g, '/');
    const parts = rel.split('/').filter(Boolean);
    // 首段现在是「用户名」而非 userId，需回查（兼容旧的 uuid 目录名）
    const userId = userIdByDirName(parts[0]);
    let sub = null;
    if (parts[1] === '.thumbs') sub = 'thumbs';
    else if (parts[1] === THUMB_ROOT) sub = 'thumbs'; // 新格局：<用户>/缩略图/<盘符>/…
    else if (parts[1] === '.docs') sub = 'docs';
    else if (parts[1] === 'avatars') sub = 'avatars';
    else if (/^[A-Z](-[^/\\]+)?$/.test(parts[1] || '')) sub = 'mirror'; // 阶段5：盘符镜像区 <用户>/<盘符(或盘符-名称)>/…
    return { kind: 'userdata', userId, rel, sub, isDir: parts.length <= 2 };
  }
  return null;
}

// 阶段5：盘符镜像区内被外部删除的目录 / 文件 → 回写数据库
// 优先按「文件夹镜像目录」匹配（含子孙），其次按路径前缀批量，最后按单文件精确匹配。
function __handleMirrorDeleted(absPath, userId, rel) {
  const now = new Date().toISOString();
  const delAbs = path.normalize(absPath);
  const softDelete = (row, clearRefs) => {
    if (clearRefs) db.prepare('UPDATE file_library_files SET is_deleted = 1, deleted_at = ?, thumbnail_path = ?, content_path = ? WHERE id = ?').run(now, '', '', row.id);
    else db.prepare('UPDATE file_library_files SET is_deleted = 1, deleted_at = ? WHERE id = ?').run(now, row.id);
    purgeStoredFiles(row); // 孤儿缩略图 / 正文 sidecar 移入 .trash
  };
  try {
    // ① 文件夹的镜像目录被删 → 该文件夹（含子文件夹与其中文件）整体进回收站
    const folders = db.prepare('SELECT id, category_id FROM file_library_folders WHERE user_id = ? AND is_deleted = 0').all(userId);
    const hit = [];
    for (const f of folders) {
      const d = path.normalize(mirrorDirAbs(userId, f.category_id, f.id));
      if (d === delAbs || d.startsWith(delAbs + path.sep)) hit.push(f.id);
    }
    if (hit.length) {
      const all = new Set();
      for (const fid of hit) for (const x of collectFolderIds(fid)) all.add(x);
      const arr = [...all];
      const ph = arr.map(() => '?').join(',');
      const rows = db.prepare(`SELECT * FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND folder_id IN (${ph})`).all(userId, ...arr);
      db.prepare(`UPDATE file_library_folders SET is_deleted = 1, deleted_at = ? WHERE id IN (${ph}) AND user_id = ?`).run(now, ...arr, userId);
      for (const r of rows) softDelete(r, true);
      console.log(`🗑️ 磁盘监听：镜像目录 ${rel} 被删，已移入回收站（${arr.length} 个文件夹 / ${rows.length} 个文件）`);
      return;
    }
    // ② 盘符根 / 某个目录被删，其下的散落文件
    const prefix = `@userdata:${rel}/%`;
    const rows = db.prepare('SELECT * FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND (file_path LIKE ? OR content_path LIKE ?)').all(userId, prefix, prefix);
    for (const r of rows) softDelete(r, true);
    if (rows.length) {
      console.log(`🗑️ 磁盘监听：镜像目录 ${rel} 下的 ${rows.length} 个文件已移入回收站`);
      return;
    }
    // ③ 单个文件
    const full = `@userdata:${rel}`;
    const row = db.prepare('SELECT * FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND (file_path = ? OR content_path = ?)').get(userId, full, full);
    if (row) {
      softDelete(row, false);
      console.log(`🗑️ 磁盘监听：镜像文件 ${rel} 被外部删除，已移入回收站（id=${row.id}）`);
    }
  } catch (e) {
    console.warn('镜像删除回写失败:', e.message);
  }
}

// 把磁盘上被外部删除的资产，回写到数据库（软删进回收站 / 清空失效引用）
function __handleDeleted(absPath) {
  const info = __classifyDeleted(absPath);
  if (!info || !info.userId) return;
  const userId = info.userId;
  try {
    if (info.kind === 'gallery') {
      if (info.isDir) {
        // 整个用户图库目录被删：该用户所有活跃文件进回收站
        const now = new Date().toISOString();
        const rows = db.prepare("SELECT id FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND file_path <> '' AND file_path NOT LIKE '@userdata:%'").all(userId);
        if (rows.length) {
          db.prepare("UPDATE file_library_files SET is_deleted = 1, deleted_at = ? WHERE user_id = ? AND is_deleted = 0 AND file_path <> '' AND file_path NOT LIKE '@userdata:%'").run(now, userId);
          console.log(`🗑️ 磁盘监听：用户 ${userId} 图库目录被删，已将 ${rows.length} 个文件移入回收站`);
        }
      } else {
        // 单个二进制文件被删：精确匹配 file_path（= userId/fileName）
        const row = db.prepare('SELECT * FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND file_path = ?').get(userId, info.rel);
        if (row) {
          const now = new Date().toISOString();
          // 软删进回收站，并同步清空失效的 sidecar 引用（避免回收站里残留指向已删缩略图 / 正文的记录）
          db.prepare('UPDATE file_library_files SET is_deleted = 1, deleted_at = ?, thumbnail_path = ?, content_path = ? WHERE id = ?').run(now, '', '', row.id);
          purgeStoredFiles(row); // 把孤儿 sidecar（缩略图 / 文档）移入 .trash
          console.log(`🗑️ 磁盘监听：文件 ${info.rel} 被外部删除，已移入回收站（id=${row.id}）`);
        }
      }
    } else if (info.kind === 'userdata') {
      // 阶段5：盘符镜像区不分目录/文件，统一交给镜像处理器判定
      if (info.sub === 'mirror') {
        __handleMirrorDeleted(absPath, userId, info.rel);
        return;
      }
      // 缩略图（旧的扁平 .thumbs、新的「缩略图」镜像树）：不再靠文件名反推路径，
      // 直接拿被删项的相对路径做「精确 + 目录前缀」匹配，盘符层/子目录层都能命中。
      if (info.sub === 'thumbs') {
        const full = `@userdata:${info.rel}`;
        const rows = db.prepare("SELECT id, thumbnail_path FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND thumbnail_path <> ''").all(userId);
        const hitIds = rows.filter((r) => r.thumbnail_path === full || r.thumbnail_path.startsWith(full + '/')).map((r) => r.id);
        if (hitIds.length) {
          const ph = hitIds.map(() => '?').join(',');
          const n = db.prepare(`UPDATE file_library_files SET thumbnail_path = '' WHERE id IN (${ph})`).run(...hitIds).changes;
          if (n) console.log(`🗑️ 磁盘监听：缩略图 ${info.rel} 被删，已清空 ${n} 条引用`);
        }
      } else if (info.isDir && info.sub === 'docs') {
        const n = db.prepare("UPDATE file_library_files SET content_path = '' WHERE user_id = ? AND is_deleted = 0 AND content_path <> ''").run(userId).changes;
        if (n) console.log(`🗑️ 磁盘监听：用户 ${userId} 文档目录被删，已清空 ${n} 条正文引用`);
      } else if (info.isDir && info.sub === 'avatars') {
        const nu = db.prepare("UPDATE users SET avatar_path = '' WHERE id = ? AND avatar_path <> ''").run(userId).changes;
        const nc = db.prepare("UPDATE characters SET avatar_path = '' WHERE user_id = ? AND avatar_path <> ''").run(userId).changes;
        if (nu || nc) console.log(`🗑️ 磁盘监听：用户 ${userId} 头像目录被删，已清空 ${nu + nc} 条头像引用`);
      } else if (!info.isDir && (info.sub === 'docs' || info.sub === 'avatars')) {
        // 注意子目录名带点（.docs），classify 里已去掉点，这里还原
        const base = path.basename(absPath);
        const dirName = info.sub === 'docs' ? '.docs' : 'avatars';
        const expected = `@userdata:${userDirName(userId)}/${dirName}/${base}`;
        if (info.sub === 'docs') {
          const n = db.prepare('UPDATE file_library_files SET content_path = ? WHERE user_id = ? AND is_deleted = 0 AND content_path = ?').run('', userId, expected).changes;
          if (n) console.log(`🗑️ 磁盘监听：正文 ${base} 被删，已清空引用（${n} 条）`);
        } else {
          const nu = db.prepare('UPDATE users SET avatar_path = ? WHERE id = ? AND avatar_path = ?').run('', userId, expected).changes;
          const nc = db.prepare('UPDATE characters SET avatar_path = ? WHERE user_id = ? AND avatar_path = ?').run('', userId, expected).changes;
          if (nu || nc) console.log(`🗑️ 磁盘监听：头像 ${base} 被删，已清空引用（${nu + nc} 条）`);
        }
      }
    }
  } catch (e) {
    console.warn('磁盘监听处理失败:', e.message);
  }
}

function __watchDir(rootDir) {
  try {
    if (!fs.existsSync(rootDir)) return null;
    const watcher = fs.watch(rootDir, { recursive: true }, (eventType, filename) => {
      if (__diskWatchPaused) return; // 改名 / 迁移期间挂起，避免把内部移动误判为删除
      if (eventType !== 'rename' || !filename) return; // 仅关心删除（rename 事件且文件已不存在）；忽略改动与新增
      const abs = join(rootDir, filename);
      if (fs.existsSync(abs)) return; // 新增 / 改名后的目标文件：仍存在 → 忽略（无法判定分类，不自动入库）
      __pendingDeletes.set(abs, 1);
      if (__diskSyncTimer) clearTimeout(__diskSyncTimer);
      __diskSyncTimer = setTimeout(() => {
        const batch = [...__pendingDeletes.keys()];
        __pendingDeletes.clear();
        __diskSyncTimer = null;
        for (const p of batch) __handleDeleted(p);
      }, 400);
    });
    watcher.on('error', (e) => console.warn('磁盘监听异常:', e.message));
    return watcher;
  } catch (e) {
    console.warn('启动磁盘监听失败（目录可能不支持递归监听）:', rootDir, e.message);
    return null;
  }
}

// 启动全量对账：把「数据库有、磁盘已没」的文件移入回收站（覆盖服务离线期间的手动删除）
function __startupReconcile() {
  try {
    const users = db.prepare("SELECT DISTINCT user_id FROM file_library_files WHERE is_deleted = 0 AND file_path <> '' AND file_path NOT LIKE '@userdata:%'").all();
    let softDeleted = 0;
    for (const u of users) {
      const userId = u.user_id;
      const userGalDir = join(GALLERY_DIR, String(userId));
      if (!fs.existsSync(userGalDir)) {
        const rows = db.prepare("SELECT id FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND file_path <> '' AND file_path NOT LIKE '@userdata:%'").all(userId);
        if (rows.length) {
          const now = new Date().toISOString();
          db.prepare("UPDATE file_library_files SET is_deleted = 1, deleted_at = ? WHERE user_id = ? AND is_deleted = 0 AND file_path <> '' AND file_path NOT LIKE '@userdata:%'").run(now, userId);
          softDeleted += rows.length;
        }
        continue;
      }
      const onDisk = new Set();
      try {
        for (const f of fs.readdirSync(userGalDir)) {
          try { if (fs.statSync(join(userGalDir, f)).isFile()) onDisk.add(f); } catch {}
        }
      } catch {}
      const rows = db.prepare("SELECT id, file_path FROM file_library_files WHERE user_id = ? AND is_deleted = 0 AND file_path <> '' AND file_path NOT LIKE '@userdata:%'").all(userId);
      const now = new Date().toISOString();
      const tx = db.transaction(() => {
        for (const r of rows) {
          if (!onDisk.has(path.basename(r.file_path))) {
            db.prepare('UPDATE file_library_files SET is_deleted = 1, deleted_at = ? WHERE id = ?').run(now, r.id);
            softDeleted++;
          }
        }
      });
      tx();
    }
    if (softDeleted) console.log(`🔄 启动对账：发现 ${softDeleted} 个磁盘缺失的文件，已移入回收站`);
  } catch (e) {
    console.warn('启动对账失败:', e.message);
  }
}

// 阶段5：盘符镜像区对账 —— 服务离线期间在资源管理器里删掉的文件，启动时补进回收站。
// 只核对 <用户>/<盘符>/… 这类镜像路径，不动 .thumbs / .docs / avatars sidecar。
function __startupReconcileMirror() {
  try {
    const rows = db.prepare("SELECT id, file_path, content_path FROM file_library_files WHERE is_deleted = 0 AND (file_path LIKE '@userdata:%' OR content_path LIKE '@userdata:%')").all();
    const now = new Date().toISOString();
    let n = 0;
    const tx = db.transaction(() => {
      for (const r of rows) {
        let gone = false;
        for (const key of ['file_path', 'content_path']) {
          const v = r[key];
          if (!v || !v.startsWith('@userdata:')) continue;
          const rel = v.slice('@userdata:'.length);
          if (!isMirrorRel(rel)) continue;
          const abs = join(USER_DATA_DIR, ...rel.split('/'));
          if (!fs.existsSync(abs)) { gone = true; break; }
        }
        if (gone) {
          db.prepare('UPDATE file_library_files SET is_deleted = 1, deleted_at = ? WHERE id = ?').run(now, r.id);
          n++;
        }
      }
    });
    tx();
    if (n) console.log(`🔄 启动对账（盘符镜像）：发现 ${n} 个磁盘缺失的文件，已移入回收站`);
  } catch (e) {
    console.warn('盘符镜像对账失败:', e.message);
  }
}

// 清理过期的磁盘回收站（默认 14 天），防止 .trash 无限膨胀
function __pruneTrash(days = 14) {
  try {
    const trashRoot = join(__dirname, '.trash');
    if (!fs.existsSync(trashRoot)) return;
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    let removed = 0, freed = 0;
    for (const userDir of fs.readdirSync(trashRoot)) {
      const ud = join(trashRoot, userDir);
      let st; try { st = fs.statSync(ud); } catch { continue; }
      if (!st.isDirectory()) continue;
      for (const f of fs.readdirSync(ud)) {
        const fp = join(ud, f);
        try {
          const s = fs.statSync(fp);
          if (s.mtimeMs < cutoff) { fs.unlinkSync(fp); removed++; freed += s.size; }
        } catch {}
      }
      try { if (fs.readdirSync(ud).length === 0) fs.rmdirSync(ud); } catch {}
    }
    if (removed) console.log(`🧹 回收站清理：删除 ${removed} 个超过 ${days} 天的文件，释放 ${(freed / 1048576).toFixed(1)} MB`);
  } catch (e) {
    console.warn('回收站清理失败:', e.message);
  }
}

// 启动磁盘反向监听 + 对账 + 回收站清理（在 api-server 启动后调用一次）
export function initDiskSync() {
  if (__diskSyncStarted) return;
  __diskSyncStarted = true;
  try {
    __startupReconcile();
    __startupReconcileMirror(); // 阶段5：必须在补建目录之前，否则缺失会被当成"还没建"
    __pruneTrash(14);
  } catch (e) { /* 不影响主服务 */ }
  __watchDir(GALLERY_DIR);
  __watchDir(USER_DATA_DIR);
  // 阶段5：按数据库结构补齐 C/ D/ E/ … 盘符目录与文件夹层级
  try { ensureMirrorTree(); } catch {}
  console.log('👁️ 已启动磁盘反向监听（gallery / user_data）：硬盘删除将同步进回收站');
}
