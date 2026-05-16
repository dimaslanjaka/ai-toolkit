import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

/** @type {import('rollup').RollupOptions} */
export default {
  input: 'src/server-memory.ts',

  output: [
    {
      file: 'dist/server-memory.cjs',
      format: 'cjs',
      exports: 'auto',
      sourcemap: true,
    },
    {
      file: 'dist/server-memory.mjs',
      format: 'es',
      sourcemap: true,
    },
  ],

  // Mark node_modules as external to avoid bundling them
  external: (id) => /node_modules/.test(id),

  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      // Ensure declaration files (.d.ts) are generated
      declaration: true,
      declarationDir: 'dist',
      rootDir: '.',
      "include": ["src/**/*"],
    }),
    resolve({ preferBuiltins: true }),
    commonjs(),
  ],
};
