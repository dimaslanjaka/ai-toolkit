import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import process from 'node:process';
import fs from 'fs-extra';
import path from 'upath';
import {
  PROXY_CHECKER_EXTERNAL_LOCK_ENV,
  createProxyCheckerLockEnv,
  releaseProxyCheckerLock,
  tryAcquireProxyCheckerLock
} from '../../proxy/proxy-checker-lock.js';
import { spawnNewTerminal } from '../../utils/spawn-new-terminal.js';

export type ProxyCheckerRunnerKind = 'ts' | 'mjs' | 'cjs';

export interface ResolvedProxyCheckerRunner {
  kind: ProxyCheckerRunnerKind;
  file: string;
}

export type ProxyCheckerState = 'idle' | 'starting' | 'running' | 'finished' | 'failed' | 'stopped' | 'locked';

export interface ProxyCheckerStatus {
  state: ProxyCheckerState;
  pid: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  lastError: string | null;
  logFile: string;
  pidFile: string;
  lockFile: string;
  lockExists: boolean;
  pidAlive: boolean;
}

export class ProxyCheckerManager {
  private child: ChildProcessWithoutNullStreams | null = null;

  private state: ProxyCheckerState = 'idle';
  private startedAt: string | null = null;
  private finishedAt: string | null = null;
  private exitCode: number | null = null;
  private signal: NodeJS.Signals | null = null;
  private lastError: string | null = null;

  private readonly projectRoot: string;
  private readonly logFile: string;
  private readonly pidFile: string;
  private readonly lockFile: string;

  constructor(projectRoot = process.cwd()) {
    this.projectRoot = path.normalize(projectRoot);

    const tmpDir = path.join(this.projectRoot, 'tmp');

    this.logFile = path.join(tmpDir, 'logs/proxy-checker.log');
    this.pidFile = path.join(tmpDir, 'logs/proxy-checker.pid');
    this.lockFile = path.join(tmpDir, 'logs/proxy-checker.lock');
  }

  getProxyCheckerRunnerCandidates(): ResolvedProxyCheckerRunner[] {
    const packageRoot = path.join(this.projectRoot, 'node_modules', '@dimaslanjaka', 'ai-toolkit');

    return [
      // Local development.
      {
        kind: 'ts',
        file: path.join(this.projectRoot, 'src', 'proxy', 'opencode-checker.runner.ts')
      },
      {
        kind: 'mjs',
        file: path.join(this.projectRoot, 'dist', 'proxy', 'opencode-checker.runner.mjs')
      },
      {
        kind: 'cjs',
        file: path.join(this.projectRoot, 'dist', 'proxy', 'opencode-checker.runner.cjs')
      },

      // Installed package.
      {
        kind: 'mjs',
        file: path.join(packageRoot, 'dist', 'proxy', 'opencode-checker.runner.mjs')
      },
      {
        kind: 'cjs',
        file: path.join(packageRoot, 'dist', 'proxy', 'opencode-checker.runner.cjs')
      },
      {
        kind: 'ts',
        file: path.join(packageRoot, 'src', 'proxy', 'opencode-checker.runner.ts')
      }
    ];
  }

  resolveProxyCheckerRunner(): ResolvedProxyCheckerRunner {
    const candidates = this.getProxyCheckerRunnerCandidates();
    const found = candidates.find((candidate) => fs.existsSync(candidate.file));

    if (found) {
      return found;
    }

    throw new Error(
      ['Proxy checker runner not found.', ...candidates.map((candidate) => `Checked: ${candidate.file}`)].join('\n')
    );
  }

  createProxyCheckerNodeArgs(runner: ResolvedProxyCheckerRunner, extraArgs: string[] = []): string[] {
    if (runner.kind === 'ts') {
      return ['--no-warnings=ExperimentalWarning', '--loader', 'ts-node/esm', runner.file, ...extraArgs];
    }

    return [runner.file, ...extraArgs];
  }

