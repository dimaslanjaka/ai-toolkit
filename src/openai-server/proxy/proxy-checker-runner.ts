import fs from 'fs-extra';
import path from 'upath';

export type ProxyCheckerRunnerKind = 'ts' | 'mjs' | 'cjs';

export interface ResolvedProxyCheckerRunner {
  kind: ProxyCheckerRunnerKind;
  file: string;
}

function getProxyCheckerRunnerCandidates(root: string): ResolvedProxyCheckerRunner[] {
  const packageRoot = path.join(root, 'node_modules', '@dimaslanjaka', 'ai-toolkit');

  return [
    // Local development.
    {
      kind: 'ts',
      file: path.join(root, 'src', 'proxy', 'opencode-checker.runner.ts')
    },
    {
      kind: 'mjs',
      file: path.join(root, 'dist', 'proxy', 'opencode-checker.runner.mjs')
    },
    {
      kind: 'cjs',
      file: path.join(root, 'dist', 'proxy', 'opencode-checker.runner.cjs')
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

export function resolveProxyCheckerRunner(root = process.cwd()): ResolvedProxyCheckerRunner {
  const candidates = getProxyCheckerRunnerCandidates(path.resolve(root));
  const found = candidates.find((candidate) => fs.existsSync(candidate.file));

  if (found) {
    return found;
  }

  throw new Error(
    ['Proxy checker runner not found.', ...candidates.map((candidate) => `Checked: ${candidate.file}`)].join('\n')
  );
}

export function createProxyCheckerNodeArgs(runner: ResolvedProxyCheckerRunner, extraArgs: string[] = []): string[] {
  if (runner.kind === 'ts') {
    return ['--no-warnings=ExperimentalWarning', '--loader', 'ts-node/esm', runner.file, ...extraArgs];
  }

  return [runner.file, ...extraArgs];
}
