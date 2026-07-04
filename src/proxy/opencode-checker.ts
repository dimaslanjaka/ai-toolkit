import ansiColors from 'ansi-colors';
import type { Proxy } from '../database/ProxyDB.js';
import { closeAllDatabases, getProductionMySQL, getSharedMarker, getSQLiteProxy } from '../database/shared.js';
import { checkProxy, type CheckProxyResult } from './checker.js';
import { getWorkingProxies } from './proxies-data.js';

const productionMySQL = getProductionMySQL();

// Marker durations
async function getUnseenWorkingProxies() {
  const proxies = await getWorkingProxies();

  const result = (await getSharedMarker()).filterUnseen(proxies.map((p) => p.proxy));
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
  const protocols = ['http', 'https', 'socks4', 'socks5'];

  // Filter out invalid credentials (e.g., "-", "-:-", empty)
  const valid = hasValidCredentials(item);

  if (!valid) {
    // If the proxy has invalid credentials, we can attempt to clear them in the production database
    try {
      await productionMySQL.update(
        'proxies',
        {
          username: '',
          password: ''
        },
        {
          proxy: item.proxy
        }
      );
    } catch (error) {
      console.warn(
        'Failed to update proxy credentials in production DB:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  let result: CheckProxyResult | undefined;
  let protocol: string | undefined;
  for (protocol of protocols) {
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
            ip: response.data?.ip,
            protocol
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
    (await getSharedMarker()).mark(item.proxy, { until: 1, unit: 'hour' });
    // write to SQLiteProxy for opencode.ai
    await (
      await getSQLiteProxy()
    ).addProxy({
      proxy: item.proxy,
      type: protocol,
      host: 'opencode.ai'
    });
  } else {
    // mark dead for configured hours
    (await getSharedMarker()).mark(item.proxy, { until: 3, unit: 'hour' });
  }

  return result;
}

export async function opencodeCheckProxy(proxiesOverride?: Proxy | Proxy[]) {
  const proxies = proxiesOverride || (await getUnseenWorkingProxies());
  if (!Array.isArray(proxies)) {
    return checkSingle(proxies);
  }
  for (let index = 0; index < proxies.length; index++) {
    const item = proxies[index];
    const result = await checkSingle(item);
    if (result?.working) {
      console.log(`Proxy ${ansiColors.green(item.proxy)} is working!`);
      // wait until protocol http found
      if (result.protocol === 'http') break;
    }
  }

  await closeAllDatabases();
}
