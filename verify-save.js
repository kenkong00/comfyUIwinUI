import Database from 'better-sqlite3';
const db = new Database('server/data.db');

console.log('🔍 验证保存操作 - 检查 Kong 用户的最新数据\n');
console.log('='.repeat(70));

const kongUserId = 'd3315910-9ea1-4f03-b461-ec11cc7e99ad';

// 查询 kong 用户的所有角色，按更新时间排序
const chars = db.prepare(`
  SELECT 
    id,
    name,
    description,
    updated_at
  FROM characters 
  WHERE user_id = ?
  ORDER BY updated_at DESC
  LIMIT 5
`).all(kongUserId);

console.log(`\n✅ Kong 用户最新更新的 5 个角色:\n`);
console.log('-'.repeat(70));

chars.forEach((char, index) => {
  console.log(`${index + 1}. 【${char.name}】(ID: ${char.id})`);
  console.log(`   描述: ${(char.description || '').substring(0, 60)}...`);
  console.log(`   最后更新: ${char.updated_at}\n`);
});

// 统计总角色数
const totalCount = db.prepare('SELECT COUNT(*) as count FROM characters WHERE user_id = ?').get(kongUserId);
console.log('='.repeat(70));
console.log(`📊 Kong 用户总角色数: ${totalCount.count} 个`);

// 检查是否有其他用户的数据
console.log('\n\n📋 所有用户角色统计:');
const allUsers = db.prepare(`
  SELECT u.username, COUNT(c.id) as count
  FROM users u
  LEFT JOIN characters c ON u.id = c.user_id
  GROUP BY u.id
  HAVING count > 0
  ORDER BY count DESC
`).all();

allUsers.forEach(u => {
  const marker = u.username === 'kong' ? ' ✅ (你)' : ' ⚠️';
  console.log(`• ${u.username}: ${u.count} 个角色${marker}`);
});

db.close();
