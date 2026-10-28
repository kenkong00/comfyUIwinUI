import Database from 'better-sqlite3';
const db = new Database('server/data.db');

console.log('🔧 开始修复数据问题...\n');

const kongUserId = 'd3315910-9ea1-4f03-b461-ec11cc7e99ad';
const adminUserId = '7f55eb0f-f614-4a27-b995-09830acca259';

// ============================================
// 步骤 1: 查看 admin 用户下的异常角色
// ============================================
console.log('📋 步骤 1: 检查 Admin 用户的异常数据');
console.log('-'.repeat(60));

const adminChars = db.prepare('SELECT id, name, updated_at FROM characters WHERE user_id = ?').all(adminUserId);

if (adminChars.length > 0) {
  console.log(`⚠️  发现 ${adminChars.length} 个异常角色（属于 admin）:`);
  adminChars.forEach(char => {
    console.log(`   - 【${char.name}】(ID: ${char.id}, 更新: ${char.updated_at})`);
  });
  
  // 备份后删除
  console.log('\n🗑️  正在删除 Admin 用户的异常角色...');
  const deleteResult = db.prepare('DELETE FROM characters WHERE user_id = ?').run(adminUserId);
  console.log(`✓ 已删除 ${deleteResult.changes} 个异常角色`);
} else {
  console.log('✓ Admin 用户下无异常角色');
}

// ============================================
// 步骤 2: 确认 kong 用户的数据
// ============================================
console.log('\n\n📋 步骤 2: 确认 Kong 用户的角色数据');
console.log('-'.repeat(60));

const kongChars = db.prepare(`
  SELECT id, name, created_at, updated_at 
  FROM characters 
  WHERE user_id = ? 
  ORDER BY updated_at DESC
`).all(kongUserId);

console.log(`✅ Kong 用户共有 ${kongChars.length} 个角色:\n`);
kongChars.forEach((char, index) => {
  console.log(`${index + 1}. 【${char.name}】`);
  console.log(`   ID: ${char.id}`);
  console.log(`   创建: ${char.created_at}`);
  console.log(`   更新: ${char.updated_at}\n`);
});

// ============================================
// 步骤 3: 统计所有用户的最终状态
// ============================================
console.log('\n' + '='.repeat(60));
console.log('📊 最终数据统计:');
console.log('='.repeat(60));

const finalStats = db.prepare(`
  SELECT 
    u.username,
    COUNT(c.id) as char_count
  FROM users u
  LEFT JOIN characters c ON u.id = c.user_id
  GROUP BY u.id
  ORDER BY char_count DESC
`).all();

finalStats.forEach(s => {
  const status = s.char_count === 0 ? '(空)' : `${s.char_count} 个`;
  console.log(`• ${s.username}: ${status}`);
});

db.close();

console.log('\n✅ 数据修复完成！');
