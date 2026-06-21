/**
 * Message sequence repair utility for OpenAI-compatible server.
 *
 * DeepSeek (and most providers) require every assistant message with tool_calls
 * to be immediately followed by matching tool-role responses for each tool_call_id.
 *
 * This module provides a reusable repair function that detects and fixes broken
 * message sequences by executing missing tools locally or inserting synthetic
 * error responses.
 *
 * It is testable without server infrastructure: pass a logger stub, and the
 * toolRegistry singleton handles local tool execution.
 *
 * @example
 * ```ts
 * import { repairMessageSequence } from './message-repair.js';
 * const repaired = await repairMessageSequence(messages);
 * ```
 */

import { toolRegistry, type ToolCall, type ToolResult } from '../tools/tool-registry.js';
import '../tools/index.js'; // Auto-register built-in tools

// ---------------------------------------------------------------------------
// Logger interface – lets the repair function work without PersistentLogger.
// ---------------------------------------------------------------------------

export interface Logger {
  log(message: string): void;
}

/** No-op logger used when no logger is passed. */
export const noopLogger: Logger = { log: () => {} };

// Re-export ToolResult for convenience
export type { ToolResult };

// ---------------------------------------------------------------------------
// Helper: resolve tool name and arguments from a tool call
// ---------------------------------------------------------------------------

function parseToolCall(tc: any): { name: string; args: string } {
  return {
    name: tc.function?.name || 'unknown',
    args:
      typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments || {})
  };
}

// ---------------------------------------------------------------------------
// Helper: build a synthetic error response for a missing tool call
// ---------------------------------------------------------------------------

function buildSyntheticResponse(id: string, toolName: string): ToolResult {
  return {
    tool_call_id: id,
    role: 'tool',
    content: JSON.stringify({
      error: `Tool "${toolName}" is not available server-side. The tool call could not be executed locally.`
    }),
    name: toolName
  };
}

// ---------------------------------------------------------------------------
// Helper: ensure a tool response's message has the required `name` field
// ---------------------------------------------------------------------------

function ensureToolName(response: any, id: string, toolName: string): ToolResult {
  return {
    tool_call_id: response.tool_call_id || id,
    role: response.role || 'tool',
    content: typeof response.content === 'string' ? response.content : JSON.stringify(response.content),
    name: response.name || toolName
  } as ToolResult;
}

// ---------------------------------------------------------------------------
// Main repair function
// ---------------------------------------------------------------------------

/**
 * Repair message sequence before sending to upstream.
 *
 * Scans an array of chat messages for sequences where an assistant message
 * contains `tool_calls` but the corresponding `role: 'tool'` responses are
 * missing. For each missing response it either:
 *
 * - Executes the tool locally via the global `toolRegistry` singleton, or
 * - Inserts a synthetic error response (tool not in registry).
 *
 * @param messages    – The original message array to repair.
 * @param logger      – Optional logger (defaults to no-op).
 * @returns           – A new array with the repaired message sequence.
 */
export async function repairMessageSequence(
  messages: { role: string; content?: any; tool_calls?: any[]; tool_call_id?: string; name?: string }[],
  logger?: Logger
): Promise<{ role: string; content?: any; tool_calls?: any[]; tool_call_id?: string; name?: string }[]> {
  const log = logger?.log ?? noopLogger.log;
  const repaired: { role: string; content?: any; tool_calls?: any[]; tool_call_id?: string; name?: string }[] = [];
  let i = 0;
  const repairStats = { total: 0, localExecuted: 0, synthetic: 0 };
  const repairedTools = new Set<string>();

  while (i < messages.length) {
    const msg = { ...messages[i] }; // shallow copy to avoid mutating input
    repaired.push(msg);

    // Only process assistant messages that have tool_calls
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      // Collect all expected tool_call_ids from this assistant message
      const expectedIds = msg.tool_calls.map((tc: any) => tc.id).filter(Boolean);

      // Look ahead to find matching tool responses
      const toolResponses = new Map<string, any>();
      let j = i + 1;
      while (j < messages.length) {
        const next = messages[j];
        // Stop scanning if we hit another assistant message (the next turn)
        if (next.role === 'assistant') break;
        if (next.role === 'tool' && next.tool_call_id) {
          toolResponses.set(next.tool_call_id, next);
          j++;
        } else {
          break;
        }
      }

      // Check for missing tool_call_ids
      const missingIds = expectedIds.filter((id: string) => !toolResponses.has(id));

      if (missingIds.length > 0) {
        log(`repairMessageSequence: ${missingIds.length} missing tool response(s) for [${missingIds.join(', ')}]`);
      }

      // ALWAYS insert tool responses regardless of whether some are missing.
      // Existing responses are copied (with name fixup); missing ones are
      // either executed locally or replaced with synthetic errors.
      for (const id of expectedIds) {
        // Resolve tool name from the assistant's tool_calls array
        const toolCall = msg.tool_calls.find((tc: any) => tc.id === id);
        const { name: toolName, args } = parseToolCall(toolCall || {});

        if (toolResponses.has(id)) {
          // Already has a response — ensure 'name' field is present (required by DeepSeek)
          const existing = toolResponses.get(id);
          repaired.push(ensureToolName(existing, id, toolName));
        } else if (toolRegistry.has(toolName) && toolCall) {
          // Execute locally through the registry
          try {
            log(
              `[repair] Executing tool locally: tool_call_id=${id}, tool=${toolName}, args=${args.substring(0, 100)}${args.length > 100 ? '...' : ''}`
            );

            const normalizedToolCall: ToolCall = {
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolName,
                arguments: args
              }
            };
            const result = await toolRegistry.execute(normalizedToolCall);
            repaired.push(result as any);

            repairStats.total++;
            repairStats.localExecuted++;
            repairedTools.add(toolName);

            log(`[repair] Tool executed successfully: tool_call_id=${id}, tool=${toolName}, status=success`);
          } catch (err: any) {
            const errorMsg = err?.message || String(err);
            log(`[repair] Local execution failed: tool_call_id=${id}, tool=${toolName}, error=${errorMsg}`);
            repaired.push({
              role: 'tool',
              tool_call_id: id,
              content: JSON.stringify({ error: `Local execution failed: ${errorMsg}` }),
              name: toolName
            });

            repairStats.total++;
            repairStats.localExecuted++;
            repairedTools.add(toolName);
          }
        } else {
          // Insert synthetic error response so upstream validation passes
          log(
            `[repair] Tool not in registry, inserting synthetic response: tool_call_id=${id}, tool=${toolName}, reason=tool_not_in_registry`
          );

          repaired.push(buildSyntheticResponse(id, toolName));

          repairStats.total++;
          repairStats.synthetic++;
          repairedTools.add(toolName);
        }
      }

      i = j; // Skip past the already-consumed messages
      continue;
    }

    i++;
  }

  // Log summary at end
  if (repairStats.total > 0) {
    const toolList = Array.from(repairedTools).sort().join(', ');
    log(
      `[repair] Summary: total_repairs=${repairStats.total}, local_executed=${repairStats.localExecuted}, synthetic=${repairStats.synthetic}, tools=[${toolList}]`
    );
  }

  return repaired;
}

// ---------------------------------------------------------------------------
// Connection error detection (extracted from opencode.ts)
// ---------------------------------------------------------------------------

/**
 * Check if an error is a connection-related error that should trigger
 * proxy rotation or server failover.
 */
export function isConnectionError(error: any): boolean {
  const message = error?.message?.toLowerCase() || '';
  const code = error?.code || '';

  return (
    message.includes('connection') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('network') ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ENETUNREACH'
  );
}
