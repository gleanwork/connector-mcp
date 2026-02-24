import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until process exits
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
