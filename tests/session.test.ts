import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setProjectPath } from '../src/session.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `session-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test('setProjectPath writes .glean/session.json with projectPath', () => {
  setProjectPath(tmpDir);
  const sessionFile = join(tmpDir, '.glean', 'session.json');
  expect(existsSync(sessionFile)).toBe(true);
  const data = JSON.parse(readFileSync(sessionFile, 'utf8')) as {
    projectPath: string;
  };
  expect(data.projectPath).toBe(tmpDir);
});

test('setProjectPath does not throw if .glean dir cannot be created', () => {
  expect(() => setProjectPath('/nonexistent-path-xyz/deep/dir')).not.toThrow();
});
