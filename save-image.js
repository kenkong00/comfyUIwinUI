import express from 'express';
import fs from 'fs';
import path from 'path';
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.static('dist'));

// ComfyUI图片目录
const COMFYUI_OUTPUT_DIR = 'H:\\COMFYUI_dapao\\ComfyUI\\output';

// 保存图片的端点
app.post('/api/save-image', (req, res) => {
  const { filename, data, subfolder } = req.body;
  
  if (!filename) {
    return res.status(400).json({ error: 'Missing filename' });
  }
  
  try {
    // 确保imgs目录存在
    const imgsDir = path.join(__dirname, 'dist', 'imgs');
    if (!fs.existsSync(imgsDir)) {
      fs.mkdirSync(imgsDir, { recursive: true });
    }
    
    let imagePath = path.join(imgsDir, filename);
    
    if (data) {
      // 通过base64数据保存图片
      const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(imagePath, buffer);
    } else if (subfolder) {
      // 直接从ComfyUI目录复制图片
      const comfyuiImagePath = path.join(COMFYUI_OUTPUT_DIR, subfolder, filename);
      if (fs.existsSync(comfyuiImagePath)) {
        fs.copyFileSync(comfyuiImagePath, imagePath);
      } else {
        return res.status(404).json({ error: '图片文件不存在' });
      }
    } else {
      return res.status(400).json({ error: 'Missing data or subfolder' });
    }
    
    res.json({ success: true, path: `/imgs/${filename}` });
  } catch (error) {
    console.error('保存图片失败:', error);
    res.status(500).json({ error: '保存图片失败' });
  }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
