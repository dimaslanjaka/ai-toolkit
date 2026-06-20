import path from 'upath';
import { ProxyDB } from './ProxyDB.js';
import { fileURLToPath } from 'url';
import { ProxyEntry, HostEntry, ProxyHostEntry } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export { ProxyEntry, HostEntry, ProxyHostEntry } from './types.js';

/**
 * SQLiteProxy provides proxy-related operations.
 * Can be initialized with either:
 * - A ProxyDB instance (shares the same connection)
 * - A config object (creates a new connection)
 */
export class SQLiteProxy extends ProxyDB {
  private sharedDb?: ProxyDB;

  constructor(config: any) {
    // If already a ProxyDB instance, wrap it without creating a new connection
    if (config instanceof ProxyDB) {
      super({ db_type: 'sqlite', sqlite_filename: '' });
      this.sharedDb = config;
      // Copy over the helper and ready state from the shared instance
      (this as any).helper = (config as any).helper;
      this.ready = config.ready;
      (this as any)._config = (config as any)._config;
    } else {
      super(config);
    }
  }

  /**
   * Initialize the database and apply schema if needed
   */
  async initialize(): Promise<void> {
    // If sharing an existing ProxyDB, skip re-initialization
    if (this.sharedDb) {
      this.ready = true;
      return;
    }

    await super.initialize();
    await super.initializeSchema(path.join(__dirname, 'SQLiteProxy.sql'));
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
      insert: (data: ProxyHostEntry) => this.insert('proxy_hosts', data),
      upsert: async (data: ProxyHostEntry) => {
        const { proxy_id, host_id, ...rest } = data;
        return this.update('proxy_hosts', rest, { proxy_id, host_id });
      },
      delete: (where: Partial<ProxyHostEntry>) => this.delete('proxy_hosts', where),
      count: (where: Partial<ProxyHostEntry> = {}) => this.count('proxy_hosts', where)
    };
  }

  /**
   * proxies table operations
   */
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

  /**
   * Add a working proxy for a host
   * @param options - { proxy: string, type?: string, host: string }
   * @param options.proxy - Proxy address (e.g., "127.0.0.1:8080")
   * @param options.type - Proxy type: 'http' | 'https' | 'socks4' | 'socks5' (default: 'http')
   * @param options.host - Target host/domain for this proxy
   */
  async addProxy(options: { proxy: string; type?: string; host: string }): Promise<void> {
    const { proxy, type = 'http', host: hostName } = options;

    // 1. Insert or find proxy entry
    const proxyTable = await this.proxy_entries();
    let proxyEntry = await proxyTable.findOne({ proxy });
    if (!proxyEntry) {
      const result = await proxyTable.insert({ proxy, type, status: 'active' });
      proxyEntry = { id: result.insertId, proxy, type, status: 'active' } as ProxyEntry;
    }

    // 2. Ensure host exists
    const hostsTable = await this.hosts();
    let hostEntry = await hostsTable.findOne({ host: hostName });
    if (!hostEntry) {
      const result = await hostsTable.insert({ host: hostName });
      hostEntry = { id: result.insertId, host: hostName } as HostEntry;
    }

    // 3. Mark proxy as active for this host
    const proxyHostsTable = await this.proxy_hosts();
    await proxyHostsTable.upsert({
      proxy_id: proxyEntry!.id!,
      host_id: hostEntry!.id!,
      status: 'active',
      last_check: new Date().toISOString()
    });
  }

  /**
   * Mark a proxy as dead and remove from all linked hosts
   * @param proxy - Proxy address to mark as dead
   */
  async markProxyDead(proxy: string): Promise<void> {
    const proxyTable = await this.proxy_entries();
    const proxyEntry = await proxyTable.findOne({ proxy });

    if (!proxyEntry?.id) {
      // Proxy not found, nothing to do
      return;
    }

    // Remove all proxy-host relationships for this proxy
    const proxyHostsTable = await this.proxy_hosts();
    await proxyHostsTable.delete({ proxy_id: proxyEntry.id });

    // Mark the proxy as dead in the proxies table
    await proxyTable.update({ status: 'dead' }, { proxy });
  }

  /**
   * Get all active proxies for a given host
   * @param host - Target host/domain to find proxies for
   * @returns Array of proxy entries with status and last_check info
   */
  async getProxiesByHost(host: string): Promise<(ProxyEntry & { status?: string; last_check?: string })[]> {
    return this.query<ProxyEntry & { status?: string; last_check?: string }>(
      `SELECT p.*, ph.status, ph.last_check
       FROM proxies p
       INNER JOIN proxy_hosts ph ON ph.proxy_id = p.id
       INNER JOIN hosts h ON h.id = ph.host_id
       WHERE h.host = ? AND ph.status = 'active'`,
      [host]
    );
  }

  /**
   * Get a working proxy for a given host
   * @param host - Target host/domain to find a proxy for
   * @param options - Optional filters
   * @param options.random - If true, randomize the returned proxy
   * @param options.type - If specified, filter by proxy protocol type (e.g., 'http', 'https', 'socks4', 'socks5')
   * @returns Proxy address or undefined if no active proxy found
   */
  async getProxyForHost(host: string, options?: { random?: boolean; type?: string }): Promise<ProxyEntry | undefined> {
    const hostEntry = await (await this.hosts()).findOne({ host });
    if (!hostEntry) {
      console.warn(`Host '${host}' not found in proxy database.`);
      return undefined;
    }

    const activeProxyHostEntries = await (
      await this.proxy_hosts()
    ).find({
      host_id: hostEntry.id,
      status: 'active'
    });

    if (activeProxyHostEntries.length === 0) {
      console.warn(`No active proxies found for host: ${host}`);
      return undefined;
    }

    // Fetch all proxy entries for the active proxy_host entries
    const proxyEntries: ProxyEntry[] = [];
    for (const entry of activeProxyHostEntries) {
      const proxyEntry = await (await this.proxy_entries()).findOne({ id: entry.proxy_id });
      if (proxyEntry && proxyEntry.proxy) {
        proxyEntries.push(proxyEntry);
      }
    }

    if (proxyEntries.length === 0) {
      console.warn(`No valid proxy entries found for host: ${host}`);
      return undefined;
    }

    // Filter by type if specified
    let filteredEntries = proxyEntries;
    if (options?.type) {
      filteredEntries = proxyEntries.filter((p) => p.type === options.type);
      if (filteredEntries.length === 0) {
        console.warn(`No proxies of type '${options.type}' found for host: ${host}`);
        return undefined;
      }
    }

    // Randomize if requested
    if (options?.random && filteredEntries.length > 1) {
      filteredEntries = [...filteredEntries].sort(() => Math.random() - 0.5);
    }

    const selected = filteredEntries[0];
    console.log(`Using proxy: ${selected.proxy} for host: ${host}${options?.type ? ` (type: ${selected.type})` : ''}`);
    return selected;
  }
}

export default SQLiteProxy;
