import fs from 'fs-extra';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'upath';

/**
 * Creates a new Puppeteer browser instance with StealthPlugin enabled.
 *
 * @param {Parameters<import("puppeteer-extra").VanillaPuppeteer["launch"]>[0]} [browserOptions={}] - Browser launch options.
 * @returns {Promise<import("puppeteer-extra").Browser>} The created browser instance.
 */
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
