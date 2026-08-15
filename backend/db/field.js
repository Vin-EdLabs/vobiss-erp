export async function initFieldSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS field_operations (
      id SERIAL PRIMARY KEY,
      project_name TEXT NOT NULL,
      town TEXT,
      engineer TEXT,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'Pending',
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_field_operations_project ON field_operations (project_name)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_field_operations_updated ON field_operations (updated_at DESC)`
  );
}
