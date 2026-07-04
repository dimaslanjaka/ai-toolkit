import { loadDotenv } from 'binary-collections';
import { opencodeCheckProxy } from './opencode-checker.js';
import { parseRunnerArgs } from './runner-args.js';
import { Proxy } from '../database/ProxyDB.js';
import { closeAllDatabases, getSQLiteProxy } from '../database/shared.js';
import {
  adoptProxyCheckerLock,
  getProxyCheckerLockFromEnv,
  PROXY_CHECKER_EXTERNAL_LOCK_ENV,
  releaseProxyCheckerLock,
  tryAcquireProxyCheckerLock,
  type ProxyCheckerLockHandle
} from './proxy-checker-lock.js';

loadDotenv();

async function run() {
  const externalLock = process.env[PROXY_CHECKER_EXTERNAL_LOCK_ENV] === '1';
  let lock: ProxyCheckerLockHandle | null = getProxyCheckerLockFromEnv();

  if (!externalLock && !lock) {
    const acquired = tryAcquireProxyCheckerLock();

    if ('ownerPid' in acquired) {
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
    const { proxies: proxyAddresses } = parseRunnerArgs();
    if (proxyAddresses) {
      const proxyDb = await getSQLiteProxy();
      const proxiesApi = await proxyDb.proxies();
      const proxies: Proxy[] = [];
      for (const addr of proxyAddresses) {
        const r = await proxiesApi.findOne({ proxy: addr });
        if (r) proxies.push(r);
      }
      console.log(`Re-checking ${proxies.length} specific proxies`);
      await opencodeCheckProxy(proxies);
    } else {
      await opencodeCheckProxy();
    }
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
