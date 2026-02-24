import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWriteFileSync } from '../core/fs-utils.js';
import {
  GLEAN_DOCUMENT_FIELDS,
  REQUIRED_GLEAN_FIELDS,
} from '../lib/glean-entity-model.js';
import { getProjectPath } from '../session.js';

// ── File path helpers ────────────────────────────────────────────

function schemaPath(projectPath: string): string {
  return join(projectPath, '.glean', 'schema.json');
}

function mappingsPath(projectPath: string): string {
  return join(projectPath, '.glean', 'mappings.json');
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

// ── get_mappings ─────────────────────────────────────────────────

export const getMappingsSchema = z.object({});

export async function handleGetMappings(
  _params: z.infer<typeof getMappingsSchema>,
  projectPath = getProjectPath(),
) {
  const schema = readJson<{
    fields: Array<{ name: string; type?: string; required?: boolean }>;
  }>(schemaPath(projectPath));

  if (!schema) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No schema found. Run infer_schema or update_schema first.',
        },
      ],
    };
  }

  const existingMappings = readJson<{
    mappings: Array<{ source_field: string; glean_field: string }>;
  }>(mappingsPath(projectPath));

  const lines = [
    '## Your Source Fields',
    ...schema.fields.map(
      (f) =>
        `  ${f.name} (${f.type ?? 'unknown'})${f.required ? ' [required]' : ''}`,
    ),
    '',
    '## Glean Entity Model (Document)',
    ...GLEAN_DOCUMENT_FIELDS.map(
      (f) =>
        `  ${f.name} (${f.type})${f.required ? ' [required]' : ''} — ${f.description}`,
    ),
  ];

  if (existingMappings?.mappings?.length) {
    lines.push('', '## Current Mappings');
    for (const m of existingMappings.mappings) {
      lines.push(`  ${m.source_field} → ${m.glean_field}`);
    }
  }

  lines.push(
    '',
    'Use confirm_mappings to save your mapping decisions, then validate_mappings to check for gaps.',
  );

  return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
}

// ── confirm_mappings ─────────────────────────────────────────────

export const confirmMappingsSchema = z.object({
  mappings: z
    .array(
      z.object({
        source_field: z.string().describe('Field name from your source schema'),
        glean_field: z.string().describe('Target Glean entity field name'),
        transform: z
          .string()
          .nullable()
          .optional()
          .describe('Optional transform expression (null for direct mapping)'),
      }),
    )
    .describe('List of source→Glean field mapping decisions'),
});

export async function handleConfirmMappings(
  params: z.infer<typeof confirmMappingsSchema>,
  projectPath = getProjectPath(),
) {
  const existing = readJson<{ mappings: unknown[] }>(
    mappingsPath(projectPath),
  ) ?? { mappings: [] };

  // Merge: replace any existing mapping for the same glean_field
  const existingMap = new Map(
    (existing.mappings as Array<{ glean_field: string }>).map((m) => [
      m.glean_field,
      m,
    ]),
  );
  for (const m of params.mappings) {
    existingMap.set(m.glean_field, m);
  }

  const merged = { mappings: [...existingMap.values()] };
  atomicWriteFileSync(
    mappingsPath(projectPath),
    JSON.stringify(merged, null, 2),
  );

  return {
    content: [
      {
        type: 'text' as const,
        text: [
          `Saved ${params.mappings.length} mapping(s). Total mappings: ${merged.mappings.length}.`,
          `Run validate_mappings to check for missing required Glean fields.`,
        ].join('\n'),
      },
    ],
  };
}

// ── validate_mappings ────────────────────────────────────────────

export const validateMappingsSchema = z.object({});

export async function handleValidateMappings(
  _params: z.infer<typeof validateMappingsSchema>,
  projectPath = getProjectPath(),
) {
  const mappings = readJson<{ mappings: Array<{ glean_field: string }> }>(
    mappingsPath(projectPath),
  );

  if (!mappings) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No mappings found. Run confirm_mappings first.',
        },
      ],
    };
  }

  const mappedGleanFields = new Set(
    mappings.mappings.map((m) => m.glean_field),
  );
  const missing = REQUIRED_GLEAN_FIELDS.filter(
    (f) => !mappedGleanFields.has(f),
  );

  if (missing.length > 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: [
            `Validation failed — ${missing.length} required Glean field(s) not mapped:`,
            ...missing.map((f) => {
              const gleanField = GLEAN_DOCUMENT_FIELDS.find(
                (gf) => gf.name === f,
              );
              return `  • ${f} — ${gleanField?.description ?? ''}`;
            }),
            '',
            'Use confirm_mappings to add mappings for these fields.',
          ].join('\n'),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: [
          '✓ Mappings are valid — all required Glean fields are mapped.',
          `  Mapped: ${[...mappedGleanFields].join(', ')}`,
          '',
          'Next step: run build_connector to generate the Python connector files.',
        ].join('\n'),
      },
    ],
  };
}
