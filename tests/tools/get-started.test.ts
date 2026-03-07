import { describe, it, expect } from 'vitest';
import { handleGetStarted } from '../../src/tools/get-started.js';

describe('get_started', () => {
  it('returns a non-empty prompt text', async () => {
    const result = await handleGetStarted({});
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  it('mentions what a connector does', async () => {
    const result = await handleGetStarted({});
    expect(result.content[0].text.toLowerCase()).toContain('connector');
  });

  it('asks the user about their data source', async () => {
    const result = await handleGetStarted({});
    expect(result.content[0].text.toLowerCase()).toContain('data source');
  });

  it('asks about a sample data file', async () => {
    const result = await handleGetStarted({});
    expect(result.content[0].text.toLowerCase()).toContain('sample');
  });

  it("includes create_connector in What's next", async () => {
    const result = await handleGetStarted({});
    expect(result.content[0].text).toContain("What's next?");
    expect(result.content[0].text).toContain('`create_connector`');
  });
});
