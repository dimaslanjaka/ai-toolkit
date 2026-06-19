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
  tryAcquireProxyCheckerLock
}));

jest.unstable_mockModule('../../../src/openai-server/proxy/proxy-checker-runner.js', () => ({
  createProxyCheckerNodeArgs: jest.fn(() => ['runner.mjs']),
  resolveProxyCheckerRunner: jest.fn(() => ({
    kind: 'mjs',
    file: 'runner.mjs'
  }))
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

    const { startProxyCheckerNewTerminal: startProxyChecker } =
      await import('../../../src/openai-server/proxy/start-proxy-checker-new-terminal.js');

    expect(startProxyChecker()).toBeNull();
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

    const { startProxyCheckerNewTerminal: startProxyChecker } =
      await import('../../../src/openai-server/proxy/start-proxy-checker-new-terminal.js');

    expect(startProxyChecker()).toBe(terminal);
    expect(spawnNewTerminal).toHaveBeenCalledTimes(1);
  });
});
