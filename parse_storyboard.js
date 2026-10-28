import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取分镜提示词文件
const storyboardPath = path.join(__dirname, '分镜内容', '分镜提示词.txt');
const content = fs.readFileSync(storyboardPath, 'utf-8');

// 解析分镜内容
const parseStoryboard = (content) => {
  const lines = content.split('\n');
  const storyboards = [];
  let currentStoryboard = null;
  
  lines.forEach(line => {
    line = line.trim();
    if (line.startsWith('分镜 ')) {
      // 新的分镜开始
      if (currentStoryboard) {
        storyboards.push(currentStoryboard);
      }
      currentStoryboard = {
        id: line.replace('分镜 ', ''),
        视角: '',
        角色动作与构图: '',
        灯光气氛: '',
        场景环境: ''
      };
    } else if (currentStoryboard) {
      if (line.startsWith('视角：')) {
        currentStoryboard.视角 = line.replace('视角：', '');
      } else if (line.startsWith('角色动作与构图：')) {
        currentStoryboard.角色动作与构图 = line.replace('角色动作与构图：', '');
      } else if (line.startsWith('灯光气氛：')) {
        currentStoryboard.灯光气氛 = line.replace('灯光气氛：', '');
      } else if (line.startsWith('场景环境：')) {
        currentStoryboard.场景环境 = line.replace('场景环境：', '');
      }
    }
  });
  
  // 添加最后一个分镜
  if (currentStoryboard) {
    storyboards.push(currentStoryboard);
  }
  
  return storyboards;
};

// 生成提示词
const generatePrompt = (storyboard) => {
  return `视角：${storyboard.视角}\n角色动作与构图：${storyboard.角色动作与构图}\n灯光气氛：${storyboard.灯光气氛}\n场景环境：${storyboard.场景环境}`;
};

// 解析分镜
const storyboards = parseStoryboard(content);

// 保存为单个JSON文件
const outputDir = path.join(__dirname, '分镜内容', 'json');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 只保留id和prompt字段
const storyboardData = storyboards.map(storyboard => {
  const prompt = generatePrompt(storyboard);
  return {
    id: storyboard.id,
    prompt: prompt
  };
});

// 生成单个JSON文件
const outputPath = path.join(outputDir, 'storyboards.json');
fs.writeFileSync(outputPath, JSON.stringify(storyboardData, null, 2));
console.log(`生成文件: ${outputPath}`);

console.log('\n分镜提示词解析完成！');
console.log(`生成了包含 ${storyboards.length} 个分镜的单个JSON文件`);