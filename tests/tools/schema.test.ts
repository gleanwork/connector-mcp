import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  handleInferSchema,
  handleGetSchema,
  handleUpdateSchema,
  handleAnalyzeField,
} from '../../src/tools/schema.js';

let projectPath: string;

beforeEach(() => {
  projectPath = join(tmpdir(), `connector-test-${Date.now()}`);
  mkdirSync(join(projectPath, '.glean'), { recursive: true });
  writeFileSync(
    join(projectPath, 'sample.csv'),
    'id,name,email\n1,Alice,alice@test.com\n2,Bob,bob@test.com',
  );
});

describe('infer_schema', () => {
  it('analyzes a CSV file and returns field analysis', async () => {
    const result = await handleInferSchema(
      { file_path: join(projectPath, 'sample.csv') },
      projectPath,
    );
    const text = result.content[0].text;
    expect(text).toContain('id');
    expect(text).toContain('name');
    expect(text).toContain('email');
  });

  it('returns an error for an unsupported file type', async () => {
    const result = await handleInferSchema(
      { file_path: join(projectPath, 'data.xml') },
      projectPath,
    );
    expect(result.content[0].text).toContain('Error');
  });
});

describe('get_schema', () => {
  it('returns empty schema message when no schema exists', async () => {
    const result = await handleGetSchema({}, projectPath);
    expect(result.content[0].text).toContain('No schema');
  });

  it('returns schema JSON when schema exists', async () => {
    writeFileSync(
      join(projectPath, '.glean/schema.json'),
      JSON.stringify({ fields: [{ name: 'id' }] }),
    );
    const result = await handleGetSchema({}, projectPath);
    expect(result.content[0].text).toContain('id');
  });
});

describe('update_schema', () => {
  it('writes schema to .glean/schema.json', async () => {
    const fields = [{ name: 'id', type: 'string', required: true }];
    await handleUpdateSchema({ fields }, projectPath);
    const saved = JSON.parse(
      readFileSync(join(projectPath, '.glean/schema.json'), 'utf8'),
    ) as { fields: { name: string }[] };
    expect(saved.fields[0].name).toBe('id');
  });
});

describe('analyze_field', () => {
  it('returns extended analysis for a named field', async () => {
    writeFileSync(
      join(projectPath, '.glean/schema.json'),
      JSON.stringify({
        fields: [{ name: 'email', type: 'string', required: false }],
        sampleData: [
          { email: 'alice@test.com' },
          { email: 'bob@test.com' },
        ],
      }),
    );
    const result = await handleAnalyzeField({ field_name: 'email' }, projectPath);
    expect(result.content[0].text).toContain('email');
  });

  it('returns not found for unknown field', async () => {
    writeFileSync(
      join(projectPath, '.glean/schema.json'),
      JSON.stringify({ fields: [] }),
    );
    const result = await handleAnalyzeField({ field_name: 'nonexistent' }, projectPath);
    expect(result.content[0].text).toContain('not found');
  });
});
