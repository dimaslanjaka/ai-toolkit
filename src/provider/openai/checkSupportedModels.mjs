import OpenAI from 'openai';
import * as util from 'binary-collections';

util.loadDotenv();

/**
 * Checks which OpenAI models are accessible and functional with the given API key.
 * Lists all available models, sends a test prompt to each, and reports success/failure.
 * @param {string} [apiKey] - OpenAI API key. Defaults to process.env.OPENAI_API_KEY.
 * @returns {Promise<void>}
 */
export async function checkSupportedModels(apiKey = process.env.OPENAI_API_KEY) {
  const openai = new OpenAI({ apiKey });

  try {
    // Step 1: List all available models
    const response = await openai.models.list();
    const models = response.data.map((m) => m.id);

    console.log("Testing models by sending 'Hello'...\n");

    for (const model of models) {
      try {
        // Step 2: Try a simple chat/completion call
        const completion = await openai.chat.completions.create({
          model: model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        });

        console.log(`✅ Model ${model} responded:`, completion.choices[0].message.content);
      } catch (err) {
        console.log(`❌ Model ${model} failed:`, err.message);
      }
    }

    console.log('\nTesting complete.');
  } catch (error) {
    console.error('Error fetching models:', error);
  }
}
