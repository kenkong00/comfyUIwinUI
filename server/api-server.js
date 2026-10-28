import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import crypto from 'crypto';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import db, { authAPI, userAPI, characterAPI, configAPI, conversationAPI, conversationCategoryAPI, imageAPI, workflowCategoryAPI, workflowAPIAPI, batchJobAPI, storyboardCategoryAPI, storyboardJsonAPI, generationTaskAPI, taskCategoryAPI, ruleCategoryAPI, ruleAPI, teamAPI, galleryCategoryAPI, galleryImageAPI, characterCategoryAPI, teamCategoryAPI, aiConfigCategoryAPI, aiConfigAPI, comfyuiConfigCategoryAPI, comfyuiConfigAPI, promptCategoryAPI, promptAPI, fileLibraryCategoryAPI, fileLibraryFolderAPI, fileLibraryFileAPI, fileLibraryTagAPI, fileLibraryPasteAPI, fileLibraryRecycleAPI, fileLibraryTagCategoryAPI, functionCategoryAPI, functionAPI, accountAPI, resolveStoredPath, saveThumbSidecar, initDiskSync } from './database.js';
import { schemesRouter as uiSchemesRouter, assetsRouter as uiAssetsRouter, categoriesRouter as uiCategoriesRouter, templatesRouter as uiTemplatesRouter, uploadsDir as uiUploadsDir, uiDb as uiDbConn } from './ui-system.js';
import { mountPlugins, installPluginRoutes } from './plugin-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 文件库图片磁盘存储根目录（与 database.js 的 GALLERY_DIR 一致：server/gallery）
const GALLERY_DIR = join(__dirname, 'gallery');
if (!fs.existsSync(GALLERY_DIR)) fs.mkdirSync(GALLERY_DIR, { recursive: true });

// 用户数据目录（生成图的落盘位置）：server/user_data
// 与 database.js 一致，支持 STORAGE_ROOT 环境变量 / server/.env 指向更大硬盘 / NAS。
const USER_DATA_DIR = (() => {
  try {
    const root = String(process.env.STORAGE_ROOT || '').trim();
    if (root) {
      const abs = require('path').resolve(root);
      if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
      return abs;
    }
  } catch (e) { /* 回退默认 */ }
  const def = join(__dirname, 'user_data');
  if (!fs.existsSync(def)) fs.mkdirSync(def, { recursive: true });
  return def;
})();

// 登记到 DB 时只存「相对 user_data 的路径」，不存绝对路径。
// 之前存的是 I:\xxx\server\user_data\... 这种带盘符的绝对路径，
// 项目换到别的盘 / 别的电脑后大图就全部 404（只剩缩略图能看）。
function userDataRef(absPath) {
  const abs = String(absPath || '');
  if (!abs) return '';
  const rel = relative(USER_DATA_DIR, abs).replace(/\\/g, '/');
  if (rel && !rel.startsWith('..') && !/^[A-Za-z]:/.test(rel)) return `@userdata:${rel}`;
  return `@userdata:${abs}`;
}

const app = express();
const PORT = 3007;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// ============================================
// JWT 认证中间件
// ============================================
const JWT_SECRET = 'ai-character-platform-local-secret-2024';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ success: false, error: '未提供认证令牌，请先登录' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch {
    return res.status(401).json({ success: false, error: '认证令牌无效或已过期，请重新登录' });
  }
}

// 可选认证中间件（有 token 就解析，没有也放行）
function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
      req.username = decoded.username;
    } catch { /* ignore */ }
  }
  next();
}

// ============================================
// 认证路由（无需 token）
// ============================================
const authRouter = express.Router();

authRouter.post('/register', (req, res) => authAPI.register(req, res));
authRouter.post('/login', (req, res) => authAPI.login(req, res));
authRouter.post('/verify', (req, res) => authAPI.verifyToken(req, res));
authRouter.post('/logout', (req, res) => authAPI.logout(req, res));

app.use('/api/auth', authRouter);

// ============================================
// 用户信息路由
// ============================================
const userRouter = express.Router();
userRouter.use(authMiddleware);

userRouter.get('/me', (req, res) => userAPI.getCurrentUser(req, res));
userRouter.put('/profile', (req, res) => userAPI.updateProfile(req, res));
userRouter.post('/change-password', (req, res) => userAPI.changePassword(req, res));

app.use('/api/user', userRouter);

// ============================================
// 角色管理路由
// ============================================
const characterRouter = express.Router();
characterRouter.use(authMiddleware);

characterRouter.get('/', (req, res) => characterAPI.getAll(req, res));
characterRouter.get('/:id', (req, res) => characterAPI.getById(req, res));
characterRouter.post('/', (req, res) => characterAPI.create(req, res));
characterRouter.put('/:id', (req, res) => characterAPI.update(req, res));
characterRouter.delete('/:id', (req, res) => characterAPI.delete(req, res));
characterRouter.post('/import', (req, res) => characterAPI.importBatch(req, res));
characterRouter.get('/export/all', (req, res) => characterAPI.exportAll(req, res));

app.use('/api/characters', characterRouter);

// ============================================
// 配置管理路由
// ============================================
const configRouter = express.Router();
configRouter.use(authMiddleware);

configRouter.get('/', (req, res) => configAPI.get(req, res));
configRouter.post('/', (req, res) => configAPI.save(req, res));

app.use('/api/configs', configRouter);

// ============================================
// 对话管理路由
// ============================================
const conversationRouter = express.Router();
conversationRouter.use(authMiddleware);

conversationRouter.get('/', (req, res) => conversationAPI.getAll(req, res));
conversationRouter.get('/:id', (req, res) => conversationAPI.getById(req, res));
conversationRouter.post('/', (req, res) => conversationAPI.create(req, res));
conversationRouter.put('/:id', (req, res) => conversationAPI.update(req, res));
conversationRouter.delete('/:id', (req, res) => conversationAPI.delete(req, res));

app.use('/api/conversations', conversationRouter);

// ============================================
// 对话分类路由
// ============================================
const conversationCategoryRouter = express.Router();
conversationCategoryRouter.use(authMiddleware);

conversationCategoryRouter.get('/', (req, res) => conversationCategoryAPI.getAll(req, res));
conversationCategoryRouter.post('/', (req, res) => conversationCategoryAPI.create(req, res));
conversationCategoryRouter.put('/:id', (req, res) => conversationCategoryAPI.update(req, res));
conversationCategoryRouter.delete('/:id', (req, res) => conversationCategoryAPI.delete(req, res));

app.use('/api/conversation-categories', conversationCategoryRouter);

// ============================================
// 图片管理路由
// ============================================
const imageRouter = express.Router();
imageRouter.use(authMiddleware);

imageRouter.get('/', (req, res) => imageAPI.getAll(req, res));
imageRouter.post('/', (req, res) => imageAPI.create(req, res));
imageRouter.delete('/:id', (req, res) => imageAPI.delete(req, res));

app.use('/api/images', imageRouter);

// ============================================
// Workflow 分类路由
// ============================================
const workflowCategoryRouter = express.Router();
workflowCategoryRouter.use(authMiddleware);

workflowCategoryRouter.get('/', (req, res) => workflowCategoryAPI.getAll(req, res));
workflowCategoryRouter.post('/', (req, res) => workflowCategoryAPI.create(req, res));
workflowCategoryRouter.put('/:id', (req, res) => workflowCategoryAPI.update(req, res));
workflowCategoryRouter.delete('/:id', (req, res) => workflowCategoryAPI.delete(req, res));