  startProxyCheckerNewTerminal(args: string[] = [], keepOpen = false) {
    const lock = tryAcquireProxyCheckerLock(this.projectRoot);

    if (!lock.acquired) {
      return null;
    }

    try {
      const runner = this.resolveProxyCheckerRunner();
      const nodeArgs = this.createProxyCheckerNodeArgs(runner, args);
      const terminal = spawnNewTerminal('node', nodeArgs, {
        cwd: this.projectRoot,
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

  async start() {
    await fs.ensureDir(path.dirname(this.logFile));

    const currentPid = await this.readPidFile();

    if (currentPid && this.isProcessAlive(currentPid)) {
      return {
        ok: false,
        message: `Proxy checker already running with PID ${currentPid}`,
        status: await this.getStatus()
      };
    }

    if (currentPid && !this.isProcessAlive(currentPid)) {
      await this.cleanupRuntimeFiles();
    }

    const lockResult = await this.acquireLock();

    if (!lockResult.ok) {
      return {
        ok: false,
        message: lockResult.message,
        status: await this.getStatus()
      };
    }

    try {
      await fs.writeFile(this.logFile, '');

      this.state = 'starting';
      this.startedAt = new Date().toISOString();
      this.finishedAt = null;
      this.exitCode = null;
      this.signal = null;
      this.lastError = null;

      const runner = this.resolveProxyCheckerRunner();
      const args = this.createProxyCheckerNodeArgs(runner);

      await this.writeLog('Starting proxy checker');
      await this.writeLog(`Runner: ${runner.kind} ${runner.file}`);
      await this.writeLog(`Command: ${process.execPath} ${args.join(' ')}`);
      await this.writeLog(`CWD: ${this.projectRoot}`);

      const child = spawn(process.execPath, args, {
        cwd: this.projectRoot,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FORCE_COLOR: '1',
          [PROXY_CHECKER_EXTERNAL_LOCK_ENV]: '1'
        }
      });

      this.child = child as any;
      this.state = 'running';

      if (child.pid) {
        await fs.writeFile(this.pidFile, String(child.pid), 'utf8');
        await this.writeLog(`Proxy checker PID: ${child.pid}`);
      }

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      child.stdout.on('data', (chunk) => {
        void this.writeLog(chunk);
      });

      child.stderr.on('data', (chunk) => {
        void this.writeLog(chunk);
      });

      child.once('error', (error) => {
        this.state = 'failed';
        this.finishedAt = new Date().toISOString();
        this.lastError = error.message;

        void this.writeLog(`Process error: ${error.message}`);
        void this.cleanupRuntimeFiles();

        this.child = null;
      });

      child.once('close', (code, signal) => {
        this.exitCode = code;
        this.signal = signal;
        this.finishedAt = new Date().toISOString();

        if (this.state !== 'stopped') {
          this.state = code === 0 ? 'finished' : 'failed';
        }

        void this.writeLog(`Process closed. code=${code}, signal=${signal}`);
        void this.cleanupRuntimeFiles();

        this.child = null;
      });

      return {
        ok: true,
        message: 'Proxy checker started',
        status: await this.getStatus()
      };
    } catch (error) {
      await this.cleanupRuntimeFiles();

      this.state = 'failed';
      this.finishedAt = new Date().toISOString();
      this.lastError = error instanceof Error ? error.message : String(error);

      throw error;
    }
  }

  async stop() {
    const pid = this.child?.pid ?? (await this.readPidFile());

    if (!pid || !this.isProcessAlive(pid)) {
      await this.cleanupRuntimeFiles();

      return {
        ok: false,
        message: 'Proxy checker is not running',
        status: await this.getStatus()
      };
    }

    this.state = 'stopped';
    await this.writeLog(`Stopping proxy checker PID ${pid}`);

    await this.killPid(pid);
    await this.cleanupRuntimeFiles();

    this.child = null;
    this.finishedAt = new Date().toISOString();

    return {
      ok: true,
      message: 'Proxy checker stopped',
      status: await this.getStatus()
    };
  }

  async getStatus(): Promise<ProxyCheckerStatus> {
    const pid = this.child?.pid ?? (await this.readPidFile());
    const lockExists = await fs.pathExists(this.lockFile);
    const pidAlive = pid ? this.isProcessAlive(pid) : false;

    let state = this.state;

    if (!this.child && lockExists && pidAlive) {
      state = 'running';
    }

    if (!this.child && lockExists && !pidAlive) {
      state = 'locked';
    }

    return {
      state,
      pid,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      exitCode: this.exitCode,
      signal: this.signal,
      lastError: this.lastError,
      logFile: this.logFile,
      pidFile: this.pidFile,
      lockFile: this.lockFile,
      lockExists,
      pidAlive
    };
  }

  async getLogs(limit = 200) {
    if (!(await fs.pathExists(this.logFile))) {
      return [];
    }

    const content = await fs.readFile(this.logFile, 'utf8');

    return content.split(/\r?\n/).filter(Boolean).slice(-limit);
  }

  private async acquireLock() {
    try {
      const handle = await fs.promises.open(this.lockFile, 'wx');

      await handle.writeFile(
        JSON.stringify(
          {
            ownerPid: process.pid,
            createdAt: new Date().toISOString()
          },
          null,
          2
        )
      );

      await handle.close();

      return {
        ok: true,
        message: 'Lock acquired'
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException;

      if (err.code === 'EEXIST') {
        return {
          ok: false,
          message: 'Proxy checker is already locked or starting'
        };
      }

      throw error;
    }
  }

  private async cleanupRuntimeFiles() {
    await fs.remove(this.pidFile);
    await fs.remove(this.lockFile);
  }

  private async readPidFile(): Promise<number | null> {
    if (!(await fs.pathExists(this.pidFile))) {
      return null;
    }

    const raw = await fs.readFile(this.pidFile, 'utf8');
    const pid = Number(raw.trim());

    return Number.isInteger(pid) && pid > 0 ? pid : null;
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async killPid(pid: number) {
    if (process.platform === 'win32') {
      await new Promise<void>((resolve, reject) => {
        const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore'
        });

        killer.once('error', reject);

        killer.once('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`taskkill failed with code ${code}`));
          }
        });
      });

      return;
    }

    process.kill(pid, 'SIGTERM');
  }

  private async writeLog(input: string) {
    await fs.ensureDir(path.dirname(this.logFile));

    const lines = String(input)
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    if (!lines.length) return;

    const output = lines.map((line) => `[${new Date().toISOString()}] ${line}`).join('\n');

    await fs.appendFile(this.logFile, `${output}\n`);
  }
}
