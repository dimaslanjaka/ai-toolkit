import { MySQLHelper, MySQLConfig } from './MySQLHelper.js';
import { SQLiteHelper, SQLiteConfig } from './SQLiteHelper.js';
import type { PoolConnection } from 'mariadb';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import path from 'upath';

export type DatabaseType = 'mysql' | 'mariadb' | 'sqlite';

/**
 * Config mirroring the Python example
 */
export interface ProxyDBConfig {
  db_type: DatabaseType;
  // MySQL/MariaDB settings
  mysql_host?: string;
  mysql_user?: string;
  mysql_password?: string;
  mysql_dbname?: string;
  mysql_port?: number | string;
  connectionLimit?: number;
  connectTimeout?: number;
  // SQLite settings
  sqlite_filename?: string;
  sqlite_verbose?: boolean;
}

/**
 * Common interface for database helpers
 */
interface IDBHelper {
  ready: boolean;
  initialize(): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<{ affectedRows: number; insertId?: number }>;
  transaction<T>(fn: (conn: any) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Table schemas from create.sql
 */
export interface Proxy {
  id?: number;
  proxy: string;
  latency?: string;
  last_check?: string;
  type?: string;
  region?: string;
  city?: string;
  country?: string;
  timezone?: string;
  latitude?: string;
  longitude?: string;
  anonymity?: string;
  https?: string;
  status?: string;
  private?: string;
  lang?: string;
  useragent?: string;
  webgl_vendor?: string;
  webgl_renderer?: string;
  browser_vendor?: string;
  username?: string;
  password?: string;
}

export interface ProcessedProxy {
  updated?: string;
  proxy: string;
}

export interface AddedProxy {
  updated?: string;
  proxy: string;
}

export interface Meta {
  key: string;
  value: string;
}

export interface AuthUser {
  id?: number;
  password: string;
  last_login?: string;
  is_superuser: number;
  username: string;
  last_name: string;
  email: string;
  is_staff: number;
  is_active: number;
  date_joined: string;
  first_name: string;
}

export interface UserFields {
  user_id: number;
  saldo: string;
  phone?: string;
}

export class ProxyDB {
  private helper: IDBHelper;
  private _config: ProxyDBConfig;
  public ready = false;

  constructor(config: ProxyDBConfig) {
    this._config = config;

    if (config.db_type === 'sqlite') {
      const sqliteConfig: SQLiteConfig = {
        filename: config.sqlite_filename || 'database.sqlite',
        verbose: config.sqlite_verbose
      };
      this.helper = new SQLiteHelper(sqliteConfig) as unknown as IDBHelper;
    } else {
      // Map Python-style config to MySQLHelper format
      const mysqlConfig: MySQLConfig = {
        host: config.mysql_host || 'localhost',
        user: config.mysql_user || 'root',
        password: config.mysql_password || '',
        database: config.mysql_dbname || 'proxy',
        port: config.mysql_port || 3306,
        connectionLimit: config.connectionLimit,
        connectTimeout: config.connectTimeout
      };
      this.helper = new MySQLHelper(mysqlConfig) as unknown as IDBHelper;
    }
  }

  /**
   * Initialize the database connection pool
   */
  async initialize(): Promise<void> {
    await this.helper.initialize();
    this.ready = this.helper.ready;
    await this.initializeSchema();
  }

  async initializeSchema(customSchema?: string) {
    // Apply schema if tables don't exist
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const schemaPath = customSchema && fs.existsSync(customSchema) ? customSchema : path.join(dir, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      // Remove block comments to avoid breaking statements
      const cleanedSchema = schema.replace(/\/\*[\s\S]*?\*\//g, '');
      // Split by semicolon and execute each statement
      const statements = cleanedSchema
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        try {
          await this.execute(statement);
        } catch (err) {
          // Ignore errors like "table already exists" if not using IF NOT EXISTS
          // or comments that split incorrectly
          if (!(err as Error).message.includes('contains no statements')) {
            console.error(`Failed statement: ${statement}`);
            throw err;
          }
        }
      }
    }
  }

  /**
   * Execute a SELECT query and return rows
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.helper.query<T>(sql, params);
  }

  /**
   * Execute INSERT, UPDATE, DELETE operations
   */
  async execute(sql: string, params: any[] = []): Promise<{ affectedRows: number; insertId?: number }> {
    return this.helper.execute(sql, params);
  }

  /**
   * Execute a transaction with automatic commit/rollback
   */
  async transaction<T>(fn: (conn: PoolConnection | SQLiteDatabase) => Promise<T>): Promise<T> {
    return this.helper.transaction(fn);
  }

  /**
   * Close the database connection pool
   */
  async close(): Promise<void> {
    await this.helper.close();
    this.ready = false;
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

  // ============================================================
  // Table-specific typed methods (matching create.sql schema)
  // ============================================================

  /**
   * proxies table operations
   */
  async proxies() {
    return {
      find: (where: Partial<Proxy> = {}) => this.select<Proxy>('proxies', where),
      findOne: async (where: Partial<Proxy>): Promise<Proxy | null> => {
        const rows = await this.select<Proxy>('proxies', where);
        return rows[0] || null;
      },
      insert: (data: Omit<Proxy, 'id'>) => this.insert('proxies', data),
      update: (data: Partial<Proxy>, where: Partial<Proxy>) => this.update('proxies', data, where),
      delete: (where: Partial<Proxy>) => this.delete('proxies', where),
      count: (where: Partial<Proxy> = {}) => this.count('proxies', where),
      findByProxy: (proxy: string) => this.select<Proxy>('proxies', { proxy }),
      findByStatus: (status: string) => this.select<Proxy>('proxies', { status }),
      findByCountry: (country: string) => this.select<Proxy>('proxies', { country }),
      findByRegion: (region: string) => this.select<Proxy>('proxies', { region }),
      getWorking: (limit?: number, randomize: boolean = true) => {
        const order = randomize ? (this._config.db_type === 'sqlite' ? ' ORDER BY RANDOM()' : ' ORDER BY RAND()') : '';
        return this.query<Proxy>(
          `SELECT * FROM \`proxies\` WHERE \`status\` IN ('active', 'working')${order}${limit ? ` LIMIT ${limit}` : ''}`
        );
      }
    };
  }

  /**
   * processed_proxies table operations
   */
  async processed_proxies() {
    return {
      find: (where: Partial<ProcessedProxy> = {}) => this.select<ProcessedProxy>('processed_proxies', where),
      findOne: async (where: Partial<ProcessedProxy>): Promise<ProcessedProxy | null> => {
        const rows = await this.select<ProcessedProxy>('processed_proxies', where);
        return rows[0] || null;
      },
      insert: (data: ProcessedProxy) => this.insert('processed_proxies', data),
      delete: (where: Partial<ProcessedProxy>) => this.delete('processed_proxies', where),
      exists: async (proxy: string): Promise<boolean> => {
        const rows = await this.select<ProcessedProxy>('processed_proxies', { proxy });
        return rows.length > 0;
      }
    };
  }

  /**
   * added_proxies table operations
   */
  async added_proxies() {
    return {
      find: (where: Partial<AddedProxy> = {}) => this.select<AddedProxy>('added_proxies', where),
      findOne: async (where: Partial<AddedProxy>): Promise<AddedProxy | null> => {
        const rows = await this.select<AddedProxy>('added_proxies', where);
        return rows[0] || null;
      },
      insert: (data: AddedProxy) => this.insert('added_proxies', data),
      delete: (where: Partial<AddedProxy>) => this.delete('added_proxies', where),
      exists: async (proxy: string): Promise<boolean> => {
        const rows = await this.select<AddedProxy>('added_proxies', { proxy });
        return rows.length > 0;
      }
    };
  }

  /**
   * meta table operations (key-value store)
   */
  async meta() {
    return {
      get: async (key: string): Promise<string | null> => {
        const rows = await this.select<Meta>('meta', { key });
        return rows[0]?.value || null;
      },
      set: async (key: string, value: string): Promise<{ affectedRows: number; insertId?: number }> => {
        const existing = await (await this.meta()).get(key);
        if (existing !== null) {
          return this.update('meta', { value }, { key });
        }
        return this.insert('meta', { key, value });
      },
      delete: (key: string) => this.delete('meta', { key }),
      getAll: () => this.select<Meta>('meta')
    };
  }

  /**
   * auth_user table operations
   */
  async auth_user() {
    return {
      find: (where: Partial<AuthUser> = {}) => this.select<AuthUser>('auth_user', where),
      findOne: async (where: Partial<AuthUser>): Promise<AuthUser | null> => {
        const rows = await this.select<AuthUser>('auth_user', where);
        return rows[0] || null;
      },
      findById: (id: number) => this.select<AuthUser>('auth_user', { id }),
      findByUsername: (username: string) => this.select<AuthUser>('auth_user', { username }),
      findByEmail: (email: string) => this.select<AuthUser>('auth_user', { email }),
      insert: (data: Omit<AuthUser, 'id'>) => this.insert('auth_user', data),
      update: (data: Partial<AuthUser>, where: Partial<AuthUser>) => this.update('auth_user', data, where),
      delete: (where: Partial<AuthUser>) => this.delete('auth_user', where),
      count: (where: Partial<AuthUser> = {}) => this.count('auth_user', where)
    };
  }

  /**
   * user_fields table operations
   */
  async user_fields() {
    return {
      find: (where: Partial<UserFields> = {}) => this.select<UserFields>('user_fields', where),
      findOne: async (where: Partial<UserFields>): Promise<UserFields | null> => {
        const rows = await this.select<UserFields>('user_fields', where);
        return rows[0] || null;
      },
      findByUserId: (user_id: number) => this.select<UserFields>('user_fields', { user_id }),
      findByPhone: (phone: string) => this.select<UserFields>('user_fields', { phone }),
      insert: (data: UserFields) => this.insert('user_fields', data),
      update: (data: Partial<UserFields>, where: Partial<UserFields>) => this.update('user_fields', data, where),
      delete: (where: Partial<UserFields>) => this.delete('user_fields', where)
    };
  }
}

export default ProxyDB;
