import * as bin from 'binary-collections';

import path from 'upath';

bin.loadDotenv();

export const OPENCODE_PROXY_DB_PATH = path.join(process.cwd(), 'tmp', 'database', 'opencode-checker.db');

export { getConfig } from 'binary-collections';
