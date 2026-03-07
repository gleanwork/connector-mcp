import { z } from 'zod';

import { analyzeFile } from '../lib/file-analyzer.js';
import {
  readStoredSchema,
  writeStoredSchema,
  type StoredSchema,
} from '../lib/schema-store.js';
import { GLEAN_DOCUMENT_FIELDS } from '../lib/glean-entity-model.js';
import { FieldType } from '../types/index.js';
import { getProjectPath } from '../session.js';
import { formatNextSteps } from './workflow.js';

// ── infer_schema ─────────────────────────────────────────────────

export const inferSchemaSchema = z.object({
  file_path: z
    .string()
    .describe('Path to a .csv, .json, .ndjson, or .jsonl file to analyze'),
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
      ...analyses.map(
        (f) =>
          `  ${f.name}: ${f.detectedType} | null_rate=${(f.nullRate * 100).toFixed(1)}% | cardinality=${f.cardinality} | samples=${JSON.stringify(f.samples.slice(0, 3))}`,
      ),
      '',
      'Use update_schema to save a field definition, or set save:true to auto-save all fields.',
    ];

    if (params.save) {
      const schema: StoredSchema = {
        fields: analyses.map((f) => ({
          name: f.name,
          type: f.detectedType,
          required: f.nullRate === 0,
        })),
        sampleData: (() => {
          if (analyses.length === 0) return undefined;
          const maxSamples = Math.max(...analyses.map((a) => a.samples.length));
          const rows: Record<string, unknown>[] = [];
          for (let i = 0; i < Math.min(maxSamples, 10); i++) {
            const row: Record<string, unknown> = {};
            for (const analysis of analyses) {
              if (i < analysis.samples.length) {
                row[analysis.name] = analysis.samples[i];
              }
            }
            rows.push(row);
          }
          return rows;
        })(),
      };
      writeStoredSchema(projectPath, schema);
      lines.push(`\nSchema saved to .glean/schema.json`);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text:
            lines.join('\n') +
            formatNextSteps([
              {
                label: 'Update Schema',
                description:
                  'save the detected fields, adjusting types if needed',
                tool: 'update_schema',
              },
              {
                label: 'Analyze Field',
                description: 'deep-dive on a specific field before committing',
                tool: 'analyze_field',
              },
            ]),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        { type: 'text' as const, text: `Error analyzing file: ${msg}` },
      ],
    };
  }
}

// ── get_schema ───────────────────────────────────────────────────

export const getSchemaSchema = z.object({});

export async function handleGetSchema(
  _params: z.infer<typeof getSchemaSchema>,
  projectPath = getProjectPath(),
) {
  const schema = readStoredSchema(projectPath);
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
        type: z
          .nativeEnum(FieldType)
          .describe(
            `Field type. Must be one of: ${Object.values(FieldType).join(', ')}`,
          ),
        required: z.boolean().optional().default(false),
        description: z.string().optional(),
      }),
    )
    .describe('Field definitions to write to .glean/schema.json'),
  merge: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'If true, merge incoming fields with the existing schema (fields with the same name are replaced; new names are appended). If false (default), the entire field list is replaced.',
    ),
});

export async function handleUpdateSchema(
  params: z.infer<typeof updateSchemaSchema>,
  projectPath = getProjectPath(),
) {
  const existing = readStoredSchema(projectPath) ?? { fields: [] };

  let mergedFields: StoredSchema['fields'];
  if (params.merge) {
    const incomingByName = new Map(params.fields.map((f) => [f.name, f]));
    const base = existing.fields.map((f) =>
      incomingByName.has(f.name) ? incomingByName.get(f.name)! : f,
    );
    const existingNames = new Set(existing.fields.map((f) => f.name));
    const appended = params.fields.filter((f) => !existingNames.has(f.name));
    mergedFields = [...base, ...appended];
  } else {
    mergedFields = params.fields;
  }

  const updated: StoredSchema = { ...existing, fields: mergedFields };
  writeStoredSchema(projectPath, updated);

  return {
    content: [
      {
        type: 'text' as const,
        text:
          `Schema updated with ${mergedFields.length} field(s)${params.merge ? ' (merged)' : ''}. Saved to .glean/schema.json.\n\nNext: call get_mappings to map these fields to Glean's entity model.` +
          formatNextSteps([
            {
              label: 'Map Fields',
              description: "view how source fields map to Glean's entity model",
              tool: 'get_mappings',
            },
            {
              label: 'Confirm Mappings',
              description: 'save field mapping decisions',
              tool: 'confirm_mappings',
            },
          ]),
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
  const schema = readStoredSchema(projectPath);
  if (!schema) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No schema found. Run infer_schema first.',
        },
      ],
    };
  }

  const field = schema.fields.find((f) => f.name === params.field_name);

  if (!field) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Field "${params.field_name}" not found in schema. Available: ${schema.fields.map((f) => f.name).join(', ')}`,
        },
      ],
    };
  }

  // Find Glean fields that could be a good match
  const gleanSuggestions = GLEAN_DOCUMENT_FIELDS.filter((gf) => {
    const name = params.field_name.toLowerCase();
    return (
      name.includes(gf.name.toLowerCase()) ||
      gf.name.toLowerCase().includes(name) ||
      gf.type === field.type
    );
  }).slice(0, 3);

  // Pull sample data from stored schema (persisted by infer_schema with save:true)
  const samples =
    schema.sampleData
      ?.map((r) => r[params.field_name])
      .filter(Boolean)
      .slice(0, 5) ?? [];

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
