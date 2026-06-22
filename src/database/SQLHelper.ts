/**
 * SQLHelper - Unified SQL helper supporting both SQLite and MySQL.
 * Follows the same composition pattern as ProxyDB:
 * selects the right helper (SQLiteHelper or MySQLHelper) internally
 * and provides a unified interface with settings management.
 */
import BaseSQL from './BaseSQL.js';
import { MySQLConfig, MySQLHelper } from './MySQLHelper.js';
import { SQLiteConfig, SQLiteHelper } from './SQLiteHelper.js';

export type { MySQLConfig, SQLiteConfig };

export type SQLHelperConfig = SQLiteConfig | MySQLConfig;

/**
 * Concrete SQL helper supporting both SQLite and MySQL.
 * Extends BaseSQL to provide a unified interface with settings management.
 * Follows the same composition pattern as ProxyDB:
 * selects the right helper (SQLiteHelper or MySQLHelper) internally
 * and provides a unified interface with settings management.
 */
export class SQLHelper extends BaseSQL {
  private helper: BaseSQL;
  private dbType: 'sqlite' | 'mysql';
  private isShared: boolean;
  public ready = false;

  get type(): 'sqlite' | 'mysql' {
    return this.dbType;
  }

  constructor(dbType: 'sqlite' | 'mysql', config: SQLiteConfig | MySQLConfig);
  constructor(helper: BaseSQL);
  constructor(dbTypeOrHelper: 'sqlite' | 'mysql' | BaseSQL, config?: SQLiteConfig | MySQLConfig) {
    super();
    if (typeof dbTypeOrHelper === 'string') {
      // Create new helper from config
      this.dbType = dbTypeOrHelper;
      this.isShared = false;
      if (dbTypeOrHelper === 'sqlite') {
        this.helper = new SQLiteHelper(config as SQLiteConfig);
      } else {
        this.helper = new MySQLHelper(config as MySQLConfig);
      }
    } else {
      // Reuse existing BaseSQL instance
      this.helper = dbTypeOrHelper;
      this.isShared = true;
      this.dbType = (dbTypeOrHelper as any).type || 'sqlite';
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
   * Close the database connection and clean up resources
   */
  async close(): Promise<void> {
    // Only close if we own the helper; don't close shared helpers
    if (!this.isShared) {
      await this.helper.close();
    }
    this.ready = false;
  }
}

export default SQLHelper;
