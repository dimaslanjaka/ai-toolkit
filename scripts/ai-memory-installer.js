import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { loadDotenv } from 'binary-collections';

loadDotenv();

const OWNER = 'alphaonedev';
const REPO = 'ai-memory-mcp';

const TOKEN = process.env.GITHUB_TOKEN;

// ===============================
// Platform detection
// ===============================
function getPlatformTriple() {
  const platform = os.platform();
  const arch = os.arch();

  let osPart;
  if (platform === 'win32') osPart = 'windows';
  else if (platform === 'darwin') osPart = 'darwin';
  else if (platform === 'linux') osPart = 'linux';
  else throw new Error(`Unsupported platform: ${platform}`);

  let archPart;
  if (arch === 'x64') archPart = 'x86_64';
  else if (arch === 'arm64') archPart = 'arm64';
  else throw new Error(`Unsupported arch: ${arch}`);

  return { osPart, archPart, platform, arch };
}

// ===============================
// Asset matching rules (fallback chain)
// ===============================
function buildCandidates({ osPart, archPart }) {
  const base = `ai-memory`;

  const suffixes = [];

  // priority order (best → worst)
  suffixes.push(
    `${base}-${archPart}-pc-${osPart}-msvc.zip`,
    `${base}-${archPart}-pc-${osPart}.zip`,
    `${base}.zip`,
    `${base}.tar.gz`,
    `${base}.exe`
  );

  return suffixes;
}

// ===============================
// GitHub API
// ===============================
async function getLatestRelease() {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
    headers: {
      Authorization: TOKEN ? `Bearer ${TOKEN}` : undefined,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'nodejs'
    }
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

// ===============================
// Resolve asset with fallback chain
// ===============================
function resolveAsset(release, candidates) {
  for (const name of candidates) {
    const found = release.assets.find((a) => a.name === name);
    if (found) return found;
  }
  return null;
}

// ===============================
// Download helper
// ===============================
async function downloadFile(url, outputPath) {
  const res = await fetch(url, {
    headers: {
      Authorization: TOKEN ? `Bearer ${TOKEN}` : undefined,
      'User-Agent': 'nodejs'
    }
  });

  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${await res.text()}`);
  }

  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(outputPath));
}

// ===============================
// Extractor
// ===============================
function extractFile(filePath, outDir) {
  const ext = path.extname(filePath);
  const platform = os.platform();

  if (ext === '.zip') {
    if (platform === 'win32') {
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${filePath}' -DestinationPath '${outDir}' -Force"`,
        { stdio: 'inherit' }
      );
    } else {
      execSync(`unzip -o '${filePath}' -d '${outDir}'`, {
        stdio: 'inherit'
      });
    }
  }

  if (ext === '.gz') {
    execSync(`mkdir -p '${outDir}' && tar -xzf '${filePath}' -C '${outDir}' --strip-components=1`, {
      stdio: 'inherit'
    });
  }

  if (ext === '.exe') {
    // no extraction needed
  }
}

// ===============================
// Main installer
// ===============================
async function main() {
  const { osPart, archPart } = getPlatformTriple();

  console.log(`Platform: ${osPart}-${archPart}`);

  const release = await getLatestRelease();

  const candidates = buildCandidates({ osPart, archPart });

  console.log('Trying assets in order:');
  console.log(candidates);

  const asset = resolveAsset(release, candidates);

  if (!asset) {
    throw new Error('No compatible asset found for this platform');
  }

  console.log('Selected asset:', asset.name);
  console.log('Version:', release.tag_name);

  const outDir = path.join(process.cwd(), 'node_modules', '.bin');
  await fsp.mkdir(outDir, { recursive: true });

  const tmpDir = path.join(process.cwd(), 'tmp', 'download');
  await fsp.mkdir(tmpDir, { recursive: true });

  const filePath = path.join(tmpDir, asset.name);

  console.log('Downloading...');
  await downloadFile(asset.browser_download_url, filePath);

  console.log('Downloaded to:', filePath);

  console.log('Extracting...');
  extractFile(filePath, outDir);

  // ensure CLI alias for Windows
  const exe = path.join(outDir, 'ai-memory.exe');

  if (fs.existsSync(exe)) {
    console.log('Installed:', exe);

    if (os.platform() === 'win32') {
      const cmd = `@echo off\r
"%~dp0ai-memory.exe" %*\r
`;

      await fsp.writeFile(path.join(outDir, 'ai-memory.cmd'), cmd, 'utf8');
    }
  }

  console.log('Done ✔');
}

main().catch((err) => {
  console.error('Install failed:', err.message);
  process.exit(1);
});
