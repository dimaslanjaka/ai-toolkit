import * as mariadb from 'mariadb';
import type { Pool, PoolConnection } from 'mariadb';
import BaseSQL from './BaseSQL.js';

export interface MySQLConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port?: number | string;
  connectionLimit?: number;
  connectTimeout?: number;
}

export class MySQLHelper extends BaseSQL {
  public readonly type = 'mysql' as const;
  private pool?: Pool;
  private config: MySQLConfig;
  public ready = false;
  private initializing?: Promise<void>;

  constructor(config: MySQLConfig) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.ready && this.pool) return;
    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = (async () => {
      // Create connection pool
      this.pool = mariadb.createPool({
        host: this.config.host,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        port: parseInt(String(this.config.port || 3306), 10),
        connectionLimit: this.config.connectionLimit || 5,
        connectTimeout: this.config.connectTimeout || 10000,
        allowPublicKeyRetrieval: true,
        acquireTimeout: 10000,
        initializationTimeout: 10000
      });

      // Test the connection
      let conn;
      try {
        conn = await this.pool.getConnection();
        this.ready = true;
      } catch (error) {
        // Connection failed, clean up pool
        if (this.pool) {
          await this.pool.end().catch(() => {});
          this.pool = undefined;
        }
        throw error;
      } finally {
        if (conn) conn.release();
      }
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = undefined;
    }
  }

  private async ensureInitialized() {
    if (!this.ready || !this.pool) {
      await this.initialize();
    }
  }

  /**
   * Execute a simple query
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.ensureInitialized();
    let conn: PoolConnection | undefined;
    try {
      conn = await this.pool!.getConnection();
      const rows = await conn.query<T>(sql, params);
      // Remove metadata property if present
      return Array.isArray(rows) ? (rows as T[]) : [];
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Execute insert/update/delete
   */
  async execute(sql: string, params: any[] = []): Promise<{ affectedRows: number; insertId?: number }> {
    await this.ensureInitialized();
    let conn: PoolConnection | undefined;
    try {
      conn = await this.pool!.getConnection();
      const result = await conn.query(sql, params);
      return {
        affectedRows: result.affectedRows || 0,
        insertId: result.insertId || undefined
      };
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Transaction wrapper
   */
  async transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
    await this.ensureInitialized();
    let conn: PoolConnection | undefined;
    try {
      conn = await this.pool!.getConnection();
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      if (conn) await conn.rollback();
      throw err;
    } finally {
      if (conn) conn.release();
    }
  }

  /**
   * Close the pool
   */
  async close(): Promise<void> {
    if (!this.ready || !this.pool) return;
    await this.pool.end();
    this.pool = undefined;
    this.ready = false;
  }
}

export default MySQLHelper;
