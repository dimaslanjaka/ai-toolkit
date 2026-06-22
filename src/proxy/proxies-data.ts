import { Proxy } from '../database/ProxyDB.js';
import { getLocalMySQL, getProductionMySQL, getSQLite } from '../database/shared.js';

/**
 * Fetches working proxies from all configured databases (production MySQL,
 * local MySQL, and SQLite) and deduplicates them by proxy address.
 *
 * @param limit - Maximum number of proxies to retrieve from each source.
 * Defaults to 100.
 * @returns A promise that resolves to an array of unique working proxies.
 */
export async function getWorkingProxies(limit = 100): Promise<Proxy[]> {
  const proxiesMap = new Map<string, Proxy>();

  // Try production MySQL
  try {
    const proxiestable = await getProductionMySQL().proxies();
    const remoteProxies = await proxiestable.getWorking(limit);
    for (const proxy of remoteProxies) {
      proxiesMap.set(proxy.proxy, proxy);
    }
  } catch (error) {
    console.warn('Production MySQL unavailable, skipping:', error instanceof Error ? error.message : String(error));
  }

  // Try local MySQL
  try {
    const proxiestable = await getLocalMySQL().proxies();
    const localProxies = await proxiestable.getWorking(limit);
    for (const proxy of localProxies) {
      proxiesMap.set(proxy.proxy, proxy);
    }
  } catch (error) {
    console.warn('Local MySQL unavailable, skipping:', error instanceof Error ? error.message : String(error));
  }

  // Try SQLite (should always work)
  try {
    const proxiestable = await (await getSQLite()).proxies();
    const sqliteProxies = await proxiestable.getWorking(limit);
    for (const proxy of sqliteProxies) {
      proxiesMap.set(proxy.proxy, proxy);
    }
  } catch (error) {
    console.warn('SQLite unavailable, skipping:', error instanceof Error ? error.message : String(error));
  }

  return Array.from(proxiesMap.values());
}

/**
 * Marks a proxy as dead across all database tables.
 *
 * If a protocol is specified, it is removed from the proxy's `type` column
 * (cleaning up comma/hyphen separated values). If the protocol is omitted,
 * the proxy's `status` column is set to `'dead'` instead.
 *
 * @param proxy - The proxy address in `IP:PORT` format.
 * @param protocol - A single protocol identifier to remove from the proxy's
 * type. If omitted, the proxy's status is set to `'dead'`.
 * @returns A promise that resolves when all database updates are complete.
 */
export async function invalidateProxyEverywhere(proxy: string, protocol?: string): Promise<void> {
  const tables: { name: string; instance: ReturnType<typeof getProductionMySQL> }[] = [
    { name: 'production', instance: getProductionMySQL() },
    { name: 'local', instance: getLocalMySQL() }
  ];

  const results = await Promise.allSettled(
    tables.map(async ({ instance }) => {
      const proxiestable = await instance.proxies();
      if (protocol) {
        const existingProtocol = (await proxiestable.find({ proxy }))[0]?.type || '';
        const cleanProtocol = existingProtocol
          .replace(protocol, '')
          .split(/[,-]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .join('-');
        return await proxiestable.update({ type: cleanProtocol }, { proxy });
      } else {
        return await proxiestable.update({ status: 'dead' }, { proxy });
      }
    })
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      // Log silently - this is a best-effort operation
    }
  }

  // Also try SQLite
  try {
    const proxiestable = await (await getSQLite()).proxies();
    if (protocol) {
      const existingProtocol = (await proxiestable.find({ proxy }))[0]?.type || '';
      const cleanProtocol = existingProtocol
        .replace(protocol, '')
        .split(/[,-]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .join('-');
      await proxiestable.update({ type: cleanProtocol }, { proxy });
    } else {
      await proxiestable.update({ status: 'dead' }, { proxy });
    }
  } catch {
    // Best-effort
  }
}
