import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleBuildConnector } from '../../src/tools/build.js';

let projectPath: string;

function setupProject(
  withSchema = true,
  withMappings = true,
  withConfig = true,
) {
  projectPath = join(
    tmpdir(),
    `build-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(join(projectPath, '.glean'), { recursive: true });

  if (withSchema) {
    writeFileSync(
      join(projectPath, '.glean/schema.json'),
      JSON.stringify({
        entities: [
          {
            name: 'Item',
            is_array: true,
            sample_count: 2,
            fields: [
              {
                name: 'id',
                field_type: 'string',
                required: true,
                nested_fields: [],
                is_array_item: false,
              },
              {
                name: 'title',
                field_type: 'string',
                required: true,
                nested_fields: [],
                is_array_item: false,
              },
            ],
          },
        ],
        source_type: 'json',
        inferred_at: new Date().toISOString(),
        version: '1.0',
      }),
    );
  }

  if (withMappings) {
    writeFileSync(
      join(projectPath, '.glean/mappings.json'),
      JSON.stringify({
        mappings: [
          { source_field: 'id', glean_field: 'datasourceObjectId' },
          { source_field: 'title', glean_field: 'title' },
        ],
      }),
    );
  }

  if (withConfig) {
    writeFileSync(
      join(projectPath, '.glean/config.json'),
      JSON.stringify({
        name: 'my-datasource',
        display_name: 'My Datasource',
        datasource_category: 'PUBLISHED_CONTENT',
        connector_type: 'basic',
        object_definitions: [],
      }),
    );
  }
}

beforeEach(() => setupProject());

describe('build_connector', () => {
  it('returns generated Python code as text in dry_run mode without writing files', async () => {
    const result = await handleBuildConnector({ dry_run: true }, projectPath);
    expect(result.content[0].text).toContain('class');
    const pyFiles = readdirSync(projectPath).filter((f) => f.endsWith('.py'));
    expect(pyFiles).toHaveLength(0);
  });

  it('writes connector files when dry_run is false', async () => {
    await handleBuildConnector({ dry_run: false }, projectPath);
    expect(existsSync(join(projectPath, 'connector.py'))).toBe(true);
    expect(existsSync(join(projectPath, 'models.py'))).toBe(true);
  });

  it('returns an error when schema is missing', async () => {
    setupProject(false, true, true);
    const result = await handleBuildConnector({ dry_run: true }, projectPath);
    expect(result.content[0].text).toContain('Error');
  });

  it('returns an error when mappings are missing', async () => {
    setupProject(true, false, true);
    const result = await handleBuildConnector({ dry_run: true }, projectPath);
    expect(result.content[0].text).toContain('Error');
  });
});
