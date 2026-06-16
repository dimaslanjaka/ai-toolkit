// Runner for getKiroToken
import { getKiroTokenParsed } from './kiro-token.js';

const token = getKiroTokenParsed();
process.stdout.write(JSON.stringify(token, null, 2) ?? 'token not found');
