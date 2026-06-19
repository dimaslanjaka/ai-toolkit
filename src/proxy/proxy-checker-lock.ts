import { randomUUID } from 'node:crypto';
import fs from 'fs-extra';
import path from 'upath';

export const PROXY_CHECKER_LOCK_FILE_ENV = 'AI_TOOLKIT_PROXY_CHECKER_LOCK_FILE';
export const PROXY_CHECKER_LOCK_TOKEN_ENV = 'AI_TOOLKIT_PROXY_CHECKER_LOCK_TOKEN';
export const PROXY_CHECKER_PID_FILE_ENV = 'AI_TOOLKIT_PROXY_CHECKER_PID_FILE';
export const PROXY_CHECKER_EXTERNAL_LOCK_ENV = 'AI_TOOLKIT_PROXY_CHECKER_EXTERNAL_LOCK';

const DEFAULT_STARTUP_GRACE_MS = 10_000;

interface ProxyCheckerLockRecord {
  token?: string;
  ownerPid: number;
  state?: 'starting' | 'running';
  createdAt: string;
  updatedAt?: string;
}

export interface ProxyCheckerLockHandle {
  lockFile: string;
  pidFile: string;
  token: string;
}

export type ProxyCheckerLockResult =
  | {
      acquired: true;
      handle: ProxyCheckerLockHandle;
    }
  | {
      acquired: false;
      ownerPid: number | null;
    };

export function getProxyCheckerRuntimeFiles(root = process.cwd()) {
  const logsDir = path.join(path.resolve(root), 'tmp', 'logs');

  return {
    lockFile: path.join(logsDir, 'proxy-checker.lock'),
    pidFile: path.join(logsDir, 'proxy-checker.pid')
  };
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockRecord(lockFile: string): ProxyCheckerLockRecord | null {
  try {
    return JSON.parse(fs.readFileSync(lockFile, 'utf8')) as ProxyCheckerLockRecord;
  } catch {
    return null;
  }
}

function readPidFile(pidFile: string): number | null {
  try {
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());

    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function getLockAge(lockFile: string, record: ProxyCheckerLockRecord | null): number {
  const timestamp = record?.updatedAt ?? record?.createdAt;

  if (timestamp) {
    const parsed = Date.parse(timestamp);

    if (Number.isFinite(parsed)) {
      return Date.now() - parsed;
    }
  }

  try {
    return Date.now() - fs.statSync(lockFile).mtimeMs;
  } catch {
    return 0;
  }
}

function removeLockIfUnchanged(lockFile: string, expectedContent: string): boolean {
  try {
    if (fs.readFileSync(lockFile, 'utf8') !== expectedContent) {
      return false;
    }

    fs.unlinkSync(lockFile);
    return true;
  } catch {
    return false;
  }
}

export function tryAcquireProxyCheckerLock(
  root = process.cwd(),
  startupGraceMs = DEFAULT_STARTUP_GRACE_MS
): ProxyCheckerLockResult {
  const { lockFile, pidFile } = getProxyCheckerRuntimeFiles(root);

  fs.mkdirSync(path.dirname(lockFile), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = randomUUID();
    let descriptor: number | null = null;

    try {
      descriptor = fs.openSync(lockFile, 'wx');
      fs.writeFileSync(
        descriptor,
        JSON.stringify(
          {
            token,
            ownerPid: process.pid,
            state: 'starting',
            createdAt: new Date().toISOString()
          } satisfies ProxyCheckerLockRecord,
          null,
          2
        )
      );

      return {
        acquired: true,
        handle: {
          lockFile,
          pidFile,
          token
        }
      };
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException;

      if (fileError.code !== 'EEXIST') {
        throw error;
      }

      let existingContent: string;

      try {
        existingContent = fs.readFileSync(lockFile, 'utf8');
      } catch {
        continue;
      }

      const existing = readLockRecord(lockFile);
      const ownerPid = Number.isInteger(existing?.ownerPid) ? existing!.ownerPid : null;
      const runtimePid = readPidFile(pidFile);

      if (runtimePid && isProcessAlive(runtimePid)) {
        return {
          acquired: false,
          ownerPid: runtimePid
        };
      }

      if ((ownerPid && isProcessAlive(ownerPid)) || getLockAge(lockFile, existing) < startupGraceMs) {
        return {
          acquired: false,
          ownerPid
        };
      }

      if (!removeLockIfUnchanged(lockFile, existingContent)) {
        return {
          acquired: false,
          ownerPid
        };
      }

      if (runtimePid && !isProcessAlive(runtimePid)) {
        try {
          fs.unlinkSync(pidFile);
        } catch {
          // Another process may already have removed the stale PID file.
        }
      }
    } finally {
      if (descriptor !== null) {
        fs.closeSync(descriptor);
      }
    }
  }

  return {
    acquired: false,
    ownerPid: null
  };
}

export function createProxyCheckerLockEnv(
  handle: ProxyCheckerLockHandle,
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return {
    ...env,
    [PROXY_CHECKER_LOCK_FILE_ENV]: handle.lockFile,
    [PROXY_CHECKER_PID_FILE_ENV]: handle.pidFile,
    [PROXY_CHECKER_LOCK_TOKEN_ENV]: handle.token
  };
}

export function getProxyCheckerLockFromEnv(env: NodeJS.ProcessEnv = process.env): ProxyCheckerLockHandle | null {
  const lockFile = env[PROXY_CHECKER_LOCK_FILE_ENV];
  const pidFile = env[PROXY_CHECKER_PID_FILE_ENV];
  const token = env[PROXY_CHECKER_LOCK_TOKEN_ENV];

  if (!lockFile || !pidFile || !token) {
    return null;
  }

  return {
    lockFile,
    pidFile,
    token
  };
}

export function adoptProxyCheckerLock(handle: ProxyCheckerLockHandle): boolean {
  const record = readLockRecord(handle.lockFile);

  if (record?.token !== handle.token) {
    return false;
  }

  fs.writeFileSync(
    handle.lockFile,
    JSON.stringify(
      {
        ...record,
        ownerPid: process.pid,
        state: 'running',
        updatedAt: new Date().toISOString()
      } satisfies ProxyCheckerLockRecord,
      null,
      2
    )
  );
  fs.writeFileSync(handle.pidFile, String(process.pid), 'utf8');

  return true;
}

export function releaseProxyCheckerLock(handle: ProxyCheckerLockHandle, ownerPid = process.pid): boolean {
  const record = readLockRecord(handle.lockFile);

  if (record?.token !== handle.token) {
    return false;
  }

  try {
    fs.unlinkSync(handle.lockFile);
  } catch {
    return false;
  }

  try {
    if (Number(fs.readFileSync(handle.pidFile, 'utf8').trim()) === ownerPid) {
      fs.unlinkSync(handle.pidFile);
    }
  } catch {
    // The PID file is optional during the launch handoff.
  }

  return true;
}
