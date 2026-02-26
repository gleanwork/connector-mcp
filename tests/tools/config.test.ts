import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleGetConfig, handleSetConfig } from '../../src/tools/config.js';

let projectPath: string;

beforeEach(() => {
  projectPath = join(tmpdir(), `config-test-${Date.now()}`);
  mkdirSync(join(projectPath, '.glean'), { recursive: true });
});

describe('get_config', () => {
  it('returns a "no config" message when config does not exist', async () => {
    const result = await handleGetConfig({}, projectPath);
    expect(result.content[0].text).toContain('No config');
  });

  it('returns config JSON when config exists', async () => {
    writeFileSync(
      join(projectPath, '.glean/config.json'),
      JSON.stringify({
        auth_type: 'bearer',
        endpoint: 'https://api.example.com',
      }),
    );
    const result = await handleGetConfig({}, projectPath);
    expect(result.content[0].text).toContain('bearer');
    expect(result.content[0].text).toContain('endpoint');
  });
});

describe('set_config', () => {
  it('writes an arbitrary config object to .glean/config.json', async () => {
    await handleSetConfig(
      { config: { auth_type: 'apikey', api_key_header: 'X-Api-Key' } },
      projectPath,
    );
    const saved = JSON.parse(
      readFileSync(join(projectPath, '.glean/config.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(saved['auth_type']).toBe('apikey');
    expect(saved['api_key_header']).toBe('X-Api-Key');
  });

  it('merges new keys with existing config', async () => {
    writeFileSync(
      join(projectPath, '.glean/config.json'),
      JSON.stringify({
        auth_type: 'bearer',
        endpoint: 'https://api.example.com',
      }),
    );
    await handleSetConfig({ config: { page_size: 100 } }, projectPath);
    const saved = JSON.parse(
      readFileSync(join(projectPath, '.glean/config.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(saved['auth_type']).toBe('bearer');
    expect(saved['page_size']).toBe(100);
  });
});

describe("set_config follow-up", () => {
  it("includes a What's next block", async () => {
    const result = await handleSetConfig(
      { config: { endpoint: 'https://api.example.com' } },
      projectPath,
    );
    expect(result.content[0].text).toContain("What's next?");
    expect(result.content[0].text).toContain('`infer_schema`');
  });
});
