import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  handleGetDataClient,
  handleUpdateDataClient,
} from '../../src/tools/data-client.js';

let tmpDir: string;
const STUB =
  'class DataClient:\n    def get_source_data(self):\n        pass\n';

beforeEach(() => {
  tmpDir = join(tmpdir(), `data-client-test-${Date.now()}`);
  const srcDir = join(tmpDir, 'src', 'jira_connector');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(srcDir, 'data_client.py'), STUB);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test('get_data_client returns file content', () => {
  const result = handleGetDataClient({ module_name: 'jira_connector' }, tmpDir);
  const text = result.content[0].text as string;
  expect(text).toContain('class DataClient');
  expect(text).toContain('get_source_data');
});

test('get_data_client returns error when module not found', () => {
  const result = handleGetDataClient({ module_name: 'nonexistent' }, tmpDir);
  const text = result.content[0].text as string;
  expect(text).toContain('not found');
});

test('get_data_client includes config context when config exists', () => {
  const gleanDir = join(tmpDir, '.glean');
  mkdirSync(gleanDir, { recursive: true });
  writeFileSync(
    join(gleanDir, 'config.json'),
    JSON.stringify({ name: 'jira' }),
  );
  const result = handleGetDataClient({ module_name: 'jira_connector' }, tmpDir);
  const text = result.content[0].text as string;
  expect(text).toContain('config.json');
});

test('update_data_client writes new content', () => {
  const newCode =
    'class DataClient:\n    def get_source_data(self):\n        return []\n';
  const result = handleUpdateDataClient(
    { module_name: 'jira_connector', code: newCode },
    tmpDir,
  );
  expect(result.content[0].text).toContain('updated');
  const written = readFileSync(
    join(tmpDir, 'src', 'jira_connector', 'data_client.py'),
    'utf8',
  );
  expect(written).toBe(newCode);
});

test('update_data_client returns error when module directory not found', () => {
  const result = handleUpdateDataClient(
    { module_name: 'nonexistent', code: 'class DataClient: pass' },
    tmpDir,
  );
  const text = result.content[0].text as string;
  expect(text).toContain('not found');
});
