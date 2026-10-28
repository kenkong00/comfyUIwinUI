// UI系统路由集成 - 将UI系统的API路由集成到主项目后端
// 包含: schemes(方案), assets(素材), categories(分类), templates(模板)
import { Router } from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Database from 'better-sqlite3';
import multer from 'multer';
import imageSize from 'image-size';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// UI系统数据库路径（已整合进本项目，直接使用本项目的 server/data 目录）
// 注意：早期版本指向 ../游戏UI界面管理系统/server/data，会在项目根生成中文目录，已废弃
const uiDbPath = join(__dirname, 'data', 'game-ui.db');
const uiDataDir = join(dirname(uiDbPath));
if (!fs.existsSync(uiDataDir)) {
  fs.mkdirSync(uiDataDir, { recursive: true });
}

const uiDb = new Database(uiDbPath);
uiDb.pragma('journal_mode = WAL');
uiDb.pragma('foreign_keys = ON');

// 创建表（如果不存在）
uiDb.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'image',
    file_path TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ui_schemes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    canvas_width INTEGER NOT NULL DEFAULT 1920,
    canvas_height INTEGER NOT NULL DEFAULT 1080,
    root_node TEXT NOT NULL,
    extra_root_nodes TEXT DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS component_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    thumbnail TEXT,
    node_data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// 迁移：为旧数据库添加 extra_root_nodes 列（如果不存在）
try {
  const columns = uiDb.pragma('table_info(ui_schemes)');
  if (columns && !columns.some(c => c.name === 'extra_root_nodes')) {
    uiDb.exec("ALTER TABLE ui_schemes ADD COLUMN extra_root_nodes TEXT DEFAULT '[]'");
  }
} catch (e) { /* 忽略迁移错误 */ }

