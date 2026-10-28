import Database from 'better-sqlite3';
const db = new Database('server/data.db');

const kongUserId = 'd3315910-9ea1-4f03-b461-ec11cc7e99ad';

console.log('🔍 查询 ComfyUI 配置\n');
console.log('=' .repeat(70));

// 查询 comfyui_settings 配置
const config = db.prepare(`
  SELECT config_data, updated_at
  FROM user_configs
  WHERE user_id = ? AND config_type = 'comfyui_settings'
`).get(kongUserId);

if (config) {
  const data = JSON.parse(config.config_data);
  
  console.log(`📅 最后更新时间: ${config.updated_at}\n`);
  console.log('💾 数据库中保存的 ComfyUI 配置:\n');
  console.log('-'.repeat(70));
  console.log(`🌐 ComfyUI 地址: ${data.comfyuiUrl || '(空)'}`);
  console.log(`📁 下载目录: ${data.downloadDir || '(默认)'}`);
  console.log(`⚡ 自动下载: ${data.autoDownload ? '开启' : '关闭'}`);
  
  // 检查是否有自定义工作流
  if (data.customWorkflow) {
    const workflowKeys = Object.keys(data.customWorkflow);
    console.log(`\n🔧 自定义工作流: ${workflowKeys.length} 个节点配置`);
    workflowKeys.slice(0, 5).forEach(key => {
      console.log(`   - 节点 ${key}: ${JSON.stringify(data.customWorkflow[key]).substring(0, 80)}...`);
    });
  }
} else {
  console.log('❌ 未找到 ComfyUI 配置！');
}

db.close();
