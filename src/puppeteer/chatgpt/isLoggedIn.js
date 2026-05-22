/**
 * Checks if the user is logged into ChatGPT by checking if login button exists and is visible.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @returns {Promise<boolean>} True if logged in (no visible login button), false if not logged in.
 */
export default async function isLoggedIn(page) {
  const result = await page.evaluate(() => {
    const loginButton = document.querySelector('[data-testid="login-button"]');
    // User is NOT logged in if login button exists and is visible
    return !(loginButton && loginButton.offsetParent !== null);
  });

  // Ensure we always return a boolean
  return result === true;
}
