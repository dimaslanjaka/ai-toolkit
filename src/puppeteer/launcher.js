import fs from 'fs-extra';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'upath';
import { getCookiePathForUrl, loadCookies } from './cookies.js';

const NAVIGATION_TIMEOUT_MS = 90000;
const NETWORK_IDLE_TIMEOUT_MS = 15000;

/**
 * Navigates to a page with a resilient strategy for apps that keep long-lived network connections.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {string} url - URL to navigate to.
 * @returns {Promise<void>} Resolves when the page is at least DOM-ready.
 */
async function gotoWithFallback(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

  try {
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: NETWORK_IDLE_TIMEOUT_MS });
  } catch {
    // Network idle timeout is expected for apps with long-lived connections. Ignore this error.
  }
}

/**
 * Navigates to a URL using Puppeteer, loading cookies for the host and injecting a DOM mutation observer.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {string} url - The URL to navigate to.
 * @returns {Promise<{ waitForDomIdle: (idleMs?: number, timeout?: number) => Promise<boolean> }>} An object containing a function to wait for DOM stability.
 */
async function navigatePage(page, url) {
  const cookiePath = getCookiePathForUrl(url);

  const cookies = loadCookies(cookiePath);
  if (cookies) {
    await page.setCookie(...cookies);
  }

  await gotoWithFallback(page, url);

  await page.evaluate(() => {
    window.__domStillUpdating = true;

    if (window.__domObserver) {
      window.__domObserver.disconnect();
    }

    window.__domObserver = new MutationObserver(() => {
      window.__lastDomMutation = Date.now();
    });

    window.__lastDomMutation = Date.now();

    window.__domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    setTimeout(() => {
      window.__domStillUpdating = false;
      window.__domObserver.disconnect();
    }, 30000);
  });

  const waitForDomIdle = async (idleMs = 1000, timeout = 10000) => {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const lastMutation = await page.evaluate(() => window.__lastDomMutation);
      const idle = Date.now() - lastMutation;

      if (idle >= idleMs) {
        return true;
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    throw new Error('DOM did not stabilize within timeout');
  };

  return { waitForDomIdle };
}

/**
 * Creates a new Puppeteer browser instance with StealthPlugin enabled.
 *
 * @param {Parameters<import("puppeteer-extra").VanillaPuppeteer["launch"]>[0]} [browserOptions={}] - Browser launch options.
 * @returns {Promise<import("puppeteer-extra").Browser>} The created browser instance.
 */
export { gotoWithFallback, navigatePage, NAVIGATION_TIMEOUT_MS, NETWORK_IDLE_TIMEOUT_MS };

export async function createBrowser(browserOptions = {}) {
  const windowsChromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const hasWindowsChrome = process.platform === 'win32' && fs.existsSync(windowsChromeExecutable);

  /**
   * @type {Parameters<import("puppeteer-extra").VanillaPuppeteer["launch"]>[0]}
   */
  const defaultOptions = {
    headless: false,
    defaultViewport: null,
    userDataDir: path.join(process.cwd(), 'tmp/puppeteer-profile'),
    // Windows-specific options to handle browser launch issues
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ],
    ignoreDefaultArgs: ['--disable-extensions'],
    ...(hasWindowsChrome && {
      // Prefer local Chrome installation when present on Windows.
      executablePath: windowsChromeExecutable
    })
  };

  try {
    return await puppeteer.use(StealthPlugin()).launch({ ...defaultOptions, ...browserOptions });
  } catch (_error) {
    console.error('Failed to launch browser with default options. Trying fallback options...');

    // Fallback: Try with minimal options
    try {
      return await puppeteer.use(StealthPlugin()).launch({
        headless: browserOptions.headless || false,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'],
        ignoreDefaultArgs: false,
        ...(hasWindowsChrome && {
          executablePath: windowsChromeExecutable
        }),
        ...browserOptions
      });
    } catch (fallbackError) {
      console.error('Browser launch failed completely. Common solutions:');
      console.error('1. Install Google Chrome if not installed');
      console.error('2. Update Node.js to the latest version');
      console.error('3. Try running: npm install puppeteer --force');
      console.error('4. Check if antivirus is blocking browser launch');
      throw new Error(`Browser launch failed: ${fallbackError.message}`);
    }
  }
}
