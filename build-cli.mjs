import * as cp from 'cross-spawn';
import { fileURLToPath } from 'node:url';
import { copySql } from './build-copy.mjs';

const __filename = fileURLToPath(import.meta.url);

await copySql();

cp.spawnSync('rollup', ['-c'], {
  stdio: 'inherit',
  env: { ...process.env, ROLLUP_ENTRIES: ['src/proxy/opencode-checker.runner.ts'].join(',') }
});
