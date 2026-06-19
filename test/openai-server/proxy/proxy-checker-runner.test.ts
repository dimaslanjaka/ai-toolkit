import { afterEach, describe, expect, it } from '@jest/globals';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createProxyCheckerNodeArgs,
  resolveProxyCheckerRunner
} from '../../../src/openai-server/proxy/proxy-checker-runner.js';

const temporaryRoots: string[] = [];

function createTemporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'proxy-checker-runner-'));

  temporaryRoots.push(root);

  return root;
}

function createFile(root: string, relativePath: string): string {
  const file = path.join(root, relativePath);

  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, '');

  return file;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('resolveProxyCheckerRunner', () => {
  it('prefers the TypeScript source runner during local development', () => {
    const root = createTemporaryRoot();
    const sourceRunner = createFile(root, 'src/proxy/opencode-checker.runner.ts');

    createFile(root, 'dist/proxy/opencode-checker.runner.mjs');

    expect(resolveProxyCheckerRunner(root)).toEqual({
      kind: 'ts',
      file: sourceRunner
    });
  });

  it('prefers the local ESM build when source is unavailable', () => {
    const root = createTemporaryRoot();
    const esmRunner = createFile(root, 'dist/proxy/opencode-checker.runner.mjs');

    createFile(root, 'dist/proxy/opencode-checker.runner.cjs');

    expect(resolveProxyCheckerRunner(root)).toEqual({
      kind: 'mjs',
      file: esmRunner
    });
  });

  it('finds the runner inside an installed package', () => {
    const root = createTemporaryRoot();
    const installedRunner = createFile(
      root,
      'node_modules/@dimaslanjaka/ai-toolkit/dist/proxy/opencode-checker.runner.mjs'
    );

    expect(resolveProxyCheckerRunner(root)).toEqual({
      kind: 'mjs',
      file: installedRunner
    });
  });

  it('reports every checked path when no runner exists', () => {
    const root = createTemporaryRoot();

    expect(() => resolveProxyCheckerRunner(root)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining(path.join(root, 'dist', 'proxy', 'opencode-checker.runner.mjs'))
      })
    );
  });
});

describe('createProxyCheckerNodeArgs', () => {
  it('uses ts-node only for a TypeScript runner', () => {
    expect(createProxyCheckerNodeArgs({ kind: 'ts', file: 'runner.ts' }, ['--debug'])).toEqual([
      '--no-warnings=ExperimentalWarning',
      '--loader',
      'ts-node/esm',
      'runner.ts',
      '--debug'
    ]);
  });

  it('runs built JavaScript directly', () => {
    expect(createProxyCheckerNodeArgs({ kind: 'mjs', file: 'runner.mjs' }, ['--debug'])).toEqual([
      'runner.mjs',
      '--debug'
    ]);
  });
});
