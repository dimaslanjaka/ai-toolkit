import { afterEach, describe, expect, it, jest } from '@jest/globals';

const buildOpenAIClient = jest.fn<(...args: any[]) => Promise<any>>();
const create = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule('../../../src/provider/opencode/get.js', () => {
  throw new Error('src/provider/opencode/get.ts should not be imported by opencode.ts');
});

jest.unstable_mockModule('../../../src/utils/buildOpenAIClient.js', () => ({
  buildOpenAIClient
}));

jest.unstable_mockModule('../../../src/database/shared.js', () => ({
  getSettings: jest.fn(async () => ({ deleteSetting: jest.fn() })),
  getSharedModels: jest.fn()
}));

jest.unstable_mockModule('../../../src/proxy/isProxyReachable.cjs', () => ({
  isProxyReachable: jest.fn(async () => ({ ok: true }))
}));

jest.unstable_mockModule('../../../src/openai-server/responses-adapter.js', () => ({
  convertChatCompletionsToResponses: jest.fn((payload: any, model) => ({
    model,
    output_text: payload.choices[0].message.content
  })),
  convertResponsesRequestToChatCompletions: jest.fn(() => ({
    model: undefined,
    messages: [{ role: 'user', content: 'ping' }],
    stream: false,
    temperature: 0,
    max_tokens: 16
  })),
  convertStreamingChunkToResponses: jest.fn()
}));

jest.unstable_mockModule('../../../src/openai-server/tools/index.js', () => ({}));

jest.unstable_mockModule('../../../src/openai-server/tools/tool-registry.js', () => ({
  toolRegistry: {
    getOpenAIToolsFormat: jest.fn(() => []),
    has: jest.fn(() => false),
    executeMultiple: jest.fn(async () => [])
  }
}));

jest.unstable_mockModule('../../../src/openai-server/provider/message-repair.js', () => ({
  isConnectionError: jest.fn(() => false),
  repairMessageSequence: jest.fn(async (messages) => messages)
}));

jest.unstable_mockModule('../../../src/openai-server/provider/proxy-utility.js', () => ({
  cacheWorkingProxy: jest.fn(async () => undefined),
  getProxyClient: jest.fn(async () => ({
    initialize: jest.fn(async () => undefined),
    markProxyDeadForHost: jest.fn(async () => undefined)
  })),
  getProxyLabel: jest.fn((value) => value),
  selectProxyUrl: jest.fn(async () => undefined)
}));

jest.unstable_mockModule('../../../src/openai-server/utils.js', () => ({
  serverLogger: {
    log: jest.fn(),
    logSync: jest.fn()
  }
}));

describe('openai-server opencode provider client wiring', () => {
  afterEach(() => {
    process.env.OPENCODE_NO_PROXY = '1';
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('builds the opencode client through buildOpenAIClient', async () => {
    buildOpenAIClient.mockResolvedValue({
      client: {
        chat: {
          completions: {
            create
          }
        }
      },
      model: 'deepseek-v4-flash-free'
    });

    create.mockResolvedValue({
      id: 'chatcmpl_test',
      model: 'deepseek-v4-flash-free',
      choices: [
        {
          message: { role: 'assistant', content: 'pong' },
          finish_reason: 'stop'
        }
      ],
      usage: {}
    });

    const { handleResponses } = await import('../../../src/openai-server/provider/opencode.js');

    const result = await handleResponses({ body: {} } as any);

    expect(buildOpenAIClient).toHaveBeenCalledWith({
      model: 'deepseek-v4-flash-free',
      provider: 'opencode',
      proxy: undefined
    });
    expect(result).toEqual({
      type: 'json',
      data: {
        model: undefined,
        output_text: 'pong'
      }
    });
  });
});
