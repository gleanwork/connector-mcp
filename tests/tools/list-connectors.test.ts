import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleListConnectors } from '../../src/tools/list-connectors.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `list-connectors-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test('returns connectors found in src/*/', () => {
  const jiraDir = join(tmpDir, 'src', 'jira_connector');
  mkdirSync(jiraDir, { recursive: true });
  writeFileSync(
    join(jiraDir, 'connector.py'),
    'class JiraConnector(BaseDatasourceConnector):\n    pass\n',
  );
  const sfDir = join(tmpDir, 'src', 'salesforce');
  mkdirSync(sfDir, { recursive: true });
  writeFileSync(
    join(sfDir, 'connector.py'),
    'class SalesforceConnector(BaseDatasourceConnector):\n    pass\n',
  );

  const result = handleListConnectors({}, tmpDir);
  const text = result.content[0].text as string;
  expect(text).toContain('JiraConnector');
  expect(text).toContain('SalesforceConnector');
});

test('returns friendly message when no connectors found', () => {
  const result = handleListConnectors({}, tmpDir);
  const text = result.content[0].text as string;
  expect(text).toContain('No connectors found');
});

test('indicates when DataClient is missing', () => {
  const dir = join(tmpDir, 'src', 'my_connector');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'connector.py'),
    'class MyConnector(BaseDatasourceConnector):\n    pass\n',
  );

  const result = handleListConnectors({}, tmpDir);
  const text = result.content[0].text as string;
  expect(text).toContain('No DataClient');
});
