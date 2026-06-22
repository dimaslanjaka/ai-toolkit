#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Load .env from Octocode config dir ─────────────────────────────
const OCTOCODE_HOME = (() => {
  const platform = os.platform();
  const home = os.homedir();
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || home, '.octocode');
  } else if (platform === 'darwin') {
    return path.join(home, '.octocode');
  } else {
    return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), '.octocode');
  }
})();

const envPath = path.join(OCTOCODE_HOME, '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

// ── Fallback: also check cwd .env (project-level) ─────────────────
const cwdEnv = path.join(process.cwd(), '.env');
if (fs.existsSync(cwdEnv)) {
  require('dotenv').config({ path: cwdEnv });
}

// ── Set Octocode workspace permissions ────────────────────────────
const cwd = process.cwd();
process.env.WORKSPACE_ROOT = cwd;
process.env.ALLOWED_PATHS = cwd;
process.env.ENABLE_LOCAL = 'true';

// ── Spawn Octocode MCP ──────────────────────────────────────────
const child = spawn('npx', ['-y', 'octocode-mcp@latest'], {
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
