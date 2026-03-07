import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { RecordingManager } from '../../src/core/recording-manager.js';

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `recording-manager-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

let projectPath: string;
let manager: RecordingManager;

beforeEach(() => {
  projectPath = makeTmpDir();
  manager = new RecordingManager(projectPath);
});

afterEach(() => {
  rmSync(projectPath, { recursive: true, force: true });
});

describe('RecordingManager start → addRecord → saveRecording', () => {
  it('creates a file in the correct location with correct structure', () => {
    manager.startRecording('my-connector');
    manager.addRecord({ id: '1', title: 'Hello' });
    manager.addRecord({ id: '2', title: 'World' });

    const info = manager.saveRecording();

    expect(info).not.toBeNull();
    expect(info!.connector_name).toBe('my-connector');
    expect(info!.record_count).toBe(2);
    expect(existsSync(info!.path)).toBe(true);

    // File should live under .glean/recordings/my-connector/
    const expectedDir = join(projectPath, '.glean/recordings/my-connector');
    expect(info!.path.startsWith(expectedDir)).toBe(true);

    // Load the file and check structure
    const loaded = manager.loadRecording(info!.path);
    expect(loaded).not.toBeNull();
    expect(loaded!.metadata.connector_name).toBe('my-connector');
    expect(loaded!.metadata.record_count).toBe(2);
    expect(loaded!.records).toHaveLength(2);
    expect(loaded!.records[0]).toEqual({ id: '1', title: 'Hello' });
  });

  it('returns null and writes no file when no records were added', () => {
    manager.startRecording('empty-connector');

    const info = manager.saveRecording();
    expect(info).toBeNull();

    const recordingsDir = join(
      projectPath,
      '.glean/recordings/empty-connector',
    );
    expect(existsSync(recordingsDir)).toBe(false);
  });
});

describe('RecordingManager.cancelRecording', () => {
  it('prevents any file from being written after start', () => {
    manager.startRecording('my-connector');
    manager.addRecord({ id: '1' });
    manager.cancelRecording();

    // saveRecording after cancel should return null (no active recording)
    const info = manager.saveRecording();
    expect(info).toBeNull();

    const recordingsDir = join(projectPath, '.glean/recordings/my-connector');
    expect(existsSync(recordingsDir)).toBe(false);
  });
});

describe('RecordingManager.listRecordings', () => {
  it('returns an empty array when no recordings exist', () => {
    const list = manager.listRecordings();
    expect(list).toEqual([]);
  });

  it('returns all recordings sorted newest first', async () => {
    // Save two recordings with a small delay to ensure different timestamps
    manager.startRecording('conn-a');
    manager.addRecord({ seq: 1 });
    const first = manager.saveRecording()!;

    // Shift the created_at so sorting is deterministic
    await new Promise((r) => setTimeout(r, 5));

    manager.startRecording('conn-a');
    manager.addRecord({ seq: 2 });
    const second = manager.saveRecording()!;

    const list = manager.listRecordings();
    expect(list).toHaveLength(2);
    // Newest first
    expect(list[0]!.recording_id).toBe(second.recording_id);
    expect(list[1]!.recording_id).toBe(first.recording_id);
  });

  it('filters by connector name when provided', () => {
    manager.startRecording('conn-a');
    manager.addRecord({ x: 1 });
    manager.saveRecording();

    manager.startRecording('conn-b');
    manager.addRecord({ x: 2 });
    manager.saveRecording();

    const listA = manager.listRecordings('conn-a');
    expect(listA).toHaveLength(1);
    expect(listA[0]!.connector_name).toBe('conn-a');

    const listAll = manager.listRecordings();
    expect(listAll).toHaveLength(2);
  });
});

describe('RecordingManager.deleteRecording', () => {
  it('removes the recording file', () => {
    manager.startRecording('my-connector');
    manager.addRecord({ id: 'x' });
    const info = manager.saveRecording()!;

    const deleted = manager.deleteRecording(info.recording_id);
    expect(deleted).toBe(true);
    expect(existsSync(info.path)).toBe(false);
  });

  it('removes the parent directory when it becomes empty', () => {
    manager.startRecording('solo-connector');
    manager.addRecord({ id: 'y' });
    const info = manager.saveRecording()!;

    const connectorDir = join(projectPath, '.glean/recordings/solo-connector');
    expect(existsSync(connectorDir)).toBe(true);

    manager.deleteRecording(info.recording_id);

    // The now-empty directory should have been cleaned up
    expect(existsSync(connectorDir)).toBe(false);
  });

  it('returns false for an unknown recording ID', () => {
    const result = manager.deleteRecording('does-not-exist');
    expect(result).toBe(false);
  });
});

describe('RecordingManager.loadRecording', () => {
  it('returns the recording object from a previously saved file', () => {
    manager.startRecording('my-connector');
    manager.addRecord({ value: 42 });
    const info = manager.saveRecording()!;

    const loaded = manager.loadRecording(info.path);
    expect(loaded).not.toBeNull();
    expect(loaded!.records[0]).toEqual({ value: 42 });
    expect(loaded!.metadata.recording_id).toBe(info.recording_id);
  });

  it('returns null when the file does not exist', () => {
    const result = manager.loadRecording(
      join(projectPath, '.glean/recordings/nope/missing.json'),
    );
    expect(result).toBeNull();
  });

  it('returns null when the file contains corrupt JSON', () => {
    const corruptPath = join(projectPath, 'corrupt.json');
    writeFileSync(corruptPath, '{ this is not valid json !!!', 'utf-8');

    const result = manager.loadRecording(corruptPath);
    expect(result).toBeNull();
  });

  it('skips corrupt recording files during listRecordings without throwing', () => {
    // Save one valid recording first so the dir exists
    manager.startRecording('my-connector');
    manager.addRecord({ id: 1 });
    manager.saveRecording();

    // Plant a corrupt file in the connector directory
    const corruptPath = join(
      projectPath,
      '.glean/recordings/my-connector/corrupt.json',
    );
    writeFileSync(corruptPath, '{ bad json', 'utf-8');

    // listRecordings should not throw; corrupt file is silently skipped
    let list: unknown[];
    expect(() => {
      list = manager.listRecordings();
    }).not.toThrow();
    // Only the valid recording is returned
    expect(list!).toHaveLength(1);
  });
});
