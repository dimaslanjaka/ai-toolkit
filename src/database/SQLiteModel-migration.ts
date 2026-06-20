import type SQLiteModel from './SQLiteModel.js';

export async function migrateSQLiteModel(db: SQLiteModel) {
  const tables = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'models'"
  );

  if (!tables.length) {
    return;
  }

  const pragma = await db.query('PRAGMA table_info(models)');
  const hasEnabledColumn = pragma.some((row: any) => row.name === 'enabled');

  if (!hasEnabledColumn) {
    await db.execute('ALTER TABLE models ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
  }
}
