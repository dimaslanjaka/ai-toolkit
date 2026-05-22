/**
 * Clicks the submit button in ChatGPT interface, trying different button variants.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @returns {Promise<boolean>} Resolves to true when submission is detected, otherwise false.
 */
export default async function clickSubmitButton(page) {
  console.log('Attempting to click the submit button...');
  try {
    const userMessageCountBefore = await page.$$eval(
      '[data-message-author-role="user"]',
      (elements) => elements.length
    );

    const waitForSubmit = async (timeout = 5000) => {
      try {
        await page.waitForFunction(
          (previousCount) => {
            const currentCount = document.querySelectorAll('[data-message-author-role="user"]').length;
            return currentCount > previousCount;
          },
          { timeout },
          userMessageCountBefore
        );
        return true;
      } catch {
        return false;
      }
    };

    await page
      .waitForFunction(
        () => {
          const candidates = [
            document.querySelector('[data-testid="fruitjuice-send-button"]'),
            document.querySelector('#composer-submit-button'),
            document.querySelector('[data-testid="send-button"]')
          ].filter(Boolean);

          return candidates.some((button) => {
            const isDisabled = button.disabled || button.getAttribute('aria-disabled') === 'true';
            const isVisible = button.offsetParent !== null;
            return !isDisabled && isVisible;
          });
        },
        { timeout: 5000 }
      )
      .catch(() => {
        // Continue to diagnostics below even if no enabled button was found within timeout.
      });

    const buttonDetails = await page.evaluate(() => {
      const selectors = [
        '[data-testid="fruitjuice-send-button"]',
        '#composer-submit-button',
        '[data-testid="send-button"]'
      ];

      const details = selectors.map((selector) => {
        const el = document.querySelector(selector);
        const exists = Boolean(el);
        const disabled = exists ? Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true') : null;
        const visible = exists ? el.offsetParent !== null : null;
        return { selector, exists, disabled, visible };
      });

      return details;
    });

    console.log(`Submit button details: ${JSON.stringify(buttonDetails)}`);
    const clickable = buttonDetails.find((item) => item.exists && item.visible && item.disabled === false);
    const selectedSelector = clickable ? clickable.selector : null;

    if (selectedSelector) {
      await page.click(selectedSelector);
      console.log(`Clicked submit button selector: ${selectedSelector}`);

      if (await waitForSubmit(5000)) {
        console.log('Submission detected after selector click.');
        return true;
      }

      // Fallback: force a DOM click in case pointer-interception blocked page.click.
      const forcedClickWorked = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) {
          return false;
        }

        el.click();
        return true;
      }, selectedSelector);

      if (forcedClickWorked) {
        console.log(`Forced DOM click on selector: ${selectedSelector}`);
        if (await waitForSubmit(5000)) {
          console.log('Submission detected after forced DOM click.');
          return true;
        }
      }
    }

    console.log('Submit button path did not submit. Trying Enter key fallback on prompt.');
    await page.focus('#prompt-textarea');
    await page.keyboard.press('Enter');
    if (await waitForSubmit(5000)) {
      console.log('Submission detected after Enter key fallback.');
      return true;
    }

    // Final fallback: submit the nearest composer form.
    const didRequestSubmit = await page.evaluate(() => {
      const prompt = document.querySelector('#prompt-textarea');
      if (!prompt) {
        return false;
      }

      const form = prompt.closest('form');
      if (!form) {
        return false;
      }

      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
      return true;
    });

    if (didRequestSubmit) {
      console.log('Triggered form submit fallback.');
      if (await waitForSubmit(5000)) {
        console.log('Submission detected after form submit fallback.');
        return true;
      }
    }

    console.log('Failed to submit prompt after all strategies.');
    return false;
  } catch (e) {
    console.log(`Failed to click the send button: ${e}`);
    return false;
  }
}
