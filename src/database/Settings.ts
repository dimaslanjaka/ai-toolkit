import SQLHelper from './SQLHelper.js';
import BaseSQL from './BaseSQL.js';

/**
 * Unified Settings class supporting both SQLite and MySQL
 * Delegates to SQLHelper for actual database operations
 */
export class Settings extends BaseSQL {
  private sqlHelper: SQLHelper;

  constructor(helper: SQLHelper) {
    super();
    this.sqlHelper = helper;
  }

  /**
   * Initialize the settings database and create table if needed
   */
  async initialize(): Promise<void> {
    if (!this.sqlHelper.ready) {
      await this.sqlHelper.initialize();
    }

    // Create settings table if it doesn't exist
    if (this.sqlHelper.type === 'sqlite') {
      await this.sqlHelper.execute(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await this.sqlHelper.execute(`
        CREATE TABLE IF NOT EXISTS \`settings\` (
          \`key\` VARCHAR(255) PRIMARY KEY,
          \`value\` LONGTEXT NOT NULL,
          \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
    }
  }

  /**
   * Whether the database connection is ready for use
   */
  get ready(): boolean {
    return this.sqlHelper.ready;
  }

  /**
   * Execute a SELECT query and return all results
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.sqlHelper.query<T>(sql, params);
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE statement
   */
  async execute(sql: string, params: any[] = []): Promise<{ affectedRows: number; insertId?: number }> {
    return this.sqlHelper.execute(sql, params);
  }

  /**
   * Execute a transaction with the provided callback function
   */
  async transaction<T>(fn: (conn: any) => Promise<T>): Promise<T> {
    return this.sqlHelper.transaction<T>(fn);
  }

  /**
   * Get a setting value by key
   */
  async getSetting(key: string): Promise<string | undefined> {
    return this.sqlHelper.getSetting(key);
  }

  /**
   * Set a setting value by key (insert or update)
   */
  async setSetting(key: string, value: string): Promise<void> {
    return this.sqlHelper.setSetting(key, value);
  }

  /**
   * Settings is a consumer of the shared helper, not the owner.
   * The shared SQLHelper owner manages connection lifecycle.
   */
  async close(): Promise<void> {
    // no-op — caller owns the SQLHelper connection
  }
}

export function createSettings(helper: SQLHelper): Settings {
  return new Settings(helper);
}

export default {
  createSettings,
  Settings
};
