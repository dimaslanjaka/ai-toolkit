import path from 'path';
import { ProxyDB } from './ProxyDB.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ProxyEntry {
  id?: number;
  proxy: string;
  /** 'http' | 'https' | 'socks4' | 'socks5' */
  type?: string;
  username?: string;
  password?: string;
  status?: string;
  latency?: string;
  last_check?: string;
  region?: string;
  city?: string;
  country?: string;
  timezone?: string;
  latitude?: string;
  longitude?: string;
  anonymity?: string;
  https?: string;
  private?: string;
  lang?: string;
  useragent?: string;
  webgl_vendor?: string;
  webgl_renderer?: string;
  browser_vendor?: string;
}

export interface HostEntry {
  id?: number;
  host: string;
  created_at?: string;
}

export interface ProxyHostEntry {
  proxy_id: number;
  host_id: number;
  status?: string;
  last_check?: string;
  created_at?: string;
}

export class SQLiteProxy extends ProxyDB {
  /**
   * Initialize the database and apply schema if needed
   */
  async initialize(): Promise<void> {
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
   * Get a working proxy for a given host
   * @param host - Target host/domain to find a proxy for
   * @returns Proxy address or undefined if no active proxy found
   */
  async getProxyForHost(host: string): Promise<string | undefined> {
    // Find proxies associated with the host and that are marked as 'active' or 'working'
    // This assumes the 'proxies' and 'proxy_hosts' tables are set up and populated.
    // We'll look for proxies linked to the host and return the first one found that is 'active' or 'working'.
    const hostEntry = await (await this.hosts()).findOne({ host });
    if (!hostEntry) {
      console.warn(`Host '${host}' not found in proxy database.`);
      return undefined;
    }

    const activeProxyHostEntries = await (
      await this.proxy_hosts()
    ).find({
      host_id: hostEntry.id,
      status: 'active' // Or consider 'working' if that's a separate status
    });

    if (activeProxyHostEntries.length > 0) {
      // Get proxy details for the first active entry
      const proxyEntry = await (await this.proxy_entries()).findOne({ id: activeProxyHostEntries[0].proxy_id });
      if (proxyEntry && proxyEntry.proxy) {
        console.log(`Using proxy: ${proxyEntry.proxy} for host: ${host}`);
        return proxyEntry.proxy;
      }
    }

    console.warn(`No active proxies found for host: ${host}`);
    return undefined;
  }
}

export default SQLiteProxy;
