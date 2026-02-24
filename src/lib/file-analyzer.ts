/**
 * File analyzer — parses CSV / JSON / NDJSON files and returns
 * per-field statistics useful for schema inference.
 */

import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

export interface FieldAnalysis {
  name: string;
  detectedType: 'string' | 'number' | 'boolean' | 'datetime' | 'object' | 'array' | 'null';
  nullRate: number;
  cardinality: number;
  samples: unknown[];
  totalRecords: number;
}

export function analyzeFile(filePath: string): FieldAnalysis[] {
  const ext = extname(filePath).toLowerCase();
  const raw = readFileSync(filePath, 'utf8');

  let records: Record<string, unknown>[];

  if (ext === '.csv') {
    records = parse(raw, { columns: true, skip_empty_lines: true }) as Record<string, unknown>[];
  } else if (ext === '.json') {
    const parsed = JSON.parse(raw) as unknown;
    records = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : [parsed as Record<string, unknown>];
  } else if (ext === '.ndjson' || ext === '.jsonl') {
    records = raw
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  } else {
    throw new Error(
      `Unsupported file type: ${ext}. Supported: .csv, .json, .ndjson, .jsonl`,
    );
  }

  if (records.length === 0) return [];

  const fields = Object.keys(records[0] ?? {});
  return fields.map((field) => analyzeField(field, records));
}

function analyzeField(name: string, records: Record<string, unknown>[]): FieldAnalysis {
  const values = records.map((r) => r[name]);
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== '');
  const samples = [...new Set(nonNull)].slice(0, 5);
  const cardinality = new Set(nonNull.map(String)).size;

  return {
    name,
    detectedType: detectType(nonNull[0]),
    nullRate: values.length > 0 ? (values.length - nonNull.length) / values.length : 0,
    cardinality,
    samples,
    totalRecords: records.length,
  };
}

function detectType(value: unknown): FieldAnalysis['detectedType'] {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'datetime';
    if (!isNaN(Number(value)) && value.trim() !== '') return 'number';
  }
  return 'string';
}
