/**
 * Single source of truth for on-disk schema I/O.
 *
 * Canonical on-disk format (.glean/schema.json):
 *   { "fields": [{ "name": "id", "type": "string", "required": true }], "sampleData": [...] }
 *
 * toGeneratorInput() converts StoredSchema → SchemaDefinition for the code generator only.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWriteFileSync } from '../core/fs-utils.js';
import { getLogger } from './logger.js';

const logger = getLogger('schema-store');
import {
  FieldType,
  SchemaSourceType,
  type SchemaDefinition,
} from '../types/index.js';

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface StoredSchema {
  fields: SchemaField[];
  sampleData?: Record<string, unknown>[];
}

function schemaFilePath(projectPath: string): string {
  return join(projectPath, '.glean', 'schema.json');
}

/**
 * Read the canonical flat schema from disk. Returns null if not found.
 * Handles legacy SchemaDefinition (entities[]) format by converting to flat.
 */
export function readStoredSchema(projectPath: string): StoredSchema | null {
  const p = schemaFilePath(projectPath);
  if (!existsSync(p)) return null;

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
  } catch {
    logger.warn({ path: p }, 'schema.json contains invalid JSON; ignoring');
    return null;
  }

  // Legacy SchemaDefinition format — convert to flat StoredSchema
  if (Array.isArray(raw['entities'])) {
    const entities = raw['entities'] as Array<{
      fields: Array<{
        name: string;
        field_type?: string;
        required?: boolean;
        description?: string | null;
      }>;
    }>;
    const fields: SchemaField[] = entities.flatMap((e) =>
      e.fields.map((f) => ({
        name: f.name,
        type: f.field_type ?? 'string',
        required: f.required ?? false,
        description: f.description ?? undefined,
      })),
    );
    return { fields };
  }

  if (
    typeof raw !== 'object' ||
    raw === null ||
    !Array.isArray(raw['fields'])
  ) {
    logger.warn(
      { path: p },
      'schema.json is malformed (missing fields array); ignoring',
    );
    return null;
  }

  return raw as unknown as StoredSchema;
}

/**
 * Write the canonical flat schema to disk atomically.
 */
export function writeStoredSchema(
  projectPath: string,
  schema: StoredSchema,
): void {
  atomicWriteFileSync(
    schemaFilePath(projectPath),
    JSON.stringify(schema, null, 2),
  );
}

/**
 * Convert a StoredSchema to the SchemaDefinition format required by the code generator.
 * Only use this when calling generateConnectorFiles().
 */
export function toGeneratorInput(schema: StoredSchema): SchemaDefinition {
  return {
    entities: [
      {
        name: 'Item',
        is_array: true,
        sample_count: schema.sampleData?.length ?? 0,
        description: null,
        fields: schema.fields.map((f) => ({
          name: f.name,
          field_type: (f.type as FieldType) ?? FieldType.STRING,
          required: f.required ?? false,
          description: f.description ?? null,
          nested_fields: [],
          example_value: undefined,
          is_array_item: false,
        })),
      },
    ],
    source_type: SchemaSourceType.MANUAL,
    raw_sample: null,
    inferred_at: new Date().toISOString(),
    version: '1.0',
  };
}
