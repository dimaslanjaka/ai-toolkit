import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { loadDotenv } from 'binary-collections';

loadDotenv();

const OWNER = 'rtk-ai';
const REPO = 'rtk';

const TOKEN = process.env.GITHUB_TOKEN;

// ===============================
// Platform detection
// ===============================
function getPlatformTriple() {
  const platform = os.platform();
  const arch = os.arch();

  let osPart;
  if (platform === 'win32') osPart = 'windows';
  else if (platform === 'darwin') osPart = 'apple';
  else if (platform === 'linux') osPart = 'unknown-linux';
  else throw new Error(`Unsupported platform: ${platform}`);

  let archPart;
  if (arch === 'x64') archPart = 'x86_64';
  else if (arch === 'arm64') archPart = 'aarch64';
  else throw new Error(`Unsupported arch: ${arch}`);

  return { osPart, archPart, platform, arch };
}

// ===============================
// Asset matching rules (fallback chain)
// ===============================
function buildCandidates({ osPart, archPart, platform }) {
  const base = 'rtk';

  const suffixes = [];

  // priority order (best → worst)
  if (platform === 'win32') {
    // Windows: MSVC build
    suffixes.push(`${base}-${archPart}-pc-${osPart}-msvc.zip`);
    suffixes.push(`${base}-${archPart}-${osPart}.zip`);
  } else if (platform === 'darwin') {
    // macOS: Darwin builds
    suffixes.push(`${base}-${archPart}-apple-darwin.tar.gz`);
    suffixes.push(`${base}-${archPart}-${osPart}.tar.gz`);
  } else if (platform === 'linux') {
    // Linux: GNU or MUSL builds
    suffixes.push(`${base}-${archPart}-unknown-linux-gnu.tar.gz`);
    suffixes.push(`${base}-${archPart}-unknown-linux-musl.tar.gz`);
    // Package fallbacks for x86_64
    if (archPart === 'x86_64') {
      suffixes.push(`${base}_0.42.4-1_amd64.deb`);
      suffixes.push(`${base}_amd64.deb`);
      suffixes.push(`${base}-0.42.4-1.x86_64.rpm`);
      suffixes.push(`${base}.x86_64.rpm`);
    }
  }

  // Generic fallbacks
  suffixes.push(`${base}.zip`);
  suffixes.push(`${base}.tar.gz`);

  return suffixes;
}

// ===============================
// GitHub API
// ===============================
async function getRelease() {
  // Get latest release (similar to ai-memory-installer)
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

  if (ext === '.deb') {
    // Extract DEB package
    const tmpExtract = path.join(path.dirname(filePath), 'deb-extract');
    execSync(`mkdir -p '${tmpExtract}' && ar x '${filePath}' --output='${tmpExtract}'`, {
      stdio: 'inherit'
    });
    // Extract data.tar.xz or data.tar.gz
    const dataTar = fs.readdirSync(tmpExtract).find((f) => f.startsWith('data.tar'));
    if (dataTar) {
      const dataPath = path.join(tmpExtract, dataTar);
      execSync(`tar -xf '${dataPath}' -C '${outDir}' --strip-components=2`, {
        stdio: 'inherit'
      });
    }
    // Cleanup
    fs.rmSync(tmpExtract, { recursive: true, force: true });
  }
}

// ===============================
// Main installer
// ===============================
async function main() {
  const { osPart, archPart, platform } = getPlatformTriple();

  console.log(`Platform: ${platform} (${archPart})`);

  const release = await getRelease();

  const candidates = buildCandidates({ osPart, archPart, platform });

  console.log('Trying assets in order:');
  candidates.forEach((c) => console.log(`  - ${c}`));

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
  const exe = path.join(outDir, 'rtk.exe');

  if (fs.existsSync(exe)) {
    console.log('Installed:', exe);

    if (os.platform() === 'win32') {
      const cmd = `@echo off\r
"%~dp0rtk.exe" %*\r
`;

      await fsp.writeFile(path.join(outDir, 'rtk.cmd'), cmd, 'utf8');
    }
  } else {
    // Check for non-.exe binary on Unix
    const bin = path.join(outDir, 'rtk');
    if (fs.existsSync(bin)) {
      console.log('Installed:', bin);
      // Make executable
      fs.chmodSync(bin, 0o755);
    }
  }

  console.log('Done ✔');
}

main().catch((err) => {
  console.error('Install failed:', err.message);
  process.exit(1);
});
