import { loadDotenv } from 'binary-collections';
import Groq from 'groq-sdk';

loadDotenv();
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Fetch all models
const res = await fetch('https://api.groq.com/openai/v1/models', {
  headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }
});
const { data: models } = await res.json();

const results = { yes: [], no: [], error: [], skipped: [] };
const DUMMY_TOOL = {
  type: 'function',
  function: {
    name: 'dummy',
    description: 'A dummy tool for probing',
    parameters: { type: 'object', properties: {} }
  }
};

// Skip audio/vision-only models that aren't chat models
const SKIP_PATTERNS = /whisper|orpheus|prompt-guard|safeguard/;
const CHAT_MODELS = models.filter((m) => !SKIP_PATTERNS.test(m.id));

console.log(`Testing ${CHAT_MODELS.length} models...\n`);

for (const model of CHAT_MODELS) {
  const id = model.id;
  process.stdout.write(`  ${id} ... `);

  try {
    await client.chat.completions.create({
      model: id,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [DUMMY_TOOL],
      max_completion_tokens: 1,
      temperature: 0
    });
    results.yes.push(id);
    console.log('✅ tools');
  } catch (err) {
    const msg = err.message || '';
    if (err.status === 400 && (msg.includes('does not support') || msg.includes('tool'))) {
      results.no.push(id);
      console.log('❌ no tools');
    } else if (err.status === 429) {
      results.error.push({ id, reason: 'rate limited' });
      console.log('⏳ rate limit');
      await new Promise((r) => setTimeout(r, 2000)); // back off
    } else {
      results.error.push({ id, reason: msg.slice(0, 100) });
      console.log(`⚠️  ${msg.slice(0, 60)}`);
    }
  }

  // Small delay to avoid rate limits
  await new Promise((r) => setTimeout(r, 300));
}

// Print summary
console.log('\n' + '='.repeat(50));
console.log(`✅ Supports tools (${results.yes.length}):`);
results.yes.forEach((m) => console.log('   ', m));

console.log(`\n❌ No tool support (${results.no.length}):`);
results.no.forEach((m) => console.log('   ', m));

console.log(`\n⚠️  Errors (${results.error.length}):`);
results.error.forEach((e) => console.log('   ', e.id, '-', e.reason));

console.log(`\n⏭️  Skipped non-chat (${models.length - CHAT_MODELS.length}):`);
models.filter((m) => SKIP_PATTERNS.test(m.id)).forEach((m) => console.log('   ', m.id));
