/**
 * Adapter functions for converting between OpenAI Responses API and Chat Completions API formats
 */

// Types for Responses API
export interface ResponseInputMessage {
  type: 'message';
  role: 'user' | 'system' | 'assistant' | 'tool';
  content: Array<{ type: string; text?: string }>;
}

export interface ResponseInputText {
  type: 'input_text';
  text: string;
}

export type ResponseInputItem = ResponseInputMessage | ResponseInputText;

export interface ResponsesRequest {
  model: string;
  instructions?: string;
  input: string | ResponseInputItem[];
  tools?: any[];
  temperature?: number;
  max_output_tokens?: number;
  stream?: boolean;
}

export interface ResponsesOutput {
  type: string;
  id: string;
  status: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
}

export interface ResponsesResponse {
  id: string;
  object: string;
  created_at: number;
  status: string;
  model: string;
  output: ResponsesOutput[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Convert Responses API request to Chat Completions format
 */
export function convertResponsesRequestToChatCompletions(request: ResponsesRequest): {
  messages: Array<{ role: string; content: string }>;
  model: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: any[];
} {
  const { model, instructions, input, temperature, max_output_tokens, stream, tools } = request;

  const messages: Array<{ role: string; content: string }> = [];

  // Add instructions as system message if provided
  if (instructions) {
    messages.push({ role: 'system', content: instructions });
  }

  // Convert input to chat completion messages
  if (typeof input === 'string') {
    messages.push({ role: 'user', content: input });
  } else if (Array.isArray(input)) {
    // Handle array of response input items (OpenAI Responses API format)
    for (const item of input) {
      if (item.type === 'message' && item.role && Array.isArray(item.content)) {
        // Message-type items: { type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }
        const textContent = item.content
          .filter((block: any) => block.type === 'input_text' && block.text)
          .map((block: any) => block.text)
          .join('\n');
        if (textContent) {
          messages.push({ role: item.role, content: textContent });
        }
      } else if (item.type === 'input_text' && item.text) {
        // Direct input_text items (simpler format)
        messages.push({ role: 'user', content: item.text });
      }
    }
  }

  return {
    messages,
    model: model || 'gpt-4o',
    temperature,
    max_tokens: max_output_tokens,
    stream,
    tools
  };
}

/**
 * Convert Chat Completions response to Responses API format
 */
export function convertChatCompletionsToResponses(chatResponse: any, model: string): ResponsesResponse {
  const responseId = `resp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Extract content from choices
  let content = '';
  if (chatResponse.choices && chatResponse.choices.length > 0) {
    const choice = chatResponse.choices[0];
    if (choice.message && choice.message.content) {
      content = choice.message.content;
    }
  }

  return {
    id: responseId,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: model || chatResponse.model || 'gpt-4o',
    output: [
      {
        type: 'message',
        id: `msg_${responseId}`,
        status: 'completed',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: content
          }
        ]
      }
    ],
    usage: chatResponse.usage
  };
}

/**
 * Convert streaming chunk from Chat Completions to Responses API streaming format
 */
export function convertStreamingChunkToResponses(chunk: any): any {
  // Return the chunk in Responses API streaming format
  return {
    type: 'response.output_text.delta',
    delta: chunk.choices?.[0]?.delta?.content || '',
    item_id: chunk.id
  };
}
