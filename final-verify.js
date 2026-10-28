import Database from 'better-sqlite3';
const db = new Database('server/data.db');

const kongUserId = 'd3315910-9ea1-4f03-b461-ec11cc7e99ad';

console.log('✅ 验证保存后的数据状态\n');
console.log('=' .repeat(80));

// 查询 character_profiles
const profileConfig = db.prepare(`
  SELECT config_data, updated_at
  FROM user_configs
  WHERE user_id = ? AND config_type = 'character_profiles'
`).get(kongUserId);

if (profileConfig) {
  const data = JSON.parse(profileConfig.config_data);
  
  console.log(`📅 最后保存时间: ${profileConfig.updated_at}\n`);
  console.log(`⭐ 当前选中方案 ID: ${data.currentProfileId}`);
  
  // 找到当前选中的方案
  const currentProfile = data.profiles?.find(p => p.id === data.currentProfileId);
  if (currentProfile) {
    console.log(`📁 当前方案名称: ${currentProfile.name}`);
    console.log(`👥 方案角色数: ${currentProfile.characters?.length || 0} 人\n`);
    
    console.log('📋 角色列表:');
    currentProfile.characters?.forEach((char, i) => {
      const dbId = char.id ? `(DB ID: ${char.id})` : '(❌ 未保存)';
      console.log(`   ${i + 1}. 【${char.name}】${dbId}`);
    });
    
    // 检查全局规则
    console.log('\n📜 全局规则:');
    if (currentProfile.globalRules) {
      if (currentProfile.globalRules.systemRules) {
        console.log(`✅ 系统规则: 已保存 (${currentProfile.globalRules.systemRules.length} 字符)`);
      }
      if (currentProfile.globalRules.imageRules) {
        console.log(`✅ 图片规则: 已保存 (${currentProfile.globalRules.imageRules.length} 字符)`);
      }
    } else {
      console.log('❌ 无全局规则');
    }
  }
}

// 统计所有角色
console.log('\n\n' + '='.repeat(80));
console.log('📊 Kong 用户所有角色（按更新时间排序）:\n');

const allChars = db.prepare(`
  SELECT id, name, updated_at
  FROM characters
  WHERE user_id = ?
  ORDER BY updated_at DESC
`).all(kongUserId);

allChars.forEach((char, i) => {
  const marker = ['小黄', '小绿'].includes(char.name) ? ' ⭐' : '';
  console.log(`${i + 1}. 【${char.name}】(ID: ${char.id}) - ${char.updated_at}${marker}`);
});

db.close();

console.log('\n\n✅ 验证完成！');
