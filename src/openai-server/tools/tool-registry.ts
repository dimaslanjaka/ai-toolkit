/**
 * Tool Registry for OpenAI-compatible server
 * Provides dynamic tool registration and dispatch mechanism
 */

import { getRtkTokenSaver } from '../rtk-saver.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: Record<string, any>) => Promise<any>;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  content: string;
  name: string;
}

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      console.warn(`Tool "${tool.name}" is already registered, overwriting`);
    }
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getOpenAIToolsFormat(): any[] {
    return this.list().map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.function.name);

    if (!tool) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        content: JSON.stringify({ error: `Tool "${toolCall.function.name}" not found` }),
        name: toolCall.function.name
      };
    }

    try {
      let args: Record<string, any> = {};
      if (toolCall.function.arguments) {
        args = JSON.parse(toolCall.function.arguments);
      }

      const result = await tool.handler(args);
      const content = typeof result === 'string' ? result : JSON.stringify(result);

      // RTK compression for token savings
      const rtkSaver = getRtkTokenSaver();
      const originalContent = content;
      const compressedContent = rtkSaver.compressToolOutput(content, toolCall.function.name);

      // Log compression stats if content was reduced
      if (originalContent !== compressedContent) {
        const saved = rtkSaver.estimateTokens(originalContent) - rtkSaver.estimateTokens(compressedContent);
        console.log(
          `[RTK] ${toolCall.function.name}: saved ~${saved} tokens (${rtkSaver.estimateTokens(originalContent)} → ${rtkSaver.estimateTokens(compressedContent)})`
        );
      }

      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        content: compressedContent,
        name: toolCall.function.name
      };
    } catch (error) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        content: JSON.stringify({ error: error instanceof Error ? error.message : 'Tool execution failed' }),
        name: toolCall.function.name
      };
    }
  }

  async executeMultiple(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map((call) => this.execute(call)));
  }

  clear(): void {
    this.tools.clear();
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();

/**
 * Register a tool with the global registry
 */
export function registerTool(tool: ToolDefinition): void {
  toolRegistry.register(tool);
}

/**
 * Get the global tool registry instance
 */
export function getToolRegistry(): ToolRegistry {
  return toolRegistry;
}
