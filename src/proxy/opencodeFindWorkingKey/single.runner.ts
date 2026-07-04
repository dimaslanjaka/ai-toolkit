import { loadDotenv } from 'binary-collections';
import { array_random } from 'sbg-utility';
import { closeAllDatabases, getOpenCodeKeysManager, getSharedMarker, getSQLiteProxy } from '../../database/shared.js';
import { downloadProxies } from '../download-proxies.js';
import { opencodeFindWorkingProxy } from '../opencodeFindWorkingKey.js';

loadDotenv();

async function main() {
  // 1. Get the first enabled key from database
  const keysManager = await getOpenCodeKeysManager();
  const keys = await keysManager.getEnabledKeysWithProxy();

  if (keys.length === 0) {
    console.log('No enabled API keys found in database.');
    return;
  }

  const keyEntry = array_random(keys);
  const apiKey = keyEntry.key;
  console.log(`Testing key: ${keyEntry.name} (${apiKey.substring(0, 8)}...)`);

  // 2. Download proxy lists
  console.log('Downloading proxy lists...');
  const proxies = await downloadProxies();

  // Pre-filter: skip proxies marked dead if they haven't expired
  const allUrls = proxies.map((p) => p.proxy);
  const unseen = (await getSharedMarker({ tableName: 'dead_proxies', keyColumn: 'proxy_url' })).filterUnseen(allUrls);
  const remaining = proxies.filter((p) => unseen.pending.has(p.proxy));

  if (remaining.length === 0) {
    console.log('All proxies currently marked dead; nothing to test.');
    return;
  }

  console.log(`Testing ${remaining.length} proxies (skipping ${proxies.length - remaining.length} recently-failed)...`);

  // 3. Set up proxy database manager with proxies table
  const proxyManager = await getSQLiteProxy();

  // 4. Try to find working proxy for the single key
  const result = await opencodeFindWorkingProxy(apiKey, remaining, async (failedProxy) => {
    (await getSharedMarker({ tableName: 'dead_proxies', keyColumn: 'proxy_url' })).mark(failedProxy.proxy, {
      until: 1,
      unit: 'hour'
    });
  });

  if (result.result && result.proxy) {
    const workingProxy = result.proxy;
    console.log(`Working proxy found: ${workingProxy.type}://${workingProxy.proxy}`);

    // 4a. Insert proxy into proxies table (or find existing)
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

    // 4b. Assign proxy to key
    const now = new Date().toISOString();
    await (await keysManager.keys()).update({ proxy_id: proxyId, updated_at: now }, { id: keyEntry.id });
    console.log(`  ✓ Proxy assigned to key "${keyEntry.name}"`);

    // 4c. Mark key usage as success
    await keysManager.markKeyUsed(keyEntry.id!, 'success');
  } else {
    console.log(`  ✗ No working proxy found for key "${keyEntry.name}"`);
    await keysManager.markKeyUsed(keyEntry.id!, 'failure');
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closeAllDatabases();
  });
