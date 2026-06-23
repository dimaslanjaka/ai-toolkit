import { loadDotenv, getGithubToken } from 'binary-collections';
import path from 'upath';
import fs from 'fs-extra';
import * as jsonc from 'jsonc-parser';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import os from 'os';
import envPaths from 'env-paths';

// Cross-platform app directories (env-paths handles Windows/macOS/Linux)
const paths = envPaths('opencode', { suffix: false });

// User home directory (normalize via upath to avoid backslash-in-JSON corruption)
const homeDir = path.normalize(os.homedir());

// Derive Windows AppData parent (C:/Users/Dell/AppData) from env-paths
// paths.config = C:/Users/Dell/AppData/Roaming/opencode
const appDataParent =
  os.platform() === 'win32'
    ? path.dirname(path.dirname(paths.config)) // strip /Roaming/opencode
    : paths.config; // macOS/Linux fallback

// Cross-platform shell path
const platform = os.platform();
const shellPath = (() => {
  if (platform === 'win32') {
    return path.join(appDataParent, 'Local', 'Microsoft', 'WindowsApps', 'pwsh.exe');
  }
  if (platform === 'darwin') {
    return '/usr/local/bin/pwsh'; // or /opt/homebrew/bin/pwsh
  }
  return '/usr/bin/pwsh'; // Linux
})();

const dotenv = loadDotenv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectFolder = path.join(__dirname, '..');

const templatePath = path.join(__dirname, 'opencode-template.jsonc');
let templateStr = fs.readFileSync(templatePath, 'utf8');

templateStr = templateStr
  .replaceAll('${shell}', shellPath)
  .replaceAll('${workspaceFolder}', projectFolder)
  .replaceAll(
    '${process.env.GITHUB_TOKEN}',
    dotenv.parsed.ACCESS_TOKEN || dotenv.parsed.GITHUB_TOKEN || (await getGithubToken())
  )
  .replaceAll('${appdata}', appDataParent)
  .replaceAll('${home}', homeDir);

const template = jsonc.parse(templateStr);
const targetConfig = path.join(__dirname, 'opencode.jsonc');

console.log(inspect(template, true, 3, true));

fs.writeFileSync(targetConfig, JSON.stringify(template, null, 2));
