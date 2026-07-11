const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_v3h9YpQkJFda@ep-ancient-night-acgxrokq.sa-east-1.aws.neon.tech/neondb?sslmode=require' });
(async () => {
  const user = await pool.query("SELECT id, user_id, alias, equipped_avatar, equipped_dice, equipped_special FROM players WHERE alias ILIKE '%tarzan%' OR name ILIKE '%tarzan%'");
  console.log('=== JUGADOR ===');
  console.log(JSON.stringify(user.rows, null, 2));
  
  if (user.rows[0]) {
    const pid = user.rows[0].id;
    const red = await pool.query('SELECT reward_id, status FROM redemptions WHERE player_id = $1', [pid]);
    console.log('=== REDEMPTIONS ===');
    console.log(JSON.stringify(red.rows, null, 2));
  }
  
  const shop = await pool.query('SELECT id, category, name FROM shop_items WHERE enabled = TRUE ORDER BY id');
  console.log('=== SHOP_ITEMS DB ===');
  console.log(JSON.stringify(shop.rows, null, 2));
  
  await pool.end();
})().catch(e => console.error(e.message));
