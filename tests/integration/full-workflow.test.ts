/**
 * Full connector authoring workflow integration test.
 *
 * Exercises the complete happy path through all tool handlers without
 * spawning real Python. The worker-pool and copier-runner are mocked;
 * everything else (file I/O, code generation, validation) is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// Note: no direct fs imports — we go through the tool handlers

// Mock external process dependencies only
vi.mock('../../src/core/copier-runner.js', () => ({
  runCopier: vi.fn().mockImplementation(
    async (name: string, parentDir: string) => {
      const projectPath = join(parentDir, name);
      mkdirSync(join(projectPath, '.glean'), { recursive: true });
      return { success: true, projectPath };
    },
  ),
}));

vi.mock('../../src/core/worker-pool.js', () => ({
  getWorkerPool: vi.fn().mockReturnValue({
    spawn: vi.fn().mockResolvedValue({ ok: false, error: new Error('no python in test') }),
    kill: vi.fn(),
    addNotificationHandler: vi.fn().mockReturnValue({ ok: true }),
  }),
}));

let parentDir: string;
let projectPath: string;

beforeEach(() => {
  parentDir = join(tmpdir(), `integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(parentDir, { recursive: true });
  projectPath = join(parentDir, 'my-connector');
});

describe('full connector workflow', () => {
  it('creates project, defines schema, maps fields, validates, builds, and runs', async () => {
    // ── Step 1: Create connector ──────────────────────────────────
    const { handleCreateConnector } = await import('../../src/tools/create-connector.js');
    const createResult = await handleCreateConnector({
      name: 'my-connector',
      parent_directory: parentDir,
    });
    expect(createResult.content[0].text).toContain('my-connector');
    expect(createResult.content[0].text).toContain('created');
    expect(existsSync(join(projectPath, 'CLAUDE.md'))).toBe(true);

    // ── Step 2: Set config ────────────────────────────────────────
    const { handleSetConfig, handleGetConfig } = await import('../../src/tools/config.js');
    await handleSetConfig(
      { config: { auth_type: 'bearer', endpoint: 'https://api.example.com' } },
      projectPath,
    );
    const configResult = await handleGetConfig({}, projectPath);
    expect(configResult.content[0].text).toContain('bearer');

    // ── Step 3: Update schema ─────────────────────────────────────
    const { handleUpdateSchema, handleGetSchema } = await import('../../src/tools/schema.js');
    await handleUpdateSchema(
      {
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'title', type: 'string', required: true },
          { name: 'url', type: 'string', required: true },
        ],
      },
      projectPath,
    );
    const schemaResult = await handleGetSchema({}, projectPath);
    expect(schemaResult.content[0].text).toContain('title');

    // ── Step 4: Map and validate ──────────────────────────────────
    const { handleGetMappings, handleConfirmMappings, handleValidateMappings } =
      await import('../../src/tools/mapping.js');

    const mappingsView = await handleGetMappings({}, projectPath);
    expect(mappingsView.content[0].text).toContain('datasourceObjectId');

    await handleConfirmMappings(
      {
        mappings: [
          { source_field: 'id', glean_field: 'datasourceObjectId', transform: null },
          { source_field: 'title', glean_field: 'title', transform: null },
          { source_field: 'url', glean_field: 'viewURL', transform: null },
          { source_field: 'id', glean_field: 'permissions', transform: null },
        ],
      },
      projectPath,
    );

    const validation = await handleValidateMappings({}, projectPath);
    expect(validation.content[0].text).toContain('valid');

    // ── Step 5b: Build dry run ────────────────────────────────────
    const { handleBuildConnector } = await import('../../src/tools/build.js');
    const preview = await handleBuildConnector({ dry_run: true }, projectPath);
    expect(preview.content[0].text).toContain('class');
    expect(existsSync(join(projectPath, 'connector.py'))).toBe(false);

    // ── Step 5c: Build for real ───────────────────────────────────
    await handleBuildConnector({ dry_run: false }, projectPath);
    expect(existsSync(join(projectPath, 'connector.py'))).toBe(true);
    expect(existsSync(join(projectPath, 'models.py'))).toBe(true);

    // ── Step 6: Run and inspect ───────────────────────────────────
    const { handleRunConnector, handleInspectExecution } =
      await import('../../src/tools/execution.js');
    const runResult = await handleRunConnector({ connector_name: 'Connector' }, projectPath);
    expect(runResult.content[0].text).toContain('execution_id');

    const match = /execution_id: ([a-f0-9-]+)/i.exec(runResult.content[0].text);
    expect(match).not.toBeNull();
    const execId = match![1];

    const inspectResult = await handleInspectExecution({ execution_id: execId }, projectPath);
    expect(inspectResult.content[0].text).toMatch(/running|failed/);
  });
});
