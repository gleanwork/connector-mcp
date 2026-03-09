import { it, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';

const schema = JSON.parse(
  readFileSync(resolve('docs/protocol/v1.0.json'), 'utf8'),
) as Record<string, unknown>;

const ajv = new Ajv({ strict: false });

describe('Protocol schema v1.0 — connector-mcp message shapes', () => {
  it('valid ExecuteRequest passes schema', () => {
    const validate = ajv.compile(
      (schema.definitions as Record<string, unknown>)['ExecuteRequest'],
    );
    expect(
      validate({
        jsonrpc: '2.0',
        method: 'execute',
        params: { connector: 'JiraConnector' },
        id: 1,
      }),
    ).toBe(true);
  });

  it('ExecuteRequest with unknown field fails schema', () => {
    const validate = ajv.compile(
      (schema.definitions as Record<string, unknown>)['ExecuteRequest'],
    );
    expect(
      validate({
        jsonrpc: '2.0',
        method: 'execute',
        params: { connector: 'Connector', connector_name: 'old' },
        id: 1,
      }),
    ).toBe(false);
  });

  it('valid RecordFetchedNotification passes schema', () => {
    const validate = ajv.compile(
      (schema.definitions as Record<string, unknown>)[
        'RecordFetchedNotification'
      ],
    );
    expect(
      validate({
        method: 'record_fetched',
        params: { record_id: 'r-0', index: 0, data: { id: '1', title: 'T' } },
      }),
    ).toBe(true);
  });

  it('old record notification method fails schema', () => {
    const validate = ajv.compile(
      (schema.definitions as Record<string, unknown>)[
        'RecordFetchedNotification'
      ],
    );
    expect(
      validate({ method: 'record', params: { id: '1', title: 'T' } }),
    ).toBe(false);
  });

  it('valid ExecutionCompleteNotification passes schema', () => {
    const validate = ajv.compile(
      (schema.definitions as Record<string, unknown>)[
        'ExecutionCompleteNotification'
      ],
    );
    expect(
      validate({
        method: 'execution_complete',
        params: { execution_id: 'e-1', success: true, total_records: 5 },
      }),
    ).toBe(true);
  });

  it('valid ExecuteResponse passes schema', () => {
    const validate = ajv.compile(
      (schema.definitions as Record<string, unknown>)['ExecuteResponse'],
    );
    expect(
      validate({
        jsonrpc: '2.0',
        id: 1,
        result: { execution_id: 'e-1', status: 'started' },
      }),
    ).toBe(true);
  });
});
