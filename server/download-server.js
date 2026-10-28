import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join, resolve, normalize } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3006;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', server: 'download-server' });
});

// 通过磁盘路径提供已保存的文件（用于对话图片加载）
// 安全限制：只允许访问 user_data 和全局 downloads 目录下的文件
app.get('/api/serve-file', (req, res) => {
  try {
    const filepath = req.query.path;
    if (!filepath || typeof filepath !== 'string') {
      return res.status(400).json({ error: '缺少 path 参数' });
    }

    const normalizedPath = normalize(filepath);
    const userDataRoot = resolve(__dirname, 'user_data');
    const globalDownloads = resolve(__dirname, 'downloads');

    // 安全检查：只允许访问 user_data 或 downloads 目录
    const isAllowed = normalizedPath.startsWith(userDataRoot) || normalizedPath.startsWith(globalDownloads);
    if (!isAllowed) {
      return res.status(403).json({ error: '无权限访问该路径' });
    }

    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 根据扩展名设置 Content-Type
    const ext = normalizedPath.toLowerCase().split('.').pop();
    const mimeTypes = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime'
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    fs.createReadStream(normalizedPath).pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 下载目录配置：默认全局目录（兼容旧调用）
let downloadDir = join(__dirname, 'downloads');

// 用户私有目录根
const USER_DATA_ROOT = join(__dirname, 'user_data');

// 确保下载目录存在
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}
if (!fs.existsSync(USER_DATA_ROOT)) {
  fs.mkdirSync(USER_DATA_ROOT, { recursive: true });
}

// 安全清理目录名/用户名：防止路径遍历
function sanitizeName(name) {
  return String(name || '').replace(/[\/\\]/g, '_').replace(/[^a-zA-Z0-9\u4e00-\u9fa5_\-\.]/g, '').trim();
}

// 构建用户私有下载目录
function buildUserDownloadDir(username, dirName) {
  const safeUser = sanitizeName(username);
  const safeDir = sanitizeName(dirName);
  if (!safeUser) {
    // 未提供用户名时回退到全局目录（兼容旧调用）
    return safeDir ? join(downloadDir, safeDir) : downloadDir;
  }
  // 用户私有目录：user_data/{username}/downloads/{dirName}
  const userBase = join(USER_DATA_ROOT, safeUser, 'downloads');
  const finalDir = safeDir ? join(userBase, safeDir) : userBase;
  if (!fs.existsSync(finalDir)) {
    fs.mkdirSync(finalDir, { recursive: true });
  }
  return finalDir;
}

// 设置下载目录（基于用户账号隔离）
app.post('/api/set-download-dir', (req, res) => {
  const { path: dirPath, username } = req.body;
  const dirName = dirPath ? String(dirPath).split(/[\\/]/).pop() : '';
  downloadDir = buildUserDownloadDir(username, dirName);
  res.json({ success: true, downloadDir });
});

// 获取当前下载目录
app.get('/api/download-dir', (req, res) => {
  res.json({ downloadDir });
});

// 下载并保存图片（支持 username 字段做账号隔离）
app.post('/api/download-image', async (req, res) => {
  try {
    const { imageUrl, filename, username, downloadDir: clientDir } = req.body;

    // 如果是相对路径，需要添加代理前缀
    const fullUrl = imageUrl.startsWith('http')
      ? imageUrl
      : `http://127.0.0.1:8188${imageUrl}`;

    const response = await fetch(fullUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 优先使用本次请求指定的目录，否则按用户名构建
    let targetDir = downloadDir;
    if (username) {
      targetDir = buildUserDownloadDir(username, clientDir || '');
    } else if (clientDir) {
      targetDir = buildUserDownloadDir(null, clientDir);
    }
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filepath = join(targetDir, filename);
    fs.writeFileSync(filepath, buffer);

    res.json({ success: true, filepath, filename });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 批量下载并保存图片（按用户账号隔离）
app.post('/api/download-images', async (req, res) => {
  try {
    const { images, comfyuiUrl, subdir, username, downloadDir: clientDir } = req.body;
    const results = [];

    console.log('Received download request:', { images, comfyuiUrl, subdir, username, clientDir });

    // 确定基础目标目录：基于用户账号
    let targetDir;
    if (username) {
      targetDir = buildUserDownloadDir(username, clientDir || '');
    } else if (clientDir) {
      targetDir = buildUserDownloadDir(null, clientDir);
    } else {
      targetDir = downloadDir;
    }

    // 支持子目录（按任务名分目录）
    if (subdir) {
      const safeSubdir = sanitizeName(subdir);
      if (safeSubdir) {
        targetDir = join(targetDir, safeSubdir);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
      }
    }

    // 确定ComfyUI基础URL
    let baseUrl = 'http://127.0.0.1:8188';
    if (comfyuiUrl) {
      baseUrl = comfyuiUrl.endsWith('/') ? comfyuiUrl.slice(0, -1) : comfyuiUrl;
    }

    for (const { imageUrl, filename } of images) {
      try {
        console.log(`Processing image: ${filename}, URL: ${imageUrl}`);

        let fullUrl;
        if (imageUrl.startsWith('http')) {
          // 已经是完整URL，直接使用
          fullUrl = imageUrl;
        } else if (imageUrl.startsWith('/api/view') || imageUrl.startsWith('/view')) {
          // 相对路径只对浏览器代理源有效，而代理指向【本地 ComfyUI】。
          // 必须用本地地址 —— comfyuiUrl 可能是远程实例（CNB 带认证 401）或过期地址。
          let path = imageUrl;
          if (path.startsWith('/api/view')) {
            path = path.replace('/api', '');
          }
          fullUrl = `http://127.0.0.1:8188${path}`;
        } else {
          // 其他相对路径：同样走本地 ComfyUI
          fullUrl = `http://127.0.0.1:8188${imageUrl}`;
        }

        console.log(`Fetching: ${fullUrl}`);

        const response = await fetch(fullUrl);

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const filepath = join(targetDir, filename);
          fs.writeFileSync(filepath, buffer);
          console.log(`Saved: ${filepath}`);
          results.push({ success: true, filepath, filename });
        } else {
          console.error(`HTTP error ${response.status} for ${fullUrl}`);
          results.push({ success: false, filename, error: `HTTP ${response.status}` });
        }
      } catch (error) {
        console.error(`Error downloading ${filename}:`, error.message);
        results.push({ success: false, filename, error: error.message });
      }
    }

    res.json({ success: true, results, downloadDir: targetDir });
  } catch (error) {
    console.error('Batch download error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Download server running on http://localhost:${PORT}`);
  console.log(`Download directory: ${downloadDir}`);
});

const CONFIG_FILE = join(__dirname, 'config.json');

app.get('/api/config', (req, res) => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      res.json(JSON.parse(data));
    } else {
      res.json({});
    }
  } catch (error) {
    console.error('Load config error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const config = req.body;
    config.lastSyncTime = new Date().toISOString();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('Config saved:', config.lastSyncTime);
    res.json({ success: true, lastSyncTime: config.lastSyncTime });
  } catch (error) {
    console.error('Save config error:', error);
    res.status(500).json({ error: error.message });
  }
});