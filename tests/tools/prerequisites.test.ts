import { test, expect } from 'vitest';
import { checkPrerequisites } from '../../src/tools/prerequisites.js';

test('checkPrerequisites returns a list of named checks', () => {
  const { checks } = checkPrerequisites();
  expect(checks.length).toBeGreaterThan(0);
  for (const check of checks) {
    expect(typeof check.name).toBe('string');
    expect(typeof check.ok).toBe('boolean');
    expect(typeof check.message).toBe('string');
  }
});

test('includes all 6 expected check names', () => {
  const { checks } = checkPrerequisites();
  const names = checks.map((c) => c.name);
  expect(names).toContain('uv');
  expect(names).toContain('python');
  expect(names).toContain('mise');
  expect(names).toContain('copier');
  expect(names).toContain('GLEAN_INSTANCE');
  expect(names).toContain('GLEAN_API_TOKEN');
});

test('handleCheckPrerequisites returns formatted text with check icons', async () => {
  const { handleCheckPrerequisites } = await import('../../src/tools/prerequisites.js');
  const result = handleCheckPrerequisites({});
  const text = result.content[0].text as string;
  // Should include check icons and names
  expect(text).toMatch(/[✓✗]/);
  expect(text).toContain('uv');
  expect(text).toContain('GLEAN_INSTANCE');
});
