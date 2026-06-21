#!/usr/bin/env node
/**
 * Standalone debugging script for repairMessageSequence.
 *
 * Run directly (no server needed):
 *   node --no-warnings=ExperimentalWarning --loader ts-node/esm test/openai-server/opencode/test-repair.ts
 *
 * This loads long-context.json, runs repairMessageSequence,
 * and prints the diff so you can inspect what was repaired.
 */

import { repairMessageSequence } from '../../../src/openai-server/provider/message-repair.js';
import fs from 'fs-extra';
import path from 'upath';

// Resolve fixture from __dirname equivalent
const fixturePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'long-context.json');

async function main() {
  const fixture = await fs.readJson(fixturePath);
  const messages = fixture.messages;
  console.log(`Original message count: ${messages.length}`);

  const logs: string[] = [];
  const repaired = await repairMessageSequence(messages, {
    log: (msg: string) => {
      logs.push(msg);
      console.log(`[repair] ${msg}`);
    }
  });

  console.log(`\nRepaired message count: ${repaired.length}`);
  console.log(`Difference: +${repaired.length - messages.length}`);

  // Print summary logs
  const summaryLog = logs.find((l) => l.includes('Summary:'));
  if (summaryLog) console.log(`\n${summaryLog}`);

  // Print around the broken sequence
  console.log('\nMessages from index 15:');
  for (let i = 15; i < Math.min(repaired.length, 30); i++) {
    const m = repaired[i] as any;
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      console.log(
        `[${i}] assistant tool_calls=${m.tool_calls.length} ids=[${m.tool_calls.map((tc: any) => tc.id).join(', ')}]`
      );
    } else if (m.role === 'tool') {
      console.log(`[${i}] tool tool_call_id=${m.tool_call_id} name=${m.name || '-'}`);
    } else {
      console.log(`[${i}] ${m.role}`);
    }
  }

  // Verify all tool_call_ids from index 17 have responses
  const msg17 = messages[17] as any;
  if (msg17?.tool_calls) {
    const originalIds = msg17.tool_calls.map((tc: any) => tc.id);
    console.log(`\nIndex 17 tool_call_ids: [${originalIds.join(', ')}]`);

    // Find them in repaired
    const after17 = repaired.slice(18);
    const toolResponses = after17.filter((m: any) => m.role === 'tool' && m.tool_call_id);
    const foundIds = toolResponses.map((m: any) => m.tool_call_id);
    console.log(`Tool responses after index 17: ${toolResponses.length}`);
    console.log(`Response IDs: [${foundIds.join(', ')}]`);

    const missing = originalIds.filter((id: string) => !foundIds.includes(id));
    if (missing.length === 0) {
      console.log('✓ All tool_call_ids have matching responses');
    } else {
      console.log(`✗ Missing responses for: [${missing.join(', ')}]`);
    }
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
