import path from 'upath';
import { writefile, readfile } from 'sbg-utility';
import { generateDiff } from './generate-diff';
import { applyUnifiedPatch } from './patcher';

async function main() {
  const tmpFile = path.join('tmp/diff-patcher/sample.cjs');
  const originalContent = `
function nameX(params) {console.log('params', params);}
nameX();
`;

  // Write initial file
  writefile(tmpFile, originalContent);
  console.log('📝 Original file written to', tmpFile);

  const instruction = 'format the code';

  console.log('🤖 Requesting AI to generate diff...');
  const diffOutput = await generateDiff(originalContent, instruction);

  console.log('\n📝 AI-generated diff:\n');
  console.log(diffOutput);
  console.log('\n');

  // Apply the diff and write back to file
  if (!diffOutput) {
    throw new Error('Diff output is empty');
  }

  const patchedCode = applyUnifiedPatch(originalContent, diffOutput);
  console.log('✅ Patch applied successfully.');

  writefile(tmpFile, patchedCode);
  console.log('✅ Patched file written to', tmpFile);

  // Read and show final content
  const finalContent = readfile(tmpFile);
  console.log('\n📄 Final file content:\n');
  console.log(finalContent);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
