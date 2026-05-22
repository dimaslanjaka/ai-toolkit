/**
 * Writes a question to the ChatGPT prompt textarea, handling multi-line questions.
 *
 * @param {import('puppeteer').Page} page - Puppeteer page instance.
 * @param {string} question - The question text to write.
 * @returns {Promise<void>} Resolves when the question is written.
 */
export default async function writeQuestion(page, question) {
  const promptTextarea = await page.waitForSelector('#prompt-textarea', { timeout: 30000 });
  if (!promptTextarea) {
    console.log(
      'Cannot find the prompt input on the webpage. Please check whether you have access to chat.openai.com without logging in via your browser.'
    );
    return;
  }

  // Inject the full prompt instantly and emit input-like events so the UI reacts.
  await page.evaluate((text) => {
    const promptEl = document.querySelector('#prompt-textarea');
    if (!promptEl) {
      return;
    }

    promptEl.focus();
    promptEl.innerHTML = '';

    const lines = String(text).split('\n');
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      promptEl.appendChild(p);
    }

    promptEl.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertFromPaste', data: text }));
    promptEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
    promptEl.dispatchEvent(new Event('change', { bubbles: true }));
  }, question);

  // If the app state did not pick up the DOM injection, use keyboard insertion as a reliable fallback.
  const hasPromptText = await page.evaluate(() => {
    const promptEl = document.querySelector('#prompt-textarea');
    return Boolean(promptEl && promptEl.textContent && promptEl.textContent.trim().length > 0);
  });

  if (!hasPromptText) {
    console.log('Prompt state not updated by DOM injection. Falling back to keyboard insertText.');
    await promptTextarea.click({ clickCount: 1 });
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.insertText(question);
  }
}
