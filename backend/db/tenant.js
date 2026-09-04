/**
 * Multi-tenant foundation — a `companies` lookup table (not a hardcoded enum) so a future
 * company (e.g. Iklick) is just a new row, never a schema/code change. Every tenant-scoped
 * table gets a `company VARCHAR(20) REFERENCES companies(slug)` column, defaulting to 'CW' so
 * all existing data backfills as C&W with zero manual migration.
 */
import pool from '../db.js';

export async function initCompaniesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      slug VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(120) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(
    `INSERT INTO companies (slug, name) VALUES ('CW', 'C&W'), ('PTEL', 'PTEL')
     ON CONFLICT (slug) DO NOTHING;`
  );
}

/** Add `company` to a table that's guaranteed to already exist by the time this runs. Every
 *  caller passes the exact same column definition — kept as one helper so every tenant-scoped
 *  table stays consistent (same default, same FK, same nullability) without repeating it. */
export async function addCompanyColumn(tableName) {
  await pool.query(
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS company VARCHAR(20) NOT NULL DEFAULT 'CW' REFERENCES companies(slug);`
  );
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_${tableName}_company ON ${tableName}(company);`);
}
