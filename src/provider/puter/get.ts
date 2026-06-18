import { createRequire } from 'node:module';
import { readfile, writefile } from 'sbg-utility';
import path from 'upath';

const require = createRequire(import.meta.url);

const { init, getAuthToken } = require('@heyputer/puter.js/src/init.cjs');

const TOKEN_FILE = path.join(process.cwd(), 'tmp/database/puter.txt');

function saveToken(data?: string) {
  if (!data) return;
  writefile(TOKEN_FILE, data);
}

function readToken() {
  return readfile(TOKEN_FILE);
}

export default async function get() {
  let token = readToken();
  if (!token) {
    await getAuthToken().then(saveToken);
    token = readToken();
  }
  return init(token!);
}

export const puterProvider = get;