// uploads 目录（本项目自己的 server/uploads）
const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// multer 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = join('.', file.originalname.split('.').pop() || 'png');
    cb(null, uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// ============================================
// 方案路由 /api/ui/schemes
// ============================================
const schemesRouter = Router();

// 获取方案列表（不包含 root_node）
schemesRouter.get('/', (req, res) => {
  try {
    const rows = uiDb.prepare(
      'SELECT id, name, description, canvas_width, canvas_height, version, created_at, updated_at FROM ui_schemes ORDER BY updated_at DESC'
    ).all();
    res.json({ code: 0, data: rows, message: 'success' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// 获取方案详情（包含完整 root_node 和 extra_root_nodes）
schemesRouter.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const scheme = uiDb.prepare('SELECT * FROM ui_schemes WHERE id = ?').get(id);
    if (!scheme) return res.status(404).json({ code: -1, data: null, message: '方案不存在' });
    scheme.root_node = JSON.parse(scheme.root_node);
    scheme.extra_root_nodes = scheme.extra_root_nodes ? JSON.parse(scheme.extra_root_nodes) : [];
    res.json({ code: 0, data: scheme, message: 'success' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// 创建方案
schemesRouter.post('/', (req, res) => {
  try {
    const { name, description = '', canvasWidth = 1920, canvasHeight = 1080, rootNode = '{}', extraRootNodes = [] } = req.body;
    if (!name) return res.status(400).json({ code: -1, data: null, message: '方案名称不能为空' });
    const now = Date.now();
    const rootNodeStr = typeof rootNode === 'object' ? JSON.stringify(rootNode) : rootNode;
    const extraRootNodesStr = JSON.stringify(extraRootNodes || []);
    const result = uiDb.prepare(
      'INSERT INTO ui_schemes (name, description, canvas_width, canvas_height, root_node, extra_root_nodes, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
    ).run(name, description, canvasWidth, canvasHeight, rootNodeStr, extraRootNodesStr, now, now);
    const scheme = uiDb.prepare('SELECT * FROM ui_schemes WHERE id = ?').get(result.lastInsertRowid);
    scheme.root_node = JSON.parse(scheme.root_node);
    scheme.extra_root_nodes = scheme.extra_root_nodes ? JSON.parse(scheme.extra_root_nodes) : [];
    res.json({ code: 0, data: scheme, message: '创建成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// 更新方案
schemesRouter.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, canvasWidth, canvasHeight, rootNode, extraRootNodes } = req.body;
    const existing = uiDb.prepare('SELECT * FROM ui_schemes WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ code: -1, data: null, message: '方案不存在' });
    const now = Date.now();
    const updateName = name !== undefined ? name : existing.name;
    const updateDescription = description !== undefined ? description : existing.description;
    const updateCanvasWidth = canvasWidth !== undefined ? canvasWidth : existing.canvas_width;
    const updateCanvasHeight = canvasHeight !== undefined ? canvasHeight : existing.canvas_height;
    const updateRootNode = rootNode !== undefined
      ? (typeof rootNode === 'object' ? JSON.stringify(rootNode) : rootNode)
      : existing.root_node;
    const updateExtraRootNodes = extraRootNodes !== undefined
      ? JSON.stringify(extraRootNodes || [])
      : (existing.extra_root_nodes || '[]');
    const newVersion = existing.version + 1;
    uiDb.prepare(
      'UPDATE ui_schemes SET name = ?, description = ?, canvas_width = ?, canvas_height = ?, root_node = ?, extra_root_nodes = ?, version = ?, updated_at = ? WHERE id = ?'
    ).run(updateName, updateDescription, updateCanvasWidth, updateCanvasHeight, updateRootNode, updateExtraRootNodes, newVersion, now, id);
    const updated = uiDb.prepare('SELECT * FROM ui_schemes WHERE id = ?').get(id);
    updated.root_node = JSON.parse(updated.root_node);
    updated.extra_root_nodes = updated.extra_root_nodes ? JSON.parse(updated.extra_root_nodes) : [];
    res.json({ code: 0, data: updated, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// 自动保存
schemesRouter.put('/:id/autosave', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, canvasWidth, canvasHeight, rootNode, extraRootNodes } = req.body;
    const existing = uiDb.prepare('SELECT * FROM ui_schemes WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ code: -1, data: null, message: '方案不存在' });
    const now = Date.now();
    const updateName = name !== undefined ? name : existing.name;
    const updateDescription = description !== undefined ? description : existing.description;
    const updateCanvasWidth = canvasWidth !== undefined ? canvasWidth : existing.canvas_width;
    const updateCanvasHeight = canvasHeight !== undefined ? canvasHeight : existing.canvas_height;
    const updateRootNode = rootNode !== undefined
      ? (typeof rootNode === 'object' ? JSON.stringify(rootNode) : rootNode)
      : existing.root_node;
    const updateExtraRootNodes = extraRootNodes !== undefined
      ? JSON.stringify(extraRootNodes || [])
      : (existing.extra_root_nodes || '[]');
    uiDb.prepare(
      'UPDATE ui_schemes SET name = ?, description = ?, canvas_width = ?, canvas_height = ?, root_node = ?, extra_root_nodes = ?, updated_at = ? WHERE id = ?'
    ).run(updateName, updateDescription, updateCanvasWidth, updateCanvasHeight, updateRootNode, updateExtraRootNodes, now, id);
    const updated = uiDb.prepare('SELECT * FROM ui_schemes WHERE id = ?').get(id);
    updated.root_node = JSON.parse(updated.root_node);
    updated.extra_root_nodes = updated.extra_root_nodes ? JSON.parse(updated.extra_root_nodes) : [];
    res.json({ code: 0, data: updated, message: '自动保存成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// 删除方案
schemesRouter.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = uiDb.prepare('SELECT * FROM ui_schemes WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ code: -1, data: null, message: '方案不存在' });
    uiDb.prepare('DELETE FROM ui_schemes WHERE id = ?').run(id);
    res.json({ code: 0, data: null, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// ============================================
// 素材路由 /api/ui/assets
// ============================================
const assetsRouter = Router();

// 获取素材列表
assetsRouter.get('/', (req, res) => {
  try {
    const { category_id, keyword } = req.query;
    let sql = 'SELECT * FROM assets WHERE 1=1';
    const params = [];
    if (category_id) {
      sql += ' AND category_id = ?';
      params.push(Number(category_id));
    }
    if (keyword) {
      sql += ' AND name LIKE ?';
      params.push(`%${keyword}%`);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = uiDb.prepare(sql).all(...params);
    res.json({ code: 0, data: rows, message: 'success' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// 上传素材
assetsRouter.post('/', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ code: -1, data: null, message: '请选择文件上传' });
    const { originalname, filename, size, mimetype } = req.file;
    const { name, category_id = 0 } = req.body;
    let type = 'image';
    if (mimetype.startsWith('video/')) type = 'video';
    else if (mimetype.startsWith('audio/')) type = 'audio';
    else if (!mimetype.startsWith('image/')) type = 'other';
    let width = null, height = null;
    if (type === 'image') {
      try {
        const dimensions = imageSize(join(uploadsDir, filename));
        width = dimensions.width;
        height = dimensions.height;
      } catch (e) { /* ignore */ }
    }
    const now = Date.now();
    const assetName = name || originalname;
    const filePath = '/uploads/' + filename;
    const result = uiDb.prepare(
      'INSERT INTO assets (name, category_id, type, file_path, width, height, file_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(assetName, Number(category_id), type, filePath, width, height, size, now, now);
    const asset = uiDb.prepare('SELECT * FROM assets WHERE id = ?').get(result.lastInsertRowid);
    res.json({ code: 0, data: asset, message: '上传成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// 更新素材
assetsRouter.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, category_id } = req.body;
    const existing = uiDb.prepare('SELECT * FROM assets WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ code: -1, data: null, message: '素材不存在' });
    const now = Date.now();
    const updateName = name !== undefined ? name : existing.name;
    const updateCategoryId = category_id !== undefined ? Number(category_id) : existing.category_id;
    uiDb.prepare('UPDATE assets SET name = ?, category_id = ?, updated_at = ? WHERE id = ?').run(updateName, updateCategoryId, now, id);
    const updated = uiDb.prepare('SELECT * FROM assets WHERE id = ?').get(id);
    res.json({ code: 0, data: updated, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// 删除素材
assetsRouter.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = uiDb.prepare('SELECT * FROM assets WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ code: -1, data: null, message: '素材不存在' });
    const filePath = join(uploadsDir, existing.file_path.replace('/uploads/', ''));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    uiDb.prepare('DELETE FROM assets WHERE id = ?').run(id);
    res.json({ code: 0, data: null, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// 获取素材文件
assetsRouter.get('/:id/file', (req, res) => {
  try {
    const { id } = req.params;
    const asset = uiDb.prepare('SELECT * FROM assets WHERE id = ?').get(id);
    if (!asset) return res.status(404).json({ code: -1, data: null, message: '素材不存在' });
    const filePath = join(uploadsDir, asset.file_path.replace('/uploads/', ''));
    if (!fs.existsSync(filePath)) return res.status(404).json({ code: -1, data: null, message: '文件不存在' });
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// ============================================
// 分类路由 /api/ui/categories
// ============================================
const categoriesRouter = Router();

categoriesRouter.get('/', (req, res) => {
  try {
    const rows = uiDb.prepare('SELECT * FROM categories ORDER BY parent_id, id').all();
    const map = {};
    const tree = [];
    rows.forEach(item => { map[item.id] = { ...item, children: [] }; });
    rows.forEach(item => {
      if (item.parent_id === 0) tree.push(map[item.id]);
      else if (map[item.parent_id]) map[item.parent_id].children.push(map[item.id]);
    });
    res.json({ code: 0, data: tree, message: 'success' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

categoriesRouter.post('/', (req, res) => {
  try {
    const { name, parent_id = 0 } = req.body;
    if (!name) return res.status(400).json({ code: -1, data: null, message: '分类名称不能为空' });
    const now = Date.now();
    const result = uiDb.prepare('INSERT INTO categories (name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?)').run(name, parent_id, now, now);
    const category = uiDb.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.json({ code: 0, data: category, message: '创建成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

categoriesRouter.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, parent_id } = req.body;
    const existing = uiDb.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ code: -1, data: null, message: '分类不存在' });
    const now = Date.now();
    const updateName = name !== undefined ? name : existing.name;
    const updateParentId = parent_id !== undefined ? parent_id : existing.parent_id;
    uiDb.prepare('UPDATE categories SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?').run(updateName, updateParentId, now, id);
    const updated = uiDb.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    res.json({ code: 0, data: updated, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

categoriesRouter.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = uiDb.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ code: -1, data: null, message: '分类不存在' });
    const getAllChildIds = (parentId) => {
      const children = uiDb.prepare('SELECT id FROM categories WHERE parent_id = ?').all(parentId);
      let ids = [];
      children.forEach(child => {
        ids.push(child.id);
        ids = ids.concat(getAllChildIds(child.id));
      });
      return ids;
    };
    const childIds = getAllChildIds(Number(id));
    const allIds = [Number(id), ...childIds];
    const placeholders = allIds.map(() => '?').join(',');
    uiDb.prepare(`DELETE FROM assets WHERE category_id IN (${placeholders})`).run(...allIds);
    if (childIds.length > 0) {
      const childPlaceholders = childIds.map(() => '?').join(',');
      uiDb.prepare(`DELETE FROM categories WHERE id IN (${childPlaceholders})`).run(...childIds);
    }
    uiDb.prepare('DELETE FROM categories WHERE id = ?').run(id);
    res.json({ code: 0, data: null, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

// ============================================
// 模板路由 /api/ui/templates
// ============================================
const templatesRouter = Router();

templatesRouter.get('/', (req, res) => {
  try {
    const rows = uiDb.prepare('SELECT * FROM component_templates ORDER BY created_at DESC').all();
    rows.forEach(row => { row.node_data = JSON.parse(row.node_data); });
    res.json({ code: 0, data: rows, message: 'success' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

templatesRouter.post('/', (req, res) => {
  try {
    const { name, nodeData, thumbnail = '' } = req.body;
    if (!name) return res.status(400).json({ code: -1, data: null, message: '模板名称不能为空' });
    if (!nodeData) return res.status(400).json({ code: -1, data: null, message: '模板节点数据不能为空' });
    const now = Date.now();
    const nodeDataStr = typeof nodeData === 'object' ? JSON.stringify(nodeData) : nodeData;
    const result = uiDb.prepare('INSERT INTO component_templates (name, thumbnail, node_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(name, thumbnail, nodeDataStr, now, now);
    const template = uiDb.prepare('SELECT * FROM component_templates WHERE id = ?').get(result.lastInsertRowid);
    template.node_data = JSON.parse(template.node_data);
    res.json({ code: 0, data: template, message: '创建成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

templatesRouter.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, nodeData, thumbnail } = req.body;
    const existing = uiDb.prepare('SELECT * FROM component_templates WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ code: -1, data: null, message: '模板不存在' });
    const now = Date.now();
    const updateName = name !== undefined ? name : existing.name;
    const updateNodeData = nodeData !== undefined ? (typeof nodeData === 'object' ? JSON.stringify(nodeData) : nodeData) : existing.node_data;
    const updateThumbnail = thumbnail !== undefined ? thumbnail : existing.thumbnail;
    uiDb.prepare('UPDATE component_templates SET name = ?, thumbnail = ?, node_data = ?, updated_at = ? WHERE id = ?').run(updateName, updateThumbnail, updateNodeData, now, id);
    const updated = uiDb.prepare('SELECT * FROM component_templates WHERE id = ?').get(id);
    updated.node_data = JSON.parse(updated.node_data);
    res.json({ code: 0, data: updated, message: '更新成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

templatesRouter.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = uiDb.prepare('SELECT * FROM component_templates WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ code: -1, data: null, message: '模板不存在' });
    uiDb.prepare('DELETE FROM component_templates WHERE id = ?').run(id);
    res.json({ code: 0, data: null, message: '删除成功' });
  } catch (err) {
    res.status(500).json({ code: -1, data: null, message: err.message });
  }
});

export { schemesRouter, assetsRouter, categoriesRouter, templatesRouter, uploadsDir, uiDb };
