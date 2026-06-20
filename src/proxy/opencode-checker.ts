import { Proxy } from '../database/ProxyDB.js';
import SQLiteMarker from '../database/SQLiteMarker.js';
import { getProductionMySQL, getSQLite } from '../database/shared.js';
import type { ProxyEntry } from '../database/types.js';
import { SQLiteProxy } from '../database/SQLiteProxy.js';
import { checkProxy, CheckProxyResult } from './checker.js';

const database = getProductionMySQL();
let sharedSqlite: Awaited<ReturnType<typeof getSQLite>>;
let marker: SQLiteMarker;
let proxyDb: SQLiteProxy;

async function initSharedSqlite() {
  if (!sharedSqlite) {
    sharedSqlite = await getSQLite();
    marker = new SQLiteMarker('', { sharedDb: sharedSqlite });
    proxyDb = new SQLiteProxy(sharedSqlite);
    await proxyDb.initialize();
  }
}

// Marker durations (in days)
const WORKING_PROXY_HOURS = 1 / 24; // 1 hour
const DEAD_PROXY_HOURS = 3 / 24; // 3 hours

async function getRemoteWorkingProxies() {
  await initSharedSqlite();
  const proxiestable = await database.proxies();
  const proxies = await proxiestable.getWorking();

  const result = marker.filterUnseen(proxies.map((p) => p.proxy));
  const filtered = proxies.filter((p) => result.pending.has(p.proxy));

  console.log(`Found ${proxies.length} proxies, ${filtered.length} pending check`);
  return filtered;
}

export function hasValidCredentials(item: Proxy) {
  return (
    item.username &&
    item.password &&
    item.username !== '-' &&
    item.password !== '-' &&
    !item.username.includes('-:') &&
    !item.password.includes('-:')
  );
}

async function checkSingle(item: Proxy) {
  const protocols = ['http', 'socks4', 'socks5'];

  // Filter out invalid credentials (e.g., "-", "-:-", empty)
  const valid = hasValidCredentials(item);

  if (!valid) {
    await database.update('proxies', { username: '', password: '' }, { proxy: item.proxy });
  }

  let result: CheckProxyResult | undefined = undefined;
  for (const protocol of protocols) {
    const built = `${protocol}://${valid ? `${item.username}:${item.password}@` : ''}${item.proxy}`;
    console.log(`Checking proxy: ${built}`);
    result = await checkProxy({
      proxy: built,
      endpoint: 'https://opencode.ai/zen/v1/responses',
      callback: (proxy, _endpoint, response) => {
        const responseBodyValid = String(response.data).includes('OpenCode');
        if (responseBodyValid) {
          return {
            proxy: proxy,
            working: true,
            status: response.status,
            ip: response.data?.ip
          };
        } else {
          return {
            proxy: proxy,
            working: false,
            status: response.status,
            error: response.statusText
          };
        }
      }
    });
    if (result.working) {
      break;
    }
  }

  if (result?.working) {
    // mark working for configured hours
    marker.mark(item.proxy, WORKING_PROXY_HOURS);
    // write to SQLiteProxy for opencode.ai
    await proxyDb.addProxy({
      proxy: item.proxy,
      type: item.type as ProxyEntry['type'],
      host: 'opencode.ai'
    });
  } else {
    // mark dead for configured hours
    marker.mark(item.proxy, DEAD_PROXY_HOURS);
  }

  return result;
}

export async function opencodeCheckProxy() {
  await initSharedSqlite();
  const proxies = await getRemoteWorkingProxies();
  for (let index = 0; index < proxies.length; index++) {
    const item = proxies[index];
    const result = await checkSingle(item);
    if (result?.working) {
      console.log(`Proxy ${item.proxy} is working!`);
      break;
    }
  }

  await database.close();
  marker.close();
  // proxyDb.close() is now handled by the shared instance
}
