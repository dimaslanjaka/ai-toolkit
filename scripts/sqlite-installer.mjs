/**
 * Auto-download and extract the latest SQLite precompiled binary
 * and install it into node_modules/.bin
 */

import https from 'https';
import os from 'os';
import path from 'upath';
import fs from 'fs-extra';
import { execSync } from 'child_process';

// === Fetch download page and extract CSV ===
async function fetchDownloadCSV() {
  return new Promise((resolve, reject) => {
    https
      .get('https://www.sqlite.org/download.html', (res) => {
        let data = '';

        res.on('data', (chunk) => (data += chunk));

        res.on('end', () => {
          const match = data.match(/<!--\s*Download product data([\s\S]*?)-->/);

          if (!match) {
            return reject(new Error('Download CSV not found'));
          }

          const csv = match[1].trim().split('\n');
          resolve(csv);
        });
      })
      .on('error', reject);
  });
}

// === Pick best binary for platform/arch ===
function pickDownload(csvLines) {
  const platform = os.platform();
  const arch = os.arch();

  let target;

  if (platform === 'win32') {
    target = arch === 'x64' ? 'win-x64' : 'win-x86';
  } else if (platform === 'darwin') {
    target = arch === 'arm64' ? 'osx-arm64' : 'osx-x86';
  } else if (platform === 'linux') {
    target = arch === 'arm64' ? 'linux-aarch64' : 'linux-x86_64';
  } else {
    throw new Error(`Unsupported platform: ${platform} ${arch}`);
  }

  const tool = csvLines.map((line) => line.split(',')).find((fields) => fields[2]?.includes(`sqlite-tools-${target}`));

  if (!tool) {
    throw new Error(`No sqlite-tools found for ${target}`);
  }

  return {
    relative: tool[2],
    filename: path.basename(tool[2])
  };
}

// === Download helper ===
async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: ${res.statusCode}`));
          return;
        }

        res.pipe(file);

        file.on('finish', () => file.close(resolve));
      })
      .on('error', reject);
  });
}

// === Check if download is needed ===
async function shouldDownload(url, local) {
  if (!fs.existsSync(local)) return true;

  const localSize = fs.statSync(local).size;

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'HEAD' }, (res) => {
      const remoteSize = parseInt(res.headers['content-length'], 10);

      if (!remoteSize || Number.isNaN(remoteSize)) {
        return resolve(true);
      }

      resolve(localSize !== remoteSize);
    });

    req.on('error', reject);
    req.end();
  });
}

// === Main ===
(async () => {
  try {
    console.log('Fetching SQLite download list...');

    const csv = await fetchDownloadCSV();
    const { relative, filename } = pickDownload(csv);

    const base = 'https://www.sqlite.org';
    const url = `${base}/${relative}`;

    console.log('Resolved URL:', url);

    const ext = path.extname(filename);

    // temp download dir
    const tmpDir = path.resolve(process.cwd(), 'tmp', 'download');
    await fs.ensureDir(tmpDir);

    const local = path.join(tmpDir, filename);

    // ✅ install target: node_modules/.bin
    const binDir = path.resolve(process.cwd(), 'node_modules', '.bin');
    await fs.ensureDir(binDir);

    let downloaded = false;

    if (await shouldDownload(url, local)) {
      console.log('Downloading:', filename);

      await downloadFile(url, local);

      console.log('Download complete:', local);

      downloaded = true;
    } else {
      console.log('Local file is up to date, skipping download.');
    }

    // final binary path inside .bin
    const sqliteBinary = os.platform() === 'win32' ? path.join(binDir, 'sqlite3.exe') : path.join(binDir, 'sqlite3');

    const needExtract = downloaded || !fs.existsSync(sqliteBinary);

    if (needExtract) {
      console.log('Extracting into node_modules/.bin...');

      if (ext === '.zip') {
        if (os.platform() === 'win32') {
          execSync(
            `powershell -NoProfile -NonInteractive -Command "Expand-Archive -Path '${local}' -DestinationPath '${binDir}' -Force"`,
            { stdio: 'inherit' }
          );
        } else {
          execSync(`unzip -o '${local}' -d '${binDir}'`, {
            stdio: 'inherit'
          });
        }
      } else if (ext === '.gz') {
        execSync(`mkdir -p '${binDir}' && tar -xzf '${local}' -C '${binDir}' --strip-components=1`, {
          stdio: 'inherit'
        });
      }

      // Windows wrapper for CLI compatibility
      const exePath = path.join(binDir, 'sqlite3.exe');

      if (fs.existsSync(exePath)) {
        const cmdScript = `@echo off\r
set SCRIPT_DIR=%~dp0\r
"%SCRIPT_DIR%sqlite3.exe" %*\r
`;

        await fs.writeFile(path.join(binDir, 'sqlite3.cmd'), cmdScript, 'utf8');
      }
    } else {
      console.log('SQLite already installed in node_modules/.bin');
    }

    console.log('✅ SQLite installed in node_modules/.bin');
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
})();