app.use('/api/workflow-categories', workflowCategoryRouter);

// ============================================
// Workflow API 路由
// ============================================
const workflowAPIRouter = express.Router();
workflowAPIRouter.use(authMiddleware);

workflowAPIRouter.get('/', (req, res) => workflowAPIAPI.getAll(req, res));
workflowAPIRouter.get('/:id', (req, res) => workflowAPIAPI.getById(req, res));
workflowAPIRouter.post('/', (req, res) => workflowAPIAPI.create(req, res));
workflowAPIRouter.put('/:id', (req, res) => workflowAPIAPI.update(req, res));
workflowAPIRouter.delete('/:id', (req, res) => workflowAPIAPI.delete(req, res));
workflowAPIRouter.post('/batch-delete', (req, res) => workflowAPIAPI.batchDelete(req, res));
workflowAPIRouter.post('/batch-category', (req, res) => workflowAPIAPI.batchCategory(req, res));

app.use('/api/workflow-apis', workflowAPIRouter);

// ============================================
// 批量生成任务路由
// ============================================
const batchJobRouter = express.Router();
batchJobRouter.use(authMiddleware);

batchJobRouter.get('/', (req, res) => batchJobAPI.getAll(req, res));
batchJobRouter.get('/:id', (req, res) => batchJobAPI.getById(req, res));
batchJobRouter.post('/', (req, res) => batchJobAPI.create(req, res));
batchJobRouter.put('/:id', (req, res) => batchJobAPI.update(req, res));
batchJobRouter.delete('/:id', (req, res) => batchJobAPI.delete(req, res));

app.use('/api/batch-jobs', batchJobRouter);

// ============================================
// 分镜JSON分类路由
// ============================================
const storyboardCategoryRouter = express.Router();
storyboardCategoryRouter.use(authMiddleware);

storyboardCategoryRouter.get('/', (req, res) => storyboardCategoryAPI.getAll(req, res));
storyboardCategoryRouter.post('/', (req, res) => storyboardCategoryAPI.create(req, res));
storyboardCategoryRouter.put('/:id', (req, res) => storyboardCategoryAPI.update(req, res));
storyboardCategoryRouter.delete('/:id', (req, res) => storyboardCategoryAPI.delete(req, res));

app.use('/api/storyboard-categories', storyboardCategoryRouter);

// ============================================
// 分镜JSON文件路由
// ============================================
const storyboardJsonRouter = express.Router();
storyboardJsonRouter.use(authMiddleware);

storyboardJsonRouter.get('/', (req, res) => storyboardJsonAPI.getAll(req, res));
storyboardJsonRouter.get('/:id', (req, res) => storyboardJsonAPI.getById(req, res));
storyboardJsonRouter.post('/', (req, res) => storyboardJsonAPI.create(req, res));
storyboardJsonRouter.put('/:id', (req, res) => storyboardJsonAPI.update(req, res));
storyboardJsonRouter.delete('/:id', (req, res) => storyboardJsonAPI.delete(req, res));
storyboardJsonRouter.post('/batch-delete', (req, res) => storyboardJsonAPI.batchDelete(req, res));
storyboardJsonRouter.post('/batch-category', (req, res) => storyboardJsonAPI.batchCategory(req, res));
storyboardJsonRouter.post('/batch-validate', (req, res) => storyboardJsonAPI.batchValidate(req, res));

app.use('/api/storyboard-jsons', storyboardJsonRouter);

// ============================================
// 生成任务路由
// ============================================
const generationTaskRouter = express.Router();
generationTaskRouter.use(authMiddleware);

