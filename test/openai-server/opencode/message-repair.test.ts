import { describe, expect, it } from '@jest/globals';
import {
  isConnectionError,
  noopLogger,
  repairMessageSequence
} from '../../../src/openai-server/provider/message-repair.js';
import context from './long-context.json' with { type: 'json' };

describe('repairMessageSequence', () => {
  const messages = context.messages;

  it('repairs missing tool responses in index 17', async () => {
    const logs: string[] = [];
    const testLogger = { log: (msg: string) => logs.push(msg) };

    const originalMsg17 = messages[17];
    expect(originalMsg17.role).toBe('assistant');
    expect(originalMsg17.tool_calls!).toHaveLength(4);

    const repaired = await repairMessageSequence(messages, testLogger);

    // Should have more messages than original (2 synthetic responses inserted)
    expect(repaired.length).toBeGreaterThan(messages.length);

    // Find index 17's tool responses in the repaired array
    const originalToolIds = originalMsg17.tool_calls!.map((tc: any) => tc.id);
    // All 4 original tool_call_ids should be present after index 17
    // Count tool responses between index 17 and next assistant
    const toolResponsesAfter = [];
    for (let i = 18; i < repaired.length; i++) {
      if (repaired[i].role === 'assistant') break;
      if (repaired[i].role === 'tool') toolResponsesAfter.push(repaired[i]);
    }

    // Should have 4 tool responses (2 existing + 2 repaired)
    expect(toolResponsesAfter).toHaveLength(4);

    // All original tool_call_ids should have corresponding responses
    const repondedIds = toolResponsesAfter.map((r) => r.tool_call_id);
    for (const id of originalToolIds) {
      expect(repondedIds).toContain(id);
    }

    // Verify repair log messages
    expect(logs.some((l) => l.includes('2 missing tool response(s)'))).toBe(true);
    expect(logs.some((l) => l.includes('Summary: total_repairs=2'))).toBe(true);
  });

  it('passes through already-valid sequences unchanged', async () => {
    const validMessages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' }
    ];

    const repaired = await repairMessageSequence(validMessages, noopLogger);
    expect(repaired).toEqual(validMessages);
  });

  it('handles empty messages array', async () => {
    const repaired = await repairMessageSequence([], noopLogger);
    expect(repaired).toEqual([]);
  });

  it('handles messages with no tool_calls', async () => {
    const simpleMessages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'What time is it?' },
      { role: 'assistant', content: 'I do not have access to the current time.' }
    ];

    const repaired = await repairMessageSequence(simpleMessages, noopLogger);
    expect(repaired).toEqual(simpleMessages);
  });

  it('handles messages where all tool responses exist', async () => {
    const completeMessages = [
      { role: 'user', content: 'What is the weather?' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call-1', function: { name: 'get_weather', arguments: '{}' } }]
      },
      { role: 'tool', tool_call_id: 'call-1', content: '{"temp": 72}', name: 'get_weather' },
      { role: 'assistant', content: 'The weather is 72 degrees.' }
    ];

    const logs: string[] = [];
    const testLogger = { log: (msg: string) => logs.push(msg) };

    const repaired = await repairMessageSequence(completeMessages, testLogger);

    // Should be unchanged
    expect(repaired).toHaveLength(completeMessages.length);

    // No repair logs
    expect(logs.some((l) => l.includes('missing tool response'))).toBe(false);
  });

  it('executes registered tools locally when responses are missing', async () => {
    // 'get_time' is registered by the index.ts side-effect import
    const messagesWithMissingTime = [
      { role: 'user', content: 'What time is it?' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'time-1', type: 'function', function: { name: 'get_time', arguments: '{}' } }]
      },
      { role: 'user', content: 'Well?' }
    ];

    const logs: string[] = [];
    const testLogger = { log: (msg: string) => logs.push(msg) };

    const repaired = await repairMessageSequence(messagesWithMissingTime, testLogger);

    // Should have the tool response inserted between assistant and user
    expect(repaired).toHaveLength(4);
    expect(repaired[2].role).toBe('tool');
    expect(repaired[2].tool_call_id).toBe('time-1');

    // The user message should be moved to index 3
    expect(repaired[3].role).toBe('user');
  });
});

describe('isConnectionError', () => {
  it('detects connection errors', () => {
    expect(isConnectionError({ message: 'Connection refused', code: 'ECONNREFUSED' })).toBe(true);
    expect(isConnectionError({ message: 'Network timeout', code: 'ETIMEDOUT' })).toBe(true);
    expect(isConnectionError({ message: 'Host not found', code: 'ENOTFOUND' })).toBe(true);
  });

  it('returns false for non-connection errors', () => {
    expect(isConnectionError({ message: 'Bad request', code: '400' })).toBe(false);
    expect(isConnectionError({})).toBe(false);
    expect(isConnectionError(null)).toBe(false);
  });
});
