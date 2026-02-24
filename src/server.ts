import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createConnectorSchema, handleCreateConnector } from './tools/create-connector.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'glean-connector',
    version: '0.1.0',
  });

  server.registerTool(
    'create_connector',
    {
      description:
        'Create a new Glean connector project using the standard template. ' +
        'Run this first. Sets the active project directory for this session.',
      inputSchema: createConnectorSchema,
    },
    handleCreateConnector,
  );

  return server;
}
