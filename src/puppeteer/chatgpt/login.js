import { createBrowser, navigatePage, NAVIGATION_TIMEOUT_MS, NETWORK_IDLE_TIMEOUT_MS } from '../launcher.js';

/**
 * Handles the login process for ChatGPT by launching a browser and clicking the login button if needed.
 *
 * @returns {Promise<void>} Resolves when the login process is complete.
 */
export default async function login() {
  const browser = await createBrowser({ headless: false });
  const page = (await browser.pages()).length > 0 ? (await browser.pages())[0] : await browser.newPage();

  const url = 'https://chat.openai.com';
  const navigate = await navigatePage(page, url);

  // Wait for page to fully load before checking login status
  await navigate.waitForDomIdle(2000, 10000);

  // Check if the login button exists
  const loginButtonExists = await page.evaluate(() => {
    return document.querySelector('[data-testid="login-button"]') !== null;
  });

  if (loginButtonExists) {
    console.log('Login button found, clicking to log in...');
    await page.click('[data-testid="login-button"]');
    // Wait for the login process to complete without requiring full network idleness.
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    try {
      await page.waitForNetworkIdle({ idleTime: 1000, timeout: NETWORK_IDLE_TIMEOUT_MS });
    } catch {
      // Ignore: authentication pages can keep background connections active.
    }
    console.log('Login process completed.');
  } else {
    console.log('No login required - user appears to be already logged in.');
    await browser.close();
  }
}

export { login as loginChatGpt };
