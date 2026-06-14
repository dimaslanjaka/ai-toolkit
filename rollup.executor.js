import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinModules } from 'node:module';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Normalize input path
 */
function normalizePath(file) {
  return path.relative(process.cwd(), path.resolve(__dirname, file)).replace(/\\/g, '/');
}

/**
 * Remove extension from output filename
 */
function removeExtension(file) {
  return file.replace(/\.(cjs|mjs|js)$/, '');
}

const input = normalizePath(process.env.ROLLUP_INPUT ?? 'src/server-memory.ts');

const outputBase = removeExtension(process.env.ROLLUP_OUTPUT_FILE ?? 'dist/server-memory');

console.log(`Input: ${input}`);
console.log(`Output: ${outputBase}`);

/**
 * Node builtins
 */
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/**
 * Externalize node_modules + builtins
 * but keep local project files bundled
 */
function isExternal(id) {
  // Relative imports
  if (id.startsWith('.')) {
    return false;
  }

  // Absolute filesystem paths
  if (path.isAbsolute(id)) {
    return false;
  }

  // Local project folders
  if (id.startsWith('src/') || id.startsWith('test/')) {
    return false;
  }

  // Node builtins
  if (builtins.has(id)) {
    return true;
  }

  // Packages from node_modules
  return true;
}

/** @type {import('rollup').RollupOptions} */
export default {
  input,

  external: isExternal,

  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    tryCatchDeoptimization: false
  },

  output: [
    {
      file: `${outputBase}.cjs`,
      format: 'cjs',
      exports: 'auto',
      sourcemap: false,
      interop: 'auto'
    },

    {
      file: `${outputBase}.mjs`,
      format: 'es',
      sourcemap: false
    }
  ],

  plugins: [
    json(),
    resolve({
      preferBuiltins: true,
      exportConditions: ['node'],
      extensions: ['.mjs', '.js', '.json', '.node', '.ts']
    }),

    commonjs(),

    typescript({
      tsconfig: path.resolve(__dirname, 'tsconfig.json'),

      // Faster compilation
      sourceMap: false,
      declaration: false,
      declarationMap: false,

      // Build performance
      noEmitOnError: false,
      incremental: false,
      composite: false
    })
  ]
};
