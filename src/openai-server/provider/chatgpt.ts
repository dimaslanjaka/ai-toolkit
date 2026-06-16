import { Request, Response } from 'express';
import { serverLogger, logMessageToFile } from '../utils.js';
import type { Browser, Page } from 'puppeteer';
import {
  convertResponsesRequestToChatCompletions,
  convertChatCompletionsToResponses,
  convertStreamingChunkToResponses,
  type ResponsesRequest
} from '../responses-adapter.js';

// Browser session management
let browserInstance: Browser | null = null;
let pageInstance: Page | null = null;

/**
 * Get or create a persistent browser session for ChatGPT
 */
async function getBrowserSession(): Promise<{ browser: Browser; page: Page }> {
  if (browserInstance && pageInstance) {
    try {
      // Check if browser is still connected
      await pageInstance.evaluate(() => true);
      return { browser: browserInstance, page: pageInstance };
    } catch {
      // Browser disconnected, recreate
      browserInstance = null;
      pageInstance = null;
    }
  }

  // Import dynamically to avoid loading Puppeteer at startup
  const { connectBrowser, navigatePage } = await import('../../puppeteer/launcher.js');
  const { default: isLoggedIn } = await import('../../puppeteer/chatgpt/isLoggedIn.js');

  serverLogger.log('Creating new browser session for ChatGPT...');

  const browser = await connectBrowser();
  const [existingPage] = await browser.pages();
  const page = existingPage || (await browser.newPage());

  await page.bringToFront();

  // Navigate to ChatGPT
  const url = 'https://chat.openai.com';
  const navigate = await navigatePage(page, url);
  await navigate.waitForDomIdle(2000, 15000);

  // Check login status
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    serverLogger.log('Not logged in to ChatGPT. Please log in manually in the browser window.');
    throw new Error('ChatGPT login required. Please log in manually and retry.');
  }

  serverLogger.log('ChatGPT browser session ready');

  // Store for reuse
  browserInstance = browser;
  pageInstance = page;

  return { browser, page };
}

/**
 * Send a message to ChatGPT and capture streaming response
 */
async function* sendChatGPTMessage(page: Page, message: string): AsyncGenerator<string> {
  const { default: writeQuestion } = await import('../../puppeteer/chatgpt/writeQuestion.js');
  const { default: clickSubmitButton } = await import('../../puppeteer/chatgpt/clickSubmitButton.js');
  const { default: waitForInitialResponse } = await import('../../puppeteer/chatgpt/waitForInitialResponse.js');
  const { delay } = await import('sbg-utility');
  const { navigatePage } = await import('../../puppeteer/launcher.js');

  // Ensure DOM is ready
  const navigate = await navigatePage(page, page.url());
  await navigate.waitForDomIdle(500, 5000);

  // Write and submit question
  await writeQuestion(page, message);
  const submitted = await clickSubmitButton(page);

  if (!submitted) {
    throw new Error('Failed to submit message to ChatGPT');
  }

  await navigate.waitForDomIdle(1000, 30000);
  await waitForInitialResponse(page);

  // Stream response chunks
  let previousText = '';
  let streaming = true;

  while (streaming) {
    const assistantMessages = await page.$$('[data-message-author-role="assistant"]');

    if (assistantMessages.length > 0) {
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const currentText = await page.evaluate((element) => element.textContent, lastMessage);

      if (currentText !== previousText) {
        const newChunk = currentText.slice(previousText.length);
        if (newChunk) {
          yield newChunk;
        }
        previousText = currentText;
      }

      const isStreaming = await lastMessage.$('.result-streaming');
      if (!isStreaming) {
        streaming = false;
      }
    }

    await delay(100);
  }
}

/**
 * Handle listing models for ChatGPT provider
 */
export async function handleModels(req: Request, res: Response) {
  try {
    const models = [
      {
        id: 'gpt-4o',
        object: 'model',
        created: 1718380395,
        owned_by: 'openai',
        permission: [],
        root: 'gpt-4o',
        parent: null
      },
      {
        id: 'gpt-4',
        object: 'model',
        created: 1687882411,
        owned_by: 'openai',
        permission: [],
        root: 'gpt-4',
        parent: null
      }
    ];

    res.json({
      object: 'list',
      data: models
    });
  } catch (err) {
    serverLogger.logSync(`Models endpoint error: ${err}`);
    res.status(500).json({ error: { message: (err as Error).message || 'Internal server error' } });
  }
}

/**
 * Handle chat completion for ChatGPT provider
 */
