import type SQLiteModel from './SQLiteModel.js';

export async function migrateSQLiteModel(db: SQLiteModel) {
  const tables = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'models'"
  );

  if (!tables.length) {
    return;
  }

  // --- Phase 1: legacy column migration (enabled column) ---
  const pragma = await db.query('PRAGMA table_info(models)');
  const hasEnabledColumn = pragma.some((row: any) => row.name === 'enabled');

  if (!hasEnabledColumn) {
    await db.execute('ALTER TABLE models ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
  }

  // --- Phase 2: composite primary key migration ---
  // Check whether the table already uses a composite PK (id, provider).
  // If the only unique/pk index covers a single column, rebuild the table.
  const indexList = await db.query<{ name: string; unique: number; origin: string }>('PRAGMA index_list(models)');

  // The old schema has a single-column PK index (sqlite_autoindex or primary key).
  // The new schema has a composite PK, so the autoindex would cover 2 columns.
  const pkIndex = indexList.find((row: any) => row.origin === 'pk');

  let isCompositePk = false;

  if (pkIndex) {
    // Count how many columns the PK index covers.
    const pkInfo = await db.query<{ seqno: number }>(`PRAGMA index_info("${pkIndex.name}")`);
    isCompositePk = pkInfo.length >= 2;
  } else {
    // No explicit pk index — could be a WITHOUT ROWID table or legacy;
    // check if a PK column named "id" alone exists.
    const idRow = pragma.find((row: any) => row.name === 'id' && row.pk === 1);
    const providerRow = pragma.find((row: any) => row.name === 'provider' && row.pk === 2);
    isCompositePk = !!(idRow && providerRow);
  }

  if (!isCompositePk) {
    // Rebuild the table with the new composite primary key.
    await db.execute(`CREATE TABLE IF NOT EXISTS "models_new" (
      "id" TEXT NOT NULL,
      "object" TEXT NOT NULL,
      "created" INTEGER,
      "owned_by" TEXT,
      "permission" TEXT,
      "root" TEXT,
      "parent" TEXT,
      "provider" TEXT NOT NULL,
      "enabled" INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY ("id", "provider")
    )`);
    await db.execute('INSERT INTO "models_new" SELECT * FROM "models"');
    await db.execute('DROP TABLE "models"');
    await db.execute('ALTER TABLE "models_new" RENAME TO "models"');
  }
}
