import babel from '@rollup/plugin-babel';
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

/**
 * @type {import('rollup').RollupOptions[]}
 */
const configs = [];
let inputs = glob.sync('src/**/*.{ts,js,mjs,cjs}', {
  ignore: ['**/*.runner.*', '**/*test*']
});
if (!isEmpty(process.env.ROLLUP_ENTRIES)) {
  inputs = process.env.ROLLUP_ENTRIES.split(',').map((p) => {
    const trimmed = p.trim();
    const resolved = path.resolve(trimmed);
    console.log(`Custom input: "${trimmed}" → "${resolved}"`);
    return resolved;
  });
}
inputs = inputs.map((p) => {
  p = path.toUnix(p);
  if (path.isAbsolute(p)) p = path.relative(__dirname, p);
  p = `tmp/dist/${p}`;
  p = p.replace(/.ts$/, '.js');
  return p;
});
console.log('inputs', inputs);

for (let input of inputs) {
  input = path.toUnix(input);
  /**
   * @type {import('rollup').OutputOptions}
   */
  const sharedOutputOptions = { preserveModulesRoot: 'tmp/dist/src', preserveModules: true };
  /**
   * @type {import('rollup').RollupOptions}
   */
  const rollupConfig = {
    input,
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
        extensions: ['.js', '.ts', '.cjs', '.mjs', '.json', '.node'],
        preferBuiltins: true
      }),
      commonjs({
        transformMixedEsModules: true
      }),
      json()
    ]
  };

  // Add Babel plugin for TypeScript files
  if (input.endsWith('.ts')) {
    rollupConfig.plugins.push(
      babel({
        babelHelpers: 'bundled',
        extensions: ['.js', '.ts', '.cjs', '.mjs'],
        exclude: '**/node_modules/**',
        presets: [
          '@babel/preset-typescript',
          [
            '@babel/preset-env',
            {
              targets: {
                node: '18'
              }
            }
          ]
        ]
      })
    );
  }

  configs.push(rollupConfig);
}

export default configs;
