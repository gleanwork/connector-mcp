import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  handleGetMappings,
  handleConfirmMappings,
  handleValidateMappings,
} from '../../src/tools/mapping.js';

let projectPath: string;

beforeEach(() => {
  projectPath = join(tmpdir(), `mapping-test-${Date.now()}`);
  mkdirSync(join(projectPath, '.glean'), { recursive: true });
  writeFileSync(
    join(projectPath, '.glean/schema.json'),
    JSON.stringify({
      fields: [{ name: 'record_title', type: 'string', required: true }],
    }),
  );
});

describe('get_mappings', () => {
  it('returns current schema and Glean entity model side-by-side', async () => {
    const result = await handleGetMappings({}, projectPath);
    const text = result.content[0].text;
    expect(text).toContain('record_title'); // source field
    expect(text).toContain('title'); // Glean field
  });

  it('handles missing schema gracefully', async () => {
    const emptyPath = join(tmpdir(), `empty-${Date.now()}`);
    mkdirSync(join(emptyPath, '.glean'), { recursive: true });
    const result = await handleGetMappings({}, emptyPath);
    expect(result.content[0].text).toContain('No schema');
  });

  it('includes permissions guidance note', async () => {
    const result = await handleGetMappings({}, projectPath);
    const text = result.content[0].text;
    expect(text).toContain('permissions');
    expect(text).toContain('allow_anonymous_access');
  });
});

describe('confirm_mappings', () => {
  it('saves mappings to .glean/mappings.json', async () => {
    const mappings = [
      { source_field: 'record_title', glean_field: 'title', transform: null },
    ];
    await handleConfirmMappings({ mappings }, projectPath);
    const saved = JSON.parse(
      readFileSync(join(projectPath, '.glean/mappings.json'), 'utf8'),
    ) as { mappings: { source_field: string }[] };
    expect(saved.mappings[0].source_field).toBe('record_title');
  });

  it("includes a What's next block", async () => {
    const mappings = [
      { source_field: 'record_title', glean_field: 'title', transform: null },
    ];
    const result = await handleConfirmMappings({ mappings }, projectPath);
    expect(result.content[0].text).toContain("What's next?");
    expect(result.content[0].text).toContain('`validate_mappings`');
  });
});

describe('validate_mappings', () => {
  it('reports missing required Glean fields', async () => {
    writeFileSync(
      join(projectPath, '.glean/mappings.json'),
      JSON.stringify({ mappings: [] }),
    );
    const result = await handleValidateMappings({}, projectPath);
    const text = result.content[0].text;
    expect(text).toContain('title');
    expect(text).toContain('viewURL');
  });

  it('reports clean when all required fields are mapped', async () => {
    const mappings = [
      { source_field: 'rec_id', glean_field: 'datasourceObjectId' },
      { source_field: 'rec_title', glean_field: 'title' },
      { source_field: 'rec_url', glean_field: 'viewURL' },
      { source_field: 'rec_perms', glean_field: 'permissions' },
    ];
    writeFileSync(
      join(projectPath, '.glean/mappings.json'),
      JSON.stringify({ mappings }),
    );
    const result = await handleValidateMappings({}, projectPath);
    expect(result.content[0].text).toContain('valid');
  });

  it("includes build_connector in What's next when valid", async () => {
    const mappings = [
      { source_field: 'rec_id', glean_field: 'datasourceObjectId' },
      { source_field: 'rec_title', glean_field: 'title' },
      { source_field: 'rec_url', glean_field: 'viewURL' },
      { source_field: 'rec_perms', glean_field: 'permissions' },
    ];
    writeFileSync(
      join(projectPath, '.glean/mappings.json'),
      JSON.stringify({ mappings }),
    );
    const result = await handleValidateMappings({}, projectPath);
    expect(result.content[0].text).toContain("What's next?");
    expect(result.content[0].text).toContain('`build_connector`');
  });

  it("includes confirm_mappings in What's next when invalid", async () => {
    writeFileSync(
      join(projectPath, '.glean/mappings.json'),
      JSON.stringify({ mappings: [] }),
    );
    const result = await handleValidateMappings({}, projectPath);
    expect(result.content[0].text).toContain("What's next?");
    expect(result.content[0].text).toContain('`confirm_mappings`');
  });

  it('includes actionable hint when permissions field is missing', async () => {
    writeFileSync(
      join(projectPath, '.glean/mappings.json'),
      JSON.stringify({ mappings: [] }),
    );
    const result = await handleValidateMappings({}, projectPath);
    const text = result.content[0].text;
    expect(text).toContain('permissions');
    expect(text).toContain('anonymous access');
  });
});
