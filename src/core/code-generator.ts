/**
 * Code generator — produces Python connector source files from the
 * schema, mappings, and config collected during the authoring phases.
 *
 * Adapted from glean-connector-studio. No changes to generation logic.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  FieldType,
  MappingStatus,
  TransformType,
  type SchemaDefinition,
  type MappingState,
  type MappingDecision,
  type DatasourceConfigState,
  type EntityType,
  type FieldTransform,
} from '../types/index.js';
import { getLogger } from '../lib/logger.js';

const logger = getLogger('code-generator');

// ── Public types ────────────────────────────────────────────────

export interface GeneratorOptions {
  moduleName: string;
  connectorName: string;
  displayName: string;
  datasourceType: 'basic' | 'streaming' | 'async_streaming';
}

export interface GeneratedFiles {
  models: string;
  connector: string;
  mockData: string;
}

// ── Entry points ────────────────────────────────────────────────

/**
 * Generate Python source code for connector project files.
 */
export function generateConnectorFiles(
  schema: SchemaDefinition,
  mappings: MappingState,
  config: DatasourceConfigState,
  options: GeneratorOptions,
): GeneratedFiles {
  const entity = findPrimaryEntity(schema);
  const confirmed = mappings.decisions.filter(
    (d) =>
      d.status === MappingStatus.CONFIRMED ||
      d.status === MappingStatus.MODIFIED,
  );

  logger.info(
    {
      entityName: entity.name,
      fieldCount: entity.fields.length,
      mappingCount: confirmed.length,
      connectorName: options.connectorName,
    },
    'Generating connector code',
  );

  return {
    models: generateModels(entity),
    connector: generateConnector(confirmed, config, options),
    mockData: generateMockData(schema, entity),
  };
}

/**
 * Write generated files into a Copier-scaffolded project directory.
 */
export function writeGeneratedFiles(
  outputDirectory: string,
  moduleName: string,
  files: GeneratedFiles,
): void {
  const srcDir = join(outputDirectory, 'src', moduleName);

  writeFileSync(join(srcDir, 'models.py'), files.models);
  writeFileSync(join(srcDir, 'connector.py'), files.connector);
  writeFileSync(join(srcDir, 'mock_data.json'), files.mockData);

  logger.info(
    { outputDirectory, moduleName },
    'Wrote generated connector files',
  );
}

// ── Schema → models.py ─────────────────────────────────────────

