import ProxyDB, { Proxy } from '../database/ProxyDB.js';
import { createProductionMySQL } from '../database/shared.js';
import { checkProxy, CheckProxyResult } from './checker.js';
import SQLiteMarker from '../database/SQLiteMarker.js';

let database: ProxyDB;
const marker = new SQLiteMarker('opencode-checker.db');

async function getRemoteWorkingProxies() {
  database = createProductionMySQL();
  const proxiestable = await database.proxies();
  const proxies = await proxiestable.getWorking();

  const result = marker.filterUnseen(proxies.map((p) => p.proxy));
  const filtered = proxies.filter((p) => result.pending.has(p.proxy));

  console.log(`Found ${proxies.length} proxies, ${filtered.length} pending check`);
  return filtered;
}

async function checkSingle(item: Proxy) {
  // let protocols = item.type?.split(/[,-]/) || ['http',  'socks4', 'socks5'];
  // if (protocols.length === 0) protocols = ['http',  'socks4', 'socks5'];
  const protocols = ['http', 'socks4', 'socks5'];

  // Filter out invalid credentials (e.g., "-", "-:-", empty)
  const hasValidCredentials =
    item.username &&
    item.password &&
    item.username !== '-' &&
    item.password !== '-' &&
    !item.username.includes('-:') &&
    !item.password.includes('-:');

  if (!hasValidCredentials) {
    await database.update('proxies', { username: '', password: '' }, { proxy: item.proxy });
  }

  let result: CheckProxyResult | undefined = undefined;
  for (const protocol of protocols) {
    const built = `${protocol}://${hasValidCredentials ? `${item.username}:${item.password}@` : ''}${item.proxy}`;
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
    // mark working for 1 day
    marker.mark(item.proxy, 1);
  } else {
    // mark dead for 1 hour
    const oneHour = 1 / 24;
    marker.mark(item.proxy, oneHour);
  }

  return result;
}

async function main() {
  const proxies = await getRemoteWorkingProxies();
  for (let index = 0; index < proxies.length; index++) {
    const item = proxies[index];
    const result = await checkSingle(item);
    if (result?.working) {
      console.log(`Proxy ${item.proxy} is working!`);
      break;
    }
  }
}

main()
  .catch(console.error)
  .finally(() => {
    database.close();
    marker.close();
  });