export async function handleChatCompletion(req: Request, res: Response) {
  try {
    const { model, messages, stream } = req.body as any;

    // Extract the last user message
    const userMessages = (messages || []).filter((m: any) => m.role === 'user');
    if (userMessages.length === 0) {
      res.status(400).json({ error: { message: 'No user message provided' } });
      return;
    }

    const lastUserMessage = userMessages[userMessages.length - 1].content;

    serverLogger.log(
      `ChatGPT request - Model: ${model}, Stream: ${stream}, Message: ${lastUserMessage.substring(0, 50)}...`
    );
    logMessageToFile('CHATGPT REQUEST PROMPT', lastUserMessage);

    // Get browser session
    const { page } = await getBrowserSession();

    if (stream) {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      try {
        let fullResponse = '';
        for await (const chunk of sendChatGPTMessage(page, lastUserMessage)) {
          fullResponse += chunk;
          const data = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model || 'gpt-4o',
            choices: [
              {
                index: 0,
                delta: { content: chunk },
                finish_reason: null
              }
            ]
          };

          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }

        logMessageToFile('CHATGPT STREAMING RESPONSE', fullResponse);

        // Send final chunk
        res.write(
          `data: ${JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model || 'gpt-4o',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
          })}\n\n`
        );

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err) {
        serverLogger.logSync(`ChatGPT streaming error: ${err}`);
        if (!res.headersSent) {
          res.status(500).json({ error: { message: (err as Error).message } });
        } else {
          res.write(`data: ${JSON.stringify({ error: { message: (err as Error).message } })}\n\n`);
          res.end();
        }
      }
    } else {
      // Non-streaming response
      let fullResponse = '';

      try {
        for await (const chunk of sendChatGPTMessage(page, lastUserMessage)) {
          fullResponse += chunk;
        }

        logMessageToFile('CHATGPT RESPONSE', fullResponse);

        const result = {
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: model || 'gpt-4o',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: fullResponse },
              finish_reason: 'stop'
            }
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        };

        res.json(result);
      } catch (err) {
        serverLogger.logSync(`ChatGPT error: ${err}`);
        res.status(500).json({ error: { message: (err as Error).message } });
      }
    }
  } catch (err) {
    serverLogger.logSync(`ChatGPT handler error: ${err}`);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: (err as Error).message || 'Internal server error' } });
    } else {
      res.end();
    }
  }
}

/**
 * Handle responses API for ChatGPT provider
 */
export async function handleResponses(req: Request, res: Response) {
  try {
    const requestData = req.body as ResponsesRequest;

    // Transform to chat completions format
    const chatReq = convertResponsesRequestToChatCompletions(requestData);

    // Extract the last user message (same logic as handleChatCompletion)
    const userMessages = (chatReq.messages || []).filter((m: any) => m.role === 'user');
    if (userMessages.length === 0) {
      res.status(400).json({ error: { message: 'No user message provided' } });
      return;
    }

    const lastUserMessage = userMessages[userMessages.length - 1].content;

    serverLogger.log(
      `ChatGPT Responses request - Model: ${requestData.model}, Stream: ${requestData.stream}, Message: ${lastUserMessage.substring(0, 50)}...`
    );
    logMessageToFile('CHATGPT REQUEST PROMPT (Responses API)', lastUserMessage);

    // Get browser session
    const { page } = await getBrowserSession();

    if (requestData.stream) {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const responseId = `resp_${Date.now()}`;

      // Emit the initial response created event
      res.write(
        `data: ${JSON.stringify({
          type: 'response.created',
          response: { id: responseId, object: 'response', status: 'in_progress', model: requestData.model || 'gpt-4o' }
        })}\n\n`
      );

      try {
        let fullResponse = '';
        for await (const chunk of sendChatGPTMessage(page, lastUserMessage)) {
          fullResponse += chunk;
          // Send each chunk as a delta event
          const deltaPayload = convertStreamingChunkToResponses({
            id: responseId,
            choices: [{ delta: { content: chunk } }]
          });
          res.write(`data: ${JSON.stringify(deltaPayload)}\n\n`);
        }

        logMessageToFile('CHATGPT STREAMING RESPONSE (Responses API)', fullResponse);

        // Send completion event
        res.write(
          `data: ${JSON.stringify({ type: 'response.done', response: { id: responseId, status: 'completed' } })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err) {
        serverLogger.logSync(`ChatGPT Responses streaming error: ${err}`);
        if (!res.headersSent) {
          res.status(500).json({ error: { message: (err as Error).message } });
        } else {
          res.write(`data: ${JSON.stringify({ error: { message: (err as Error).message } })}\n\n`);
          res.end();
        }
      }
    } else {
      // Non-streaming response
      let fullResponse = '';

      try {
        for await (const chunk of sendChatGPTMessage(page, lastUserMessage)) {
          fullResponse += chunk;
        }

        logMessageToFile('CHATGPT RESPONSE (Responses API)', fullResponse);

        // Convert to Responses API format
        const chatCompletionsFormat = {
          model: requestData.model,
          choices: [
            {
              message: { role: 'assistant', content: fullResponse }
            }
          ]
        };

        const result = convertChatCompletionsToResponses(chatCompletionsFormat, requestData.model);
        res.json(result);
      } catch (err) {
        serverLogger.logSync(`ChatGPT Responses error: ${err}`);
        res.status(500).json({ error: { message: (err as Error).message } });
      }
    }
  } catch (err) {
    serverLogger.logSync(`ChatGPT Responses handler error: ${err}`);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: (err as Error).message || 'Internal server error' } });
    } else {
      res.end();
    }
  }
}

/**
 * Cleanup browser session (call on server shutdown)
 */
export async function cleanup() {
  if (browserInstance) {
    try {
      await browserInstance.close();
      serverLogger.log('ChatGPT browser session closed');
    } catch (err) {
      serverLogger.logSync(`Error closing browser: ${err}`);
    }
    browserInstance = null;
    pageInstance = null;
  }
}
