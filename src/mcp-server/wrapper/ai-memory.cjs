#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Load .env (optional, for LLM backend tokens) ─────────────────
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

const cwdEnv = path.join(process.cwd(), '.env');
if (fs.existsSync(cwdEnv)) {
  try {
    require('dotenv').config({ path: cwdEnv });
  } catch (_) {}
}

// ── Resolve per-project database path ─────────────────────────────
const cwd = process.cwd();
const dbDir = path.join(cwd, '.opencode', 'memory');
const dbPath = path.join(dbDir, 'memories.db');

// Ensure directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ── Build args ────────────────────────────────────────────────────
const tier = process.env.AI_MEMORY_TIER || 'semantic';
const args = ['--db', dbPath, 'mcp', '--tier', tier];

// ── Spawn ai-memory MCP ─────────────────────────────────────────
const child = spawn('ai-memory', args, {
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
