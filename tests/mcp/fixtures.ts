import {
  test as base,
  expect,
  createMCPClientForConfig,
  closeMCPClient,
  createMCPFixture,
} from '@gleanwork/mcp-server-tester';
import { Project } from 'fixturify-project';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect };

// Absolute path to the built server entry point, resolved relative to the
// package root (two levels up from tests/mcp/).
const SERVER_ENTRY = resolve(
  fileURLToPath(import.meta.url),
  '../../../dist/index.js',
);

type ConnectorFixtures = {
  connectorProject: Project;
};

/**
 * Extended test fixture that creates a per-test isolated project directory.
 *
 * Each test gets its own temporary directory with the standard test files
 * (.glean/schema.json, .glean/mappings.json, .glean/config.json, sample.csv)
 * and its own MCP server process pointed at that directory.
 */
export const test = base.extend<ConnectorFixtures>({
  // Per-test isolated project directory
  connectorProject: async (_: object, use) => {
    const project = new Project('connector-test-project', '0.0.0', {
      files: {
        '.glean': {
          'schema.json': JSON.stringify({
            fields: [
              { name: 'id', type: 'string', required: true },
              { name: 'title', type: 'string', required: true },
              { name: 'url', type: 'string', required: true },
            ],
          }),
          'mappings.json': JSON.stringify({
            mappings: [
              { source_field: 'id', glean_field: 'datasourceObjectId' },
              { source_field: 'title', glean_field: 'title' },
              { source_field: 'url', glean_field: 'viewURL' },
              { source_field: 'id', glean_field: 'permissions' },
            ],
          }),
          'config.json': JSON.stringify({
            name: 'test-datasource',
            display_name: 'Test Datasource',
            datasource_category: 'PUBLISHED_CONTENT',
            connector_type: 'basic',
            object_definitions: [],
          }),
        },
        'sample.csv':
          'id,title,url\n1,Hello World,https://example.com/1\n2,Foo Bar,https://example.com/2',
      },
    });

    await project.write();

    try {
      await use(project);
    } finally {
      await project.dispose();
    }
  },

  // Override mcpClient to use the per-test project directory as cwd.
  mcpClient: async ({ connectorProject }, use) => {
    const client = await createMCPClientForConfig({
      transport: 'stdio',
      command: 'node',
      args: [SERVER_ENTRY],
      cwd: connectorProject.baseDir,
    });
    try {
      await use(client);
    } finally {
      await closeMCPClient(client);
    }
  },

  // Override mcp to use the new mcpClient.
  mcp: async ({ mcpClient }, use, testInfo) => {
    const api = createMCPFixture(mcpClient, testInfo);
    await use(api);
  },
});
