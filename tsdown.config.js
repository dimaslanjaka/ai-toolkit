import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/**/*.ts', 'src/**/*.js', 'src/**/*.mjs', 'src/**/*.cjs'],

  format: ['esm', 'cjs'],

  dts: true,
  clean: true,
  sourcemap: true,

  // 🔥 KEY
  splitting: false,

  // force dependencies inline (not chunked)
  treeshake: false,

  deps: {
    alwaysBundle: ['fs-extra', 'upath', 'zod']
  }
});
