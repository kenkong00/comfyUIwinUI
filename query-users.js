import Database from 'better-sqlite3';
const db = new Database('server/data.db');

console.log('🔍 调查 admin 用户下的异常角色');
console.log('=' .repeat(80));

const adminUserId = '7f55eb0f-f614-4a27-b995-09830acca259';
const kongUserId = 'd3315910-9ea1-4f03-b461-ec11cc7e99ad';

// 查询 admin 用户的角色
const adminChars = db.prepare(`
  SELECT * FROM characters WHERE user_id = ?
`).all(adminUserId);

console.log('\n👤 Admin 用户的角色:');
adminChars.forEach(char => {
  console.log(`\n【${char.name}】(ID: ${char.id})`);
  console.log(`  描述: ${(char.description || '').substring(0, 100)}`);
  console.log(`  创建: ${char.created_at}`);
  console.log(`  更新: ${char.updated_at}`);
});

// 查询 kong 用户的柳如烟角色
console.log('\n\n' + '='.repeat(80));
console.log('👤 Kong 用户的柳如烟角色:');
const kongLiuruyan = db.prepare(`
  SELECT * FROM characters WHERE user_id = ? AND name = ?
`).all(kongUserId, '柳如烟');

kongLiuruyan.forEach(char => {
  console.log(`\n【${char.name}】(ID: ${char.id})`);
  console.log(`  描述: ${(char.description || '').substring(0, 100)}`);
  console.log(`  创建: ${char.created_at}`);
  console.log(`  更新: ${char.updated_at}`);
});

// 查看最近的 API 请求日志（如果有）
console.log('\n\n' + '='.repeat(80));
console.log('📊 数据统计:');
const stats = db.prepare(`
  SELECT 
    u.username,
    COUNT(c.id) as char_count,
    MAX(c.updated_at) as last_update
  FROM users u
  LEFT JOIN characters c ON u.id = c.user_id
  GROUP BY u.id
  ORDER BY char_count DESC
`).all();

stats.forEach(s => {
  console.log(`${s.username}: ${s.char_count} 个角色 (最后更新: ${s.last_update || '无'})`);
});

db.close();
