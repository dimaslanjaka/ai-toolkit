import {
  createProxyCheckerLockEnv,
  releaseProxyCheckerLock,
  tryAcquireProxyCheckerLock
} from '../../proxy/proxy-checker-lock.js';
import { spawnNewTerminal } from '../../utils/spawn-new-terminal.js';
import { createProxyCheckerNodeArgs, resolveProxyCheckerRunner } from './proxy-checker-runner.js';

export function startProxyCheckerNewTerminal(args: string[] = [], keepOpen = false) {
  const cwd = process.cwd();
  const lock = tryAcquireProxyCheckerLock(cwd);

  if (!lock.acquired) {
    return null;
  }

  try {
    const runner = resolveProxyCheckerRunner(cwd);
    const nodeArgs = createProxyCheckerNodeArgs(runner, args);
    const terminal = spawnNewTerminal('node', nodeArgs, {
      cwd,
      keepOpen,
      title: keepOpen ? 'Proxy Checker Debug' : 'Proxy Checker',
      env: createProxyCheckerLockEnv(lock.handle)
    });

    terminal.once('error', () => {
      releaseProxyCheckerLock(lock.handle);
    });

    return terminal;
  } catch (error) {
    releaseProxyCheckerLock(lock.handle);
    throw error;
  }
}
