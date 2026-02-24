import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { analyzeFile } from '../lib/file-analyzer.js';
import { atomicWriteFileSync } from '../core/fs-utils.js';
import { GLEAN_DOCUMENT_FIELDS } from '../lib/glean-entity-model.js';
import { getProjectPath } from '../session.js';

// ── Shared schema file helpers ───────────────────────────────────

function schemaPath(projectPath: string): string {
  return join(projectPath, '.glean', 'schema.json');
}

function readSchema(projectPath: string): Record<string, unknown> | null {
  const p = schemaPath(projectPath);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
}

// ── infer_schema ─────────────────────────────────────────────────

export const inferSchemaSchema = z.object({
  file_path: z.string().describe('Path to a .csv, .json, .ndjson, or .jsonl file to analyze'),
  save: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, save the inferred schema to .glean/schema.json'),
});

export async function handleInferSchema(
  params: z.infer<typeof inferSchemaSchema>,
  projectPath = getProjectPath(),
) {
  try {
    const analyses = analyzeFile(params.file_path);

    const lines = [
      `Analyzed ${analyses[0]?.totalRecords ?? 0} records, found ${analyses.length} fields:\n`,
      ...analyses.map((f) =>
        `  ${f.name}: ${f.detectedType} | null_rate=${(f.nullRate * 100).toFixed(1)}% | cardinality=${f.cardinality} | samples=${JSON.stringify(f.samples.slice(0, 3))}`,
      ),
      '',
      'Use update_schema to save a field definition, or set save:true to auto-save all fields.',
    ];

    if (params.save) {
      const fields = analyses.map((f) => ({
        name: f.name,
        type: f.detectedType,
        required: f.nullRate === 0,
      }));
      atomicWriteFileSync(schemaPath(projectPath), JSON.stringify({ fields }, null, 2));
      lines.push(`\nSchema saved to ${schemaPath(projectPath)}`);
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text' as const, text: `Error analyzing file: ${msg}` }] };
  }
}

// ── get_schema ───────────────────────────────────────────────────

export const getSchemaSchema = z.object({});

export async function handleGetSchema(
  _params: z.infer<typeof getSchemaSchema>,
  projectPath = getProjectPath(),
) {
  const schema = readSchema(projectPath);
  if (!schema) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No schema found. Use infer_schema with a sample file, or update_schema to define fields manually.',
        },
      ],
    };
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(schema, null, 2) }],
  };
}

// ── update_schema ────────────────────────────────────────────────

export const updateSchemaSchema = z.object({
  fields: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean().optional().default(false),
        description: z.string().optional(),
      }),
    )
    .describe('Field definitions to write to .glean/schema.json'),
});

export async function handleUpdateSchema(
  params: z.infer<typeof updateSchemaSchema>,
  projectPath = getProjectPath(),
) {
  const existing = readSchema(projectPath) ?? {};
  const updated = { ...existing, fields: params.fields };
  atomicWriteFileSync(schemaPath(projectPath), JSON.stringify(updated, null, 2));

  return {
    content: [
      {
        type: 'text' as const,
        text: `Schema updated with ${params.fields.length} field(s). Saved to .glean/schema.json.\n\nNext: call get_mappings to map these fields to Glean's entity model.`,
      },
    ],
  };
}

// ── analyze_field ────────────────────────────────────────────────

export const analyzeFieldSchema = z.object({
  field_name: z.string().describe('Name of the field to analyze in depth'),
});

export async function handleAnalyzeField(
  params: z.infer<typeof analyzeFieldSchema>,
  projectPath = getProjectPath(),
) {
  const schema = readSchema(projectPath);
  if (!schema) {
    return {
      content: [{ type: 'text' as const, text: 'No schema found. Run infer_schema first.' }],
    };
  }

  const fields = (schema['fields'] as Array<{ name: string; type?: string; required?: boolean; description?: string }>) ?? [];
  const field = fields.find((f) => f.name === params.field_name);

  if (!field) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Field "${params.field_name}" not found in schema. Available: ${fields.map((f) => f.name).join(', ')}`,
        },
      ],
    };
  }

  // Find Glean fields that could be a good match
  const gleanSuggestions = GLEAN_DOCUMENT_FIELDS
    .filter((gf) => {
      const name = params.field_name.toLowerCase();
      return (
        name.includes(gf.name.toLowerCase()) ||
        gf.name.toLowerCase().includes(name) ||
        gf.type === field.type
      );
    })
    .slice(0, 3);

  // Pull sample data if available
  const sampleData = schema['sampleData'] as Array<Record<string, unknown>> | undefined;
  const samples = sampleData?.map((r) => r[params.field_name]).filter(Boolean).slice(0, 5) ?? [];

  const lines = [
    `Field: ${field.name}`,
    `Type: ${field.type ?? 'unknown'}`,
    `Required: ${field.required ?? false}`,
    field.description ? `Description: ${field.description}` : null,
    samples.length > 0 ? `Samples: ${JSON.stringify(samples)}` : null,
    '',
    gleanSuggestions.length > 0
      ? `Suggested Glean mappings:\n${gleanSuggestions.map((g) => `  ${g.name} (${g.type}) — ${g.description}`).join('\n')}`
      : 'No obvious Glean field match — review get_mappings for all options.',
  ].filter(Boolean);

  return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
}
