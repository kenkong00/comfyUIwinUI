import Database from 'better-sqlite3';
const db = new Database('server/data.db');

const kongUserId = 'd3315910-9ea1-4f03-b461-ec11cc7e99ad';

console.log('🔍 检查配置方案持久化问题\n');
console.log('=' .repeat(70));

const config = db.prepare(`
  SELECT config_data, updated_at
  FROM user_configs
  WHERE user_id = ? AND config_type = 'character_profiles'
`).get(kongUserId);

if (!config) {
  console.log('❌ 没有找到 character_profiles 配置！');
  db.close();
  process.exit(1);
}

const data = JSON.parse(config.config_data);

console.log(`📅 最后更新: ${config.updated_at}`);
console.log(`\n📦 currentProfileId: ${data.currentProfileId}`);
console.log(`📋 方案数量: ${data.profiles?.length || 0}\n`);

data.profiles?.forEach((p, i) => {
  const marker = p.id === data.currentProfileId ? ' ⭐ 当前选中' : '';
  console.log(`${i + 1}. ${p.name} (ID: ${p.id})${marker}`);
  console.log(`   角色: ${(p.characters || []).map(c => c.name).join(', ')}`);
});

if (data.currentProfileId) {
  const current = data.profiles?.find(p => p.id === data.currentProfileId);
  if (current) {
    console.log(`\n✅ 当前选中方案 "${current.name}" 存在于 profiles 中`);
  } else {
    console.log(`\n❌ 当前选中 ID "${data.currentProfileId}" 在 profiles 中不存在！`);
  }
}

db.close();
