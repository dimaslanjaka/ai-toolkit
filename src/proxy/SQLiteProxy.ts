import { ProxyDB } from '../database/ProxyDB.js';
import fs from 'fs-extra';
import path from 'upath';

export interface ProxyEntry {
  id?: number;
  proxy: string;
  type: 'http' | 'https' | 'socks4' | 'socks5';
  username?: string;
  password?: string;
  is_active?: number;
  created_at?: string;
  updated_at?: string;
}

export interface HostEntry {
  id?: number;
  host: string;
  match_type: 'exact' | 'subdomain' | 'wildcard';
  created_at?: string;
  updated_at?: string;
}

export interface ProxyHostEntry {
  proxy_id: number;
  host_id: number;
  status: 'working' | 'failed' | 'banned' | 'timeout' | 'unknown';
  latency?: number;
  last_check?: string;
  fail_count?: number;
  success_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProxyCheckLogEntry {
  id?: number;
  proxy_id: number;
  host_id: number;
  status: 'working' | 'failed' | 'banned' | 'timeout' | 'unknown';
  latency?: number;
  error_message?: string;
  checked_at?: string;
}

export class SQLiteProxy extends ProxyDB {
  /**
   * Initialize the database and apply schema if needed
   */
  async initialize(): Promise<void> {
    await super.initialize();

    // Apply schema if tables don't exist
    const schemaPath = path.join(__dirname, 'schema.sql');
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
   * hosts table operations
   */
  async hosts() {
    return {
      find: (where: Partial<HostEntry> = {}) => this.select<HostEntry>('hosts', where),
      findOne: async (where: Partial<HostEntry>): Promise<HostEntry | null> => {
        const rows = await this.select<HostEntry>('hosts', where);
        return rows[0] || null;
      },
      insert: (data: Omit<HostEntry, 'id'>) => this.insert('hosts', data),
      update: (data: Partial<HostEntry>, where: Partial<HostEntry>) => this.update('hosts', data, where),
      delete: (where: Partial<HostEntry>) => this.delete('hosts', where),
      count: (where: Partial<HostEntry> = {}) => this.count('hosts', where)
    };
  }

  /**
   * proxy_hosts table operations
   */
  async proxy_hosts() {
    return {
      find: (where: Partial<ProxyHostEntry> = {}) => this.select<ProxyHostEntry>('proxy_hosts', where),
      findOne: async (where: Partial<ProxyHostEntry>): Promise<ProxyHostEntry | null> => {
        const rows = await this.select<ProxyHostEntry>('proxy_hosts', where);
        return rows[0] || null;
      },
      upsert: async (data: ProxyHostEntry) => {
        const { proxy_id, host_id, ...rest } = data;
        return this.update('proxy_hosts', rest, { proxy_id, host_id });
      },
      delete: (where: Partial<ProxyHostEntry>) => this.delete('proxy_hosts', where),
      count: (where: Partial<ProxyHostEntry> = {}) => this.count('proxy_hosts', where)
    };
  }

  /**
   * proxy_check_logs table operations
   */
  async proxy_check_logs() {
    return {
      find: (where: Partial<ProxyCheckLogEntry> = {}) => this.select<ProxyCheckLogEntry>('proxy_check_logs', where),
      insert: (data: Omit<ProxyCheckLogEntry, 'id'>) => this.insert('proxy_check_logs', data),
      delete: (where: Partial<ProxyCheckLogEntry>) => this.delete('proxy_check_logs', where),
      count: (where: Partial<ProxyCheckLogEntry> = {}) => this.count('proxy_check_logs', where)
    };
  }

  // Override proxies to match SQLite schema
  async proxy_entries() {
    return {
      find: (where: Partial<ProxyEntry> = {}) => this.select<ProxyEntry>('proxies', where),
      findOne: async (where: Partial<ProxyEntry>): Promise<ProxyEntry | null> => {
        const rows = await this.select<ProxyEntry>('proxies', where);
        return rows[0] || null;
      },
      insert: (data: Omit<ProxyEntry, 'id'>) => this.insert('proxies', data),
      update: (data: Partial<ProxyEntry>, where: Partial<ProxyEntry>) => this.update('proxies', data, where),
      delete: (where: Partial<ProxyEntry>) => this.delete('proxies', where),
      count: (where: Partial<ProxyEntry> = {}) => this.count('proxies', where)
    };
  }
}

export default SQLiteProxy;
