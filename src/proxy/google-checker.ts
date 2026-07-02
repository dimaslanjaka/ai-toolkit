import ansiColors from 'ansi-colors';
import { Window } from 'happy-dom';
import { Proxy } from '../database/ProxyDB.js';
import SQLiteMarker from '../database/SQLiteMarker.js';
import { closeAllDatabases, getProductionMySQL, getSQLite, getSQLiteProxy } from '../database/shared.js';
import { checkProxy, CheckProxyResult } from './checker.js';
import { getWorkingProxies } from './proxies-data.js';

const productionMySQL = getProductionMySQL();
let sharedSqlite: Awaited<ReturnType<typeof getSQLite>>;
let marker: SQLiteMarker;

async function initSharedSqlite() {
  if (!sharedSqlite) {
    sharedSqlite = await getSQLite();
    marker = new SQLiteMarker('', { sharedDb: sharedSqlite });
  }
}

// Marker durations (in days)
const WORKING_PROXY_HOURS = 1 / 24; // 1 hour
const DEAD_PROXY_HOURS = 3 / 24; // 3 hours

async function getUnseenWorkingProxies() {
  await initSharedSqlite();
  const proxies = await getWorkingProxies();

  const result = marker.filterUnseen(proxies.map((p) => p.proxy));
  const filtered = proxies.filter((p) => result.pending.has(p.proxy));

  console.log(`Found ${proxies.length} proxies, ${filtered.length} pending check`);
  return filtered;
}

export function hasValidCredentials(item: Proxy) {
  return (
    item.username &&
    item.password &&
    item.username !== '-' &&
    item.password !== '-' &&
    !item.username.includes('-:') &&
    !item.password.includes('-:')
  );
}

/**
 * Extract the raw page title from HTML using happy-dom.
 */
function extractRawTitle(html: string): string {
  try {
    const window = new Window();
    const document = window.document;
    document.write(html);
    window.close();
    return document.title?.trim() ?? '';
  } catch {
    return '';
  }
}

/**
 * Parse HTML using happy-dom and validate the page title.
 * Returns the title if valid, null if captcha/bot detection or non-Google title.
 */
function parseGoogleTitle(html: string): string | null {
  const title = extractRawTitle(html);
  const lowerTitle = title.toLowerCase();

  // Reject known captcha/bot detection pages
  if (
    lowerTitle.includes('captcha') ||
    lowerTitle.includes('unusual traffic') ||
    lowerTitle.includes('not a robot') ||
    lowerTitle.includes('automated queries') ||
    lowerTitle.includes('sorry') ||
    lowerTitle.includes('blocked') ||
    lowerTitle.includes('error') ||
    lowerTitle.includes('attention')
  ) {
    return null;
  }

  // Must be exactly "Google" (case-insensitive)
  if (lowerTitle !== 'google') {
    return null;
  }

  return title;
}

async function checkSingle(item: Proxy) {
  const protocols = ['http', 'socks4', 'socks5'];

  const valid = hasValidCredentials(item);

  if (!valid) {
    try {
      await productionMySQL.update('proxies', { username: '', password: '' }, { proxy: item.proxy });
    } catch (error) {
      console.warn(
        'Failed to update proxy credentials in production DB:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  let result: CheckProxyResult | undefined = undefined;
  let protocol: string | undefined = undefined;
  for (protocol of protocols) {
    const built = `${protocol}://${valid ? `${item.username}:${item.password}@` : ''}${item.proxy}`;
    console.log(`Checking proxy: ${built}`);
    result = await checkProxy({
      proxy: built,
      endpoint: 'https://www.google.com/',
      callback: (proxy, _endpoint, response) => {
        const html = String(response.data);
        const title = parseGoogleTitle(html);

        if (title) {
          return {
            proxy: proxy,
            working: true,
            status: response.status,
            ip: response.data?.ip,
            protocol
          };
        } else {
          const rawTitle = extractRawTitle(html);
          return {
            proxy: proxy,
            working: false,
            status: response.status,
            error: rawTitle
              ? `Page title is "${rawTitle}" — not "Google", possible captcha or bot detection`
              : 'Page title is empty — possible captcha or bot detection'
          };
        }
      }
    });
    if (result.working) {
      break;
    }
  }

  if (result?.working) {
    marker.mark(item.proxy, WORKING_PROXY_HOURS);
    await (
      await getSQLiteProxy()
    ).addProxy({
      proxy: item.proxy,
      type: protocol,
      host: 'google.com'
    });
  } else {
    marker.mark(item.proxy, DEAD_PROXY_HOURS);
  }

  return result;
}

export async function googleCheckProxy() {
  await initSharedSqlite();
  const proxies = await getUnseenWorkingProxies();
  for (let index = 0; index < proxies.length; index++) {
    const item = proxies[index];
    const result = await checkSingle(item);
    if (result?.working) {
      console.log(`Proxy ${ansiColors.green(item.proxy)} is working!`);
      if (result.protocol === 'http') break;
    }
  }

  await closeAllDatabases();
  marker.close();
}