generationTaskRouter.get('/', (req, res) => generationTaskAPI.getAll(req, res));
generationTaskRouter.get('/:id', (req, res) => generationTaskAPI.getById(req, res));
generationTaskRouter.post('/', (req, res) => generationTaskAPI.create(req, res));
generationTaskRouter.put('/:id', (req, res) => generationTaskAPI.update(req, res));
generationTaskRouter.delete('/:id', (req, res) => generationTaskAPI.delete(req, res));
generationTaskRouter.post('/batch-delete', (req, res) => generationTaskAPI.batchDelete(req, res));
generationTaskRouter.post('/batch-category', (req, res) => generationTaskAPI.batchCategory(req, res));
generationTaskRouter.post('/batch-review', (req, res) => generationTaskAPI.batchReview(req, res));
generationTaskRouter.post('/batch-sort', (req, res) => generationTaskAPI.batchSort(req, res));
generationTaskRouter.post('/:id/review', (req, res) => generationTaskAPI.review(req, res));
generationTaskRouter.post('/:id/unreview', (req, res) => generationTaskAPI.unreview(req, res));
generationTaskRouter.post('/:id/complete', (req, res) => generationTaskAPI.complete(req, res));
generationTaskRouter.post('/:id/progress', (req, res) => generationTaskAPI.updateProgress(req, res));
// 批量任务完成后自动保存到文件库（在总库下以任务名为文件夹名）
generationTaskRouter.post('/:id/save-to-library', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { results, comfyuiUrl } = req.body || {};
    const userId = req.userId;
    if (!userId) return res.status(401).json({ success: false, error: '未认证用户' });
    if (!Array.isArray(results) || results.length === 0) {
      return res.json({ success: true, savedCount: 0, message: '无可保存的结果' });
    }

    // 1. 获取任务（用于拿 name）
    const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!task) return res.status(404).json({ success: false, error: '任务不存在' });
    const taskName = (task.name || `task_${taskId}`).trim() || `task_${taskId}`;

    // 2+3. 目标目录：任务携带 target_folder_id / target_category_id 时（右键一键生成），
    //       图片直接落到该目录；否则兜底 = 权威总库 + 以任务名命名的顶级文件夹
    //       （权威总库必须 ORDER BY id —— 库里曾有 9 个重名"总库"，不加排序会挂到幽灵总库）
    let categoryId = null;
    let folderId = null;
    if (task.target_folder_id) {
      const frow = db.prepare('SELECT id, category_id FROM file_library_folders WHERE id = ? AND user_id = ?').get(task.target_folder_id, userId);
      if (frow) { folderId = frow.id; categoryId = frow.category_id; }
    }
    if (!categoryId && task.target_category_id) {
      const crow = db.prepare('SELECT id FROM file_library_categories WHERE id = ? AND user_id = ?').get(task.target_category_id, userId);
      if (crow) categoryId = crow.id;
    }
    if (!categoryId) {
      let cat = db.prepare("SELECT id FROM file_library_categories WHERE user_id = ? AND is_system = 1 ORDER BY id LIMIT 1").get(userId);
      if (!cat) {
        const r = db.prepare("INSERT INTO file_library_categories (user_id, name, is_system, sort_order) VALUES (?, '总库', 1, 0)").run(userId);
        cat = { id: r.lastInsertRowid };
      }
      categoryId = cat.id;
    }
    if (!folderId) {
      let folder = db.prepare("SELECT id, name FROM file_library_folders WHERE user_id = ? AND category_id = ? AND parent_id IS NULL AND name = ?").get(userId, categoryId, taskName);
      if (!folder) {
        const r = db.prepare("INSERT INTO file_library_folders (user_id, category_id, parent_id, name, is_callable, sort_order) VALUES (?, ?, NULL, ?, 0, 0)").run(userId, categoryId, taskName);
        folder = { id: r.lastInsertRowid, name: taskName };
      }
      folderId = folder.id;
    }

    // 4. 遍历 results：拉取图片 → base64 → 写入文件库
    const baseUrl = (comfyuiUrl || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const userDir = join(GALLERY_DIR, String(userId));
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

    let savedCount = 0;
    let skippedCount = 0;
    const errors = [];
    for (const item of results) {
      try {
        const itemUrl = item.url || '';
        if (!itemUrl) continue;

        // 文件名（去掉扩展名）
        const baseName = (item.filename || `image_${Date.now()}`).replace(/\.[^.]+$/, '');

        // 去重检查：通过 folder_id + name 检查是否已存在
        const existing = db.prepare("SELECT id FROM file_library_files WHERE folder_id IS ? AND name = ?").get(folderId, baseName);
        if (existing) {
          skippedCount++;
          continue;
        }

        // 构建可拉取的 URL：
        // - 相对 URL（/api/view?...）只对浏览器代理源有效，而代理指向【本地 ComfyUI】。
        //   必须用本地地址拉取 —— 任务配置的 comfyuiUrl 可能是远程实例（如 CNB，带认证
        //   会 401）或过期地址，拼上去必然失败，造成"文件夹建了但一张图都没存进去"。
        // - blob: 开头的是浏览器本地对象 URL，服务端拉不到，记入错误。
        let fullUrl = '';
        if (itemUrl.startsWith('http')) {
          fullUrl = itemUrl;
        } else {
          let p = itemUrl;
          if (p.startsWith('/api/view')) p = p.replace('/api', '');
          fullUrl = `http://127.0.0.1:8188${p}`;
        }
        if (itemUrl.startsWith('blob:')) { errors.push(`${item.filename}: blob URL 无法在服务端拉取`); continue; }
        const resp = await fetch(fullUrl);
        if (!resp.ok) { errors.push(`${item.filename}: HTTP ${resp.status}`); continue; }
        const ab = await resp.arrayBuffer();
        const buf = Buffer.from(ab);
        // 推断格式
        const lowerName = (item.filename || 'image.png').toLowerCase();
        let format = 'png';
        if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) format = 'jpg';
        else if (lowerName.endsWith('.webp')) format = 'webp';
        else if (lowerName.endsWith('.gif')) format = 'gif';
        else if (lowerName.endsWith('.mp4')) format = 'mp4';
        else if (lowerName.endsWith('.webm')) format = 'webm';
        const isVideo = !!item.isVideo || ['mp4', 'webm', 'gif'].includes(format);
        const fileType = isVideo ? 'video' : 'image';

        // 写入磁盘
        const uuid = crypto.randomUUID();
        const diskPath = join(userDir, `${uuid}.${format}`);
        fs.writeFileSync(diskPath, buf);

        // 缩略图不再以 base64 存库，改为落盘 sidecar（见下方写入 thumbnail_path）
        // 写入数据库（file_path 必须包含 userId/ 前缀，与 getFile 路由的查找路径一致）
        const info = db.prepare(`INSERT INTO file_library_files
          (user_id, category_id, folder_id, name, file_type, filename, file_path, thumbnail_data, thumbnail_path, width, height, format, file_size, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          userId, categoryId, folderId, baseName, fileType,
          item.filename || `${uuid}.${format}`, `${userId}/${uuid}.${format}`,
          '', null, null, null, format, buf.length,
          item.prompt || '', new Date().toISOString(), new Date().toISOString()
        );
        const newId = info.lastInsertRowid;
        // 缩略图外置到磁盘 sidecar（优先用前端压缩 thumbnail，否则复制原图）
        if (!isVideo) {
          const tp = saveThumbSidecar(userId, newId, format, item.thumbnail || null, diskPath);
          if (tp) db.prepare('UPDATE file_library_files SET thumbnail_path = ? WHERE id = ?').run(tp, newId);
        }
        savedCount++;
      } catch (e) {
        errors.push(`${item.filename || 'unknown'}: ${e.message}`);
      }
    }

    res.json({ success: true, savedCount, skippedCount, totalResults: results.length, errors, folderName: taskName, folderId, categoryId });
  } catch (e) {
    console.error('保存到文件库失败:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// 注册已保存到用户目录的文件到文件库（不复制文件，仅创建DB记录）
// 前端通过 saveImageToDirectory 保存图片到 user_data 目录后调用此端点
// ============================================
generationTaskRouter.post('/:id/register-to-library', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { results } = req.body || {};
    const userId = req.userId;
    if (!userId) return res.status(401).json({ success: false, error: '未认证用户' });
    if (!Array.isArray(results) || results.length === 0) {
      return res.json({ success: true, savedCount: 0, message: '无可注册的结果' });
    }

    // 1. 获取任务名
    const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!task) return res.status(404).json({ success: false, error: '任务不存在' });
    const taskName = (task.name || `task_${taskId}`).trim() || `task_${taskId}`;

    // 2+3. 目标目录（同 save-to-library：任务 target_* 优先，兜底 权威总库 + 任务名文件夹）
    let categoryId = null;
    let folderId = null;
    if (task.target_folder_id) {
      const frow = db.prepare('SELECT id, category_id FROM file_library_folders WHERE id = ? AND user_id = ?').get(task.target_folder_id, userId);
      if (frow) { folderId = frow.id; categoryId = frow.category_id; }
    }
    if (!categoryId && task.target_category_id) {
      const crow = db.prepare('SELECT id FROM file_library_categories WHERE id = ? AND user_id = ?').get(task.target_category_id, userId);
      if (crow) categoryId = crow.id;
    }
    if (!categoryId) {
      let cat = db.prepare("SELECT id FROM file_library_categories WHERE user_id = ? AND is_system = 1 ORDER BY id LIMIT 1").get(userId);
      if (!cat) {
        const r = db.prepare("INSERT INTO file_library_categories (user_id, name, is_system, sort_order) VALUES (?, '总库', 1, 0)").run(userId);
        cat = { id: r.lastInsertRowid };
      }
      categoryId = cat.id;
    }
    if (!folderId) {
      let folder = db.prepare("SELECT id, name FROM file_library_folders WHERE user_id = ? AND category_id = ? AND parent_id IS NULL AND name = ?").get(userId, categoryId, taskName);
      if (!folder) {
        const r = db.prepare("INSERT INTO file_library_folders (user_id, category_id, parent_id, name, is_callable, sort_order) VALUES (?, ?, NULL, ?, 0, 0)").run(userId, categoryId, taskName);
        folder = { id: r.lastInsertRowid, name: taskName };
      }
      folderId = folder.id;
    }

    // 4. 遍历 results：为已保存到用户目录的文件创建DB记录（不复制文件）
    let savedCount = 0;
    let skippedCount = 0;
    const errors = [];
    for (const item of results) {
      try {
        const savedPath = item.savedPath || '';
        if (!savedPath) continue;

        // 文件名（去掉扩展名）
        const baseName = (item.filename || `image_${Date.now()}`).replace(/\.[^.]+$/, '');

        // 去重检查
        const existing = db.prepare("SELECT id FROM file_library_files WHERE folder_id IS ? AND name = ?").get(folderId, baseName);
        if (existing) {
          skippedCount++;
          continue;
        }

        // 推断格式
        const lowerName = (item.filename || 'image.png').toLowerCase();
        let format = 'png';
        if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) format = 'jpg';
        else if (lowerName.endsWith('.webp')) format = 'webp';
        else if (lowerName.endsWith('.gif')) format = 'gif';
        else if (lowerName.endsWith('.mp4')) format = 'mp4';
        else if (lowerName.endsWith('.webm')) format = 'webm';
        const isVideo = !!item.isVideo || ['mp4', 'webm', 'gif'].includes(format);
        const fileType = isVideo ? 'video' : 'image';

        // 缩略图不再以 base64 存库，改为落盘 sidecar（见下方写入 thumbnail_path）

        // 获取文件大小
        let fileSize = 0;
        try {
          if (fs.existsSync(savedPath)) {
            fileSize = fs.statSync(savedPath).size;
          }
        } catch (e) { /* ignore */ }

        // file_path 使用 @userdata: 前缀标记为用户目录文件，避免与 GALLERY_DIR 相对路径混淆；
        // 只存相对 user_data 的路径，保证换电脑 / 换盘符后仍能读到大图
        const filePath = userDataRef(savedPath);

        const info = db.prepare(`INSERT INTO file_library_files
          (user_id, category_id, folder_id, name, file_type, filename, file_path, thumbnail_data, thumbnail_path, width, height, format, file_size, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          userId, categoryId, folderId, baseName, fileType,
          item.filename || baseName, filePath,
          '', null, null, null, format, fileSize,
          item.prompt || '', new Date().toISOString(), new Date().toISOString()
        );
        const newId = info.lastInsertRowid;
        // 缩略图外置到磁盘 sidecar（优先用前端压缩 thumbnail，否则复制原图）
        if (!isVideo) {
          const tp = saveThumbSidecar(userId, newId, format, item.thumbnail || null, savedPath);
          if (tp) db.prepare('UPDATE file_library_files SET thumbnail_path = ? WHERE id = ?').run(tp, newId);
        }
        savedCount++;
      } catch (e) {
        errors.push(`${item.filename || 'unknown'}: ${e.message}`);
      }
    }

    res.json({ success: true, savedCount, skippedCount, totalResults: results.length, errors, folderName: taskName, folderId, categoryId });
  } catch (e) {
    console.error('注册到文件库失败:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// 前端直传生成结果到文件库（首选链路）
// 背景：远程 ComfyUI（如 CNB 实例）带认证，服务端直连拉图会 401；
// 浏览器通过本地代理一定能拿到图 —— 因此由前端把图片 base64 直传，
// 服务端只负责落盘 + 登记 DB。
// 磁盘布局（按账号可查）：server/user_data/<用户名>/downloads/<yyyyMMdd>/<任务名>/<文件名>
// DB 登记：总库(C:)/<任务名>/ 下创建记录，file_path 用 @userdata: 前缀指向磁盘文件，
// description 存该图对应的提示词。
// ============================================
generationTaskRouter.post('/:id/upload-to-library', async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { results } = req.body || {};
    const userId = req.userId;
    if (!userId) return res.status(401).json({ success: false, error: '未认证用户' });
    if (!Array.isArray(results) || results.length === 0) {
      return res.json({ success: true, savedCount: 0, message: '无可保存的结果' });
    }

    // 1. 任务与用户名
    const task = db.prepare('SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?').get(taskId, userId);
    if (!task) return res.status(404).json({ success: false, error: '任务不存在' });
    const taskName = (task.name || `task_${taskId}`).trim() || `task_${taskId}`;
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
    const username = (user && user.username) || 'unknown';

    // 2. 目标目录（同 save-to-library：任务 target_* 优先，兜底 权威总库 + 任务名文件夹）
    let categoryId = null;
    let folderId = null;
    if (task.target_folder_id) {
      const frow = db.prepare('SELECT id, category_id FROM file_library_folders WHERE id = ? AND user_id = ?').get(task.target_folder_id, userId);
      if (frow) { folderId = frow.id; categoryId = frow.category_id; }
    }
    if (!categoryId && task.target_category_id) {
      const crow = db.prepare('SELECT id FROM file_library_categories WHERE id = ? AND user_id = ?').get(task.target_category_id, userId);
      if (crow) categoryId = crow.id;
    }
    if (!categoryId) {
      let cat = db.prepare("SELECT id FROM file_library_categories WHERE user_id = ? AND is_system = 1 ORDER BY id LIMIT 1").get(userId);
      if (!cat) {
        const r = db.prepare("INSERT INTO file_library_categories (user_id, name, is_system, sort_order) VALUES (?, '总库', 1, 0)").run(userId);
        cat = { id: r.lastInsertRowid };
      }
      categoryId = cat.id;
    }
    if (!folderId) {
      let folder = db.prepare("SELECT id FROM file_library_folders WHERE user_id = ? AND category_id = ? AND parent_id IS NULL AND name = ?").get(userId, categoryId, taskName);
      if (!folder) {
        const r = db.prepare("INSERT INTO file_library_folders (user_id, category_id, parent_id, name, is_callable, sort_order) VALUES (?, ?, NULL, ?, 0, 0)").run(userId, categoryId, taskName);
        folder = { id: r.lastInsertRowid };
      }
      folderId = folder.id;
    }

    // 3. 磁盘目标目录：user_data/<用户名>/downloads/<当天日期>/<任务名>/
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateDir = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const sanitize = (s) => String(s || '').replace(/[\/\\]/g, '_').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\-\.]/g, '').trim();
    const targetDir = join(__dirname, 'user_data', sanitize(username), 'downloads', dateDir, sanitize(taskName));
    fs.mkdirSync(targetDir, { recursive: true });

    let savedCount = 0;
    let skippedCount = 0;
    const errors = [];
    const saved = [];
    for (const item of results) {
      try {
        const dataBase64 = item.dataBase64 || '';
        if (!dataBase64) { errors.push(`${item.filename || 'unknown'}: 无图片数据`); continue; }
        const m = dataBase64.match(/^data:[^;]+;base64,(.+)$/);
        const buf = Buffer.from(m ? m[1] : dataBase64, 'base64');
        if (!buf.length) { errors.push(`${item.filename || 'unknown'}: 图片数据为空`); continue; }

        const baseName = (item.filename || `image_${Date.now()}`).replace(/\.[^.]+$/, '');

        // 去重：同文件夹同名跳过
        const existing = db.prepare("SELECT id FROM file_library_files WHERE folder_id IS ? AND name = ?").get(folderId, baseName);
        if (existing) { skippedCount++; continue; }

        // 格式
        const lowerName = (item.filename || 'image.png').toLowerCase();
        let format = 'png';
        if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) format = 'jpg';
        else if (lowerName.endsWith('.webp')) format = 'webp';
        else if (lowerName.endsWith('.gif')) format = 'gif';
        else if (lowerName.endsWith('.mp4')) format = 'mp4';
        else if (lowerName.endsWith('.webm')) format = 'webm';
        const isVideo = !!item.isVideo || ['mp4', 'webm', 'gif'].includes(format);
        const fileType = isVideo ? 'video' : 'image';

        const filename = item.filename || `${baseName}.${format}`;
        const absPath = join(targetDir, filename);
        fs.writeFileSync(absPath, buf);

        const thumbnailData = (!isVideo && item.thumbnail) ? item.thumbnail : null;
        db.prepare(`INSERT INTO file_library_files
          (user_id, category_id, folder_id, name, file_type, filename, file_path, thumbnail_data, width, height, format, file_size, description, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          userId, categoryId, folderId, baseName, fileType,
          filename, userDataRef(absPath),
          thumbnailData, null, null, format, buf.length,
          item.prompt || '', new Date().toISOString(), new Date().toISOString()
        );
        savedCount++;
        saved.push(absPath);
      } catch (e) {
        errors.push(`${item.filename || 'unknown'}: ${e.message}`);
      }
    }

    res.json({ success: true, savedCount, skippedCount, totalResults: results.length, errors, saved, savedDir: targetDir, folderId, categoryId });
  } catch (e) {
    console.error('直传保存到文件库失败:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.use('/api/generation-tasks', generationTaskRouter);

// ============================================
// 任务分类路由
// ============================================
const taskCategoryRouter = express.Router();
taskCategoryRouter.use(authMiddleware);

taskCategoryRouter.get('/', (req, res) => taskCategoryAPI.getAll(req, res));
taskCategoryRouter.post('/', (req, res) => taskCategoryAPI.create(req, res));
taskCategoryRouter.put('/:id', (req, res) => taskCategoryAPI.update(req, res));
taskCategoryRouter.delete('/:id', (req, res) => taskCategoryAPI.delete(req, res));

app.use('/api/task-categories', taskCategoryRouter);

// ============================================
// 功能库分类路由
// ============================================
const functionCategoryRouter = express.Router();
functionCategoryRouter.use(authMiddleware);

functionCategoryRouter.get('/', (req, res) => functionCategoryAPI.getAll(req, res));
functionCategoryRouter.post('/', (req, res) => functionCategoryAPI.create(req, res));
functionCategoryRouter.put('/:id', (req, res) => functionCategoryAPI.update(req, res));
functionCategoryRouter.delete('/:id', (req, res) => functionCategoryAPI.delete(req, res));

app.use('/api/function-categories', functionCategoryRouter);

// ============================================
// 功能库路由
// ============================================
const functionRouter = express.Router();
functionRouter.use(authMiddleware);

functionRouter.get('/', (req, res) => functionAPI.getAll(req, res));
functionRouter.get('/:id', (req, res) => functionAPI.getById(req, res));
functionRouter.post('/', (req, res) => functionAPI.create(req, res));
functionRouter.put('/:id', (req, res) => functionAPI.update(req, res));
functionRouter.delete('/:id', (req, res) => functionAPI.delete(req, res));
functionRouter.post('/batch-delete', (req, res) => functionAPI.batchDelete(req, res));
functionRouter.post('/batch-category', (req, res) => functionAPI.batchCategory(req, res));
// 批量测试 ComfyUI 连通性（接收 configIds 数组，返回每个配置的连通状态）
functionRouter.post('/batch-test-connection', async (req, res) => {
  try {
    const { configs } = req.body;
    if (!Array.isArray(configs) || configs.length === 0) {
      return res.json({ success: false, error: '请提供配置列表' });
    }
    const results = await Promise.all(configs.map(async (cfg) => {
      const url = cfg.url;
      if (!url) return { id: cfg.id, name: cfg.name, success: false, error: '未配置地址' };
      const testUrl = url.endsWith('/') ? url + 'api/history' : url + '/api/history';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const r = await fetch(testUrl, { method: 'GET', signal: controller.signal });
        clearTimeout(timeout);
        return { id: cfg.id, name: cfg.name, success: r.ok, error: r.ok ? '' : `HTTP ${r.status}` };
      } catch (e) {
        clearTimeout(timeout);
        return { id: cfg.id, name: cfg.name, success: false, error: e.name === 'AbortError' ? '连接超时' : (e.message || '连接失败') };
      }
    }));
    return res.json({ success: true, data: results });
  } catch (e) {
    return res.json({ success: false, error: e.message || '测试失败' });
  }
});

app.use('/api/functions', functionRouter);

// ============================================
// 规则分类路由
// ============================================
const ruleCategoryRouter = express.Router();
ruleCategoryRouter.use(authMiddleware);

ruleCategoryRouter.get('/', (req, res) => ruleCategoryAPI.getAll(req, res));
ruleCategoryRouter.post('/', (req, res) => ruleCategoryAPI.create(req, res));
ruleCategoryRouter.put('/:id', (req, res) => ruleCategoryAPI.update(req, res));
ruleCategoryRouter.delete('/:id', (req, res) => ruleCategoryAPI.delete(req, res));

app.use('/api/rule-categories', ruleCategoryRouter);

// ============================================
// 规则路由
// ============================================
const ruleRouter = express.Router();
ruleRouter.use(authMiddleware);

ruleRouter.get('/', (req, res) => ruleAPI.getAll(req, res));
ruleRouter.get('/:id', (req, res) => ruleAPI.getById(req, res));
ruleRouter.post('/', (req, res) => ruleAPI.create(req, res));
ruleRouter.put('/:id', (req, res) => ruleAPI.update(req, res));
ruleRouter.delete('/:id', (req, res) => ruleAPI.delete(req, res));
ruleRouter.post('/batch-delete', (req, res) => ruleAPI.batchDelete(req, res));
ruleRouter.post('/batch-category', (req, res) => ruleAPI.batchCategory(req, res));
ruleRouter.post('/batch-import', (req, res) => ruleAPI.batchImport(req, res));

app.use('/api/rules', ruleRouter);

// ============================================
// 团队路由
// ============================================
const teamRouter = express.Router();
teamRouter.use(authMiddleware);

teamRouter.get('/', (req, res) => teamAPI.getAll(req, res));
teamRouter.get('/:id', (req, res) => teamAPI.getById(req, res));
teamRouter.post('/', (req, res) => teamAPI.create(req, res));
teamRouter.put('/:id', (req, res) => teamAPI.update(req, res));
teamRouter.delete('/:id', (req, res) => teamAPI.delete(req, res));

app.use('/api/teams', teamRouter);

// ============================================
// 艺术图库分类路由
// ============================================
const galleryCategoryRouter = express.Router();
galleryCategoryRouter.use(authMiddleware);

galleryCategoryRouter.get('/', (req, res) => galleryCategoryAPI.getAll(req, res));
galleryCategoryRouter.post('/', (req, res) => galleryCategoryAPI.create(req, res));
galleryCategoryRouter.put('/:id', (req, res) => galleryCategoryAPI.update(req, res));
galleryCategoryRouter.delete('/:id', (req, res) => galleryCategoryAPI.delete(req, res));

app.use('/api/gallery-categories', galleryCategoryRouter);

// ============================================
// 艺术图库图片路由
// ============================================
const galleryImageRouter = express.Router();
galleryImageRouter.use(authMiddleware);

galleryImageRouter.get('/', (req, res) => galleryImageAPI.getAll(req, res));
galleryImageRouter.get('/:id', (req, res) => galleryImageAPI.getById(req, res));
galleryImageRouter.get('/:id/file', (req, res) => galleryImageAPI.getFile(req, res));
galleryImageRouter.post('/', (req, res) => galleryImageAPI.create(req, res));
galleryImageRouter.put('/:id', (req, res) => galleryImageAPI.update(req, res));
galleryImageRouter.delete('/:id', (req, res) => galleryImageAPI.delete(req, res));
galleryImageRouter.post('/batch-delete', (req, res) => galleryImageAPI.batchDelete(req, res));
galleryImageRouter.post('/batch-category', (req, res) => galleryImageAPI.batchCategory(req, res));

app.use('/api/gallery-images', galleryImageRouter);

// ============================================
// 角色分类路由
// ============================================
const characterCategoryRouter = express.Router();
characterCategoryRouter.use(authMiddleware);

characterCategoryRouter.get('/', (req, res) => characterCategoryAPI.getAll(req, res));
characterCategoryRouter.post('/', (req, res) => characterCategoryAPI.create(req, res));
characterCategoryRouter.put('/:id', (req, res) => characterCategoryAPI.update(req, res));
characterCategoryRouter.delete('/:id', (req, res) => characterCategoryAPI.delete(req, res));

app.use('/api/character-categories', characterCategoryRouter);

// ============================================
// 团队分类路由
// ============================================
const teamCategoryRouter = express.Router();
teamCategoryRouter.use(authMiddleware);

teamCategoryRouter.get('/', (req, res) => teamCategoryAPI.getAll(req, res));
teamCategoryRouter.post('/', (req, res) => teamCategoryAPI.create(req, res));
teamCategoryRouter.put('/:id', (req, res) => teamCategoryAPI.update(req, res));
teamCategoryRouter.delete('/:id', (req, res) => teamCategoryAPI.delete(req, res));

app.use('/api/team-categories', teamCategoryRouter);

// ============================================
// AI 配置分类路由
// ============================================
const aiConfigCategoryRouter = express.Router();
aiConfigCategoryRouter.use(authMiddleware);

aiConfigCategoryRouter.get('/', (req, res) => aiConfigCategoryAPI.getAll(req, res));
aiConfigCategoryRouter.post('/', (req, res) => aiConfigCategoryAPI.create(req, res));
aiConfigCategoryRouter.put('/:id', (req, res) => aiConfigCategoryAPI.update(req, res));
aiConfigCategoryRouter.delete('/:id', (req, res) => aiConfigCategoryAPI.delete(req, res));

app.use('/api/ai-config-categories', aiConfigCategoryRouter);

// ============================================
// AI 配置路由
// ============================================
const aiConfigRouter = express.Router();
aiConfigRouter.use(authMiddleware);

aiConfigRouter.get('/', (req, res) => aiConfigAPI.getAll(req, res));
aiConfigRouter.get('/active', (req, res) => aiConfigAPI.getActive(req, res));
aiConfigRouter.get('/:id', (req, res) => aiConfigAPI.getById(req, res));
aiConfigRouter.post('/', (req, res) => aiConfigAPI.create(req, res));
aiConfigRouter.put('/:id', (req, res) => aiConfigAPI.update(req, res));
aiConfigRouter.post('/:id/active', (req, res) => aiConfigAPI.setActive(req, res));
aiConfigRouter.delete('/:id', (req, res) => aiConfigAPI.delete(req, res));
aiConfigRouter.post('/batch-delete', (req, res) => aiConfigAPI.batchDelete(req, res));
aiConfigRouter.post('/batch-category', (req, res) => aiConfigAPI.batchCategory(req, res));
aiConfigRouter.post('/batch-callable', (req, res) => aiConfigAPI.batchSetCallable(req, res));

app.use('/api/ai-configs', aiConfigRouter);

// ============================================
// ComfyUI 配置分类路由
// ============================================
const comfyuiConfigCategoryRouter = express.Router();
comfyuiConfigCategoryRouter.use(authMiddleware);

comfyuiConfigCategoryRouter.get('/', (req, res) => comfyuiConfigCategoryAPI.getAll(req, res));
comfyuiConfigCategoryRouter.post('/', (req, res) => comfyuiConfigCategoryAPI.create(req, res));
comfyuiConfigCategoryRouter.put('/:id', (req, res) => comfyuiConfigCategoryAPI.update(req, res));
comfyuiConfigCategoryRouter.delete('/:id', (req, res) => comfyuiConfigCategoryAPI.delete(req, res));

app.use('/api/comfyui-config-categories', comfyuiConfigCategoryRouter);

// ============================================
// ComfyUI 配置路由
// ============================================
const comfyuiConfigRouter = express.Router();
comfyuiConfigRouter.use(authMiddleware);

comfyuiConfigRouter.get('/', (req, res) => comfyuiConfigAPI.getAll(req, res));
comfyuiConfigRouter.get('/active', (req, res) => comfyuiConfigAPI.getActive(req, res));
// 已激活 ComfyUI 配置的连通状态（服务端代理探测，规避浏览器 CORS 拦截）
comfyuiConfigRouter.get('/active-status', async (req, res) => {
  try {
    // 直接查库取已激活配置（优先当前用户，兜底任意已激活）
    let row = req.userId
      ? db.prepare('SELECT * FROM comfyui_configs WHERE is_active = 1 AND user_id = ? ORDER BY updated_at DESC LIMIT 1').get(req.userId)
      : null;
    if (!row) row = db.prepare('SELECT * FROM comfyui_configs WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1').get();
    if (!row) {
      return res.json({ success: true, connected: false, configured: false, error: '未激活任何 ComfyUI 配置' });
    }
    const base = String(row.comfyui_url || 'http://127.0.0.1:8188').replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const r = await fetch(`${base}/system_stats`, { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);
      res.json({ success: true, configured: true, connected: r.ok, url: base, name: row.name, error: r.ok ? '' : `HTTP ${r.status}` });
    } catch (e) {
      clearTimeout(timeout);
      res.json({ success: true, configured: true, connected: false, url: base, name: row.name, error: e.name === 'AbortError' ? '连接超时' : (e.message || '连接失败') });
    }
  } catch (e) {
    res.json({ success: false, connected: false, configured: false, error: e.message || '检测失败' });
  }
});
comfyuiConfigRouter.get('/active-list', (req, res) => comfyuiConfigAPI.getActiveList(req, res));
comfyuiConfigRouter.get('/:id', (req, res) => comfyuiConfigAPI.getById(req, res));
comfyuiConfigRouter.post('/', (req, res) => comfyuiConfigAPI.create(req, res));
comfyuiConfigRouter.put('/:id', (req, res) => comfyuiConfigAPI.update(req, res));
comfyuiConfigRouter.post('/:id/active', (req, res) => comfyuiConfigAPI.setActive(req, res));
comfyuiConfigRouter.post('/:id/toggle-active', (req, res) => comfyuiConfigAPI.toggleActive(req, res));
comfyuiConfigRouter.delete('/:id', (req, res) => comfyuiConfigAPI.delete(req, res));
comfyuiConfigRouter.post('/batch-delete', (req, res) => comfyuiConfigAPI.batchDelete(req, res));
comfyuiConfigRouter.post('/batch-category', (req, res) => comfyuiConfigAPI.batchCategory(req, res));

app.use('/api/comfyui-configs', comfyuiConfigRouter);

// ============================================
// 提示词分类路由
// ============================================
const promptCategoryRouter = express.Router();
promptCategoryRouter.use(authMiddleware);

promptCategoryRouter.get('/', (req, res) => promptCategoryAPI.getAll(req, res));
promptCategoryRouter.post('/', (req, res) => promptCategoryAPI.create(req, res));
promptCategoryRouter.put('/:id', (req, res) => promptCategoryAPI.update(req, res));
promptCategoryRouter.delete('/:id', (req, res) => promptCategoryAPI.delete(req, res));

app.use('/api/prompt-categories', promptCategoryRouter);

// ============================================
// 提示词路由
// ============================================
const promptRouter = express.Router();
promptRouter.use(authMiddleware);

promptRouter.get('/', (req, res) => promptAPI.getAll(req, res));
promptRouter.get('/:id', (req, res) => promptAPI.getById(req, res));
promptRouter.post('/', (req, res) => promptAPI.create(req, res));
promptRouter.put('/:id', (req, res) => promptAPI.update(req, res));
promptRouter.delete('/:id', (req, res) => promptAPI.delete(req, res));
promptRouter.post('/batch-delete', (req, res) => promptAPI.batchDelete(req, res));
promptRouter.post('/batch-category', (req, res) => promptAPI.batchCategory(req, res));
promptRouter.post('/batch-import', (req, res) => promptAPI.batchImport(req, res));

app.use('/api/prompts', promptRouter);

// ============================================
// 文件库分类路由（硬盘分区）
// ============================================
const fileLibraryCategoryRouter = express.Router();
fileLibraryCategoryRouter.use(authMiddleware);

fileLibraryCategoryRouter.get('/', (req, res) => fileLibraryCategoryAPI.getAll(req, res));
fileLibraryCategoryRouter.post('/', (req, res) => fileLibraryCategoryAPI.create(req, res));
fileLibraryCategoryRouter.put('/:id', (req, res) => fileLibraryCategoryAPI.update(req, res));
fileLibraryCategoryRouter.delete('/:id', (req, res) => fileLibraryCategoryAPI.delete(req, res));

app.use('/api/file-library-categories', fileLibraryCategoryRouter);

// ============================================
// 文件库文件夹路由
// ============================================
const fileLibraryFolderRouter = express.Router();
fileLibraryFolderRouter.use(authMiddleware);

fileLibraryFolderRouter.get('/', (req, res) => fileLibraryFolderAPI.getAll(req, res));
fileLibraryFolderRouter.get('/:id', (req, res) => fileLibraryFolderAPI.getById(req, res));
fileLibraryFolderRouter.post('/', (req, res) => fileLibraryFolderAPI.create(req, res));
fileLibraryFolderRouter.put('/:id', (req, res) => fileLibraryFolderAPI.update(req, res));
fileLibraryFolderRouter.delete('/:id', (req, res) => fileLibraryFolderAPI.delete(req, res));

// 文件库文件夹批量操作路由（在 fileLibraryFolderRouter 中添加）
fileLibraryFolderRouter.post('/batch-delete', (req, res) => fileLibraryFolderAPI.batchDelete(req, res));
fileLibraryFolderRouter.post('/batch-move', (req, res) => fileLibraryFolderAPI.batchMove(req, res));
fileLibraryFolderRouter.post('/copy', (req, res) => fileLibraryFolderAPI.copy(req, res));

app.use('/api/file-library-folders', fileLibraryFolderRouter);

// ============================================
// 文件库文件路由
// ============================================
const fileLibraryFileRouter = express.Router();
fileLibraryFileRouter.use(authMiddleware);

fileLibraryFileRouter.get('/', (req, res) => fileLibraryFileAPI.getAll(req, res));
fileLibraryFileRouter.get('/callable', (req, res) => fileLibraryFileAPI.getCallableFiles(req, res));
fileLibraryFileRouter.get('/folder-path/:id', (req, res) => fileLibraryFileAPI.getFolderPath(req, res));
fileLibraryFileRouter.get('/:id', (req, res) => fileLibraryFileAPI.getById(req, res));
fileLibraryFileRouter.get('/:id/thumb', (req, res) => fileLibraryFileAPI.getThumb(req, res));
fileLibraryFileRouter.get('/:id/file', (req, res) => fileLibraryFileAPI.getFile(req, res));
fileLibraryFileRouter.post('/', (req, res) => fileLibraryFileAPI.create(req, res));
fileLibraryFileRouter.post('/batch-delete', (req, res) => fileLibraryFileAPI.batchDelete(req, res));
fileLibraryFileRouter.post('/batch-move', (req, res) => fileLibraryFileAPI.batchMove(req, res));
fileLibraryFileRouter.post('/copy', (req, res) => fileLibraryFileAPI.copy(req, res));
fileLibraryFileRouter.put('/:id', (req, res) => fileLibraryFileAPI.update(req, res));
fileLibraryFileRouter.delete('/:id', (req, res) => fileLibraryFileAPI.delete(req, res));

app.use('/api/file-library-files', fileLibraryFileRouter);

// ============================================
// 粘贴冲突预检路由
// ============================================
const fileLibraryPasteRouter = express.Router();
fileLibraryPasteRouter.use(authMiddleware);
fileLibraryPasteRouter.post('/conflicts', (req, res) => fileLibraryPasteAPI.conflicts(req, res));
app.use('/api/file-library-paste', fileLibraryPasteRouter);

// ============================================
// 文件库标签路由
// ============================================
const fileLibraryTagRouter = express.Router();
fileLibraryTagRouter.use(authMiddleware);

fileLibraryTagRouter.get('/', (req, res) => fileLibraryTagAPI.getAll(req, res));
fileLibraryTagRouter.post('/', (req, res) => fileLibraryTagAPI.create(req, res));
fileLibraryTagRouter.put('/:id', (req, res) => fileLibraryTagAPI.update(req, res));
fileLibraryTagRouter.delete('/:id', (req, res) => fileLibraryTagAPI.delete(req, res));
fileLibraryTagRouter.post('/tag-file', (req, res) => fileLibraryTagAPI.tagFile(req, res));
fileLibraryTagRouter.post('/batch-tag', (req, res) => fileLibraryTagAPI.batchTag(req, res));
fileLibraryTagRouter.post('/untag-file', (req, res) => fileLibraryTagAPI.untagFile(req, res));
fileLibraryTagRouter.post('/batch-delete', (req, res) => fileLibraryTagAPI.batchDelete(req, res));

app.use('/api/file-library-tags', fileLibraryTagRouter);

// 文件库回收站路由
const fileLibraryRecycleRouter = express.Router();
fileLibraryRecycleRouter.use(authMiddleware);
fileLibraryRecycleRouter.get('/', (req, res) => fileLibraryRecycleAPI.getAll(req, res));
fileLibraryRecycleRouter.post('/restore-files', (req, res) => fileLibraryRecycleAPI.restoreFiles(req, res));
fileLibraryRecycleRouter.post('/restore-folders', (req, res) => fileLibraryRecycleAPI.restoreFolders(req, res));
fileLibraryRecycleRouter.post('/restore-all', (req, res) => fileLibraryRecycleAPI.restoreAll(req, res));
fileLibraryRecycleRouter.post('/purge-files', (req, res) => fileLibraryRecycleAPI.purgeFiles(req, res));
fileLibraryRecycleRouter.post('/purge-folders', (req, res) => fileLibraryRecycleAPI.purgeFolders(req, res));
fileLibraryRecycleRouter.post('/empty', (req, res) => fileLibraryRecycleAPI.empty(req, res));
app.use('/api/file-library-recycle', fileLibraryRecycleRouter);

// ============================================
// 会员账户路由（套餐 / 配额 / 用量）
// ============================================
const accountRouter = express.Router();
accountRouter.use(authMiddleware);

accountRouter.get('/me', (req, res) => accountAPI.me(req, res));
accountRouter.post('/membership', (req, res) => accountAPI.updateMembership(req, res));
accountRouter.get('/usage', (req, res) => accountAPI.usage(req, res));
accountRouter.get('/check', (req, res) => accountAPI.check(req, res));

app.use('/api/account', accountRouter);

// 文件库标签分类路由
const fileLibraryTagCategoryRouter = express.Router();
fileLibraryTagCategoryRouter.use(authMiddleware);
fileLibraryTagCategoryRouter.get('/', (req, res) => fileLibraryTagCategoryAPI.getAll(req, res));
fileLibraryTagCategoryRouter.post('/', (req, res) => fileLibraryTagCategoryAPI.create(req, res));
fileLibraryTagCategoryRouter.put('/:id', (req, res) => fileLibraryTagCategoryAPI.update(req, res));
fileLibraryTagCategoryRouter.delete('/:id', (req, res) => fileLibraryTagCategoryAPI.delete(req, res));
app.use('/api/file-library-tag-categories', fileLibraryTagCategoryRouter);

// ============================================
// ComfyUI 代理路由
// ============================================
const comfyuiRouter = express.Router();
comfyuiRouter.use(authMiddleware);

comfyuiRouter.post('/generate-single', async (req, res) => {
  try {
    const { prompt, workflow, comfyuiUrl, filenamePrefix } = req.body;
    if (!prompt || !workflow) {
      return res.status(400).json({ success: false, error: '缺少提示词或工作流' });
    }

    const apiUrl = comfyuiUrl || 'http://127.0.0.1:8188';

    let updatedWorkflow = JSON.parse(JSON.stringify(workflow));
    updatedWorkflow["109"].inputs.text = prompt;
    updatedWorkflow["84"].inputs.batch_size = 1;

    const finalPrefix = filenamePrefix || 'ComfyUI';
    Object.values(updatedWorkflow).forEach(node => {
      if (node && node.class_type === 'SaveImage' && node.inputs) {
        node.inputs.filename_prefix = finalPrefix;
      }
    });

    const response = await fetch(`${apiUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: updatedWorkflow })
    });

    if (!response.ok) {
      return res.status(502).json({ success: false, error: `ComfyUI 返回错误: HTTP ${response.status}` });
    }

    const data = await response.json();
    const promptId = data.prompt_id;
    if (!promptId) {
      return res.status(500).json({ success: false, error: '未获取到任务ID' });
    }

    res.json({ success: true, promptId, apiUrl });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

