import type { Request } from 'express';
import fs from 'fs-extra';
import { OpenAI } from 'openai';
import { isEmpty, writefile } from 'sbg-utility';
import { ProxyAgent } from 'undici';
import path from 'upath';
import SQLiteProxy from '../../database/SQLiteProxy.js';
import { getSQLite, getSharedModels } from '../../database/shared.js';
import { opencodeProvider } from '../../provider/opencode/get.js';

import {
  convertChatCompletionsToResponses,
  convertResponsesRequestToChatCompletions,
  convertStreamingChunkToResponses,
  type ResponsesRequest
} from '../responses-adapter.js';
import '../tools/index.js'; // Auto-register built-in tools
import { toolRegistry } from '../tools/tool-registry.js';
import { appendMessageToFile, logMessageToFile, serverLogger } from '../utils.js';
import type { ProviderResult } from './index.js';
import { isConnectionError, repairMessageSequence } from './message-repair.js';

// Lazy-load the OpenCode provider to avoid SDK init at import time
let opencodeClient: OpenAI | null = null;
let opencodeClientProxy: string | undefined;
const LAST_OPENCODE_PROXY_PATH = path.join(process.cwd(), 'tmp', 'database', 'last-opencode-proxy.txt');

async function getProxyClient() {
  const sharedDb = await getSQLite();
  return new SQLiteProxy(sharedDb);
}

function getProxyUrl(item: {
  password?: string | null;
  proxy: string;
  type?: string | null;
  username?: string | null;
}): string {
  let protocol = item.type?.split(/[,-]/)[0];
  if (isEmpty(protocol)) protocol = 'http';
  return `${protocol}://${item.username ? `${item.username}:${item.password}@` : ''}${item.proxy}`;
}

function getProxyLabel(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    return `${parsed.hostname}:${parsed.port}`;
  } catch {
    return proxyUrl;
  }
}

async function readLastWorkingProxy(): Promise<string | undefined> {
  try {
    const proxyUrl = (await fs.readFile(LAST_OPENCODE_PROXY_PATH, 'utf8')).trim();
    if (!proxyUrl) return undefined;

    const parsed = new URL(proxyUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }

    serverLogger.log(`Reusing cached OpenCode proxy: ${getProxyLabel(proxyUrl)}`);
    return proxyUrl;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      serverLogger.logSync(`Unable to read cached OpenCode proxy: ${error}`);
    }
    return undefined;
  }
}

async function selectProxyUrl(): Promise<string | undefined> {
  const cachedProxy = await readLastWorkingProxy();
  if (cachedProxy) return cachedProxy;

  const proxyClient = await getProxyClient();
  const item = await proxyClient.getProxyForHost('opencode.ai', { type: 'http' });
  serverLogger.log(`Proxy search result for opencode.ai: ${JSON.stringify(item)}`);
  return item ? getProxyUrl(item) : undefined;
}

async function cacheWorkingProxy(proxyUrl: string | undefined): Promise<void> {
  if (!proxyUrl) return;

  try {
    writefile(LAST_OPENCODE_PROXY_PATH, `${proxyUrl}\n`);
    serverLogger.log(`Cached working OpenCode proxy: ${getProxyLabel(proxyUrl)}`);
  } catch (error) {
    serverLogger.logSync(`Unable to cache working OpenCode proxy: ${error}`);
  }
}

async function getOpenCode(): Promise<OpenAI> {
  if (!opencodeClient) {
    // Filter for HTTP proxies only since undici ProxyAgent doesn't support SOCKS5.
    opencodeClientProxy = await selectProxyUrl();

    // getSQLite provides the centralized SQLite connection
    const proxyClient = await getProxyClient();
    await proxyClient.initialize();
    serverLogger.log('Proxy client initialized.');

    opencodeClient = await opencodeProvider({
      model: 'deepseek-v4-flash-free',
      provider: 'opencode',
      proxy: opencodeClientProxy
    });
  }
  return opencodeClient;
}

export async function handleModels(_req: Request): Promise<ProviderResult> {
  const modelDb = await getSharedModels();
  await modelDb.initialize();

  const modelsApi = await modelDb.models();
  const dbModels = await modelsApi.find({ provider: 'opencode' });

  const data = dbModels.map((model: any) => ({
    id: model.id,
    object: model.object,
    created: model.created,
    owned_by: model.owned_by,
    permission: JSON.parse(model.permission),
    root: model.root,
    parent: model.parent,
    enabled: model.enabled !== 0
  }));

  return { type: 'json', data: { object: 'list', data } };
}

