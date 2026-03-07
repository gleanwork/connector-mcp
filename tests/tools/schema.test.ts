import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  handleInferSchema,
  handleGetSchema,
  handleUpdateSchema,
  handleAnalyzeField,
  updateSchemaSchema,
} from '../../src/tools/schema.js';
import { FieldType } from '../../src/types/index.js';

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

  it("includes a What's next block on success", async () => {
    const result = await handleInferSchema(
      { file_path: join(projectPath, 'sample.csv'), save: false },
      projectPath,
    );
    expect(result.content[0].text).toContain("What's next?");
    expect(result.content[0].text).toContain('`update_schema`');
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
    const fields = [{ name: 'id', type: FieldType.STRING, required: true }];
    await handleUpdateSchema({ fields }, projectPath);
    const saved = JSON.parse(
      readFileSync(join(projectPath, '.glean/schema.json'), 'utf8'),
    ) as { fields: { name: string }[] };
    expect(saved.fields[0].name).toBe('id');
  });

  it("includes a What's next block", async () => {
    const result = await handleUpdateSchema(
      { fields: [{ name: 'id', type: FieldType.STRING, required: true }] },
      projectPath,
    );
    expect(result.content[0].text).toContain("What's next?");
    expect(result.content[0].text).toContain('`confirm_mappings`');
  });

  it('rejects an invalid type string (CHK-019)', () => {
    const result = updateSchemaSchema.safeParse({
      fields: [{ name: 'bad', type: 'banana' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid FieldType values (CHK-019)', () => {
    const result = updateSchemaSchema.safeParse({
      fields: Object.values(FieldType).map((t) => ({ name: t, type: t })),
    });
    expect(result.success).toBe(true);
  });

  it('merges incoming fields with existing schema when merge:true (CHK-017)', async () => {
    writeFileSync(
      join(projectPath, '.glean/schema.json'),
      JSON.stringify({
        fields: [
          { name: 'id', type: FieldType.INTEGER, required: true },
          { name: 'name', type: FieldType.STRING, required: false },
        ],
      }),
    );
    await handleUpdateSchema(
      {
        fields: [
          { name: 'name', type: FieldType.STRING, required: true },
          { name: 'email', type: FieldType.STRING, required: false },
        ],
        merge: true,
      },
      projectPath,
    );
    const saved = JSON.parse(
      readFileSync(join(projectPath, '.glean/schema.json'), 'utf8'),
    ) as { fields: { name: string; required: boolean }[] };
    expect(saved.fields).toHaveLength(3);
    const nameField = saved.fields.find((f) => f.name === 'name');
    expect(nameField?.required).toBe(true);
    expect(saved.fields.find((f) => f.name === 'id')).toBeDefined();
    expect(saved.fields.find((f) => f.name === 'email')).toBeDefined();
  });

  it('replaces entire field list when merge:false (CHK-017)', async () => {
    writeFileSync(
      join(projectPath, '.glean/schema.json'),
      JSON.stringify({
        fields: [
          { name: 'old_field', type: FieldType.STRING, required: false },
        ],
      }),
    );
    await handleUpdateSchema(
      {
        fields: [
          { name: 'new_field', type: FieldType.STRING, required: false },
        ],
        merge: false,
      },
      projectPath,
    );
    const saved = JSON.parse(
      readFileSync(join(projectPath, '.glean/schema.json'), 'utf8'),
    ) as { fields: { name: string }[] };
    expect(saved.fields).toHaveLength(1);
    expect(saved.fields[0].name).toBe('new_field');
  });
});

describe('analyze_field', () => {
  it('returns extended analysis for a named field', async () => {
    writeFileSync(
      join(projectPath, '.glean/schema.json'),
      JSON.stringify({
        fields: [{ name: 'email', type: 'string', required: false }],
        sampleData: [{ email: 'alice@test.com' }, { email: 'bob@test.com' }],
      }),
    );
    const result = await handleAnalyzeField(
      { field_name: 'email' },
      projectPath,
    );
    expect(result.content[0].text).toContain('email');
  });

  it('returns non-empty samples after infer_schema with save:true (CHK-002)', async () => {
    await handleInferSchema(
      { file_path: join(projectPath, 'sample.csv'), save: true },
      projectPath,
    );
    const result = await handleAnalyzeField(
      { field_name: 'email' },
      projectPath,
    );
    const text = result.content[0].text;
    expect(text).toContain('Samples:');
    expect(text).toContain('alice@test.com');
  });

  it('returns not found for unknown field', async () => {
    writeFileSync(
      join(projectPath, '.glean/schema.json'),
      JSON.stringify({ fields: [] }),
    );
    const result = await handleAnalyzeField(
      { field_name: 'nonexistent' },
      projectPath,
    );
    expect(result.content[0].text).toContain('not found');
  });
});
