import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({
  name: 'test-client',
  version: '1.0.0'
});

const transport = new StdioClientTransport({
  command: 'node',
  args: ['src/mcp-server/context-compress/server.mjs']
});

await client.connect(transport);

const result = await client.callTool({
  name: 'compress_context',
  arguments: {
    text: `Create MCP server for GitHub automation. Fix Node.js errors. Configure filesystem and puppeteer tools.
Implement caching layer for memory optimization. Add GitHub issue integration. Improve error handling strategy.
Refactor server architecture into modular components. Optimize token usage across MCP pipeline.`,
    mode: 'full',
    maxSentences: 3
  }
});

console.log(result);
client.close();
// process.exit(0);
