import pg from 'pg';
const pool = new pg.Pool({ host: 'localhost', port: 5432, database: 'vobiss', user: 'vobiss', password: 'vobiss123' });
const r = await pool.query(`SELECT to_regclass('public.territories') t`);
console.log(r.rows[0]);
const u = await pool.query('SELECT id, username, role FROM users WHERE deleted_at IS NULL ORDER BY id LIMIT 5');
console.log(u.rows);
await pool.end();
