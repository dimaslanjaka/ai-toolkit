import path from 'upath';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import type { ProxyDB } from './ProxyDB.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SCHEMA_TABLE = '_schema_version';

export async function runMigrations(db: ProxyDB): Promise<void> {
  if (!(await fs.pathExists(MIGRATIONS_DIR))) {
    console.warn(`No migrations directory at ${MIGRATIONS_DIR}`);
    return;
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA_TABLE} (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = await db.query<{ version: number }>(`SELECT version FROM ${SCHEMA_TABLE} ORDER BY version ASC`);
  const appliedSet = new Set(applied.map((r) => r.version));

  const files = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

  for (const file of sqlFiles) {
    const match = file.match(/^(\d+)/);
    if (!match) continue;
    const version = parseInt(match[1], 10);
    if (appliedSet.has(version)) continue;

    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const cleaned = sql.replace(/\/\*[\s\S]*?\*\//g, '');
    const statements = cleaned
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length && !s.startsWith('--'));

    await db.transaction(async () => {
      for (const stmt of statements) {
        try {
          await db.execute(stmt);
        } catch (e) {
          if (!(e as Error).message.includes('contains no statements')) {
            throw e;
          }
        }
      }
      await db.execute(`INSERT INTO ${SCHEMA_TABLE} (version) VALUES (?)`, [version]);
    });
  }
}