async function resolveModel(model: string | undefined) {
  if (!model || model === 'auto') {
    return 'deepseek-v4-flash-free';
  }

  // Check if the model exists in the database
  const modelDb = await getSharedModels();
  await modelDb.initialize();
  const modelsApi = await modelDb.models();
  const dbModels = await modelsApi.find({ id: model, provider: 'opencode' });

  if (dbModels.length === 0) {
    // Model not found in database, use deepseek as default
    serverLogger.log(`Model ${model} not found in database, using deepseek-v4-flash-free instead`);
    return 'deepseek-v4-flash-free';
  }

  return model;
}

async function markProxyDeadSafely(proxyUrl: string): Promise<void> {
  try {
    // Extract proxy address from URL (remove protocol and auth)
    const url = new URL(proxyUrl);
    const proxyAddress = `${url.hostname}:${url.port}`;

    const proxyClient = await getProxyClient();
    await proxyClient.markProxyDead(proxyAddress);
    serverLogger.log(`Marked dead proxy: ${getProxyLabel(proxyUrl)}`);

    // Clear the cached proxy file since it's no longer working
    try {
      await fs.unlink(LAST_OPENCODE_PROXY_PATH);
    } catch {
      // File may not exist, which is fine
    }
  } catch (error) {
    serverLogger.logSync(`Failed to mark proxy dead: ${error}`);
  }
}

async function createProxyDispatcher(): Promise<{ dispatcher?: ProxyAgent; proxyUrl?: string }> {
  const proxyUrl = await selectProxyUrl();
  return {
    dispatcher: proxyUrl ? new ProxyAgent(proxyUrl) : undefined,
    proxyUrl
  };
}

