import * as cp from 'cross-spawn';
import path from 'upath';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

cp.spawnSync('rollup', ['-c'], {
  stdio: 'inherit',
  env: { ...process.env, ROLLUP_ENTRIES: ['src/proxy/opencode-checker.runner.ts'].join(',') }
});
