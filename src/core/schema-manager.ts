/**
 * Schema manager — infers and stores schema definitions from JSON data and OpenAPI specs.
 *
 * Adapted from glean-connector-studio. Takes a projectPath directly instead
 * of looking up a project from a project store.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getLogger } from '../lib/logger.js';
import { atomicWriteFileSync } from './fs-utils.js';
import {
  FieldType,
  SchemaSourceType,
  type EntityType,
  type FieldDefinition,
  type SchemaDefinition,
} from '../types/index.js';

const logger = getLogger('schema-manager');

const SCHEMA_FILE = '.glean/schema.json';

export class SchemaManager {
  private schema: SchemaDefinition | null = null;

  constructor(public readonly projectPath: string) {}

  private getStoragePath(): string {
    return join(this.projectPath, SCHEMA_FILE);
  }

  load(): SchemaDefinition | null {
    const storagePath = this.getStoragePath();
    if (!existsSync(storagePath)) return null;

    try {
      const data = JSON.parse(readFileSync(storagePath, 'utf-8')) as SchemaDefinition;
      this.schema = data;
      logger.info({ entityCount: data.entities.length }, 'Loaded schema');
      return this.schema;
    } catch (e) {
      logger.error({ err: e }, 'Failed to load schema');
      return null;
    }
  }

  save(schema: SchemaDefinition): void {
    const storagePath = this.getStoragePath();
    atomicWriteFileSync(storagePath, JSON.stringify(schema, null, 2));
    this.schema = schema;
    logger.info({ path: storagePath, entityCount: schema.entities.length }, 'Saved schema');
  }

  inferFromJson(
    jsonData: Record<string, unknown> | unknown[],
    entityName?: string | null,
  ): SchemaDefinition {
    logger.info(
      { dataType: Array.isArray(jsonData) ? 'array' : 'object' },
      'Inferring schema from JSON',
    );

    const entities: EntityType[] = [];

    if (Array.isArray(jsonData)) {
      if (jsonData.length > 0 && isObject(jsonData[0])) {
        const name = entityName ?? 'Item';
        const fields = this.inferFieldsFromObjects(jsonData as Record<string, unknown>[]);
        entities.push({
          name,
          fields,
          description: `Collection of ${name} objects`,
          is_array: true,
          sample_count: jsonData.length,
        });
      }
    } else if (isObject(jsonData)) {
      const name = entityName ?? 'Root';
      const fields = this.inferFieldsFromObject(jsonData);
      entities.push({
        name,
        fields,
        description: `${name} entity`,
        is_array: false,
        sample_count: 1,
      });
      entities.push(...this.extractNestedEntities(jsonData));
    }

    const schema: SchemaDefinition = {
      entities,
      source_type: SchemaSourceType.JSON,
      raw_sample: jsonData as Record<string, unknown> | unknown[],
      inferred_at: new Date().toISOString(),
      version: '1.0',
    };

    logger.info(
      {
        entityCount: entities.length,
        totalFields: entities.reduce((sum, e) => sum + e.fields.length, 0),
      },
      'Inferred schema',
    );

    return schema;
  }

  private inferFieldsFromObjects(objects: Record<string, unknown>[]): FieldDefinition[] {
    const allFields = new Map<string, FieldDefinition>();
    const fieldPresence = new Map<string, number>();

    for (const obj of objects) {
      for (const [key, value] of Object.entries(obj)) {
        fieldPresence.set(key, (fieldPresence.get(key) ?? 0) + 1);

        if (!allFields.has(key)) {
          allFields.set(key, this.createFieldDefinition(key, value));
        } else {
          const existing = allFields.get(key)!;
          const newType = this.inferType(value);

          if (existing.field_type !== newType && newType !== FieldType.NULL) {
            if (existing.field_type === FieldType.NULL) {
              existing.field_type = newType;
            } else if (
              [FieldType.INTEGER, FieldType.NUMBER].includes(existing.field_type) &&
              [FieldType.INTEGER, FieldType.NUMBER].includes(newType)
            ) {
              existing.field_type = FieldType.NUMBER;
            }
          }
        }
      }
    }

    const totalObjects = objects.length;
    for (const [key, field] of allFields) {
      field.required = (fieldPresence.get(key) ?? 0) === totalObjects;
    }

    return [...allFields.values()];
  }

  private inferFieldsFromObject(obj: Record<string, unknown>): FieldDefinition[] {
    return Object.entries(obj).map(([key, value]) => this.createFieldDefinition(key, value));
  }

  private createFieldDefinition(name: string, value: unknown): FieldDefinition {
    const fieldType = this.inferType(value);
    let nestedFields: FieldDefinition[] = [];

    if (fieldType === FieldType.OBJECT && isObject(value)) {
      nestedFields = this.inferFieldsFromObject(value as Record<string, unknown>);
    } else if (fieldType === FieldType.ARRAY && Array.isArray(value) && value.length > 0) {
      if (isObject(value[0])) {
        nestedFields = this.inferFieldsFromObjects(value as Record<string, unknown>[]);
      }
    }

    return {
      name,
      field_type: fieldType,
      required: false,
      description: null,
      nested_fields: nestedFields,
      example_value: this.getExampleValue(value),
      is_array_item: false,
    };
  }

  private inferType(value: unknown): FieldType {
    if (value === null || value === undefined) return FieldType.NULL;
    if (typeof value === 'boolean') return FieldType.BOOLEAN;
    if (typeof value === 'number') {
      return Number.isInteger(value) ? FieldType.INTEGER : FieldType.NUMBER;
    }
    if (typeof value === 'string') {
      if (this.isDatetime(value)) return FieldType.DATETIME;
      if (this.isDate(value)) return FieldType.DATE;
      return FieldType.STRING;
    }
    if (Array.isArray(value)) return FieldType.ARRAY;
    if (isObject(value)) return FieldType.OBJECT;
    return FieldType.UNKNOWN;
  }

  private isDatetime(value: string): boolean {
    return (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) ||
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)
    );
  }

  private isDate(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private getExampleValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') {
      return value.length > 100 ? value.slice(0, 100) : value;
    }
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (isObject(value)) {
      return `{${Object.keys(value as Record<string, unknown>).length} fields}`;
    }
    return String(value).slice(0, 100);
  }

  private extractNestedEntities(obj: Record<string, unknown>, prefix = ''): EntityType[] {
    const entities: EntityType[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;

      if (Array.isArray(value) && value.length > 0 && isObject(value[0])) {
        const entityName = this.toEntityName(key);
        const fields = this.inferFieldsFromObjects(value as Record<string, unknown>[]);
        entities.push({
          name: entityName,
          fields,
          description: `Nested collection at ${fullPath}`,
          is_array: true,
          sample_count: value.length,
        });
        for (const item of value) {
          if (isObject(item)) {
            entities.push(
              ...this.extractNestedEntities(item as Record<string, unknown>, fullPath),
            );
          }
        }
      } else if (isObject(value)) {
        entities.push(...this.extractNestedEntities(value as Record<string, unknown>, fullPath));
      }
    }

    return entities;
  }

  private toEntityName(key: string): string {
    const words = key.split(/[_\-\s]|(?=[A-Z])/).filter((w) => w.length > 0);
    let name = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    if (name.endsWith('s') && name.length > 1) {
      name = name.slice(0, -1);
    }
    return name;
  }

  parseOpenapi(spec: Record<string, unknown>): SchemaDefinition {
    logger.info('Parsing OpenAPI specification');

    const entities: EntityType[] = [];

    // OpenAPI 3.x: components.schemas
    let schemas =
      ((spec['components'] as Record<string, unknown> | undefined)?.['schemas'] as
        | Record<string, Record<string, unknown>>
        | undefined) ?? {};

    // Swagger 2.x fallback: definitions
    if (Object.keys(schemas).length === 0) {
      schemas = (spec['definitions'] as Record<string, Record<string, unknown>>) ?? {};
    }

    for (const [name, schemaDef] of Object.entries(schemas)) {
      const entity = this.parseOpenapiSchema(name, schemaDef, schemas);
      if (entity) entities.push(entity);
    }

    // Fallback: extract from paths
    if (entities.length === 0) {
      entities.push(...this.extractEntitiesFromPaths(spec));
    }

    const schema: SchemaDefinition = {
      entities,
      source_type: SchemaSourceType.OPENAPI,
      raw_sample: spec,
      inferred_at: new Date().toISOString(),
      version: '1.0',
    };

    logger.info({ entityCount: entities.length }, 'Parsed OpenAPI schema');

    return schema;
  }

  private parseOpenapiSchema(
    name: string,
    schemaDef: Record<string, unknown>,
    allSchemas: Record<string, Record<string, unknown>>,
  ): EntityType | null {
    if ((schemaDef['type'] as string | undefined) !== 'object' && !('properties' in schemaDef)) {
      return null;
    }

    const properties = (schemaDef['properties'] as Record<string, Record<string, unknown>>) ?? {};
    const requiredFields = new Set((schemaDef['required'] as string[]) ?? []);

    const fields: FieldDefinition[] = Object.entries(properties).map(([propName, propDef]) =>
      this.parseOpenapiProperty(propName, propDef, allSchemas, requiredFields.has(propName)),
    );

    return {
      name,
      fields,
      description: (schemaDef['description'] as string | undefined) ?? null,
      is_array: false,
      sample_count: 0,
    };
  }

  private parseOpenapiProperty(
    name: string,
    propDef: Record<string, unknown>,
    allSchemas: Record<string, Record<string, unknown>>,
    required = false,
  ): FieldDefinition {
    // Handle $ref
    if ('$ref' in propDef) {
      const refName = (propDef['$ref'] as string).split('/').pop() ?? '';
      const refSchema = allSchemas[refName] ?? {};
      return {
        name,
        field_type: FieldType.OBJECT,
        required,
        description: (refSchema['description'] as string | undefined) ?? null,
        nested_fields: this.getNestedFieldsFromRef(refSchema, allSchemas),
        example_value: undefined,
        is_array_item: false,
      };
    }

    const propType = (propDef['type'] as string | undefined) ?? 'string';
    const fieldType = this.openapiTypeToFieldType(propType, propDef);

    let nestedFields: FieldDefinition[] = [];
    if (propType === 'object') {
      const nestedProps = (propDef['properties'] as Record<string, Record<string, unknown>>) ?? {};
      const nestedRequired = new Set((propDef['required'] as string[]) ?? []);
      nestedFields = Object.entries(nestedProps).map(([n, d]) =>
        this.parseOpenapiProperty(n, d, allSchemas, nestedRequired.has(n)),
      );
    } else if (propType === 'array') {
      const items = (propDef['items'] as Record<string, unknown>) ?? {};
      if ((items['type'] as string | undefined) === 'object' || '$ref' in items) {
        const itemField = this.parseOpenapiProperty('item', items, allSchemas);
        if (itemField.nested_fields.length > 0) {
          nestedFields = [{ ...itemField, is_array_item: true }];
        }
      }
    }

    return {
      name,
      field_type: fieldType,
      required,
      description: (propDef['description'] as string | undefined) ?? null,
      nested_fields: nestedFields,
      example_value: propDef['example'],
      is_array_item: false,
    };
  }

  private getNestedFieldsFromRef(
    refSchema: Record<string, unknown>,
    allSchemas: Record<string, Record<string, unknown>>,
  ): FieldDefinition[] {
    if ((refSchema['type'] as string | undefined) !== 'object') return [];

    const properties = (refSchema['properties'] as Record<string, Record<string, unknown>>) ?? {};
    const requiredFields = new Set((refSchema['required'] as string[]) ?? []);

    return Object.entries(properties).map(([propName, propDef]) =>
      this.parseOpenapiProperty(propName, propDef, allSchemas, requiredFields.has(propName)),
    );
  }

  private openapiTypeToFieldType(
    openapiType: string,
    propDef: Record<string, unknown>,
  ): FieldType {
    const typeMap: Record<string, FieldType> = {
      string: FieldType.STRING,
      integer: FieldType.INTEGER,
      number: FieldType.NUMBER,
      boolean: FieldType.BOOLEAN,
      array: FieldType.ARRAY,
      object: FieldType.OBJECT,
    };

    if (openapiType === 'string') {
      const fmt = (propDef['format'] as string | undefined) ?? '';
      if (fmt === 'date-time') return FieldType.DATETIME;
      if (fmt === 'date') return FieldType.DATE;
    }

    return typeMap[openapiType] ?? FieldType.UNKNOWN;
  }

  private extractEntitiesFromPaths(spec: Record<string, unknown>): EntityType[] {
    const entities: EntityType[] = [];
    const paths = (spec['paths'] as Record<string, Record<string, unknown>>) ?? {};

    for (const [path, methods] of Object.entries(paths)) {
      for (const [, details] of Object.entries(methods)) {
        if (!isObject(details)) continue;
        const det = details as Record<string, unknown>;

        const responses = (det['responses'] as Record<string, Record<string, unknown>>) ?? {};
        for (const [, response] of Object.entries(responses)) {
          if (!isObject(response)) continue;
          const resp = response as Record<string, unknown>;
          const content = (resp['content'] as Record<string, Record<string, unknown>>) ?? {};
          for (const [, mediaDef] of Object.entries(content)) {
            const schema =
              ((mediaDef as Record<string, unknown>)['schema'] as Record<string, unknown>) ?? {};
            if ((schema['type'] as string | undefined) === 'object') {
              const entityName = this.pathToEntityName(path);
              const properties = (schema['properties'] as Record<string, unknown>) ?? {};
              entities.push({
                name: entityName,
                fields: this.inferFieldsFromObject(properties),
                description: `Response from ${path}`,
                is_array: false,
                sample_count: 0,
              });
              break;
            }
          }
        }
      }
    }

    return entities;
  }

  private pathToEntityName(path: string): string {
    const cleaned = path.replace(/\{[^}]+\}/g, '').replace(/^\/+|\/+$/g, '');
    const parts = cleaned.split('/');
    const last = parts[parts.length - 1];
    return last ? this.toEntityName(last) : 'Entity';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
