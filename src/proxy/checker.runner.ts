import Bluebird from 'bluebird';
import ProxyDB from '../database/ProxyDB.js';
import { createProductionMySQL } from '../database/shared.js';
import { checkProxy, CheckProxyResult } from './checker.js';

const databases: Record<string, ProxyDB> = {};

async function getRemoteWorkingProxies() {
  if (!databases.remote) databases.remote = createProductionMySQL();
  const proxiestable = await databases.remote.proxies();
  const proxies = await proxiestable.getWorking();
  return proxies;
}

async function _check() {
  const proxies = await getRemoteWorkingProxies();
  let result: CheckProxyResult | undefined = undefined;
  for (const proxy of proxies) {
    let protocols = proxy.type?.split(/,-/) || ['http', 'https', 'socks4', 'socks5'];
    if (protocols.length === 0) protocols = ['http', 'https', 'socks4', 'socks5'];
    let shouldBreak = false;
    for (const protocol of protocols) {
      const proxyUrl = `${protocol}://${proxy.username ? `${proxy.username}:${proxy.password}@` : ''}${proxy.proxy}`;
      console.log(`Checking proxy: ${proxyUrl}`);
      result = await checkProxy({
        proxy: proxyUrl,
        callback: (proxy, _endpoint, response) => {
          if (response.status >= 200 && response.status < 300) {
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
              error: `Unexpected status code: ${response.status}`
            };
          }
        }
      });
      console.log(result);
      if (result.working) {
        shouldBreak = true;
        break;
      }
    }
    if (shouldBreak) break;
  }
}

_check()
  .then(console.log)
  .catch(console.error)
  .finally(() => {
    Bluebird.each(Object.values(databases), (db) => db.close());
  });
