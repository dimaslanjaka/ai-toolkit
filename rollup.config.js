import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import { babel } from '@rollup/plugin-babel';
import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';

// Clean dist directory
fs.removeSync('dist');

// Find all entry points
const entries = glob.sync('src/**/*.{ts,js,mjs,cjs}', {
  ignore: ['src/**/*.runner.*']
});

// Create rollup configs for each entry
const configs = entries.flatMap((entry) => {
  const parsed = path.parse(entry);
  const relativePath = path.relative('src', entry);
  const outputBase = path.join('dist', relativePath).replace(/\.[^.]+$/, '');

  const externalFn = (id) => {
    // Never mark entry modules as external
    if (id === entry || id.startsWith('.')) return false;
    
    // Bundle @modelcontextprotocol/sdk, externalize everything else
    if (id.startsWith('@modelcontextprotocol/sdk')) return false;
    
    // Externalize node_modules dependencies
    return !path.isAbsolute(id);
  };

  return [
    // ESM build
    {
      input: entry,
      output: {
        file: `${outputBase}.mjs`,
        format: 'esm',
        sourcemap: true,
        exports: 'named'
      },
      external: externalFn,
      plugins: [
        resolve({
          extensions: ['.ts', '.js', '.mjs', '.cjs'],
          preferBuiltins: true
        }),
        commonjs(),
        typescript({
          tsconfig: './tsconfig.json',
          declaration: false,
          declarationMap: false
        }),
        babel({
          babelHelpers: 'bundled',
          extensions: ['.ts', '.js', '.mjs', '.cjs'],
          exclude: 'node_modules/**',
          presets: [
            ['@babel/preset-typescript']
          ]
        })
      ],
      treeshake: false
    },
    // CJS build
    {
      input: entry,
      output: {
        file: `${outputBase}.cjs`,
        format: 'cjs',
        sourcemap: true,
        exports: 'named'
      },
      external: externalFn,
      plugins: [
        resolve({
          extensions: ['.ts', '.js', '.mjs', '.cjs'],
          preferBuiltins: true
        }),
        commonjs(),
        typescript({
          tsconfig: './tsconfig.json',
          declaration: false,
          declarationMap: false
        }),
        babel({
          babelHelpers: 'bundled',
          extensions: ['.ts', '.js', '.mjs', '.cjs'],
          exclude: 'node_modules/**',
          presets: [
            ['@babel/preset-typescript']
          ]
        })
      ],
      treeshake: false
    }
  ];
});

export default configs;
