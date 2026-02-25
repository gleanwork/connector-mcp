import { execFileSync } from 'node:child_process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

function warnIfUvMissing(): void {
  try {
    execFileSync('uv', ['--version'], { stdio: 'ignore' });
  } catch {
    console.error(
      'glean-connector-mcp: uv not found.\n' +
        'Tools that scaffold or run connectors (create_connector, run_connector) will not work.\n' +
        'Install uv from: https://docs.astral.sh/uv/\n' +
        'Or set GLEAN_WORKER_COMMAND to override the worker command.',
    );
  }
}

async function main() {
  warnIfUvMissing();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until process exits
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
