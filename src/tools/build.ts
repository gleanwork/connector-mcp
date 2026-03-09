import { z } from 'zod';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  generateConnectorFiles,
  type GeneratorOptions,
} from '../core/code-generator.js';
import {
  TransformType,
  type FieldTransform,
  type MappingState,
  type MappingDecision,
  type MappingStatus,
  type DatasourceConfigState,
} from '../types/index.js';
import { readStoredSchema, toGeneratorInput } from '../lib/schema-store.js';
import { getProjectPath } from '../session.js';
import { formatNextSteps } from './workflow.js';

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

/**
 * Convert a stored transform string (e.g. "concat") to a FieldTransform object
 * suitable for the code generator. Returns null for direct/absent transforms.
 */
function storedTransformToFieldTransform(
  transform: string | null | undefined,
  sourcePath: string,
): FieldTransform | null {
  if (!transform) return null;

  const normalised = transform.trim().toLowerCase();

  switch (normalised) {
    case TransformType.CONCAT:
      return {
        transform_type: TransformType.CONCAT,
        source_paths: [sourcePath],
      };
    case TransformType.TEMPLATE:
      return {
        transform_type: TransformType.TEMPLATE,
        template: `{${sourcePath}}`,
        source_paths: [sourcePath],
      };
    case TransformType.EXTRACT:
      return {
        transform_type: TransformType.EXTRACT,
        template: '',
        source_paths: [sourcePath],
      };
    case TransformType.DEFAULT:
      return {
        transform_type: TransformType.DEFAULT,
        default_value: null,
        source_paths: [sourcePath],
      };
    case TransformType.CUSTOM:
      return {
        transform_type: TransformType.CUSTOM,
        source_paths: [sourcePath],
      };
    case TransformType.DIRECT:
    default:
      return null;
  }
}

export async function handleBuildConnector(
  params: z.infer<typeof buildConnectorSchema>,
  projectPath = getProjectPath(),
) {
  // Load required files
  const mappingsFile = join(projectPath, '.glean', 'mappings.json');
  const configFile = join(projectPath, '.glean', 'config.json');

  const storedSchema = readStoredSchema(projectPath);
  if (!storedSchema) {
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

  const schema = toGeneratorInput(storedSchema);
  let rawMappings: {
    mappings: Array<{
      source_field: string;
      glean_field: string;
      transform?: string | null;
    }>;
  };
  let config: Partial<DatasourceConfigState>;

  try {
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
      transform: storedTransformToFieldTransform(m.transform, m.source_field),
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
            text:
              [
                '## connector.py (preview)',
                generated.connector,
                '## models.py (preview)',
                generated.models,
                '',
                'Run build_connector with dry_run: false to write these files.',
              ].join('\n') +
              formatNextSteps([
                {
                  label: 'Write Files',
                  description:
                    'run build_connector with dry_run: false to write the files',
                  tool: 'build_connector',
                },
                {
                  label: 'Run Connector',
                  description: 'execute the connector and start ingesting data',
                  tool: 'run_connector',
                },
              ]),
          },
        ],
      };
    }

    // Write files to src/{moduleName}/ — matches Copier template structure
    const srcDir = join(projectPath, 'src', moduleName);
    mkdirSync(srcDir, { recursive: true });

    const connectorFilePath = join(srcDir, 'connector.py');
    const overwriteWarnings: string[] = [];

    if (existsSync(connectorFilePath)) {
      const existing = readFileSync(connectorFilePath, 'utf8');
      if (!existing.includes('from glean.indexing import')) {
        overwriteWarnings.push(
          `⚠ src/${moduleName}/connector.py appears to have been customized and will be overwritten.`,
        );
      }
    }

    writeFileSync(connectorFilePath, generated.connector);
    writeFileSync(join(srcDir, 'models.py'), generated.models);
    writeFileSync(join(srcDir, 'mock_data.json'), generated.mockData);

    const warningText =
      overwriteWarnings.length > 0 ? '\n\n' + overwriteWarnings.join('\n') : '';

    return {
      content: [
        {
          type: 'text' as const,
          text:
            [
              'Generated files written:',
              `  src/${moduleName}/connector.py — connector class with transform() method`,
              `  src/${moduleName}/models.py — SourceDocument TypedDict`,
              `  src/${moduleName}/mock_data.json — sample data for local testing`,
              '',
              'Next: run run_connector to test execution against your data source.',
            ].join('\n') +
            formatNextSteps([
              {
                label: 'Run Connector',
                description: 'execute the connector and start ingesting data',
                tool: 'run_connector',
              },
            ]) +
            warningText,
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
