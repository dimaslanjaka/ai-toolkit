import path from 'upath';
import { writefile } from 'sbg-utility';
import { generateDiff } from './generate-diff';

async function main() {
  const content = `
function nameX(params) {console.log('params', params);}
nameX();
`;

  const tmpFile = path.join('tmp/diff-patcher/sample.cjs');
  writefile(tmpFile, content);

  const instruction = 'format the code';

  console.log('🤖 Requesting AI to generate diff...');
  const diffOutput = await generateDiff(content, instruction);

  console.log('\n📝 AI-generated diff:\n');
  console.log(diffOutput);
  console.log('\n');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
