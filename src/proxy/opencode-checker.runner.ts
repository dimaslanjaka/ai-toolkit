import {
  adoptProxyCheckerLock,
  getProxyCheckerLockFromEnv,
  PROXY_CHECKER_EXTERNAL_LOCK_ENV,
  releaseProxyCheckerLock,
  tryAcquireProxyCheckerLock,
  type ProxyCheckerLockHandle
} from './proxy-checker-lock.js';
import { opencodeCheckProxy } from './opencode-checker.js';

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
    await opencodeCheckProxy();
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    cleanup();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
