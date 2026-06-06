const spawn = require('cross-spawn');
const path = require('upath');
const fs = require('fs-extra');
const CryptoJS = require('crypto-js');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const [, , rollupInput, rollupOutputFile] = process.argv;

if (!rollupInput) {
  console.error('Missing input file');
  process.exit(1);
}

if (!rollupOutputFile) {
  console.error('Missing output file');
  process.exit(1);
}

const inputPath = path.resolve(rollupInput);
const outputPath = path.resolve(rollupOutputFile);

const EXTENSIONS = ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.mts', '.cts', '.json'];

const CACHE_FILE = path.resolve(
  '.cache',
  'rollup-runner',
  CryptoJS.MD5(inputPath + '::' + outputPath).toString() + '.json'
);

function isLocalImport(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/');
}

function resolveLocalImport(specifier, basedir) {
  if (!isLocalImport(specifier)) return null;

  const target = path.resolve(basedir, specifier);

  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    return target;
  }

  for (const ext of EXTENSIONS) {
    const file = target + ext;

    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return file;
    }
  }

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    for (const ext of EXTENSIONS) {
      const indexFile = path.join(target, 'index' + ext);

      if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
        return indexFile;
      }
    }
  }

  return null;
}

function collectLocalFiles(entryFile, visited = new Set()) {
  const file = path.resolve(entryFile);

  if (visited.has(file)) return visited;
  if (file.includes('/node_modules/')) return visited;
  if (!fs.existsSync(file)) return visited;

  visited.add(file);

  const ext = path.extname(file);

  if (ext === '.json') {
    return visited;
  }

  const code = fs.readFileSync(file, 'utf8');
  const imports = [];

  let ast;

  try {
    ast = parse(code, {
      sourceType: 'unambiguous',
      plugins: [
        'typescript',
        'jsx',
        'dynamicImport',
        'importMeta',
        'topLevelAwait',
        'decorators-legacy',
        'classProperties'
      ]
    });
  } catch (err) {
    console.warn(`Cannot parse file, skipped dependency scan: ${file}`, err);
    return visited;
  }

  traverse(ast, {
    ImportDeclaration(p) {
      imports.push(p.node.source.value);
    },

    ExportAllDeclaration(p) {
      if (p.node.source) imports.push(p.node.source.value);
    },

    ExportNamedDeclaration(p) {
      if (p.node.source) imports.push(p.node.source.value);
    },

    CallExpression(p) {
      const callee = p.node.callee;

      if (callee.type === 'Identifier' && callee.name === 'require') {
        const arg = p.node.arguments[0];

        if (arg && arg.type === 'StringLiteral') {
          imports.push(arg.value);
        }
      }

      if (callee.type === 'Import') {
        const arg = p.node.arguments[0];

        if (arg && arg.type === 'StringLiteral') {
          imports.push(arg.value);
        }
      }
    }
  });

  for (const specifier of imports) {
    const resolved = resolveLocalImport(specifier, path.dirname(file));

    if (resolved) {
      collectLocalFiles(resolved, visited);
    }
  }

  return visited;
}

function checksumFiles(files) {
  const hash = CryptoJS.algo.SHA256.create();

  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update('\0');
    hash.update(fs.readFileSync(file, 'utf8'));
    hash.update('\0');
  }

  return hash.finalize().toString(CryptoJS.enc.Hex);
}

function readCache() {
  if (!fs.existsSync(CACHE_FILE)) return null;

  try {
    return fs.readJsonSync(CACHE_FILE);
  } catch {
    return null;
  }
}

function writeCache(data) {
  fs.ensureDirSync(path.dirname(CACHE_FILE));
  fs.writeJsonSync(CACHE_FILE, data, { spaces: 2 });
}

const localFiles = [...collectLocalFiles(inputPath)];
const checksum = checksumFiles(localFiles);
const cache = readCache();

const outputExists = fs.existsSync(outputPath);
const checksumChanged = !cache || cache.checksum !== checksum;

if (checksumChanged || !outputExists) {
  console.log('Changes detected. Running Rollup...');

  const env = {
    ...process.env,
    ROLLUP_INPUT: inputPath,
    ROLLUP_OUTPUT_FILE: outputPath
  };

  const rollupResult = spawn.sync('rollup', ['-c', 'rollup.executor.js'], {
    stdio: 'inherit',
    env
  });

  if (rollupResult.status !== 0) {
    console.error('Rollup build failed');
    process.exit(1);
  }

  if (!fs.existsSync(outputPath)) {
    console.error(`Output file not found: ${outputPath}`);
    process.exit(1);
  }

  writeCache({
    input: inputPath,
    output: outputPath,
    checksum,
    files: localFiles,
    updatedAt: new Date().toISOString()
  });
} else {
  console.log('No local file changes detected. Skipping Rollup.');
}

console.log(`Running built file: ${outputPath}`);
console.log('-------------------------------\n');

const nodeResult = spawn.sync('node', [outputPath], {
  stdio: 'inherit'
});

process.exit(nodeResult.status ?? 1);
