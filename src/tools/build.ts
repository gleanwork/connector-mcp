import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Convert either a flat {fields:[]} schema (from update_schema) or a full
 * SchemaDefinition (from infer_schema with save:true) into the SchemaDefinition
 * format required by the code generator.
 */
function toSchemaDefinition(raw: Record<string, unknown>): SchemaDefinition {
  // Already a SchemaDefinition — has entities array
  if (Array.isArray(raw['entities'])) {
    return raw as unknown as SchemaDefinition;
  }

  // Flat format from update_schema: { fields: [{name, type, required}] }
  const flatFields =
    (raw['fields'] as Array<{
      name: string;
      type?: string;
      required?: boolean;
    }>) ?? [];
  return {
    entities: [
      {
        name: 'Item',
        is_array: true,
        sample_count: 0,
        description: null,
        fields: flatFields.map((f) => ({
          name: f.name,
          field_type: (f.type as FieldType | undefined) ?? FieldType.STRING,
          required: f.required ?? false,
          description: null,
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

import {
  generateConnectorFiles,
  type GeneratorOptions,
} from '../core/code-generator.js';
import {
  FieldType,
  SchemaSourceType,
  type SchemaDefinition,
  type MappingState,
  type MappingDecision,
  type MappingStatus,
  type DatasourceConfigState,
} from '../types/index.js';
import { getProjectPath } from '../session.js';

export const buildConnectorSchema = z.object({
  dry_run: z
    .boolean()
    .default(true)
    .describe(
      'If true, return generated code as text without writing files. ' +
        'Set to false to write connector.py, models.py, and mock_data.json.',
    ),
  connector_name: z
    .string()
    .optional()
    .describe('Class name for the connector (defaults to "Connector")'),
  datasource_type: z
    .enum(['basic', 'streaming', 'async_streaming'])
    .optional()
    .default('basic')
    .describe('Connector base class type'),
});

export async function handleBuildConnector(
  params: z.infer<typeof buildConnectorSchema>,
  projectPath = getProjectPath(),
) {
  // Load required files
  const schemaFile = join(projectPath, '.glean', 'schema.json');
  const mappingsFile = join(projectPath, '.glean', 'mappings.json');
  const configFile = join(projectPath, '.glean', 'config.json');

  if (!existsSync(schemaFile)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Error: schema not found. Run infer_schema or update_schema first.',
        },
      ],
    };
  }
  if (!existsSync(mappingsFile)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'Error: mappings not found. Run confirm_mappings first.',
        },
      ],
    };
  }

  let schema: SchemaDefinition;
  let rawMappings: {
    mappings: Array<{
      source_field: string;
      glean_field: string;
      transform?: string | null;
    }>;
  };
  let config: Partial<DatasourceConfigState>;

  try {
    const rawSchema = JSON.parse(readFileSync(schemaFile, 'utf8')) as Record<
      string,
      unknown
    >;
    schema = toSchemaDefinition(rawSchema);
    rawMappings = JSON.parse(
      readFileSync(mappingsFile, 'utf8'),
    ) as typeof rawMappings;
    config = existsSync(configFile)
      ? (JSON.parse(
          readFileSync(configFile, 'utf8'),
        ) as Partial<DatasourceConfigState>)
      : {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        { type: 'text' as const, text: `Error reading project files: ${msg}` },
      ],
    };
  }

  // Build MappingState from flat mappings file format
  const decisions: MappingDecision[] = rawMappings.mappings.map((m) => ({
    field_mapping: {
      source_path: m.source_field,
      target_field: m.glean_field,
      transform: null,
      confidence: 1,
    },
    status: 'confirmed' as MappingStatus,
    user_note: null,
    decided_at: new Date().toISOString(),
  }));

  const mappingState: MappingState = {
    decisions,
    completeness_score: 1,
    required_fields_mapped: true,
    validation_errors: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Normalise config with defaults
  const fullConfig: DatasourceConfigState = {
    name: config.name ?? 'my-datasource',
    display_name: config.display_name ?? 'My Datasource',
    datasource_category: config.datasource_category ?? 'PUBLISHED_CONTENT',
    connector_type: config.connector_type ?? 'basic',
    object_definitions: config.object_definitions ?? [],
    url_regex: config.url_regex,
    icon_url: config.icon_url,
  };

  const connectorName = params.connector_name ?? 'Connector';
  const moduleName = connectorName.toLowerCase().replace(/[^a-z0-9]/g, '_');

  const options: GeneratorOptions = {
    moduleName,
    connectorName,
    displayName: fullConfig.display_name,
    datasourceType: params.datasource_type ?? 'basic',
  };

  try {
    const generated = generateConnectorFiles(
      schema,
      mappingState,
      fullConfig,
      options,
    );

    if (params.dry_run) {
      return {
        content: [
          {
            type: 'text' as const,
            text: [
              '## connector.py (preview)',
              generated.connector,
              '## models.py (preview)',
              generated.models,
              '',
              'Run build_connector with dry_run: false to write these files.',
            ].join('\n'),
          },
        ],
      };
    }

    // Write files
    writeFileSync(join(projectPath, 'connector.py'), generated.connector);
    writeFileSync(join(projectPath, 'models.py'), generated.models);
    writeFileSync(join(projectPath, 'mock_data.json'), generated.mockData);

    return {
      content: [
        {
          type: 'text' as const,
          text: [
            'Generated files written:',
            '  connector.py — connector class with transform() method',
            '  models.py — SourceDocument TypedDict',
            '  mock_data.json — sample data for local testing',
            '',
            'Next: run run_connector to test execution against your data source.',
          ].join('\n'),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        { type: 'text' as const, text: `Error generating connector: ${msg}` },
      ],
    };
  }
}
