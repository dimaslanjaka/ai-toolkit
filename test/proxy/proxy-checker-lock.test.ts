import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  adoptProxyCheckerLock,
  getProxyCheckerRuntimeFiles,
  releaseProxyCheckerLock,
  tryAcquireProxyCheckerLock
} from '../../src/proxy/proxy-checker-lock.js';

const temporaryRoots: string[] = [];

function createTemporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'proxy-checker-lock-'));

  temporaryRoots.push(root);

  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('proxy checker lock', () => {
  it('allows only one owner across repeated acquisitions', () => {
    const root = createTemporaryRoot();
    const first = tryAcquireProxyCheckerLock(root);
    const second = tryAcquireProxyCheckerLock(root);

    expect(first.acquired).toBe(true);
    expect(second).toEqual({
      acquired: false,
      ownerPid: process.pid
    });
  });

  it('allows the checker process to adopt and release a launch lock', () => {
    const root = createTemporaryRoot();
    const acquired = tryAcquireProxyCheckerLock(root);

    expect(acquired.acquired).toBe(true);

    if (!acquired.acquired) {
      throw new Error('Expected lock acquisition');
    }

    expect(adoptProxyCheckerLock(acquired.handle)).toBe(true);
    expect(readFileSync(acquired.handle.pidFile, 'utf8')).toBe(String(process.pid));
    expect(releaseProxyCheckerLock(acquired.handle)).toBe(true);
  });

  it('replaces a stale lock after its startup grace period', () => {
    const root = createTemporaryRoot();
    const { lockFile } = getProxyCheckerRuntimeFiles(root);
    const initial = tryAcquireProxyCheckerLock(root);

    expect(initial.acquired).toBe(true);

    writeFileSync(
      lockFile,
      JSON.stringify({
        ownerPid: 2147483647,
        createdAt: new Date(0).toISOString()
      })
    );

    expect(tryAcquireProxyCheckerLock(root, 0).acquired).toBe(true);
  });

  it('honors a live checker PID after its original launcher exits', () => {
    const root = createTemporaryRoot();
    const acquired = tryAcquireProxyCheckerLock(root);

    expect(acquired.acquired).toBe(true);

    if (!acquired.acquired) {
      throw new Error('Expected lock acquisition');
    }

    writeFileSync(acquired.handle.pidFile, String(process.pid));
    writeFileSync(
      acquired.handle.lockFile,
      JSON.stringify({
        ownerPid: 2147483647,
        createdAt: new Date(0).toISOString()
      })
    );

    expect(tryAcquireProxyCheckerLock(root, 0)).toEqual({
      acquired: false,
      ownerPid: process.pid
    });
  });
});
