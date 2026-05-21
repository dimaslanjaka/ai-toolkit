import path from 'upath';
import fs from 'fs-extra';

export const COOKIE_DIR = path.join(process.cwd(), 'tmp', 'cookies');
export const DEFAULT_COOKIE_PATH = path.join(COOKIE_DIR, 'cookies.json');

fs.ensureDirSync(COOKIE_DIR);

/**
 * Returns the cookie file path for a given URL's hostname.
 *
 * @param {string} url - The URL to extract the hostname from.
 * @returns {string} The path to the cookie file for the hostname, or the default cookie path if invalid.
 */
export function getCookiePathForUrl(url) {
  try {
    const { hostname } = new URL(url);
    return path.join(COOKIE_DIR, `cookies_${hostname}.json`);
  } catch {
    return DEFAULT_COOKIE_PATH;
  }
}

/**
 * Saves cookies from a Puppeteer page to a specified file path.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {string} [path=DEFAULT_COOKIE_PATH] - Path to save the cookies file.
 * @returns {Promise<void>} Resolves when cookies are saved.
 */
export async function saveCookies(page, path = DEFAULT_COOKIE_PATH) {
  const cookies = await page.cookies();
  fs.writeFileSync(path, JSON.stringify(cookies, null, 2));
}

/**
 * Loads cookies from a specified file path.
 *
 * @param {string} [cookieFilePath=DEFAULT_COOKIE_PATH] - Path to the cookie file.
 * @returns {Array|Null} Parsed cookies array, or null if file does not exist.
 */
export function loadCookies(cookieFilePath = DEFAULT_COOKIE_PATH) {
  if (!fs.existsSync(cookieFilePath)) return null;
  return JSON.parse(fs.readFileSync(cookieFilePath));
}

/**
 * Restores cookies from a file to a Puppeteer page.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {string} [cookieFilePath=DEFAULT_COOKIE_PATH] - Path to the cookie file.
 * @returns {Promise<void>} Resolves when cookies are restored.
 */
export async function restoreCookies(page, cookieFilePath = DEFAULT_COOKIE_PATH) {
  const cookies = loadCookies(cookieFilePath);
  if (cookies) {
    await page.setCookie(...cookies);
  }
}
