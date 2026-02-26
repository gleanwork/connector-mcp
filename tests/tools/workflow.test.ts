import { describe, it, expect } from 'vitest';
import { formatNextSteps } from '../../src/tools/workflow.js';

describe('formatNextSteps', () => {
  it('returns a block with the header and numbered items', () => {
    const result = formatNextSteps([
      { label: 'Infer Schema', description: 'parse a data file', tool: 'infer_schema' },
      { label: 'Set Config', description: 'define auth settings', tool: 'set_config' },
    ]);
    expect(result).toContain("**What's next?**");
    expect(result).toContain('1. **Infer Schema**');
    expect(result).toContain('`infer_schema`');
    expect(result).toContain('2. **Set Config**');
    expect(result).toContain('`set_config`');
  });

  it('starts with a divider', () => {
    const result = formatNextSteps([
      { label: 'Build', description: 'generate code', tool: 'build_connector' },
    ]);
    expect(result).toMatch(/^---/m);
  });

  it('works with a single step', () => {
    const result = formatNextSteps([
      { label: 'Inspect', description: 'check status', tool: 'inspect_execution' },
    ]);
    expect(result).toContain('1. **Inspect**');
    expect(result).not.toContain('2.');
  });
});