export async function handleChatCompletion(req: Request): Promise<ProviderResult> {
  const { model, messages, stream, temperature, max_tokens, stream_options, tools, tool_choice } = req.body as any;
  const resolvedModel = await resolveModel(model);
  const includeUsage = stream_options?.include_usage === true;

  serverLogger.log(`OpenCode Chat - Model: ${resolvedModel}, Stream: ${!!stream}, Messages Length: ${messages.length}`);

  // Repair message sequence: fill missing tool responses before sending upstream.
  // DeepSeek rejects sequences where an assistant message with tool_calls
  // is not immediately followed by matching tool-role responses.
  const repairedMessages = await repairMessageSequence(
    messages as { role: string; content?: any; tool_calls?: any[]; tool_call_id?: string; name?: string }[],
    serverLogger
  );

  const logFile = logMessageToFile(
    'OPENCODE REQUEST',
    JSON.stringify({ model: resolvedModel, messages: repairedMessages, stream, temperature, max_tokens }, null, 2)
  );

  const client = await getOpenCode();
  const baseBody: Record<string, any> = {
    model: resolvedModel,
    messages: repairedMessages,
    temperature,
    max_tokens
  };

  // Merge client-provided tools with registry tools
  const registryTools = toolRegistry.getOpenAIToolsFormat();
  const allTools = [...(tools || []), ...registryTools];

  // Deduplicate by tool name, client-provided tools take precedence
  const seenToolNames = new Set<string>();
  const deduplicatedTools = allTools.filter((tool) => {
    const name = tool?.function?.name;
    if (!name || seenToolNames.has(name)) return false;
    seenToolNames.add(name);
    return true;
  });

  if (deduplicatedTools.length > 0) {
    baseBody.tools = deduplicatedTools;
    if (tool_choice) {
      baseBody.tool_choice = tool_choice;
    }
  }

  const { dispatcher, proxyUrl } = await createProxyDispatcher();

  if (stream) {
    return {
      type: 'stream',
      pipe: async (res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();

        const completionId = `chatcmpl-${Date.now()}`;
        const created = Math.floor(Date.now() / 1000);
        const streamModel = resolvedModel || 'opencode-default';

        let fullResponse = '';
        let collectedToolCalls: any[] = [];
        try {
          const streamResponse = await client.chat.completions.create(
            {
              ...baseBody,
              stream: true as const
            } as OpenAI.ChatCompletionCreateParamsStreaming,
            { fetchOptions: { dispatcher } }
          );
          for await (const chunk of streamResponse) {
            const choice = chunk.choices?.[0];
            const delta = choice?.delta;
            const content = delta?.content || '';
            const toolCalls = delta?.tool_calls;
            const finishReason = choice?.finish_reason;

            // Collect text for final log
            if (content) {
              fullResponse += content;
            }

            // Collect tool calls for local execution
            if (toolCalls && toolCalls.length > 0) {
              for (const tc of toolCalls) {
                // Handle incremental tool call deltas
                if (tc.index !== undefined) {
                  while (collectedToolCalls.length <= tc.index) {
                    collectedToolCalls.push({ id: '', type: 'function', function: { name: '', arguments: '' } });
                  }
                  const existing = collectedToolCalls[tc.index];
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.function.name += tc.function.name;
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                } else {
                  // Complete tool call
                  collectedToolCalls.push(tc);
                }
              }
            }

            // Build the chunk to forward, preserving ALL upstream fields
            const forwardDelta: any = {};
            if (delta?.role) forwardDelta.role = delta.role;
            if (content) forwardDelta.content = content;
            if (toolCalls) forwardDelta.tool_calls = toolCalls;

            // Write every chunk that has content, tool_calls, or a finish_reason
            if (content || toolCalls || finishReason) {
              res.write(
                `data: ${JSON.stringify({
                  id: chunk.id || completionId,
                  object: 'chat.completion.chunk',
                  created,
                  model: chunk.model || streamModel,
                  choices: [
                    {
                      index: choice?.index ?? 0,
                      delta: forwardDelta,
                      finish_reason: finishReason ?? null
                    }
                  ]
                })}\n\n`
              );
            }
          }
          await cacheWorkingProxy(proxyUrl);

          // Check if there are local tools to execute after streaming completes
          if (collectedToolCalls.length > 0) {
            const localToolCalls = collectedToolCalls.filter(
              (tc) => tc.function?.name && toolRegistry.has(tc.function.name)
            );

            if (localToolCalls.length > 0) {
              serverLogger.log(
                `Streaming: Executing ${localToolCalls.length} local tool(s): ${localToolCalls.map((tc) => tc.function?.name).join(', ')}`
              );

              // Execute local tools
              const toolResults = await toolRegistry.executeMultiple(localToolCalls);

              // Log tool results
              appendMessageToFile(logFile, 'OPENCODE STREAMING TOOL RESULTS', JSON.stringify(toolResults, null, 2));

              // For streaming, we need to continue the conversation
              // Add assistant message with tool_calls and tool results to messages
              const messagesWithToolCalls = [
                ...repairedMessages,
                {
                  role: 'assistant',
                  content: fullResponse || null,
                  tool_calls: localToolCalls
                },
                ...toolResults
              ];

              // Make a follow-up streaming call with tool results
              const followUpBody = {
                ...baseBody,
                messages: messagesWithToolCalls,
                tools: deduplicatedTools.length > 0 ? deduplicatedTools : undefined
              };

              try {
                const followUpStream = await client.chat.completions.create(
                  {
                    ...followUpBody,
                    stream: true as const
                  } as OpenAI.ChatCompletionCreateParamsStreaming,
                  { fetchOptions: { dispatcher } }
                );

                let followUpResponse = '';
                for await (const chunk of followUpStream) {
                  const choice = chunk.choices?.[0];
                  const delta = choice?.delta;
                  const content = delta?.content || '';
                  const toolCalls = delta?.tool_calls;
                  const finishReason = choice?.finish_reason;

                  if (content) {
                    followUpResponse += content;
                  }

                  const forwardDelta: any = {};
                  if (delta?.role) forwardDelta.role = delta.role;
                  if (content) forwardDelta.content = content;
                  if (toolCalls) forwardDelta.tool_calls = toolCalls;

                  if (content || toolCalls || finishReason) {
                    res.write(
                      `data: ${JSON.stringify({
                        id: chunk.id || completionId,
                        object: 'chat.completion.chunk',
                        created,
                        model: chunk.model || streamModel,
                        choices: [
                          {
                            index: choice?.index ?? 0,
                            delta: forwardDelta,
                            finish_reason: finishReason ?? null
                          }
                        ]
                      })}\n\n`
                    );
                  }
                }

                appendMessageToFile(logFile, 'OPENCODE STREAMING TOOL FOLLOW-UP RESPONSE', followUpResponse);
              } catch (followUpErr: any) {
                serverLogger.logSync(`OpenCode streaming follow-up error: ${followUpErr}`);
                res.write(
                  `data: ${JSON.stringify({ error: { message: followUpErr.message || 'Follow-up stream error' } })}\n\n`
                );
              }
            }
          }

          // Include usage information if requested
          if (includeUsage) {
            const promptTokens =
              messages?.reduce((sum: number, m: any) => sum + Math.ceil((m.content?.toString().length || 0) / 4), 0) ||
              0;
            const completionTokens = Math.ceil(fullResponse.length / 4);
            res.write(
              `data: ${JSON.stringify({
                id: completionId,
                object: 'chat.completion.chunk',
                created,
                model: streamModel,
                choices: [],
                usage: {
                  prompt_tokens: promptTokens,
                  completion_tokens: completionTokens,
                  total_tokens: promptTokens + completionTokens
                }
              })}\n\n`
            );
          }

          res.write('data: [DONE]\n\n');
          appendMessageToFile(logFile, 'OPENCODE STREAMING RESPONSE', fullResponse);
        } catch (streamErr: any) {
          serverLogger.logSync(`OpenCode streaming error: ${streamErr}`);
          // Mark proxy as dead on connection error
          if (proxyUrl && isConnectionError(streamErr)) {
            await markProxyDeadSafely(proxyUrl);
          }
          if (!res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: { message: streamErr.message || 'Stream error' } })}\n\n`);
          }
        }
        res.end();
      }
    };
  }

  try {
    const completion = await client.chat.completions.create(
      {
        ...baseBody,
        stream: false as const
      } as OpenAI.ChatCompletionCreateParamsNonStreaming,
      { fetchOptions: { dispatcher } }
    );
    await cacheWorkingProxy(proxyUrl);

    // Preserve the full upstream response including tool_calls and finish_reason
    const upstreamChoice = completion.choices?.[0];
    const upstreamMessage = upstreamChoice?.message || { role: 'assistant' as const, content: '' };
    const upstreamToolCalls = (upstreamMessage as any)?.tool_calls;

    const content = upstreamMessage?.content || '';
    appendMessageToFile(logFile, 'OPENCODE RESPONSE', content);

    // Check if the upstream response contains tool calls that should be executed locally
    if (upstreamToolCalls && upstreamToolCalls.length > 0) {
      // Find which tools can be executed locally from the registry
      const localToolCalls = upstreamToolCalls.filter((tc: any) => toolRegistry.has(tc.function?.name));

      if (localToolCalls.length > 0) {
        serverLogger.log(
          `Executing ${localToolCalls.length} local tool(s): ${localToolCalls.map((tc: any) => tc.function?.name).join(', ')}`
        );

        // Execute local tools
        const toolResults = await toolRegistry.executeMultiple(localToolCalls);

        // Add assistant message with tool_calls to conversation
        const messagesWithToolCalls = [
          ...repairedMessages,
          {
            role: 'assistant',
            content: content || null,
            tool_calls: localToolCalls
          },
          ...toolResults
        ];

        // Make another API call with tool results
        const followUpBody = {
          ...baseBody,
          messages: messagesWithToolCalls,
          tools: deduplicatedTools.length > 0 ? deduplicatedTools : undefined
        };

        const followUpCompletion = await client.chat.completions.create(
          {
            ...followUpBody,
            stream: false as const
          } as OpenAI.ChatCompletionCreateParamsNonStreaming,
          { fetchOptions: { dispatcher } }
        );

        const followUpChoice = followUpCompletion.choices?.[0];
        const followUpMessage = followUpChoice?.message || { role: 'assistant' as const, content: '' };
        const followUpContent = followUpMessage?.content || '';
        const followUpToolCalls = (followUpMessage as any)?.tool_calls;

        appendMessageToFile(logFile, 'OPENCODE TOOL FOLLOW-UP RESPONSE', followUpContent);

        const responseChoice: any = {
          index: 0,
          message: {
            role: followUpMessage?.role || 'assistant',
            content: followUpContent || null
          },
          finish_reason: followUpChoice?.finish_reason || 'stop'
        };

        // Forward any additional tool_calls from the follow-up response
        if (followUpToolCalls && followUpToolCalls.length > 0) {
          responseChoice.message.tool_calls = followUpToolCalls;
        }

        return {
          type: 'json',
          data: {
            id: followUpCompletion.id || `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model ?? followUpCompletion.model ?? 'opencode-default',
            choices: [responseChoice],
            usage: followUpCompletion.usage || {}
          }
        };
      }
    }

    // No local tool execution needed, return the original response
    const responseChoice: any = {
      index: 0,
      message: {
        role: upstreamMessage?.role || 'assistant',
        content: content || null
      },
      finish_reason: upstreamChoice?.finish_reason || 'stop'
    };

    // Forward tool_calls to the client so agentic tools work
    if (upstreamToolCalls && upstreamToolCalls.length > 0) {
      responseChoice.message.tool_calls = upstreamToolCalls;
    }

    return {
      type: 'json',
      data: {
        id: completion.id || `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model ?? completion.model ?? 'opencode-default',
        choices: [responseChoice],
        usage: completion.usage || {}
      }
    };
  } catch (err: any) {
    serverLogger.logSync(`OpenCode chat completion error: ${err}`);
    // Mark proxy as dead on connection error
    if (proxyUrl && isConnectionError(err)) {
      await markProxyDeadSafely(proxyUrl);
    }
    throw err;
  }
}

export async function handleResponses(req: Request): Promise<ProviderResult> {
  const requestData = req.body as ResponsesRequest;
  const chatReq = convertResponsesRequestToChatCompletions(requestData);
  const { model, messages, stream, temperature, max_tokens } = chatReq;
  const resolvedModel = await resolveModel(model);

  const promptPreview = (messages || [])
    .map((m: any) => `${m.role}: ${(m.content || '').toString().substring(0, 80)}`)
    .join(' | ');
  serverLogger.log(`OpenCode Responses - Model: ${resolvedModel}, Stream: ${!!stream}, Messages: ${promptPreview}`);
  const responsesLogFile = logMessageToFile('OPENCODE RESPONSES REQUEST', JSON.stringify(requestData, null, 2));

  const client = await getOpenCode();
  const baseBody = {
    model: resolvedModel,
    messages: messages as OpenAI.ChatCompletionMessageParam[],
    temperature,
    max_tokens
  };
  const { dispatcher, proxyUrl } = await createProxyDispatcher();

  if (stream) {
    return {
      type: 'stream',
      pipe: async (res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();

        const responseId = `resp_${Date.now()}`;
        res.write(
          `data: ${JSON.stringify({
            type: 'response.created',
            response: { id: responseId, object: 'response', status: 'in_progress', model: model || 'opencode-default' }
          })}\n\n`
        );

        let fullResponse = '';
        try {
          const streamResponse = await client.chat.completions.create(
            {
              ...baseBody,
              stream: true as const
            },
            { fetchOptions: { dispatcher } }
          );
          for await (const chunk of streamResponse) {
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullResponse += delta;
              const deltaPayload = convertStreamingChunkToResponses({
                id: responseId,
                choices: [{ delta: { content: delta } }]
              });
              res.write(`data: ${JSON.stringify(deltaPayload)}\n\n`);
            }
          }
          await cacheWorkingProxy(proxyUrl);
          res.write(
            `data: ${JSON.stringify({ type: 'response.done', response: { id: responseId, status: 'completed' } })}\n\n`
          );
          res.write('data: [DONE]\n\n');
          appendMessageToFile(responsesLogFile, 'OPENCODE RESPONSES STREAMING RESPONSE', fullResponse);
        } catch (streamErr: any) {
          serverLogger.logSync(`OpenCode Responses streaming error: ${streamErr}`);
          // Mark proxy as dead on connection error
          if (proxyUrl && isConnectionError(streamErr)) {
            await markProxyDeadSafely(proxyUrl);
          }
          if (!res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: { message: streamErr.message || 'Stream error' } })}\n\n`);
          }
        }
        res.end();
      }
    };
  }

  try {
    const completion = await client.chat.completions.create(
      {
        ...baseBody,
        stream: false as const
      },
      { fetchOptions: { dispatcher } }
    );
    await cacheWorkingProxy(proxyUrl);
    const content = completion.choices?.[0]?.message?.content || '';
    appendMessageToFile(responsesLogFile, 'OPENCODE RESPONSES RESPONSE', content);

    const chatCompletionsFormat = {
      model: requestData.model,
      choices: [{ message: { role: 'assistant', content } }]
    };
    const result = convertChatCompletionsToResponses(chatCompletionsFormat, requestData.model);
    return { type: 'json', data: result };
  } catch (err: any) {
    serverLogger.logSync(`OpenCode Responses completion error: ${err}`);
    // Mark proxy as dead on connection error
    if (proxyUrl && isConnectionError(err)) {
      await markProxyDeadSafely(proxyUrl);
    }
    throw err;
  }
}
