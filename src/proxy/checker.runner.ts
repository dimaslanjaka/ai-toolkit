import { loadDotenv } from 'binary-collections';
import { Proxy } from '../database/ProxyDB.js';
import { closeAllDatabases, getProductionMySQL } from '../database/shared.js';
import { checkProxy, CheckProxyResult } from './checker.js';
import { getWorkingProxies } from './proxies-data.js';
import {
  adoptProxyCheckerLock,
  getProxyCheckerLockFromEnv,
  PROXY_CHECKER_EXTERNAL_LOCK_ENV,
  releaseProxyCheckerLock,
  tryAcquireProxyCheckerLock,
  type ProxyCheckerLockHandle
} from './proxy-checker-lock.js';

loadDotenv();

async function checkHttps(proxies: Proxy[]) {
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

    const table_proxies = await getProductionMySQL().proxies();
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

async function run() {
  const externalLock = process.env[PROXY_CHECKER_EXTERNAL_LOCK_ENV] === '1';
  let lock: ProxyCheckerLockHandle | null = getProxyCheckerLockFromEnv();

  if (!externalLock && !lock) {
    const acquired = tryAcquireProxyCheckerLock();

    if (!acquired.acquired) {
      console.log(
        acquired.ownerPid
          ? `Proxy checker is already running with PID ${acquired.ownerPid}`
          : 'Proxy checker is already running'
      );
      return;
    }

    lock = acquired.handle;
  }

  if (lock && !adoptProxyCheckerLock(lock)) {
    console.log('Proxy checker lock ownership changed before startup');
    return;
  }

  const cleanup = () => {
    if (lock) {
      releaseProxyCheckerLock(lock);
    }
  };
  const stop = () => {
    cleanup();
    process.exit(0);
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    const result = await getWorkingProxies().then(checkHttps);
    console.log(result);
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    cleanup();
    await closeAllDatabases();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
