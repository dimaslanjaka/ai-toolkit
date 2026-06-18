import fs from 'node:fs';
import path from 'node:path';
import { spawnNewTerminal } from '../../utils/spawn-new-terminal.js';

type RunnerKind = 'ts' | 'cjs';

interface ResolvedRunner {
  kind: RunnerKind;
  file: string;
}

function resolveProxyCheckerRunner(cwd = process.cwd()): ResolvedRunner {
  const packageRoot = path.join(cwd, 'node_modules', '@dimaslanjaka', 'ai-toolkit');

  const candidates: ResolvedRunner[] = [
    // local development
    {
      kind: 'ts',
      file: path.join(cwd, 'src', 'proxy', 'opencode-checker.runner.ts')
    },
    {
      kind: 'cjs',
      file: path.join(cwd, 'dist', 'proxy', 'opencode-checker.runner.cjs')
    },

    // installed package
    {
      kind: 'cjs',
      file: path.join(packageRoot, 'dist', 'proxy', 'opencode-checker.runner.cjs')
    },
    {
      kind: 'ts',
      file: path.join(packageRoot, 'src', 'proxy', 'opencode-checker.runner.ts')
    }
  ];

  const found = candidates.find((candidate) => fs.existsSync(candidate.file));

  if (found) {
    return found;
  }

  throw new Error(
    ['Proxy checker runner not found.', ...candidates.map((candidate) => `Checked: ${candidate.file}`)].join('\n')
  );
}

export function startProxyChecker(args: string[] = [], keepOpen = false) {
  const cwd = process.cwd();
  const runner = resolveProxyCheckerRunner(cwd);

  if (runner.kind === 'ts') {
    return spawnNewTerminal(
      'node',
      ['--no-warnings=ExperimentalWarning', '--loader', 'ts-node/esm', runner.file, ...args],
      {
        cwd,
        keepOpen,
        title: keepOpen ? 'Proxy Checker Debug' : 'Proxy Checker'
      }
    );
  }

  return spawnNewTerminal('node', [runner.file, ...args], {
    cwd,
    keepOpen,
    title: keepOpen ? 'Proxy Checker Debug' : 'Proxy Checker'
  });
}
