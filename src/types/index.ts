/**
 * Consolidated types for the Glean Connector MCP server.
 *
 * Derived from glean-connector-studio types, with HTTP-specific
 * and project-store types removed.
 */

// ── Field / Schema types ────────────────────────────────────────

export enum FieldType {
  STRING = 'string',
  INTEGER = 'integer',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
  DATE = 'date',
  DATETIME = 'datetime',
  NULL = 'null',
  UNKNOWN = 'unknown',
}

export enum SchemaSourceType {
  JSON = 'json',
  OPENAPI = 'openapi',
  GRAPHQL = 'graphql',
  MANUAL = 'manual',
}

export interface FieldDefinition {
  name: string;
  field_type: FieldType;
  required: boolean;
  description?: string | null;
  nested_fields: FieldDefinition[];
  example_value?: unknown;
  is_array_item: boolean;
}

export interface EntityType {
  name: string;
  fields: FieldDefinition[];
  description?: string | null;
  is_array: boolean;
  sample_count: number;
}

export interface SchemaDefinition {
  entities: EntityType[];
  source_type: SchemaSourceType;
  raw_sample?: Record<string, unknown> | unknown[] | null;
  inferred_at: string;
  version: string;
}

// ── Mapping types ───────────────────────────────────────────────

export enum MappingStatus {
  PROPOSED = 'proposed',
  CONFIRMED = 'confirmed',
  REJECTED = 'rejected',
  MODIFIED = 'modified',
}

export enum TransformType {
  DIRECT = 'direct',
  CONCAT = 'concat',
  TEMPLATE = 'template',
  EXTRACT = 'extract',
  DEFAULT = 'default',
  CUSTOM = 'custom',
}

export interface FieldTransform {
  transform_type: TransformType;
  template?: string | null;
  default_value?: unknown;
  source_paths: string[];
  custom_code?: string | null;
}

export interface FieldMapping {
  source_path: string;
  target_field: string;
  transform?: FieldTransform | null;
  confidence: number;
  reasoning?: string | null;
}

export interface MappingDecision {
  field_mapping: FieldMapping;
  status: MappingStatus;
  user_note?: string | null;
  decided_at?: string | null;
}

export interface MappingState {
  decisions: MappingDecision[];
  completeness_score: number;
  required_fields_mapped: boolean;
  validation_errors: string[];
  created_at: string;
  updated_at: string;
}

// ── Datasource configuration types ──────────────────────────────

export type PropertyType = 'TEXT' | 'DATE' | 'INT' | 'USERID' | 'PICKLIST' | 'TEXTLIST';
export type UiOption = 'NONE' | 'SEARCH_RESULT' | 'DOC_HOVERCARD';

export interface PropertyDefinitionConfig {
  name: string;
  display_label: string;
  display_label_plural?: string;
  property_type: PropertyType;
  ui_options: UiOption;
  hide_ui_facet?: boolean;
  ui_facet_order?: number;
}

export interface ObjectDefinitionConfig {
  name: string;
  display_label: string;
  doc_category?: string;
  property_definitions: PropertyDefinitionConfig[];
}

export interface DatasourceConfigState {
  name: string;
  display_name: string;
  datasource_category: string;
  url_regex?: string;
  icon_url?: string;
  connector_type: string;
  is_entity_datasource?: boolean;
  is_test_datasource?: boolean;
  is_user_referenced_by_email?: boolean;
  object_definitions: ObjectDefinitionConfig[];
  home_url?: string;
  suggestion_text?: string;
}

// ── Execution types ─────────────────────────────────────────────

export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ABORTED = 'aborted',
}

export interface RecordingMetadata {
  recording_id: string;
  connector_name: string;
  created_at: string;
  record_count: number;
  data_source_type?: string | null;
  duration_ms?: number | null;
}

export interface RecordingInfo {
  recording_id: string;
  filename: string;
  connector_name: string;
  created_at: string;
  record_count: number;
  file_size_bytes: number;
  path: string;
}

// ── Validation rule types ────────────────────────────────────────

export enum IssueSeverity {
  WARNING = 'warning',
  ERROR = 'error',
}

export enum ValidationRuleCode {
  MISSING_PERMISSIONS = 'MISSING_PERMISSIONS',
  EMPTY_TITLE = 'EMPTY_TITLE',
  LARGE_BODY = 'LARGE_BODY',
  MISSING_URL = 'MISSING_URL',
  STALE_TIMESTAMP = 'STALE_TIMESTAMP',
  INVALID_MIME_TYPE = 'INVALID_MIME_TYPE',
}

export interface ValidationRuleConfig {
  code: ValidationRuleCode;
  enabled: boolean;
  severity: IssueSeverity;
}

export interface ValidationRulesConfiguration {
  rules: ValidationRuleConfig[];
}
