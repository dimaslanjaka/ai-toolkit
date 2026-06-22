#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Load .env from Octocode-style config dir (optional) ────────
const CONFIG_DIR = (() => {
  const platform = os.platform();
  const home = os.homedir();
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || home, '.mcp');
  } else if (platform === 'darwin') {
    return path.join(home, '.mcp');
  } else {
    return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'mcp');
  }
})();

const envPath = path.join(CONFIG_DIR, '.env');
if (fs.existsSync(envPath)) {
  try {
    require('dotenv').config({ path: envPath });
  } catch (_) {}
}

// ── Fallback: project-level .env ────────────────────────────────
const cwdEnv = path.join(process.cwd(), '.env');
if (fs.existsSync(cwdEnv)) {
  try {
    require('dotenv').config({ path: cwdEnv });
  } catch (_) {}
}

// ── Resolve allowed directories ─────────────────────────────────
const cwd = process.cwd();

// Optional: allow extra paths via env (comma-separated)
const extraPaths = (process.env.FS_ALLOWED_PATHS || '')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean)
  .map((p) => path.resolve(p));

// Build args: server binary + allowed dirs
const allowedDirs = [cwd, ...extraPaths];

// ── Spawn filesystem MCP ────────────────────────────────────────
const args = ['-y', '@modelcontextprotocol/server-filesystem', ...allowedDirs];

const child = spawn('npx', args, {
  stdio: 'inherit',
  shell: true,
  windowsHide: true
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => child.kill(sig));
});
