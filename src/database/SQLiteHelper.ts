import Database from 'better-sqlite3';
import type { RunResult } from 'better-sqlite3';
import fs from 'fs-extra';
import path from 'upath';

export interface SQLiteConfig {
  filename: string;
  readonly?: boolean;
  fileMustExist?: boolean;
  verbose?: boolean;
}

export class SQLiteHelper {
  private db?: Database.Database;
  private config: SQLiteConfig;
  public ready = false;
  private initializing?: Promise<void>;

  constructor(config: SQLiteConfig) {
    this.config = config;
  }

  async initialize() {
    if (this.ready && this.db) return;
    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = (async () => {
      const dir = path.dirname(this.config.filename);
      await fs.ensureDir(dir);

      this.db = new Database(this.config.filename, {
        readonly: this.config.readonly ?? false,
        fileMustExist: this.config.fileMustExist ?? false
      });

      // Apply performance tuning PRAGMAs
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('cache_size = -64000');
      this.db.pragma('busy_timeout = 5000');
      this.db.pragma('foreign_keys = ON');

      if (this.config.verbose) {
        console.log('Connected to the SQLite database (better-sqlite3).');
      }

      this.ready = true;
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = undefined;
    }
  }

  private async ensureInitialized() {
    if (!this.ready || !this.db) {
      await this.initialize();
    }
  }

  /**
   * Execute a simple query (SELECT)
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.ensureInitialized();
    const stmt = this.db!.prepare(sql);
    return stmt.all(...params) as T[];
  }

  /**
   * Execute insert/update/delete
   */
  async execute(sql: string, params: any[] = []): Promise<{ affectedRows: number; insertId?: number }> {
    await this.ensureInitialized();
    const stmt = this.db!.prepare(sql);
    const result: RunResult = stmt.run(...params);
    return {
      affectedRows: result.changes,
      insertId: result.lastInsertRowid as number | undefined
    };
  }

  /**
   * Transaction wrapper
   */
  async transaction<T>(fn: (db: Database.Database) => Promise<T>): Promise<T> {
    await this.ensureInitialized();
    const transaction = this.db!.transaction(fn);
    return transaction(this.db!);
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (!this.ready || !this.db) return;
    this.db.close();
    this.db = undefined;
    this.ready = false;
    if (this.config.verbose) {
      console.log('SQLite database connection closed.');
    }
  }
}

export default SQLiteHelper;
