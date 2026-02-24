import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createExecution } from '../../src/lib/execution-store.js';

vi.mock('../../src/core/worker-pool.js', () => ({
  getWorkerPool: vi.fn().mockReturnValue({
    spawn: vi
      .fn()
      .mockResolvedValue({ ok: false, error: new Error('mocked - no python') }),
    kill: vi.fn().mockResolvedValue({ ok: true }),
    addNotificationHandler: vi.fn().mockReturnValue({ ok: true }),
  }),
}));

let projectPath: string;

beforeEach(() => {
  projectPath = join(
    tmpdir(),
    `exec-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(projectPath, '.glean'), { recursive: true });
});

describe('run_connector', () => {
  it('returns an execution_id immediately without blocking', async () => {
    const { handleRunConnector } = await import('../../src/tools/execution.js');
    const result = await handleRunConnector(
      { connector_name: 'MyConnector' },
      projectPath,
    );
    expect(result.content[0].text).toContain('execution_id');
  });
});

describe('inspect_execution', () => {
  it('returns status for a known execution', async () => {
    const { handleInspectExecution } =
      await import('../../src/tools/execution.js');
    const id = `test-exec-${Date.now()}`;
    createExecution(id, 'MyConnector');
    const result = await handleInspectExecution(
      { execution_id: id },
      projectPath,
    );
    expect(result.content[0].text).toContain('running');
  });

  it('returns not found for an unknown execution_id', async () => {
    const { handleInspectExecution } =
      await import('../../src/tools/execution.js');
    const result = await handleInspectExecution(
      { execution_id: 'does-not-exist' },
      projectPath,
    );
    expect(result.content[0].text).toContain('not found');
  });
});

describe('manage_recording', () => {
  it('returns an error for replay when no recording path is provided', async () => {
    const { handleManageRecording } =
      await import('../../src/tools/execution.js');
    const result = await handleManageRecording(
      { action: 'replay' },
      projectPath,
    );
    expect(result.content[0].text).toContain('recording_path');
  });

  it('acknowledges a list action', async () => {
    const { handleManageRecording } =
      await import('../../src/tools/execution.js');
    const result = await handleManageRecording({ action: 'list' }, projectPath);
    expect(result.content[0].text).toBeDefined();
  });
});
