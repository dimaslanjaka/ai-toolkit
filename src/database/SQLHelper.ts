/**
 * SQLHelper - Unified SQL helper supporting both SQLite and MySQL.
 * Follows the same composition pattern as ProxyDB:
 * selects the right helper (SQLiteHelper or MySQLHelper) internally
 * and provides a unified interface with settings management.
 */
import fs from 'fs-extra';
import path from 'upath';
import { fileURLToPath } from 'url';
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
  protected helper: BaseSQL;
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

  /**
   * Initialize database schema from a SQL file
   * @param customSchema - Optional path to custom schema file
   */
  async initializeSchema(customSchema?: string): Promise<void> {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const schemaPath = path.resolve(
      customSchema && fs.existsSync(customSchema) ? customSchema : path.join(dir, 'schema.sql')
    );

    // Apply schema if file exists
    if (await fs.pathExists(schemaPath)) {
      const schema = await fs.readFile(schemaPath, 'utf8');
      const cleanedSchema = schema.replace(/\/\*[\s\S]*?\*\//g, '');
      const statements = cleanedSchema
        .split(';')
        .map((s) => s.trim())
        .map((s) =>
          s
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => !l.startsWith('--'))
            .join('\n')
            .trim()
        )
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        await this.execute(statement);
      }
    }
  }

  /**
   * Convenience method: SELECT with WHERE clause
   */
  async select<T = any>(table: string, where: Record<string, any> = {}, columns: string[] = ['*']): Promise<T[]> {
    const cols = columns.join(', ');
    const keys = Object.keys(where);

    if (keys.length === 0) {
      return this.query<T>(`SELECT ${cols} FROM \`${table}\``);
    }

    const whereClause = keys.map((key) => `\`${key}\` = ?`).join(' AND ');
    const values = keys.map((key) => where[key]);

    return this.query<T>(`SELECT ${cols} FROM \`${table}\` WHERE ${whereClause}`, values);
  }

  /**
   * Convenience method: INSERT a row
   */
  async insert(table: string, data: Record<string, any>): Promise<{ affectedRows: number; insertId?: number }> {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const columns = keys.map((k) => `\`${k}\``).join(', ');
    const values = keys.map((key) => data[key]);

    return this.execute(`INSERT INTO \`${table}\` (${columns}) VALUES (${placeholders})`, values);
  }

  /**
   * Convenience method: UPDATE rows (upsert logic: update if exists, otherwise create)
   */
  async update(
    table: string,
    data: Record<string, any>,
    where: Record<string, any>
  ): Promise<{ affectedRows: number; insertId?: number }> {
    const dataKeys = Object.keys(data);
    const whereKeys = Object.keys(where);

    if (whereKeys.length === 0) {
      throw new Error('UPDATE requires WHERE clause to prevent accidental full table updates');
    }

    // Check if record exists
    const existing = await this.select(table, where);
    if (existing.length === 0) {
      // Create: merge data and where into a single object for insertion
      return this.insert(table, { ...where, ...data });
    }

    // Update
    const setClause = dataKeys.map((key) => `\`${key}\` = ?`).join(', ');
    const whereClause = whereKeys.map((key) => `\`${key}\` = ?`).join(' AND ');
    const values = [...dataKeys.map((key) => data[key]), ...whereKeys.map((key) => where[key])];

    return this.execute(`UPDATE \`${table}\` SET ${setClause} WHERE ${whereClause}`, values);
  }

  /**
   * Convenience method: DELETE rows
   */
  async delete(table: string, where: Record<string, any>): Promise<{ affectedRows: number; insertId?: number }> {
    const keys = Object.keys(where);

    if (keys.length === 0) {
      throw new Error('DELETE requires WHERE clause to prevent accidental full table deletions');
    }

    const whereClause = keys.map((key) => `\`${key}\` = ?`).join(' AND ');
    const values = keys.map((key) => where[key]);

    return this.execute(`DELETE FROM \`${table}\` WHERE ${whereClause}`, values);
  }

  /**
   * Convenience method: COUNT rows
   */
  async count(table: string, where: Record<string, any> = {}): Promise<number> {
    const keys = Object.keys(where);

    let sql = `SELECT COUNT(*) as count FROM \`${table}\``;
    const values: any[] = [];

    if (keys.length > 0) {
      const whereClause = keys.map((key) => `\`${key}\` = ?`).join(' AND ');
      values.push(...keys.map((key) => where[key]));
      sql += ` WHERE ${whereClause}`;
    }

    const result = await this.query<{ count: number }>(sql, values);
    return result[0]?.count || 0;
  }
}

export default SQLHelper;
