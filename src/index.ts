import { execFileSync } from 'node:child_process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

function checkDependencies(): void {
  try {
    execFileSync('uv', ['--version'], { stdio: 'ignore' });
  } catch {
    console.error(
      'glean-connector-mcp requires uv.\n' +
        'Install it from: https://docs.astral.sh/uv/\n' +
        'Or set GLEAN_WORKER_COMMAND to override the worker command.',
    );
    process.exit(1);
  }
}

async function main() {
  checkDependencies();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until process exits
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
