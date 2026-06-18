import fs from 'fs-extra';
import readline from 'readline';
import { applyUnifiedPatch } from './patcher.js';
import { generateDiff } from './generate-diff.js';

async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    console.error(`❌ Failed to read file ${filePath}:`, (err as Error).message);
    process.exit(1);
  }
}
// node D:/Repositories/binary-collections/packages/ai-toolkit/dist/index.cjs "D:\Repositories\binary-collections\packages\ai-toolkit\src\diff-patcher\sample.cjs" "rename function nameX to parameX"
async function writeFileSafe(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8');
  console.log(`✅ File ${filePath} successfully updated.`);
}

async function main(): Promise<void> {
  const filePath = process.argv[2] || 'original.js';
  const instruction = process.argv[3];

  if (!instruction) {
    console.error('Usage: node index.js <file.js> "<change instruction>"');
    console.error('Example: node index.js original.js "change add function to async/await"');
    process.exit(1);
  }

  console.log(`📖 Reading file: ${filePath}`);
  const originalCode = await readFileSafe(filePath);

  console.log('🤖 Requesting AI to generate diff...');
  const diffOutput = await generateDiff(originalCode, instruction);

  console.log('\n📝 AI-generated diff:\n');
  console.log(diffOutput);
  console.log('\n');

  // Try to apply diff
  try {
    if (!diffOutput) {
      throw new Error('Diff output is empty');
    }
    const patchedCode = applyUnifiedPatch(originalCode, diffOutput);
    console.log('✅ Patch applied virtually successfully.');

    // Show changes preview (optional)
    console.log('\n🔍 Preview of changes (first 100 characters):');
    console.log(patchedCode.slice(0, 300) + (patchedCode.length > 300 ? '...' : ''));

    // Prompt to save
    const answer = await askUser('Do you want to save changes to file? (y/n): ');
    if (answer.toLowerCase() === 'y') {
      await writeFileSafe(filePath, patchedCode);
    } else {
      console.log('❌ Changes cancelled.');
    }
  } catch (err) {
    console.error('❌ Failed to apply diff:', (err as Error).message);
    console.log(
      '\n💡 Suggestion: Check whether the AI-generated diff format is correct. You can save the diff to a file and inspect it.'
    );
    // Save diff for debugging
    if (diffOutput) {
      await fs.writeFile('failed.diff', diffOutput);
      console.log('Failed diff saved to failed.diff');
    }
  }
}

// Simple function for user input (using readline)
function askUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

main().catch(console.error);
