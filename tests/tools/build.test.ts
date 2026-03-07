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
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'title', type: 'string', required: true },
        ],
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
    // Files are written to src/{module_name}/ — matches Copier template structure
    expect(existsSync(join(projectPath, 'src/connector/connector.py'))).toBe(
      true,
    );
    expect(existsSync(join(projectPath, 'src/connector/models.py'))).toBe(true);
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

  it("includes run_connector in What's next after dry_run preview", async () => {
    const result = await handleBuildConnector({ dry_run: true }, projectPath);
    expect(result.content[0].text).toContain("What's next?");
    expect(result.content[0].text).toContain('`run_connector`');
  });

  it("includes run_connector in What's next after writing files", async () => {
    const result = await handleBuildConnector({ dry_run: false }, projectPath);
    expect(result.content[0].text).toContain("What's next?");
    expect(result.content[0].text).toContain('`run_connector`');
  });

  it('preserves CONCAT transform from mappings into generated connector', async () => {
    // Set up a mapping with a CONCAT transform on a composite title field
    writeFileSync(
      join(projectPath, '.glean/schema.json'),
      JSON.stringify({
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'first_name', type: 'string', required: true },
          { name: 'last_name', type: 'string', required: true },
        ],
      }),
    );
    writeFileSync(
      join(projectPath, '.glean/mappings.json'),
      JSON.stringify({
        mappings: [
          { source_field: 'id', glean_field: 'datasourceObjectId' },
          {
            source_field: 'first_name',
            glean_field: 'title',
            transform: 'concat',
          },
        ],
      }),
    );

    const result = await handleBuildConnector({ dry_run: true }, projectPath);
    const text = result.content[0].text;

    // The generated connector should use join() for concat, not direct field access
    expect(text).toContain("' '.join(");
    // Direct field access pattern should not be used for the title mapping
    expect(text).not.toContain('record["first_name"]');
  });
});