function generateModels(entity: EntityType): string {
  const needsAny = entity.fields.some((f) =>
    [FieldType.ARRAY, FieldType.OBJECT, FieldType.UNKNOWN].includes(
      f.field_type,
    ),
  );

  const typingImport = needsAny
    ? 'from typing import Any, TypedDict'
    : 'from typing import TypedDict';

  const lines: string[] = [
    'from __future__ import annotations',
    '',
    typingImport,
    '',
    '',
    'class SourceDocument(TypedDict):',
    `    """Raw document from the external data source (${entity.name})."""`,
    '',
  ];

  if (entity.fields.length === 0) {
    lines.push('    pass');
  } else {
    for (const field of entity.fields) {
      const pyType = fieldTypeToPython(field.field_type);
      const safeName = sanitizeFieldName(field.name);
      if (safeName !== field.name) {
        lines.push(`    ${safeName}: ${pyType}  # original: ${field.name}`);
      } else {
        lines.push(`    ${safeName}: ${pyType}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ── Mappings + Config → connector.py ────────────────────────────

function generateConnector(
  mappings: MappingDecision[],
  config: DatasourceConfigState,
  options: GeneratorOptions,
): string {
  const targets = new Set(mappings.map((m) => m.field_mapping.target_field));
  const needsContent = targets.has('body');
  const needsUser = targets.has('author');
  const needsPermissions = targets.has('permissions');
  const needsDatetime = targets.has('createdAt') || targets.has('updatedAt');
  const needsRegex = mappings.some(
    (m) => m.field_mapping.transform?.transform_type === TransformType.EXTRACT,
  );
  const { baseClass, importName } = getBaseClassInfo(options.datasourceType);

  // ── Imports ──
  const lines: string[] = ['from __future__ import annotations', ''];

  if (needsDatetime) lines.push('import datetime');
  if (needsRegex) lines.push('import re');
  lines.push('from collections.abc import Sequence');
  lines.push('');
  lines.push(`from glean.indexing import ${importName}`);

  const modelImports: string[] = [];
  if (needsContent) modelImports.push('ContentDefinition');
  modelImports.push('CustomDatasourceConfig');
  modelImports.push('DocumentDefinition');
  if (needsPermissions) modelImports.push('DocumentPermissionsDefinition');
  if (needsUser) modelImports.push('UserReferenceDefinition');

  lines.push('from glean.indexing.models import (');
  for (const imp of modelImports) {
    lines.push(`    ${imp},`);
  }
  lines.push(')');
  lines.push('');
  lines.push(`from ${options.moduleName}.models import SourceDocument`);
  lines.push('');
  lines.push('');

  // ── Class ──
  lines.push(`class Connector(${baseClass}[SourceDocument]):`);
  lines.push(
    '    """Transforms source documents into Glean DocumentDefinitions."""',
  );
  lines.push('');

  // ── Configuration ──
  lines.push('    configuration = CustomDatasourceConfig(');
  lines.push(`        name="${escPy(config.name)}",`);
  lines.push(`        display_name="${escPy(config.display_name)}",`);
  if (config.datasource_category) {
    lines.push(
      `        datasource_category="${escPy(config.datasource_category)}",`,
    );
  }
  if (config.url_regex) {
    lines.push(`        url_regex="${escPy(config.url_regex)}",`);
  }
  lines.push('    )');
  lines.push('');

  // ── Transform method ──
  lines.push(
    '    def transform(self, data: Sequence[SourceDocument]) -> Sequence[DocumentDefinition]:',
  );
  lines.push(
    '        """Convert source documents to Glean document definitions."""',
  );
  lines.push('        documents: list[DocumentDefinition] = []');
  lines.push('        for record in data:');
  lines.push('            doc = DocumentDefinition(');
  lines.push(`                datasource="${escPy(config.name)}",`);

  for (const mapping of mappings) {
    const assignment = generateFieldAssignment(mapping);
    if (assignment) lines.push(assignment);
  }

  lines.push('            )');
  lines.push('            documents.append(doc)');
  lines.push('        return documents');
  lines.push('');

  return lines.join('\n');
}

function generateFieldValue(mapping: MappingDecision): string {
  const transform = mapping.field_mapping.transform;
  const sourceField = mapping.field_mapping.source_path;

  if (!transform || transform.transform_type === TransformType.DIRECT) {
    return `record${pathToAccess(sourceField)}`;
  }

  return applyTransform(transform, sourceField);
}

function applyTransform(
  transform: FieldTransform,
  primarySourcePath: string,
): string {
  switch (transform.transform_type) {
    case TransformType.DEFAULT: {
      const defaultVal = toPythonLiteral(transform.default_value ?? null);
      return `record.get('${primarySourcePath}', ${defaultVal})`;
    }

    case TransformType.CONCAT: {
      const fields =
        transform.source_paths.length > 0
          ? transform.source_paths
          : [primarySourcePath];
      const parts = fields.map((f) => `str(record.get('${f}', ''))`).join(', ');
      return `' '.join([${parts}])`;
    }

    case TransformType.TEMPLATE: {
      const templateStr = transform.template ?? '';
      const interpolated = templateStr.replace(
        /\{(\w+)\}/g,
        (_match, fieldName: string) => {
          return `{record.get('${fieldName}', '')}`;
        },
      );
      return `f"${interpolated}"`;
    }

    case TransformType.EXTRACT: {
      const pattern = transform.template ?? '';
      const group = transform.custom_code ?? '0';
      return `(lambda _m: _m.group(${group}) if _m else None)(re.search(r'${pattern}', record.get('${primarySourcePath}', '') or ''))`;
    }

    case TransformType.CUSTOM: {
      return (
        transform.custom_code ?? `record${pathToAccess(primarySourcePath)}`
      );
    }

    default:
      return `record${pathToAccess(primarySourcePath)}`;
  }
}

function generateFieldAssignment(mapping: MappingDecision): string | null {
  const target = mapping.field_mapping.target_field;
  const access = generateFieldValue(mapping);

  switch (target) {
    case 'datasourceObjectId':
      return `                id=${access},`;
    case 'title':
      return `                title=${access},`;
    case 'viewURL':
      return `                view_url=${access},`;
    case 'body':
      return [
        '                body=ContentDefinition(',
        '                    mime_type="text/plain",',
        `                    text_content=${access},`,
        '                ),',
      ].join('\n');
    case 'author':
      return `                author=UserReferenceDefinition(name=${access}),`;
    case 'createdAt':
      return [
        '                created_at=int(',
        `                    datetime.datetime.fromisoformat(${access}.replace("Z", "+00:00")).timestamp()`,
        '                ),',
      ].join('\n');
    case 'updatedAt':
      return [
        '                updated_at=int(',
        `                    datetime.datetime.fromisoformat(${access}.replace("Z", "+00:00")).timestamp()`,
        '                ),',
      ].join('\n');
    case 'tags':
      return `                tags=${access},`;
    case 'container':
      return `                container=${access},`;
    case 'mimeType':
      return `                mime_type=${access},`;
    case 'permissions':
      return `                permissions=DocumentPermissionsDefinition(\n                    allow_anonymous_access=${access},\n                ),`;
    default:
      logger.warn(
        { target_field: target },
        'Unrecognized target_field in mapping — assignment will be skipped',
      );
      return null;
  }
}

// ── Schema → mock_data.json ─────────────────────────────────────

function generateMockData(
  schema: SchemaDefinition,
  entity: EntityType,
): string {
  if (schema.raw_sample) {
    if (Array.isArray(schema.raw_sample)) {
      return JSON.stringify(schema.raw_sample, null, 2) + '\n';
    }
    return JSON.stringify([schema.raw_sample], null, 2) + '\n';
  }

  const sampleRecord: Record<string, unknown> = {};
  for (const field of entity.fields) {
    sampleRecord[field.name] =
      field.example_value ?? getDefaultValue(field.field_type);
  }

  return JSON.stringify([sampleRecord], null, 2) + '\n';
}

// ── Helpers ──────────────────────────────────────────────────────

const PYTHON_RESERVED_WORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
]);

function sanitizeFieldName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^\d/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }
  if (PYTHON_RESERVED_WORDS.has(sanitized)) {
    sanitized = 'field_' + sanitized;
  }
  return sanitized;
}

function findPrimaryEntity(schema: SchemaDefinition): EntityType {
  const arrayEntity = schema.entities.find((e) => e.is_array);
  return (
    arrayEntity ??
    schema.entities[0] ?? {
      name: 'Item',
      fields: [],
      description: null,
      is_array: true,
      sample_count: 0,
    }
  );
}

function fieldTypeToPython(ft: FieldType): string {
  switch (ft) {
    case FieldType.STRING:
      return 'str';
    case FieldType.INTEGER:
      return 'int';
    case FieldType.NUMBER:
      return 'float';
    case FieldType.BOOLEAN:
      return 'bool';
    case FieldType.DATE:
    case FieldType.DATETIME:
      return 'str';
    case FieldType.ARRAY:
      return 'list[Any]';
    case FieldType.OBJECT:
      return 'dict[str, Any]';
    case FieldType.NULL:
      return 'str | None';
    case FieldType.UNKNOWN:
      return 'Any';
    default:
      return 'Any';
  }
}

function pathToAccess(sourcePath: string): string {
  if (!sourcePath || sourcePath.trim() === '') return '';
  const segments = sourcePath.split('.').filter((s) => s !== '');
  if (segments.length === 0) return '';
  return segments.map((s) => `["${escPy(s)}"]`).join('');
}

function escPy(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\0/g, '\\0')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}

function toPythonLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `'${escaped}'`;
  }
  return JSON.stringify(value);
}

function getBaseClassInfo(datasourceType: string): {
  baseClass: string;
  importName: string;
} {
  switch (datasourceType) {
    case 'streaming':
      return {
        baseClass: 'BaseStreamingDatasourceConnector',
        importName: 'BaseStreamingDatasourceConnector',
      };
    case 'async_streaming':
      return {
        baseClass: 'BaseAsyncStreamingDatasourceConnector',
        importName: 'BaseAsyncStreamingDatasourceConnector',
      };
    default:
      return {
        baseClass: 'BaseDatasourceConnector',
        importName: 'BaseDatasourceConnector',
      };
  }
}

function getDefaultValue(ft: FieldType): unknown {
  switch (ft) {
    case FieldType.STRING:
      return 'example';
    case FieldType.INTEGER:
      return 1;
    case FieldType.NUMBER:
      return 1.0;
    case FieldType.BOOLEAN:
      return true;
    case FieldType.DATE:
      return '2024-01-15';
    case FieldType.DATETIME:
      return '2024-01-15T09:00:00Z';
    case FieldType.ARRAY:
      return [];
    case FieldType.OBJECT:
      return {};
    default:
      return null;
  }
}
