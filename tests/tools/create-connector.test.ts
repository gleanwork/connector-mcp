import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateConnector } from '../../src/tools/create-connector.js';

vi.mock('../../src/core/copier-runner.js', () => ({
  runCopier: vi.fn().mockResolvedValue({ success: true, projectPath: '/tmp/test-connector' }),
}));

describe('create_connector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the new project path on success', async () => {
    const result = await handleCreateConnector({
      name: 'test-connector',
      parent_directory: '/tmp',
    });
    expect(result.content[0].text).toContain('test-connector');
    expect(result.content[0].text).toContain('created');
  });

  it('returns an error message if copier fails', async () => {
    const { runCopier } = await import('../../src/core/copier-runner.js');
    vi.mocked(runCopier).mockResolvedValueOnce({
      success: false,
      projectPath: '/tmp/bad',
      error: 'Template not found',
    });
    const result = await handleCreateConnector({ name: 'bad', parent_directory: '/tmp' });
    expect(result.content[0].text).toContain('Error');
  });
});
