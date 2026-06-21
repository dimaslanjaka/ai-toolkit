import { Proxy } from '../database/ProxyDB.js';
import { getLocalMySQL, getProductionMySQL, getSQLite } from '../database/shared.js';

export async function getWorkingProxies(limit = 100) {
  const proxiesMap = new Map<string, Proxy>();

  let proxiestable = await getProductionMySQL().proxies();
  const remoteProxies = await proxiestable.getWorking(limit);
  for (const proxy of remoteProxies) {
    proxiesMap.set(proxy.proxy, proxy);
  }

  proxiestable = await getLocalMySQL().proxies();
  const localProxies = await proxiestable.getWorking(limit);
  for (const proxy of localProxies) {
    proxiesMap.set(proxy.proxy, proxy);
  }

  const sqlite = await getSQLite();
  proxiestable = await sqlite.proxies();
  const sqliteProxies = await proxiestable.getWorking(limit);
  for (const proxy of sqliteProxies) {
    proxiesMap.set(proxy.proxy, proxy);
  }

  return Array.from(proxiesMap.values());
}
