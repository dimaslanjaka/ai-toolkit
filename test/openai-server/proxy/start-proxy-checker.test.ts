import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

const terminal = new EventEmitter() as ChildProcess;
const spawnNewTerminal = jest.fn(() => terminal);
const releaseProxyCheckerLock = jest.fn();
const tryAcquireProxyCheckerLock = jest.fn();

jest.unstable_mockModule('../../../src/utils/spawn-new-terminal.js', () => ({
  spawnNewTerminal
}));

jest.unstable_mockModule('../../../src/proxy/proxy-checker-lock.js', () => ({
  createProxyCheckerLockEnv: jest.fn(() => ({
    AI_TOOLKIT_PROXY_CHECKER_LOCK_TOKEN: 'token'
  })),
  releaseProxyCheckerLock,
  tryAcquireProxyCheckerLock,
  PROXY_CHECKER_EXTERNAL_LOCK_ENV: 'AI_TOOLKIT_PROXY_CHECKER_EXTERNAL_LOCK'
}));

describe('startProxyChecker', () => {
  beforeEach(() => {
    spawnNewTerminal.mockClear();
    releaseProxyCheckerLock.mockClear();
    tryAcquireProxyCheckerLock.mockReset();
  });

  it('does not spawn a terminal when another process owns the lock', async () => {
    tryAcquireProxyCheckerLock.mockReturnValue({
      acquired: false,
      ownerPid: 123
    });

    const { ProxyCheckerManager } = await import('../../../src/openai-server/proxy/proxy-checker-manager.js');
    jest.spyOn(ProxyCheckerManager.prototype, 'resolveProxyCheckerRunner').mockReturnValue({
      kind: 'mjs',
      file: 'runner.mjs'
    });
    jest.spyOn(ProxyCheckerManager.prototype, 'createProxyCheckerNodeArgs').mockReturnValue(['runner.mjs']);

    const manager = new ProxyCheckerManager();
    expect(manager.startProxyCheckerNewTerminal()).toBeNull();
    expect(spawnNewTerminal).not.toHaveBeenCalled();
  });

  it('spawns a terminal after acquiring the filesystem lock', async () => {
    tryAcquireProxyCheckerLock.mockReturnValue({
      acquired: true,
      handle: {
        lockFile: 'proxy-checker.lock',
        pidFile: 'proxy-checker.pid',
        token: 'token'
      }
    });

    const { ProxyCheckerManager } = await import('../../../src/openai-server/proxy/proxy-checker-manager.js');
    jest.spyOn(ProxyCheckerManager.prototype, 'resolveProxyCheckerRunner').mockReturnValue({
      kind: 'mjs',
      file: 'runner.mjs'
    });
    jest.spyOn(ProxyCheckerManager.prototype, 'createProxyCheckerNodeArgs').mockReturnValue(['runner.mjs']);

    const manager = new ProxyCheckerManager();
    expect(manager.startProxyCheckerNewTerminal()).toBe(terminal);
    expect(spawnNewTerminal).toHaveBeenCalledTimes(1);
  });
});
