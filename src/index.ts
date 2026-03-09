import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { getWorkerPool } from './core/worker-pool.js';
import { checkPrerequisites } from './tools/prerequisites.js';

function warnIfPrerequisitesMissing(): void {
  const { checks } = checkPrerequisites();
  const failing = checks
    .filter((c) => !c.ok && !c.message.includes('needed for create_connector'))
    .map((c) => c.name);
  if (failing.length > 0) {
    console.error(
      `glean-connector-mcp: missing prerequisites: ${failing.join(', ')}\n` +
        `Run the check_prerequisites tool for details and install instructions.`,
    );
  }
}

async function shutdown(): Promise<void> {
  await getWorkerPool().killAll();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

async function main() {
  warnIfPrerequisitesMissing();
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until process exits
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
