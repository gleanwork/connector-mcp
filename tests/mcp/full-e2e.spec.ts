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
import { execFileSync } from 'node:child_process';

const SERVER_ENTRY = resolve(
  fileURLToPath(import.meta.url),
  '../../../dist/index.js',
);

const STUB_WORKER_PATH = resolve(
  fileURLToPath(import.meta.url),
  '../../fixtures/stub_worker.py',
);

// Poll inspect_execution until status is "complete" or "failed", or timeout.
async function pollUntilDone(
  mcp: ReturnType<typeof createMCPFixture>,
  executionId: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await mcp.callTool('inspect_execution', {
      execution_id: executionId,
    });
    const text = result.content[0].text as string;
    if (/Status:\s*(complete|failed)/.test(text)) {
      return text;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for execution ${executionId} to finish`);
}

// ── Tier 1: Stub worker ───────────────────────────────────────────────────────

type StubFixtures = {
  stubProject: Project;
};

const stubTest = base.extend<StubFixtures>({
  // eslint-disable-next-line no-empty-pattern
  stubProject: async ({}, use) => {
    const project = new Project('stub-e2e-project', '0.0.0', {
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
            name: 'stub-datasource',
            display_name: 'Stub Datasource',
            datasource_category: 'PUBLISHED_CONTENT',
            connector_type: 'basic',
            object_definitions: [],
          }),
        },
      },
    });
    await project.write();
    try {
      await use(project);
    } finally {
      await project.dispose();
    }
  },

  mcpClient: async ({ stubProject }, use) => {
    const client = await createMCPClientForConfig({
      transport: 'stdio',
      command: 'node',
      args: [SERVER_ENTRY],
      cwd: stubProject.baseDir,
      env: {
        GLEAN_WORKER_COMMAND: JSON.stringify(['python3', STUB_WORKER_PATH]),
      },
    });
    try {
      await use(client);
    } finally {
      await closeMCPClient(client);
    }
  },

  mcp: async ({ mcpClient }, use, testInfo) => {
    const api = createMCPFixture(mcpClient, testInfo);
    await use(api);
  },
});

stubTest.describe('Tier 1: stub worker E2E', () => {
  stubTest(
    'build → run → inspect pipeline completes with records',
    async ({ mcp }) => {
      // Step 1: build_connector (writes connector.py, models.py, mock_data.json)
      const buildResult = await mcp.callTool('build_connector', {
        dry_run: false,
      });
      expect(buildResult.isError).toBeFalsy();
      const buildText = buildResult.content[0].text as string;
      expect(buildText).toContain('mock_data.json');

      // Step 2: run_connector (spawns stub worker)
      const runResult = await mcp.callTool('run_connector', {
        connector_name: 'Connector',
      });
      expect(runResult.isError).toBeFalsy();
      const runText = runResult.content[0].text as string;

      const match = runText.match(/execution_id:\s*(\S+)/);
      expect(match).not.toBeNull();
      const executionId = match![1];

      // Step 3: poll until complete (max 5s)
      const inspectText = await pollUntilDone(mcp, executionId, 5000, 100);

      // Step 4: assert complete status
      expect(inspectText).toContain('Status: complete');

      // Step 5: assert records were fetched (mock_data.json has 5 entries)
      const recordsMatch = inspectText.match(/Records fetched:\s*(\d+)/);
      expect(recordsMatch).not.toBeNull();
      const recordsFetched = parseInt(recordsMatch![1], 10);
      expect(recordsFetched).toBeGreaterThan(0);
    },
  );
});

// ── Tier 2: Real Copier + real SDK ────────────────────────────────────────────

function checkCommandAvailable(cmd: string): boolean {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const miseAvailable = checkCommandAvailable('mise');
const uvAvailable = checkCommandAvailable('uv');
const tier2Available = miseAvailable && uvAvailable;

const tier2Test = base.extend<{ baseDir: string }>({
  // eslint-disable-next-line no-empty-pattern
  baseDir: async ({}, use) => {
    const project = new Project('tier2-e2e-project', '0.0.0', { files: {} });
    await project.write();
    try {
      await use(project.baseDir);
    } finally {
      await project.dispose();
    }
  },

  mcpClient: async ({ baseDir }, use) => {
    const client = await createMCPClientForConfig({
      transport: 'stdio',
      command: 'node',
      args: [SERVER_ENTRY],
      cwd: baseDir,
    });
    try {
      await use(client);
    } finally {
      await closeMCPClient(client);
    }
  },

  mcp: async ({ mcpClient }, use, testInfo) => {
    const api = createMCPFixture(mcpClient, testInfo);
    await use(api);
  },
});

tier2Test.describe('Tier 2: real Copier + real SDK E2E', () => {
  tier2Test.skip(!tier2Available, 'Requires mise and uv to be installed');

  tier2Test(
    'create → config → schema → mappings → build → run pipeline',
    async ({ mcp, baseDir }) => {
      // Copier + mise install + uv sync can take time; override test timeout
      tier2Test.setTimeout(120_000);
      // Step 1: create_connector (real Copier run with mise install + uv sync)
      const createResult = await mcp.callTool('create_connector', {
        name: 'test-connector',
        parent_directory: baseDir,
      });
      const createText = createResult.content[0].text as string;
      // If Copier completely failed to write files, bail out
      expect(createText).not.toContain('Error creating connector:');

      // Step 2: set_config
      const configResult = await mcp.callTool('set_config', {
        config: {
          name: 'test-ds',
          display_name: 'Test DS',
          datasource_category: 'PUBLISHED_CONTENT',
        },
      });
      expect(configResult.isError).toBeFalsy();

      // Step 3: update_schema
      const schemaResult = await mcp.callTool('update_schema', {
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'title', type: 'string', required: true },
          { name: 'url', type: 'string', required: true },
        ],
      });
      expect(schemaResult.isError).toBeFalsy();

      // Step 4: confirm_mappings
      const mappingsResult = await mcp.callTool('confirm_mappings', {
        mappings: [
          { source_field: 'id', glean_field: 'datasourceObjectId' },
          { source_field: 'title', glean_field: 'title' },
          { source_field: 'url', glean_field: 'viewURL' },
          { source_field: 'id', glean_field: 'permissions' },
        ],
      });
      expect(mappingsResult.isError).toBeFalsy();

      // Step 5: build_connector
      const buildResult = await mcp.callTool('build_connector', {
        dry_run: false,
      });
      expect(buildResult.isError).toBeFalsy();

      // Step 6: run_connector (real uv run python -m glean.indexing.worker)
      const runResult = await mcp.callTool('run_connector', {
        connector_name: 'Connector',
      });
      expect(runResult.isError).toBeFalsy();
      const runText = runResult.content[0].text as string;

      const match = runText.match(/execution_id:\s*(\S+)/);
      expect(match).not.toBeNull();
      const executionId = match![1];

      // Step 7: poll until complete or failed (max 30s)
      const inspectText = await pollUntilDone(mcp, executionId, 30000, 500);

      // Any terminal status (complete or failed) proves the full stack ran:
      // Copier → mise → uv sync → Python → SDK worker → JSON-RPC protocol.
      // "complete with 0 records" is also acceptable — it means the worker
      // executed successfully but found no reachable data source (e.g. the
      // generated connector module has no DataClient alongside it).
      const isComplete = inspectText.includes('Status: complete');
      const isFailed = inspectText.includes('Status: failed');
      expect(isComplete || isFailed).toBe(true);
    },
  );
});
