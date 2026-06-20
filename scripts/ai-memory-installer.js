import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { loadDotenv } from 'binary-collections';

loadDotenv();

const OWNER = 'alphaonedev';
const REPO = 'ai-memory-mcp';
const FILE_NAME = 'ai-memory.exe';

const TOKEN = process.env.GITHUB_TOKEN;

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

async function main() {
  const release = await getLatestRelease();

  const asset = release.assets.find((a) => a.name === FILE_NAME);

  if (!asset) {
    throw new Error(`Asset not found: ${FILE_NAME}`);
  }

  const outDir = path.join(process.cwd(), 'node_modules', '.bin');
  const outFile = path.join(outDir, FILE_NAME);

  await fsp.mkdir(outDir, { recursive: true });

  console.log('Latest version:', release.tag_name);
  console.log('Downloading:', asset.browser_download_url);

  await downloadFile(asset.browser_download_url, outFile);

  console.log('Saved to:', outFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