comfyuiRouter.get('/history/:promptId', async (req, res) => {
  try {
    const { apiUrl } = req.query;
    const response = await fetch(`${apiUrl || 'http://127.0.0.1:8188'}/history/${req.params.promptId}`);
    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: `HTTP ${response.status}` });
    }
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ComfyUI 连通性测试（走后端代理，避免浏览器 CORS 拦截）
comfyuiRouter.post('/test-connection', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.json({ success: false, error: '未配置地址' });
    }
    const testUrl = url.endsWith('/') ? url + 'api/history' : url + '/api/history';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(testUrl, { method: 'GET', signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        res.json({ success: true, status: 'ok' });
      } else {
        res.json({ success: false, error: `HTTP ${response.status}`, status: 'fail' });
      }
    } catch (e) {
      clearTimeout(timeout);
      res.json({ success: false, error: e.name === 'AbortError' ? '连接超时' : (e.message || '连接失败'), status: 'fail' });
    }
  } catch (e) {
    res.json({ success: false, error: e.message || '连接失败', status: 'fail' });
  }
});

app.use('/api/comfyui', comfyuiRouter);

// ============================================
// UI系统路由（方案/素材/分类/模板）
// ============================================
app.use('/api/ui/schemes', uiSchemesRouter);
app.use('/api/ui/assets', uiAssetsRouter);
app.use('/api/ui/categories', uiCategoriesRouter);
app.use('/api/ui/templates', uiTemplatesRouter);
// UI系统素材文件静态目录
app.use('/uploads', express.static(uiUploadsDir));

