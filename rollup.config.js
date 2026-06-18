import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import color from 'ansi-colors';
import path from 'upath';
import pkgJson from './package.json' with { type: 'json' };
import * as glob from 'glob';
import fs from 'fs';
import { isEmpty } from 'sbg-utility';

const { dependencies = {}, devDependencies = {} } = pkgJson;

// Packages that should be bundled (from tsup config)
export const bundledPackages = [
  'p-limit',
  'deepmerge-ts',
  'is-stream',
  'markdown-it',
  'node-cache',
  'glob',
  'proxy-agent',
  'http-proxy-agent',
  'https-proxy-agent',
  'socks-proxy-agent'
];

export const externalPackages = [
  ...Object.keys(dependencies),
  ...Object.keys(devDependencies),
  'proxy-agent-negotiate'
].filter((pkgName) => {
  return !bundledPackages.includes(pkgName);
});

/**
 * Returns a function to generate entry file names with the given extension for Rollup output.
 *
 * For files from node_modules, places them in the dependencies folder and logs the mapping.
 * For local files, preserves the `src/` directory structure in the output.
 *
 * @param {string} ext The file extension (e.g. 'js', 'cjs', 'mjs').
 * @returns {(info: { facadeModuleId: string }) => string} Function that generates the output file name for a given entry.
 */
export function entryFileNamesWithExt(ext) {
  // Ensure the extension does not start with a dot
  if (ext.startsWith('.')) {
    ext = ext.slice(1);
  }
  return function ({ facadeModuleId }) {
    facadeModuleId = path.toUnix(facadeModuleId);
    if (!facadeModuleId.includes('node_modules')) {
      // Preserve src directory structure
      const srcDir = path.toUnix(path.resolve('src'));
      const rel = path.relative(srcDir, facadeModuleId);

      if (!rel.startsWith('..')) {
        const dir = path.dirname(rel);
        const name = path.basename(rel, path.extname(rel));
        if (dir === '.') {
          return `${name}.${ext}`;
        }
        return `${dir}/${name}.${ext}`;
      }

      // Fallback if file is somehow outside src/
      return `[name].${ext}`;
    }
    // Find the first occurrence of 'node_modules' and slice from there
    const nodeModulesIdx = facadeModuleId.indexOf('node_modules');
    let rel = facadeModuleId.slice(nodeModulesIdx);
    rel = rel.replace('node_modules', 'dependencies');
    // Remove extension using upath.extname
    rel = rel.slice(0, -path.extname(rel).length) + `.${ext}`;
    // Remove any null bytes (\x00) that may be present (Rollup sometimes injects these)
    rel = rel.replace(/\0/g, '');
    // Remove any leading slashes
    rel = rel.replace(/^\/\/+/, '');

    fs.appendFileSync(
      'tmp/rollup.log',
      `entryFileNamesWithExt:\n  [facadeModuleId] ${facadeModuleId}\n  [rel] ${rel}\n`
    );
    return rel;
  };
}

/**
 * Returns a function to generate chunk file names with the given extension for Rollup output.
 *
 * For chunks from node_modules, places them in the dependencies folder and removes the original extension.
 *
 * @param {string} ext The file extension (e.g. 'js', 'cjs', 'mjs').
 * @returns {(info: { name: string }) => string} Function that generates the output file name for a given chunk.
 */
export function chunkFileNamesWithExt(ext) {
  return function ({ name }) {
    // For node_modules chunks, place in dependencies folder
    if (name && name.includes('node_modules')) {
      const nodeModulesIdx = name.indexOf('node_modules');
      let rel = name.slice(nodeModulesIdx);
      rel = rel.replace('node_modules', 'dependencies');
      // Remove extension using upath.extname
      rel = rel.slice(0, -path.extname(rel).length);
      // Remove any null bytes (\x00) that may be present
      rel = rel.replace(/\0/g, '');
      // Remove any leading slashes
      rel = rel.replace(/^\/\/+/, '');
      return `${rel}-[hash].${ext}`;
    }
    // For local chunks, keep the default pattern
    return `[name]-[hash].${ext}`;
  };
}

/**
 * Rollup external filter function.
 * Determines if a module should be treated as external (not bundled) or bundled.
 *
 * @param {string} source - The import path or module ID.
 * @param {string} importer - The path of the importing file.
 * @param {boolean} isResolved - Whether the import has been resolved.
 * @returns {boolean} True if the module should be external, false if it should be bundled.
 */
export function externalPackagesFilter(source, importer, isResolved) {
  function getPackageNameFromSource(source) {
    // Handle absolute paths (Windows/Unix)
    const nm = /node_modules[\\/]+([^\\/]+)(?:[\\/]+([^\\/]+))?/.exec(source);
    if (nm) {
      // Scoped package
      if (nm[1].startsWith('@') && nm[2]) {
        return nm[1] + '/' + nm[2];
      }
      return nm[1];
    }
    // Handle bare imports
    if (source.startsWith('@')) {
      return source.split('/').slice(0, 2).join('/');
    }
    return source.split('/')[0];
  }

  const pkgName = getPackageNameFromSource(source);
  const isBundled = bundledPackages.includes(pkgName);
  const isExternal = externalPackages.includes(pkgName);

  if (bundledPackages.some((pkg) => source.includes(pkg))) {
    // Helper to color booleans
    const boolColor = (val) => (val ? color.green('true') : color.red('false'));
    const treeLog = [
      color.bold(color.cyan('externalFilter')),
      `\t├─ ${color.cyan('source:')}     ${color.yellow(source)}`,
      `\t├─ ${color.cyan('pkgName:')}    ${color.yellow(pkgName)}`,
      `\t├─ ${color.cyan('external:')}   ${boolColor(isExternal)}`,
      `\t├─ ${color.cyan('bundled:')}    ${boolColor(isBundled)}`,
      `\t├─ ${color.cyan('importer:')}   ${color.yellow((importer || '-').replace(process.cwd(), '').replace(/^\//, ''))}`,
      `\t└─ ${color.cyan('isResolved:')} ${boolColor(isResolved)}`
    ].join('\n');
    console.log(treeLog);
  }

  if (isBundled) return false; // <-- force bundle
  if (isExternal) return true; // <-- mark as external
  return false; // fallback: bundle it
}

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

for (let input of inputs) {
  input = path.toUnix(input);
  /**
   * @type {import('rollup').RollupOptions}
   */
  const rollupConfig = {
    input,
    output: [
      {
        format: 'esm',
        dir: 'dist',
        entryFileNames: entryFileNamesWithExt('mjs'),
        chunkFileNames: chunkFileNamesWithExt('mjs')
      },
      {
        format: 'cjs',
        dir: 'dist',
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
