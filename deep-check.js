import Database from 'better-sqlite3';
const db = new Database('server/data.db');

const kongUserId = 'd3315910-9ea1-4f03-b461-ec11cc7e99ad';

console.log('🔍 深度分析：配置方案详情\n');
console.log('=' .repeat(80));

// 查询 character_profiles 的完整数据
const profileConfig = db.prepare(`
  SELECT config_data, updated_at
  FROM user_configs
  WHERE user_id = ? AND config_type = 'character_profiles'
`).get(kongUserId);

if (profileConfig) {
  const data = JSON.parse(profileConfig.config_data);
  
  console.log(`📦 最后更新: ${profileConfig.updated_at}\n`);
  console.log(`📋 配置方案数量: ${data.profiles?.length || 0}\n`);
  
  if (data.profiles) {
    data.profiles.forEach((profile, index) => {
      console.log('='.repeat(80));
      console.log(`\n📁 方案 ${index + 1}: ${profile.name || '(未命名)'}`);
      console.log(`   ID: ${profile.id}`);
      console.log(`   角色数: ${profile.characters?.length || 0} 人`);
      console.log(`   更新时间: ${profile.updatedAt || '未知'}`);
      
      // 显示角色列表
      if (profile.characters && profile.characters.length > 0) {
        console.log('\n   👥 角色列表:');
        profile.characters.forEach((char, i) => {
          const dbId = char.id ? `(DB ID: ${char.id})` : '(❌ 无数据库ID)';
          console.log(`   ${i + 1}. 【${char.name}】${dbId}`);
        });
      }
      
      // 显示全局规则（检查格式）
      console.log('\n   📜 全局规则:');
      if (profile.globalRules) {
        const rulesType = typeof profile.globalRules;
        console.log(`   - 数据类型: ${rulesType}`);
        
        if (rulesType === 'string') {
          console.log(`   - 内容预览: ${profile.globalRules.substring(0, 150)}...`);
        } else if (Array.isArray(profile.globalRules)) {
          console.log(`   - 数组长度: ${profile.globalRules.length}`);
          console.log(`   - 内容: ${JSON.stringify(profile.globalRules).substring(0, 150)}...`);
        } else if (typeof profile.globalRules === 'object') {
          console.log(`   - 对象结构: ${JSON.stringify(profile.globalRules).substring(0, 200)}...`);
        } else {
          console.log(`   - 原始值: ${profile.globalRules}`);
        }
      } else {
        console.log('   ❌ 空值或不存在');
      }
      
      // 当前选中的方案
      if (data.currentProfileId === profile.id) {
        console.log('\n   ⭐ 这是当前选中的方案');
      }
    });
    
    console.log('\n\n' + '='.repeat(80));
    console.log('⭐ 当前选中方案 ID:', data.currentProfileId);
  }
  
  // 检查全局规则字段（在 profiles 外层）
  if (data.globalRules) {
    console.log('\n\n📜 顶层全局规则 (globalRules):');
    console.log(typeof data.globalRules);
    console.log(JSON.stringify(data.globalRules, null, 2).substring(0, 300));
  }
}

db.close();
