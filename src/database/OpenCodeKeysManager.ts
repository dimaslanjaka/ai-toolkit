import path from 'upath';
import { fileURLToPath } from 'url';
import { SQLHelper } from './SQLHelper.js';
import type { SQLHelperConfig } from './SQLHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface OpenCodeKey {
  id?: number;
  name: string;
  key: string;
  proxy_id?: number;
  enabled: number;
  last_used?: string;
  last_status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface OpenCodeKeyWithProxy extends OpenCodeKey {
  proxy_address?: string;
  proxy_type?: string;
}

/**
 * OpenCodeKeysManager provides CRUD operations for the "opencode_keys" table
 * which stores OpenCode API keys with metadata.
 *
 * Can be initialized with either:
 * - A SQLHelper instance (shares the same connection)
 * - A config object (creates a new connection)
 */
export class OpenCodeKeysManager extends SQLHelper {
  private sharedDb?: SQLHelper;
  private initializingSchema?: Promise<void>;

  constructor(config: SQLHelperConfig | SQLHelper) {
    // If already a SQLHelper instance, wrap it without creating a new connection
    if (config instanceof SQLHelper) {
      super(config);
      this.sharedDb = config;
    } else {
      // Determine database type from config
      const dbType = 'filename' in config ? 'sqlite' : 'mysql';
      super(dbType, config);
    }
  }

  /** Initialize the DB and apply the opencode_keys schema */
  async initialize() {
    if (this.initializingSchema) {
      return this.initializingSchema;
    }

    this.initializingSchema = (async () => {
      if (this.sharedDb) {
        this.ready = true;
      } else {
        await super.initialize();
      }

      // Apply the OpenCodeKeysManager schema
      await this.initializeSchema(path.join(__dirname, 'OpenCodeKeysManager.sql'));

      // Migration: add proxy_id column if table was created before this feature
      try {
        await this.execute('ALTER TABLE opencode_keys ADD COLUMN proxy_id INTEGER');
      } catch {
        // Column already exists — this is the common path after first migration
      }
    })();

    return this.initializingSchema;
  }

  /** CRUD helpers for the opencode_keys table */
  async keys() {
    await this.initialize();
    return {
      find: (where: Partial<OpenCodeKey> = {}) => this.select<OpenCodeKey>('opencode_keys', where),
      findOne: async (where: Partial<OpenCodeKey>) => {
        const rows = await this.select<OpenCodeKey>('opencode_keys', where);
        return rows[0] || null;
      },
      insert: (data: Partial<OpenCodeKey>) => this.insert('opencode_keys', data),
      update: (data: Partial<OpenCodeKey>, where: Partial<OpenCodeKey>) => this.update('opencode_keys', data, where),
      delete: (where: Partial<OpenCodeKey>) => this.delete('opencode_keys', where),
      count: (where: Partial<OpenCodeKey> = {}) => this.count('opencode_keys', where)
    };
  }

  /**
   * Get all enabled keys with their proxy information
   */
  async getEnabledKeysWithProxy(): Promise<OpenCodeKeyWithProxy[]> {
    await this.initialize();
    const query = `
      SELECT
        k.*,
        p.proxy as proxy_address,
        p.type as proxy_type
      FROM opencode_keys k
      LEFT JOIN proxies p ON k.proxy_id = p.id
      WHERE k.enabled = 1
      ORDER BY k.last_used DESC
    `;
    const rows = await this.query<OpenCodeKeyWithProxy>(query);

    // Sort by last_used: most recent first, nulls last
    return rows.sort((a, b) => {
      if (!a.last_used && !b.last_used) return 0;
      if (!a.last_used) return 1;
      if (!b.last_used) return -1;
      return b.last_used.localeCompare(a.last_used);
    });
  }

  /**
   * Mark a key as used with success/failure status
   */
  async markKeyUsed(keyId: number, status: 'success' | 'failure'): Promise<void> {
    await this.initialize();
    const now = new Date().toISOString();
    await this.update(
      'opencode_keys',
      {
        last_used: now,
        last_status: status,
        updated_at: now
      },
      { id: keyId }
    );
  }

  /**
   * Convert database keys to BinaryCollectionsConfig format
   */
  async toBinaryCollectionsConfig(): Promise<{ opencode: { keys: Array<{ name: string; key: string }> } } | null> {
    const enabledKeys = await this.getEnabledKeysWithProxy();

    if (enabledKeys.length === 0) {
      return null;
    }

    return {
      opencode: {
        keys: enabledKeys.map((k: OpenCodeKeyWithProxy) => ({ name: k.name, key: k.key }))
      }
    };
  }
}

export default OpenCodeKeysManager;
