import Bluebird from 'bluebird';
import ProxyDB from '../database/ProxyDB.js';
import { getProductionMySQL } from '../database/shared.js';
import { checkProxy, CheckProxyResult } from './checker.js';

const databases: Record<string, ProxyDB> = {};

async function getRemoteWorkingProxies() {
  if (!databases.remote) databases.remote = getProductionMySQL();
  const proxiestable = await databases.remote.proxies();
  const proxies = await proxiestable.getWorking();
  return proxies;
}

async function _check() {
  const proxies = await getRemoteWorkingProxies();
  let result: CheckProxyResult | undefined = undefined;
  for (const item of proxies) {
    const VALID_PROTOCOLS = ['http', 'socks4', 'socks5'];
    let protocols = item.type?.split(/[,|-]+/).filter((p: string) => VALID_PROTOCOLS.includes(p)) || [];
    if (protocols.length === 0) protocols = [...VALID_PROTOCOLS];
    let shouldBreak = false;
    let protocol;
    for (protocol of protocols) {
      const proxyUrl = `${protocol}://${item.username ? `${item.username}:${item.password}@` : ''}${item.proxy}`;
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
      // console.log(result);
      if (result.working) {
        shouldBreak = true;
        break;
      }
    }

    const table_proxies = await databases.remote.proxies();
    if (shouldBreak) {
      // got working proxy
      await table_proxies.update({ status: 'active', type: protocol, https: 'true' }, { proxy: item.proxy });
      break;
    } else {
      // all protocols dead
      await table_proxies.update({ status: 'dead', type: '' }, { proxy: item.proxy });
    }
  }
  return result;
}

_check()
  .then(console.log)
  .catch(console.error)
  .finally(() => {
    Bluebird.each(Object.values(databases), (db) => db.close());
  });
