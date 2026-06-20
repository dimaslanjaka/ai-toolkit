import path from 'upath';
import { fileURLToPath } from 'url';
import { ProxyDB } from './ProxyDB.js';
import fs from 'fs-extra';
import { migrateSQLiteModel } from './SQLiteModel-migration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * SQLiteModel provides CRUD operations for the "models" table which stores
 * provider model metadata. It mirrors the pattern of `SQLiteProxy` but operates
 * on the `models` schema defined in `SQLiteModel.sql`.
 *
 * Can be initialized with either:
 * - A ProxyDB instance (shares the same connection)
 * - A config object (creates a new connection)
 */
export class SQLiteModel extends ProxyDB {
  private sharedDb?: ProxyDB;

  constructor(config: any) {
    // If already a ProxyDB instance, wrap it without creating a new connection
    if (config instanceof ProxyDB) {
      super({ db_type: 'sqlite', sqlite_filename: '' });
      this.sharedDb = config;
      // Copy over the helper and ready state from the shared instance
      (this as any).helper = (config as any).helper;
      this.ready = config.ready;
      (this as any)._config = (config as any)._config;
    } else {
      super(config);
    }
  }

  /** Initialize the DB and apply the models schema */
  async initialize() {
    if (this.sharedDb) {
      this.ready = true;
    } else {
      await super.initialize();
    }

    // Apply the SQLiteModel schema explicitly
    await this.initializeSchema(path.join(__dirname, 'SQLiteModel.sql'));
    // Run migrations
    await migrateSQLiteModel(this);
    // Run seed script once
    const meta = await this.meta();
    const seeded = await meta.get('models_seeded');
    if (!seeded) {
      const seedPath = path.join(__dirname, 'SQLiteModel-seed.sql');
      const sql = await fs.readFile(seedPath, 'utf8');
      const statements = sql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        await this.execute(stmt);
      }
      await meta.set('models_seeded', 'true');
    }
  }

  /** CRUD helpers for the models table */
  async models() {
    return {
      find: (where: Partial<any> = {}) => this.select<any>('models', where),
      findOne: async (where: Partial<any>) => {
        const rows = await this.select<any>('models', where);
        return rows[0] || null;
      },
      insert: (data: any) => this.insert('models', data),
      update: (data: Partial<any>, where: Partial<any>) => this.update('models', data, where),
      delete: (where: Partial<any>) => this.delete('models', where),
      count: (where: Partial<any> = {}) => this.count('models', where)
    };
  }
}

export default SQLiteModel;
