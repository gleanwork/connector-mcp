import { test, expect } from '@gleanwork/mcp-server-tester/fixtures/mcp';
import { runConformanceChecks } from '@gleanwork/mcp-server-tester';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Must match TEST_PROJECT_PATH in playwright.config.ts.
// The MCP server process runs with cwd set to this directory, so
// session.ts falls back to process.cwd() → this path.
const PROJECT_PATH = join(tmpdir(), 'connector-mcp-playwright-tests');

const setupProject = () => {
  mkdirSync(join(PROJECT_PATH, '.glean'), { recursive: true });

  writeFileSync(
    join(PROJECT_PATH, '.glean/schema.json'),
    JSON.stringify({
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'title', type: 'string', required: true },
        { name: 'url', type: 'string', required: true },
      ],
    }),
  );

  writeFileSync(
    join(PROJECT_PATH, '.glean/mappings.json'),
    JSON.stringify({
      mappings: [
        { source_field: 'id', glean_field: 'datasourceObjectId' },
        { source_field: 'title', glean_field: 'title' },
        { source_field: 'url', glean_field: 'viewURL' },
        { source_field: 'id', glean_field: 'permissions' },
      ],
    }),
  );

  writeFileSync(
    join(PROJECT_PATH, '.glean/config.json'),
    JSON.stringify({
      name: 'test-datasource',
      display_name: 'Test Datasource',
      datasource_category: 'PUBLISHED_CONTENT',
      connector_type: 'basic',
      object_definitions: [],
    }),
  );

  writeFileSync(
    join(PROJECT_PATH, 'sample.csv'),
    'id,title,url\n1,Hello World,https://example.com/1\n2,Foo Bar,https://example.com/2',
  );
};

// Create project files before any test runs.
// The MCP server is started fresh per test by the fixture, so files must
// already exist on disk before the first tool call.
test.beforeAll(() => {
  setupProject();
});

// ── Protocol Conformance (generates the reporter conformance widget) ──────

test('MCP protocol conformance', async ({ mcp, mcpClient }, testInfo) => {
  const result = await runConformanceChecks(
    mcp,
    {
      requiredTools: [
        'create_connector', 'infer_schema', 'get_schema', 'update_schema', 'analyze_field',
        'get_mappings', 'confirm_mappings', 'validate_mappings',
        'get_config', 'set_config',
        'build_connector',
        'run_connector', 'inspect_execution', 'manage_recording',
      ],
      validateSchemas: true,
      checkServerInfo: true,
      checkResources: true,
    },
    testInfo,
  );
  expect(result.pass).toBe(true);
});

// ── Individual Protocol Conformance Assertions ───────────────────

test.describe('MCP Protocol Conformance', () => {
  test('returns valid server info', async ({ mcp }) => {
    const info = mcp.getServerInfo();
    expect(info?.name).toBe('glean-connector');
    expect(info?.version).toBeTruthy();
  });

  test('lists all 14 tools', async ({ mcp }) => {
    const tools = await mcp.listTools();
    expect(tools.length).toBe(14);
  });

  test('tool names match expected set', async ({ mcp }) => {
    const tools = await mcp.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'analyze_field',
      'build_connector',
      'confirm_mappings',
      'create_connector',
      'get_config',
      'get_mappings',
      'get_schema',
      'infer_schema',
      'inspect_execution',
      'manage_recording',
      'run_connector',
      'set_config',
      'update_schema',
      'validate_mappings',
    ]);
  });

  test('lists the connector://workflow resource', async ({ mcpClient }) => {
    const result = await mcpClient.listResources();
    expect(result.resources.some((r) => r.uri === 'connector://workflow')).toBe(true);
  });

  test('handles unknown tool gracefully', async ({ mcp }) => {
    const result = await mcp.callTool('nonexistent_tool', {});
    expect(result.isError).toBe(true);
  });
});

// ── Schema Tools ─────────────────────────────────────────────────

test.describe('Schema Tools', () => {
  test('get_schema returns the current schema', async ({ mcp }) => {
    const result = await mcp.callTool('get_schema', {});
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('title');
    expect(text).toContain('url');
  });

  test('update_schema writes a new field list', async ({ mcp }) => {
    const result = await mcp.callTool('update_schema', {
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'body', type: 'string', required: false },
      ],
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('2 field');
  });

  test('infer_schema analyzes a CSV file', async ({ mcp }) => {
    const result = await mcp.callTool('infer_schema', {
      file_path: join(PROJECT_PATH, 'sample.csv'),
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('id');
    expect(text).toContain('title');
  });

  test('infer_schema returns an error message for unsupported file types', async ({ mcp }) => {
    const result = await mcp.callTool('infer_schema', {
      file_path: join(PROJECT_PATH, 'data.xml'),
    });
    // Tool-level error returned as text content, not a protocol-level error
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('Error');
  });
});

// ── Mapping Tools ────────────────────────────────────────────────

test.describe('Mapping Tools', () => {
  test.beforeEach(() => {
    // Restore full project state in case a prior test mutated schema/mappings
    setupProject();
  });

  test('get_mappings returns source schema and Glean entity model', async ({ mcp }) => {
    const result = await mcp.callTool('get_mappings', {});
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('datasourceObjectId');
    expect(text).toContain('title');
  });

  test('validate_mappings reports valid when all required fields are mapped', async ({ mcp }) => {
    const result = await mcp.callTool('validate_mappings', {});
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('valid');
  });

  test('confirm_mappings saves mapping decisions', async ({ mcp }) => {
    const result = await mcp.callTool('confirm_mappings', {
      mappings: [{ source_field: 'title', glean_field: 'title', transform: null }],
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('mapping');
  });
});

// ── Config Tools ─────────────────────────────────────────────────

test.describe('Config Tools', () => {
  test.beforeEach(() => {
    setupProject();
  });

  test('get_config returns the current config', async ({ mcp }) => {
    const result = await mcp.callTool('get_config', {});
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('test-datasource');
  });

  test('set_config merges new keys into existing config', async ({ mcp }) => {
    const result = await mcp.callTool('set_config', {
      config: { page_size: 50, rate_limit_rps: 10 },
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('page_size');
  });
});

// ── Build Tool ───────────────────────────────────────────────────

test.describe('Build Tool', () => {
  test.beforeEach(() => {
    setupProject();
  });

  test('build_connector returns Python preview in dry_run mode', async ({ mcp }) => {
    const result = await mcp.callTool('build_connector', { dry_run: true });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('class');
    expect(text).toContain('def transform');
  });
});

// ── Execution Tools ──────────────────────────────────────────────

test.describe('Execution Tools', () => {
  test('run_connector returns an execution_id immediately', async ({ mcp }) => {
    const result = await mcp.callTool('run_connector', { connector_name: 'Connector' });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('execution_id');
  });

  test('inspect_execution returns not found for unknown id', async ({ mcp }) => {
    const result = await mcp.callTool('inspect_execution', {
      execution_id: 'does-not-exist',
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('not found');
  });

  test('manage_recording list action returns a response', async ({ mcp }) => {
    const result = await mcp.callTool('manage_recording', { action: 'list' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toBeTruthy();
  });
});

// ── Workflow Resource ────────────────────────────────────────────

test.describe('Workflow Resource', () => {
  test('connector://workflow returns the authoring guide', async ({ mcpClient }) => {
    const result = await mcpClient.readResource({ uri: 'connector://workflow' });
    expect(result.contents).toBeTruthy();
    const text = result.contents[0].text as string;
    expect(text).toContain('Step 1');
    expect(text).toContain('create_connector');
  });
});
