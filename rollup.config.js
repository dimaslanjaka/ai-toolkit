import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import * as glob from 'glob';
import { fileURLToPath } from 'node:url';
import { isEmpty } from 'sbg-utility';
import path from 'upath';
import { chunkFileNamesWithExt, entryFileNamesWithExt, externalPackagesFilter } from './rollup-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let inputs = glob.sync('src/**/*.{ts,js,mjs,cjs}', {
  ignore: ['**/*.runner.*', '**/*test*', '**/*.d.ts', '**/frontend/**']
});
if (!isEmpty(process.env.ROLLUP_ENTRIES)) {
  const customInputs = process.env.ROLLUP_ENTRIES.split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((input) => {
      const resolved = path.resolve(input);
      console.log(`Custom input: "${input}" → "${resolved}"`);
      return resolved;
    });

  inputs.push(...customInputs);
}

inputs = [
  ...new Set(
    inputs.map((input) => {
      input = path.toUnix(input);
      if (path.isAbsolute(input)) input = path.relative(__dirname, input);
      input = `tmp/dist/${input}`;
      return input.replace(/\.ts$/, '.js');
    })
  )
];

console.log('inputs', inputs);

/**
 * Build every entry in one module graph. With preserveModules enabled, separate
 * Rollup configs would emit shared modules to the same paths and overwrite them
 * with entry-specific tree-shaken exports.
 *
 * @type {import('rollup').OutputOptions}
 */
const sharedOutputOptions = {
  preserveModulesRoot: 'tmp/dist/src',
  preserveModules: true
};

/**
 * Rollup consumes JavaScript already emitted by TypeScript into tmp/dist.
 *
 * @type {import('rollup').RollupOptions}
 */
const rollupConfig = {
  input: inputs,
  output: [
    {
      format: 'esm',
      dir: 'dist',
      ...sharedOutputOptions,
      entryFileNames: entryFileNamesWithExt('mjs'),
      chunkFileNames: chunkFileNamesWithExt('mjs')
    },
    {
      format: 'cjs',
      dir: 'dist',
      ...sharedOutputOptions,
      entryFileNames: entryFileNamesWithExt('cjs'),
      chunkFileNames: chunkFileNamesWithExt('cjs')
    }
  ],
  external: externalPackagesFilter,
  plugins: [
    nodeResolve({
      extensions: ['.js', '.cjs', '.mjs', '.json', '.node'],
      preferBuiltins: true
    }),
    commonjs({
      transformMixedEsModules: true
    }),
    json()
  ]
};

export default rollupConfig;
