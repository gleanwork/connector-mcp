import { test, expect } from './fixtures.js';
import { runConformanceChecks } from '@gleanwork/mcp-server-tester';
import { join } from 'node:path';

// ── Protocol Conformance (generates the reporter conformance widget) ──────

test('MCP protocol conformance', async ({ mcp }, testInfo) => {
  const result = await runConformanceChecks(
    mcp,
    {
      requiredTools: [
        'get_started',
        'create_connector',
        'infer_schema',
        'get_schema',
        'update_schema',
        'analyze_field',
        'get_mappings',
        'confirm_mappings',
        'validate_mappings',
        'get_config',
        'set_config',
        'build_connector',
        'run_connector',
        'inspect_execution',
        'manage_recording',
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
    expect(info?.name).toBe('glean-connector-mcp');
    expect(info?.version).toBeTruthy();
  });

  test('lists all 15 tools', async ({ mcp }) => {
    const tools = await mcp.listTools();
    expect(tools.length).toBe(15);
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
      'get_started',
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
    expect(result.resources.some((r) => r.uri === 'connector://workflow')).toBe(
      true,
    );
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

  test('infer_schema analyzes a CSV file', async ({
    mcp,
    connectorProject,
  }) => {
    const result = await mcp.callTool('infer_schema', {
      file_path: join(connectorProject.baseDir, 'sample.csv'),
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('id');
    expect(text).toContain('title');
  });

  test('infer_schema returns an error message for unsupported file types', async ({
    mcp,
    connectorProject,
  }) => {
    const result = await mcp.callTool('infer_schema', {
      file_path: join(connectorProject.baseDir, 'data.xml'),
    });
    // Tool-level error returned as text content, not a protocol-level error
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('Error');
  });
});

// ── Mapping Tools ────────────────────────────────────────────────

test.describe('Mapping Tools', () => {
  test('get_mappings returns source schema and Glean entity model', async ({
    mcp,
  }) => {
    const result = await mcp.callTool('get_mappings', {});
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('datasourceObjectId');
    expect(text).toContain('title');
  });

  test('validate_mappings reports valid when all required fields are mapped', async ({
    mcp,
  }) => {
    const result = await mcp.callTool('validate_mappings', {});
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('valid');
  });

  test('confirm_mappings saves mapping decisions', async ({ mcp }) => {
    const result = await mcp.callTool('confirm_mappings', {
      mappings: [
        { source_field: 'title', glean_field: 'title', transform: null },
      ],
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('mapping');
  });
});

// ── Config Tools ─────────────────────────────────────────────────

test.describe('Config Tools', () => {
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
  test('build_connector returns Python preview in dry_run mode', async ({
    mcp,
  }) => {
    const result = await mcp.callTool('build_connector', { dry_run: true });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('class');
    expect(text).toContain('def transform');
  });
});

// ── Execution Tools ──────────────────────────────────────────────

test.describe('Execution Tools', () => {
  test.skip('run_connector returns an execution_id immediately', async ({
    mcp,
  }) => {
    // Requires uv to spawn the Python worker — skipped in environments without uv.
    const result = await mcp.callTool('run_connector', {
      connector_name: 'Connector',
    });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text as string;
    expect(text).toContain('execution_id');
  });

  test('inspect_execution returns not found for unknown id', async ({
    mcp,
  }) => {
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
  test('connector://workflow returns the authoring guide', async ({
    mcpClient,
  }) => {
    const result = await mcpClient.readResource({
      uri: 'connector://workflow',
    });
    expect(result.contents).toBeTruthy();
    const text = result.contents[0].text as string;
    expect(text).toContain('Step 1');
    expect(text).toContain('create_connector');
  });
});
