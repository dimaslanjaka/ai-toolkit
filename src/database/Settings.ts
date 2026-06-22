import SQLHelper from './SQLHelper.js';
import BaseSQL from './BaseSQL.js';

/**
 * Unified Settings class supporting both SQLite and MySQLite and MySQL
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
    // Table creation is handled here, so we don't need to call super.initialize() or check helper.ready.
    // Create settings table if it doesn't exist.
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
   * Get a setting from the database.
   */
  async getSetting(key: string): Promise<string | null> {
    const result = await this.sqlHelper.query<{ key: string; value: string }>(
      `SELECT value FROM settings WHERE key = ?`,
      [key]
    );
    return result.length > 0 ? result[0].value : null;
  }

  /**
   * Set a setting in the database.
   */
  async setSetting(key: string, value: string): Promise<void> {
    if (this.sqlHelper.type === 'sqlite') {
      await this.sqlHelper.execute(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
    } else {
      await this.sqlHelper.execute(
        `INSERT INTO \`settings\` (\`key\`, \`value\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
        [key, value]
      );
    }
  }

  /**
   * Delete a setting from the database.
   */
  async deleteSetting(key: string): Promise<void> {
    await this.sqlHelper.execute('DELETE FROM settings WHERE key = ?', [key]);
  }

  /**
   * Get all settings from the database.
   */
  async getAllSettings(): Promise<{ key: string; value: string }[]> {
    return this.sqlHelper.query('SELECT key, value FROM settings');
  }

  // Implement remaining abstract methods from BaseSQL by delegating to sqlHelper
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.sqlHelper.query<T>(sql, params);
  }

  async execute(sql: string, params: any[] = []): Promise<{ affectedRows: number; insertId?: number }> {
    return this.sqlHelper.execute(sql, params);
  }

  async transaction<T>(fn: (conn: any) => Promise<T>): Promise<T> {
    return this.sqlHelper.transaction(fn);
  }

  async close(): Promise<void> {
    // Settings class does not own the SQLHelper, so it should not close it.
    // Closing is handled by closeAllDatabases().
    return Promise.resolve();
  }

  // The 'ready' getter is inherited from BaseSQL and reflects the sqlHelper's readiness.
  get ready(): boolean {
    return this.sqlHelper.ready;
  }
}

/**
 * Factory function to create a Settings instance
 */
export function createSettings(helper: SQLHelper): Settings {
  return new Settings(helper);
}

export default Settings;
