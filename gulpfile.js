import { dest, parallel, series, src } from 'gulp';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'upath';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to run CLI commands
function runCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: { ...process.env, ...options.env },
      cwd: options.cwd || __dirname,
      shell: process.platform === 'win32'
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
      } else {
        resolve();
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

// TypeScript compilation to tmp/dist
export function buildTs() {
  return runCommand('yarn', ['tsc', '-p', 'tsconfig.build.json']);
}

// Copy SQL schema files to tmp/dist
export function copySql() {
  return new Promise((resolve, reject) => {
    const destinations = ['tmp/dist/src/database/', 'dist/src/database/', 'dist/database/'];
    let pending = destinations.length;
    const check = () => {
      if (--pending === 0) resolve();
    };
    destinations.forEach((destPath) => {
      src('src/database/*.sql').pipe(dest(destPath)).on('finish', check).on('error', reject);
    });
  });
}

// Rollup build
export async function buildRollup() {
  // build special for server
  await runCommand('yarn', ['tsc', '-p', 'tsconfig.server.json']);

  const { ROLLUP_ENTRIES: existingEntries, ...parentEnv } = process.env;

  return runCommand('npx', ['rollup', '-c'], {
    env: {
      ...parentEnv,
      ROLLUP_ENTRIES: [
        'src/proxy/opencode-checker.runner.ts',
        'src/proxy/checker.runner.ts',
        'src/proxy/google-checker.runner.ts',
        'src/mcp-server/wrapper/octocode.cjs',
        'src/mcp-server/wrapper/filesystem.cjs',
        'src/proxy/server.runner.ts',
        ...(existingEntries || '').split(',')
      ].join(',')
    }
  });
}

// TypeScript declarations
export function buildDeclarations() {
  return runCommand('yarn', ['tsc', '-p', 'tsconfig.dts.json']);
}

// Vite build for web frontend
export function buildWeb() {
  return runCommand('npx', ['vite', 'build', '--config', 'vite.config.mjs']);
}

// OpenAI-compatible server build
export const buildServer = series(copySql, buildRollup);

// Clean build artifacts
export function clean() {
  return runCommand('npx', ['rimraf', 'tmp/dist', 'dist']);
}

// Main build sequence
export const build = series(clean, parallel(copySql, buildTs), buildServer, buildDeclarations, buildWeb);

export default build;
