/**
 * Checks if the user is logged into ChatGPT by checking for the main chat interface.
 * Uses positive indicators (chat UI elements) rather than relying on login button visibility,
 * because `offsetParent` is unreliable in headless browser mode.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @returns {Promise<boolean>} True if logged in (chat interface detected), false if not logged in.
 */
export default async function isLoggedIn(page) {
  const result = await page.evaluate(() => {
    // Positive indicators: ChatGPT main chat interface elements
    const hasChatInput = !!document.querySelector(
      'textarea[placeholder*="Message"], textarea#prompt-textarea, [contenteditable="true"][data-placeholder*="Message"]'
    );
    const hasSidebar = !!document.querySelector('nav');
    const loginButton = document.querySelector('[data-testid="login-button"]');

    // If we see the chat input area, we're definitely logged in
    if (hasChatInput) return true;

    // If there's a sidebar AND no login button, likely logged in
    if (hasSidebar && !loginButton) return true;

    // Login button exists -> not logged in (regardless of offsetParent)
    if (loginButton) return false;

    // No positive or negative signals — default to not logged in
    return false;
  });

  return result === true;
}
