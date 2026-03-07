import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeFile } from '../../src/lib/file-analyzer.js';

let dir: string;

beforeEach(() => {
  dir = join(
    tmpdir(),
    `file-analyzer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
});

function write(filename: string, content: string): string {
  const path = join(dir, filename);
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('CSV parsing', () => {
  it('parses headers and data rows', () => {
    const path = write(
      'data.csv',
      'id,name,score\n1,Alice,99\n2,Bob,87\n3,Carol,72',
    );
    const fields = analyzeFile(path);
    const names = fields.map((f) => f.name);
    expect(names).toContain('id');
    expect(names).toContain('name');
    expect(names).toContain('score');
    expect(fields[0].totalRecords).toBe(3);
  });

  it('throws for CSV with missing columns (inconsistent row lengths)', () => {
    // csv-parse enforces consistent column counts by default — short rows throw
    const path = write('missing.csv', 'a,b,c\n1,2,3\n4,5\n6');
    expect(() => analyzeFile(path)).toThrow();
  });
});

describe('JSON array input', () => {
  it('parses an array of objects', () => {
    const path = write(
      'array.json',
      JSON.stringify([
        { id: 1, label: 'foo' },
        { id: 2, label: 'bar' },
      ]),
    );
    const fields = analyzeFile(path);
    const names = fields.map((f) => f.name);
    expect(names).toContain('id');
    expect(names).toContain('label');
    expect(fields[0].totalRecords).toBe(2);
  });
});

describe('single JSON object', () => {
  it('wraps a plain object in an array and returns one record', () => {
    const path = write(
      'object.json',
      JSON.stringify({ key: 'value', num: 42 }),
    );
    const fields = analyzeFile(path);
    expect(fields[0].totalRecords).toBe(1);
    const names = fields.map((f) => f.name);
    expect(names).toContain('key');
    expect(names).toContain('num');
  });
});

describe('NDJSON / JSONL', () => {
  it('parses one JSON object per line (.ndjson)', () => {
    const lines = [
      JSON.stringify({ x: 1, y: 'a' }),
      JSON.stringify({ x: 2, y: 'b' }),
      JSON.stringify({ x: 3, y: 'c' }),
    ].join('\n');
    const path = write('data.ndjson', lines);
    const fields = analyzeFile(path);
    const names = fields.map((f) => f.name);
    expect(names).toContain('x');
    expect(names).toContain('y');
    expect(fields[0].totalRecords).toBe(3);
  });

  it('parses one JSON object per line (.jsonl)', () => {
    const lines = [
      JSON.stringify({ val: 10 }),
      JSON.stringify({ val: 20 }),
    ].join('\n');
    const path = write('data.jsonl', lines);
    const fields = analyzeFile(path);
    expect(fields[0].name).toBe('val');
  });
});

describe('empty file', () => {
  it('returns empty array for an empty CSV', () => {
    const path = write('empty.csv', '');
    const fields = analyzeFile(path);
    expect(fields).toEqual([]);
  });

  it('returns empty array for a JSON array with no elements', () => {
    const path = write('empty.json', '[]');
    const fields = analyzeFile(path);
    expect(fields).toEqual([]);
  });
});

describe('malformed JSON', () => {
  it('throws (does not silently swallow) a syntax error for bad .json', () => {
    const path = write('bad.json', '{ not valid json ]');
    expect(() => analyzeFile(path)).toThrow();
  });

  it('throws for malformed NDJSON lines', () => {
    const path = write('bad.ndjson', '{"ok":1}\nnot-json');
    expect(() => analyzeFile(path)).toThrow();
  });
});

describe('unsupported file type', () => {
  it('throws for unrecognized extensions', () => {
    const path = write('data.xml', '<root/>');
    expect(() => analyzeFile(path)).toThrow(/Unsupported/);
  });
});

describe('detectType heuristics', () => {
  it('detects integer strings from CSV as number', () => {
    const path = write('ints.csv', 'count\n1\n2\n3');
    const fields = analyzeFile(path);
    const count = fields.find((f) => f.name === 'count');
    expect(count?.detectedType).toBe('number');
  });

  it('detects ISO date strings as datetime', () => {
    const path = write(
      'dates.json',
      JSON.stringify([
        { ts: '2024-01-15T12:00:00Z' },
        { ts: '2024-02-20T08:30:00Z' },
      ]),
    );
    const fields = analyzeFile(path);
    const ts = fields.find((f) => f.name === 'ts');
    expect(ts?.detectedType).toBe('datetime');
  });

  it('detects plain date strings (YYYY-MM-DD) as datetime', () => {
    const path = write(
      'dates2.json',
      JSON.stringify([{ d: '2024-03-01' }, { d: '2024-04-15' }]),
    );
    const fields = analyzeFile(path);
    const d = fields.find((f) => f.name === 'd');
    expect(d?.detectedType).toBe('datetime');
  });

  it('detects all-null field as null type', () => {
    const path = write(
      'nulls.json',
      JSON.stringify([
        { a: null, b: 'hello' },
        { a: null, b: 'world' },
      ]),
    );
    const fields = analyzeFile(path);
    const a = fields.find((f) => f.name === 'a');
    expect(a?.detectedType).toBe('null');
  });

  it('reports 100% null rate for an all-null field', () => {
    const path = write(
      'nullrate.json',
      JSON.stringify([{ v: null }, { v: null }]),
    );
    const fields = analyzeFile(path);
    const v = fields.find((f) => f.name === 'v');
    expect(v?.nullRate).toBe(1);
  });

  it('uses first non-null value type for mixed fields', () => {
    // Current implementation: majority-vote across all non-null values; ties broken by first-seen order
    const path = write(
      'mixed.json',
      JSON.stringify([{ x: 42 }, { x: 'text' }, { x: null }]),
    );
    const fields = analyzeFile(path);
    const x = fields.find((f) => f.name === 'x');
    // first non-null is 42 (number)
    expect(x?.detectedType).toBe('number');
  });

  it('detects boolean fields', () => {
    const path = write(
      'bool.json',
      JSON.stringify([{ active: true }, { active: false }]),
    );
    const fields = analyzeFile(path);
    const active = fields.find((f) => f.name === 'active');
    expect(active?.detectedType).toBe('boolean');
  });

  it('limits samples to 5 unique values', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ n: i }));
    const path = write('many.json', JSON.stringify(rows));
    const fields = analyzeFile(path);
    const n = fields.find((f) => f.name === 'n');
    expect(n?.samples.length).toBeLessThanOrEqual(5);
  });

  it('reports correct cardinality', () => {
    const path = write(
      'card.json',
      JSON.stringify([{ c: 'a' }, { c: 'b' }, { c: 'a' }, { c: 'c' }]),
    );
    const fields = analyzeFile(path);
    const c = fields.find((f) => f.name === 'c');
    expect(c?.cardinality).toBe(3);
  });
});
