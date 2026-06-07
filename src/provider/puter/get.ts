import * as puter from '@heyputer/puter.js/src/init.cjs';
import { readfile, writefile } from 'sbg-utility';
import path from 'upath';

const TOKEN_FILE = path.join(process.cwd(), 'tmp/data/puter.txt');

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
    await puter.getAuthToken().then(saveToken);
    token = readToken();
  }
  return puter.init(token!);
}

export const puterProvider = get;