// ============================================
// UI库图片统一免 auth 访问接口
// 兼容文件库(UI库分类)的 fileId 和旧 UI 素材库的 assetId
// 前端 UI 控件渲染图片统一用此接口，无需 Authorization header
// ============================================
const UI_LIB_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
app.get('/api/ui-library/:id/file', (req, res) => {
  try {
    const id = req.params.id;
    // 1. 先查文件库（新数据：UI上传的图片存于文件库"UI库"分类）
    const flFile = db.prepare('SELECT * FROM file_library_files WHERE id = ?').get(id);
    if (flFile && flFile.file_path) {
      // 支持 @userdata: 前缀（用户目录文件，不复制到 GALLERY_DIR）；换电脑/换盘符自动重定位
      const fp = resolveStoredPath(flFile.file_path);
      if (fp) {
        const ext = (flFile.format || 'png').toLowerCase();
        return res.type(UI_LIB_MIME[ext] || 'application/octet-stream').send(fs.readFileSync(fp));
      }
    }
    // 2. 回退查 UI 素材库（旧数据：兼容已有方案的 assetId）
    const asset = uiDbConn.prepare('SELECT * FROM assets WHERE id = ?').get(id);
    if (asset && asset.file_path) {
      const fp = join(uiUploadsDir, String(asset.file_path).replace('/uploads/', ''));
      if (fs.existsSync(fp)) {
        const ext = (asset.format || 'png').toLowerCase();
        return res.type(UI_LIB_MIME[ext] || 'application/octet-stream').send(fs.readFileSync(fp));
      }
    }
    return res.status(404).json({ success: false, error: '文件不存在' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// 插件系统（等价于 ComfyUI 的 custom_nodes 扫描）
// 顺序：先装管理接口 + 静态资源，再扫描并挂载插件自己的 Router
// ============================================
installPluginRoutes(app);
const pluginReport = await mountPlugins(app, { db, authMiddleware });

// ============================================
// 健康检查
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'AI Character Platform - Local API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth/* (register, login, verify, logout)',
      user: '/api/user/* (me, profile)',
      characters: '/api/characters/* (CRUD + import/export)',
      configs: '/api/configs/* (get, save)',
      conversations: '/api/conversations/* (CRUD)',
      images: '/api/images/* (CRUD)',
      workflowCategories: '/api/workflow-categories/* (CRUD)',
      workflowApis: '/api/workflow-apis/* (CRUD + batch)',
      batchJobs: '/api/batch-jobs/* (CRUD)',
      plugins: '/api/plugins (插件清单 / 启用禁用 / 安装卸载)'
    },
    plugins: {
      total: pluginReport.list.length,
      enabled: pluginReport.list.filter((p) => p.enabled).length,
      mounted: pluginReport.mounted,
      failed: pluginReport.failed
    }
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log('');
  console.log(`🚀 本地 API 服务器已启动: http://localhost:${PORT}`);
  console.log(`📡 API 端点:`);
  console.log(`   POST /api/auth/register   - 注册`);
  console.log(`   POST /api/auth/login      - 登录`);
  console.log(`   GET  /api/characters        - 获取角色列表`);
  console.log(`   POST /api/characters        - 创建角色`);
  console.log(`   GET  /api/configs           - 获取配置`);
  console.log(`   POST /api/configs           - 保存配置`);
  console.log(`   GET  /api/conversations     - 获取对话列表`);
  console.log(`   GET  /api/images            - 获取图片列表`);
  console.log(`   GET  /api/health            - 健康检查`);
  if (pluginReport.list.length) {
    console.log(`🧩 插件：共 ${pluginReport.list.length} 个，已挂载路由 ${pluginReport.mounted.length} 个` +
      (pluginReport.failed.length ? `，失败 ${pluginReport.failed.length} 个` : ''));
    for (const m of pluginReport.mounted) console.log(`   - ${m.id} → ${m.route}`);
    for (const f of pluginReport.failed) console.log(`   ✗ ${f.id}: ${f.error}`);
  }
  console.log('');
  // 阶段4：启动磁盘反向监听（硬盘删除 → 回收站）+ 启动对账 + .trash 清理
  try { initDiskSync(); } catch (e) { console.warn('磁盘反向监听启动失败（不影响主服务）:', e.message); }
});
