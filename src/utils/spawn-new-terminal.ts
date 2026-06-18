// src/utils/spawn-new-terminal.ts
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'upath';

export type TerminalRuntime = 'node' | 'python' | 'custom';

export interface SpawnNewTerminalOptions {
  cwd?: string;
  title?: string;
  keepOpen?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface SpawnRuntimeOptions extends SpawnNewTerminalOptions {
  runtime?: TerminalRuntime;
  command?: string;
  args?: string[];
}

/**
 * Find real PATH key.
 *
 * Windows can use `Path`, while Linux/macOS usually use `PATH`.
 */
function getPathKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
}

/**
 * Add local executable folders to PATH.
 *
 * Priority:
 * 1. ./node_modules/.bin
 * 2. ./venv/Scripts
 * 3. ./.venv/Scripts
 * 4. ./vendor/bin
 */
export function createEnvWithLocalBins(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = { ...env };
  const pathKey = getPathKey(nextEnv);

  const localBins = [
    path.join(cwd, 'node_modules', '.bin'),
    path.join(cwd, 'venv', 'Scripts'),
    path.join(cwd, '.venv', 'Scripts'),
    path.join(cwd, 'vendor', 'bin')
  ];

  nextEnv[pathKey] = [...localBins, nextEnv[pathKey] || ''].filter(Boolean).join(path.delimiter);

  return nextEnv;
}

/**
 * Spawn command in a new terminal window.
 *
 * Windows:
 * - Opens new cmd window.
 * - Auto closes when keepOpen = false.
 * - Keeps open when keepOpen = true.
 */
export function spawnNewTerminal(
  command: string,
  args: string[] = [],
  options: SpawnNewTerminalOptions = {}
): ChildProcess {
  const cwd = options.cwd || process.cwd();
  const env = createEnvWithLocalBins(cwd, options.env);
  const title = options.title || '';
  const cmdMode = options.keepOpen ? '/k' : '/c';

  if (process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', 'start', title, 'cmd.exe', cmdMode, command, ...args], {
      cwd,
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });

    child.unref();
    return child;
  }

  /**
   * Linux/macOS fallback.
   *
   * This does not guarantee a visible terminal window because terminal apps
   * differ by desktop environment. It still detaches the process.
   */
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: 'ignore'
  });

  child.unref();
  return child;
}

/**
 * Run Node.js file in new terminal.
 */
export function spawnNodeNewTerminal(
  scriptPath: string,
  scriptArgs: string[] = [],
  options: SpawnNewTerminalOptions = {}
): ChildProcess {
  return spawnNewTerminal('node', [scriptPath, ...scriptArgs], {
    title: 'Node Runner',
    ...options
  });
}

/**
 * Run TypeScript ESM file with ts-node loader in new terminal.
 */
export function spawnNodeTsNewTerminal(
  scriptPath: string,
  scriptArgs: string[] = [],
  options: SpawnNewTerminalOptions = {}
): ChildProcess {
  return spawnNewTerminal(
    'node',
    ['--no-warnings=ExperimentalWarning', '--loader', 'ts-node/esm', scriptPath, ...scriptArgs],
    {
      title: 'Node TypeScript Runner',
      ...options
    }
  );
}

/**
 * Run Python file in new terminal.
 *
 * Because local venv folders are prepended to PATH,
 * `python` resolves from:
 *
 * - ./venv/Scripts/python.exe
 * - ./.venv/Scripts/python.exe
 *
 * before global Python, when available.
 */
export function spawnPythonNewTerminal(
  scriptPath: string,
  scriptArgs: string[] = [],
  options: SpawnNewTerminalOptions = {}
): ChildProcess {
  return spawnNewTerminal('python', ['-u', scriptPath, ...scriptArgs], {
    title: 'Python Runner',
    ...options
  });
}
