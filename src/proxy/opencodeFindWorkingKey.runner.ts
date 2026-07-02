/**
 * Runner — find working proxies for all enabled OpenCode API keys and assign them.
 *
 * For each enabled key in the database that doesn't already have a proxy assigned,
 * downloads HTTP/SOCKS5 proxy lists, finds the first working proxy, and saves it
 * to the database (both `proxies` table and `proxy_id` on the key record).
 *
 * Usage:
 *   npx tsx src/proxy/opencodeFindWorkingKey.runner.ts
 */

import { loadDotenv } from 'binary-collections';
import { downloader } from '../utils/downloader.js';
import { extractProxies } from './proxy-extractor.js';
import { opencodeFindWorkingProxy } from './opencodeFindWorkingKey.js';
import SQLiteMarker from '../database/SQLiteMarker.js';
import { getOpenCodeKeysManager, getSQLiteProxy } from '../database/shared.js';

loadDotenv();

// 1 hour in days (SQLiteMarker uses days as its validUntil unit)
const DEAD_PROXY_DAYS = 1 / 24;

const marker = new SQLiteMarker('dead-proxies.sqlite', {
  tableName: 'dead_proxies',
  keyColumn: 'proxy_url'
});

async function main() {
  try {
    // 1. Get all enabled keys from database
    const keysManager = await getOpenCodeKeysManager();
    const keys = await keysManager.getEnabledKeysWithProxy();

    if (keys.length === 0) {
      console.log('No enabled API keys found in database.');
      return;
    }

    // Filter to keys that don't already have a proxy assigned
    const keysWithoutProxy = keys.filter((k) => !k.proxy_id);

    if (keysWithoutProxy.length === 0) {
      console.log('All enabled keys already have a proxy assigned.');
      return;
    }

    console.log(`Found ${keysWithoutProxy.length} key(s) needing a proxy (out of ${keys.length} enabled).`);

    // 2. Download proxy lists (shared across all key tests)
    console.log('Downloading proxy lists...');
    const [httpRaw, socks5Raw] = await Promise.all([
      downloader('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt'),
      downloader('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt')
    ]);

    const http = extractProxies(httpRaw).map((p) => ({ ...p, type: 'http' as const }));
    const socks5 = extractProxies(socks5Raw).map((p) => ({ ...p, type: 'socks5' as const }));

    const proxies = [...http, ...socks5].sort(() => Math.random() - 0.5);

    // Pre-filter: skip proxies that were marked dead and haven't expired
    const allUrls = proxies.map((p) => `${p.type}://${p.proxy}`);
    const unseen = marker.filterUnseen(allUrls);
    const remaining = proxies.filter((p) => unseen.pending.has(`${p.type}://${p.proxy}`));

    if (remaining.length === 0) {
      console.log('All proxies are currently marked dead — nothing to test.');
      return;
    }

    console.log(
      `Testing ${remaining.length} proxies (skipping ${proxies.length - remaining.length} recently-failed)...`
    );

    // 3. Set up proxy database manager for the proxies table
    const proxyManager = await getSQLiteProxy();

    // 4. For each key without a proxy, try to find a working one
    let assigned = 0;
    for (const keyEntry of keysWithoutProxy) {
      // Use only the key string for proxy testing (no other parameters needed)
      const apiKey = keyEntry.key;
      console.log(`\n--- Testing key: ${keyEntry.name} (${apiKey.substring(0, 8)}...) ---`);

      const result = await opencodeFindWorkingProxy(apiKey, remaining, (failedProxy) => {
        marker.mark(`${failedProxy.type || 'http'}://${failedProxy.proxy}`, DEAD_PROXY_DAYS);
      });

      if (result.result && result.proxy) {
        const workingProxy = result.proxy;
        console.log(`  ✓ Working proxy found: ${workingProxy.type}://${workingProxy.proxy}`);

        // 4a. Insert the proxy into the proxies table (or find existing)
        const proxyEntry = await proxyManager.proxy_entries();
        let existing = await proxyEntry.findOne({ proxy: workingProxy.proxy });
        let proxyId: number;

        if (existing) {
          proxyId = existing.id!;
          console.log(`  Proxy already exists in database (id=${proxyId})`);
          // Update status to active in case it was dead
          await proxyEntry.update({ status: 'active' }, { id: proxyId });
        } else {
          const insertResult = await proxyEntry.insert({
            proxy: workingProxy.proxy,
            type: workingProxy.type || 'http',
            username: workingProxy.username,
            password: workingProxy.password,
            status: 'active'
          });
          proxyId = insertResult.insertId!;
          console.log(`  Proxy saved to database (id=${proxyId})`);
        }

        // 4b. Assign the proxy to the key
        const now = new Date().toISOString();
        await (await keysManager.keys()).update({ proxy_id: proxyId, updated_at: now }, { id: keyEntry.id });
        console.log(`  ✓ Proxy assigned to key "${keyEntry.name}"`);

        // 4c. Mark key usage as success
        await keysManager.markKeyUsed(keyEntry.id!, 'success');

        assigned++;
      } else {
        console.log(`  ✗ No working proxy found for key "${keyEntry.name}"`);
        await keysManager.markKeyUsed(keyEntry.id!, 'failure');
      }
    }

    console.log(`\n=== Done. Assigned proxies to ${assigned}/${keysWithoutProxy.length} key(s). ===`);
  } finally {
    marker.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
