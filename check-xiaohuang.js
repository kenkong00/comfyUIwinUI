import Database from 'better-sqlite3';
const db = new Database('server/data.db');

const kongUserId = 'd3315910-9ea1-4f03-b461-ec11cc7e99ad';

console.log('🔍 紧急检查：小黄和全局规则\n');
console.log('=' .repeat(70));

// 1. 查询所有角色
console.log('\n📋 Kong 用户的所有角色（按名称排序）:\n');
const allChars = db.prepare(`
  SELECT id, name, updated_at 
  FROM characters 
  WHERE user_id = ?
  ORDER BY name
`).all(kongUserId);

let hasXiaoHuang = false;
allChars.forEach((char, index) => {
  const marker = char.name.includes('黄') ? ' ⭐' : '';
  console.log(`${index + 1}. 【${char.name}】(ID: ${char.id})${marker} - 更新: ${char.updated_at}`);
  if (char.name.includes('黄')) hasXiaoHuang = true;
});

console.log('\n' + '-'.repeat(70));
console.log(hasXiaoHuang ? '✅ 找到"小黄"相关角色' : '❌ 未找到"小黄"！');

// 2. 查询 user_configs 表中的全局规则
console.log('\n\n📋 查询 Kong 用户的配置数据 (user_configs):\n');
const configs = db.prepare(`
  SELECT config_type, config_data, updated_at
  FROM user_configs
  WHERE user_id = ?
`).all(kongUserId);

if (configs.length === 0) {
  console.log('❌ 没有找到任何配置数据！');
} else {
  configs.forEach(config => {
    console.log(`\n配置类型: ${config.config_type}`);
    console.log(`最后更新: ${config.updated_at}`);
    
    try {
      const data = JSON.parse(config.config_data);
      
      if (config.config_type === 'character_profiles') {
        console.log(`\n📦 配置方案数据:`);
        console.log(`   - 方案数量: ${data.profiles?.length || 0}`);
        if (data.profiles) {
          data.profiles.forEach((profile, i) => {
            console.log(`\n   方案 ${i + 1}: ${profile.name || '未命名'} (${profile.characters?.length || 0} 人)`);
            if (profile.globalRules) {
              console.log(`   - 全局规则: ${(profile.globalRules).substring(0, 100)}...`);
            } else {
              console.log(`   - 全局规则: ❌ 无`);
            }
          });
        }
        
        // 检查当前方案
        if (data.currentProfileId) {
          const currentProfile = data.profiles?.find(p => p.id === data.currentProfileId);
          if (currentProfile) {
            console.log(`\n✅ 当前选中方案: ${currentProfile.name} (ID: ${data.currentProfileId})`);
            console.log(`   包含角色: ${currentProfile.characters?.map(c => c.name).join(', ') || '无'}`);
          }
        }
      } else {
        console.log(`\n数据预览: ${JSON.stringify(data).substring(0, 200)}...`);
      }
    } catch(e) {
      console.log('解析失败:', e.message);
    }
  });
}

// 3. 统计信息
console.log('\n\n' + '='.repeat(70));
console.log('📊 数据统计:');
console.log(`• 角色总数: ${allChars.length} 个`);
console.log(`• 配置记录: ${configs.length} 条`);

db.close();
