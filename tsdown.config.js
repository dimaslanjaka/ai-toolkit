import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/**/*.{ts,js,mjs,cjs}', '!src/**/*.runner.*'],

  format: ['esm', 'cjs'],

  dts: false,
  clean: true,
  sourcemap: true,

  // 🔥 KEY
  splitting: false,

  // force dependencies inline (not chunked)
  treeshake: false,

  deps: {
    skipNodeModulesBundle: true
  }
});
