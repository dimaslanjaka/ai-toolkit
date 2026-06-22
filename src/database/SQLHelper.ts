/**
 * SQLHelper - Unified SQL helper supporting both SQLite and MySQL.
 * Follows the same composition pattern as ProxyDB:
 * selects the right helper (SQLiteHelper or MySQLHelper) internally
 * and provides a unified interface with settings management.
 */
import { MySQLConfig, MySQLHelper } from './MySQLHelper.js';
import { SQLiteConfig, SQLiteHelper } from './SQLiteHelper.js';

export type { MySQLConfig, SQLiteConfig };

export type SQLHelperConfig = SQLiteConfig | MySQLConfig;

/**
 * Database helper interface matching BaseSQL contract
 */
interface IHelper {
  ready: boolean;
  initialize(): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }>;
  transaction<T>(fn: (conn: any) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Concrete SQL helper supporting both SQLite and MySQL.
 * Handles database initialization, query execution, and settings management
 * with automatic dialect detection and routing.
 */
export class SQLHelper {
  private helper: IHelper;
  private dbType: 'sqlite' | 'mysql';
  public ready = false;

  constructor(dbType: 'sqlite' | 'mysql', config: SQLiteConfig | MySQLConfig) {
    this.dbType = dbType;
    if (dbType === 'sqlite') {
      this.helper = new SQLiteHelper(config as SQLiteConfig);
    } else {
      this.helper = new MySQLHelper(config as MySQLConfig);
    }
  }

  /**
   * Initialize the database connection
   */
  async initialize(): Promise<void> {
    await this.helper.initialize();
    this.ready = this.helper.ready;
  }

  /**
   * Execute a SELECT query and return all results
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.helper.query<T>(sql, params);
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE statement
   */
  async execute(sql: string, params: any[] = []): Promise<{ affectedRows: number; insertId?: number }> {
    return this.helper.execute(sql, params);
  }

  /**
   * Execute a transaction with automatic commit/rollback
   */
  async transaction<T>(fn: (conn: any) => Promise<T>): Promise<T> {
    return this.helper.transaction(fn);
  }

  /**
   * Get a setting value by key
   */
  async getSetting(key: string): Promise<string | undefined> {
    await this.ensureInitialized();
    if (this.dbType === 'sqlite') {
      // Use SQLiteHelper's query directly to fetch the setting
      const rows = await (this.helper as SQLiteHelper).query<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        [key]
      );
      return rows[0]?.value;
    } else {
      // Use MySQLHelper's query directly to fetch the setting
      const rows = await (this.helper as MySQLHelper).query<{ value: string }>(
        'SELECT `value` FROM `settings` WHERE `key` = ?',
        [key]
      );
      return rows[0]?.value;
    }
  }

  /**
   * Set a setting value by key (insert or update)
   */
  async setSetting(key: string, value: string): Promise<void> {
    await this.ensureInitialized();
    if (this.dbType === 'sqlite') {
      await (this.helper as SQLiteHelper).execute(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ' +
          'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP',
        [key, value]
      );
    } else {
      await (this.helper as MySQLHelper).execute(
        'INSERT INTO `settings` (`key`, `value`, `updated_at`) VALUES (?, ?, CURRENT_TIMESTAMP) ' +
          'ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = CURRENT_TIMESTAMP',
        [key, value]
      );
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.ready) {
      await this.initialize();
    }
  }

  /**
   * Close the database connection and clean up resources
   */
  async close(): Promise<void> {
    await this.helper.close();
    this.ready = false;
  }
}

export default SQLHelper;
