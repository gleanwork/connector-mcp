/**
 * Recording manager — capture and replay API responses.
 *
 * Adapted from glean-connector-studio. Uses .glean/recordings/ instead
 * of .glean-studio/recordings/.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { getLogger } from '../lib/logger.js';
import type { RecordingInfo, RecordingMetadata } from '../types/index.js';
import { atomicWriteFileSync } from './fs-utils.js';

const logger = getLogger('recording-manager');

const RECORDINGS_DIR = '.glean/recordings';

interface Recording {
  metadata: RecordingMetadata;
  records: Record<string, unknown>[];
}

export class RecordingManager {
  private recordingsDir: string;
  private currentRecording: Record<string, unknown>[] | null = null;
  private currentConnector: string | null = null;
  private recordingStart: Date | null = null;

  constructor(projectPath: string) {
    this.recordingsDir = join(projectPath, RECORDINGS_DIR);
  }

  startRecording(connectorName: string): void {
    this.currentRecording = [];
    this.currentConnector = connectorName;
    this.recordingStart = new Date();
    logger.info({ connector: connectorName }, 'Started recording');
  }

  addRecord(recordData: Record<string, unknown>): void {
    if (!this.currentRecording) {
      logger.warn('Attempted to add record without active recording');
      return;
    }
    this.currentRecording.push(recordData);
  }

  saveRecording(): RecordingInfo | null {
    if (!this.currentRecording || !this.currentConnector) {
      logger.warn('Attempted to save recording without active recording');
      return null;
    }

    if (this.currentRecording.length === 0) {
      logger.info('Recording empty, skipping save');
      this.currentRecording = null;
      this.currentConnector = null;
      return null;
    }

    const connectorDir = join(this.recordingsDir, this.currentConnector);
    mkdirSync(connectorDir, { recursive: true });

    const recordingId = randomUUID().slice(0, 8);
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const filename = `${timestamp}_${recordingId}.json`;
    const filePath = join(connectorDir, filename);

    let durationMs: number | null = null;
    if (this.recordingStart) {
      durationMs = Date.now() - this.recordingStart.getTime();
    }

    const metadata: RecordingMetadata = {
      recording_id: recordingId,
      connector_name: this.currentConnector,
      created_at: new Date().toISOString(),
      record_count: this.currentRecording.length,
      duration_ms: durationMs,
    };

    const recording: Recording = {
      metadata,
      records: this.currentRecording,
    };

    atomicWriteFileSync(filePath, JSON.stringify(recording, null, 2));
    const fileSize = statSync(filePath).size;

    logger.info(
      {
        recordingId,
        connector: this.currentConnector,
        recordCount: this.currentRecording.length,
        fileSize,
      },
      'Saved recording',
    );

    this.currentRecording = null;
    this.currentConnector = null;
    this.recordingStart = null;

    return {
      recording_id: recordingId,
      filename,
      connector_name: metadata.connector_name,
      created_at: metadata.created_at,
      record_count: metadata.record_count,
      file_size_bytes: fileSize,
      path: filePath,
    };
  }

  cancelRecording(): void {
    if (this.currentRecording) {
      logger.info(
        {
          connector: this.currentConnector,
          recordsCaptured: this.currentRecording.length,
        },
        'Cancelled recording',
      );
    }
    this.currentRecording = null;
    this.currentConnector = null;
    this.recordingStart = null;
  }

  loadRecording(recordingPath: string): Recording | null {
    if (!existsSync(recordingPath)) {
      logger.warn({ path: recordingPath }, 'Recording file not found');
      return null;
    }

    try {
      const data = JSON.parse(
        readFileSync(recordingPath, 'utf-8'),
      ) as Recording;
      logger.info(
        {
          recordingId: data.metadata.recording_id,
          recordCount: data.metadata.record_count,
        },
        'Loaded recording',
      );
      return data;
    } catch (e) {
      logger.error({ path: recordingPath, err: e }, 'Failed to load recording');
      return null;
    }
  }

  listRecordings(connectorName?: string | null): RecordingInfo[] {
    const recordings: RecordingInfo[] = [];

    if (!existsSync(this.recordingsDir)) return recordings;

    const connectorDirs = readdirSync(this.recordingsDir);
    for (const dir of connectorDirs) {
      const connectorDir = join(this.recordingsDir, dir);
      try {
        if (!statSync(connectorDir).isDirectory()) continue;
      } catch {
        continue;
      }

      if (connectorName && dir !== connectorName) continue;

      const files = readdirSync(connectorDir).filter((f) =>
        f.endsWith('.json'),
      );
      for (const file of files) {
        const filePath = join(connectorDir, file);
        try {
          const data = JSON.parse(readFileSync(filePath, 'utf-8')) as Recording;
          const fileSize = statSync(filePath).size;

          recordings.push({
            recording_id: data.metadata.recording_id,
            filename: file,
            connector_name: data.metadata.connector_name,
            created_at: data.metadata.created_at,
            record_count: data.metadata.record_count,
            file_size_bytes: fileSize,
            path: filePath,
          });
        } catch (e) {
          logger.warn(
            { path: filePath, err: e },
            'Failed to read recording metadata',
          );
        }
      }
    }

    // Sort newest first
    recordings.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return recordings;
  }

  deleteRecording(recordingId: string): boolean {
    if (!existsSync(this.recordingsDir)) return false;

    const connectorDirs = readdirSync(this.recordingsDir);
    for (const dir of connectorDirs) {
      const connectorDir = join(this.recordingsDir, dir);
      try {
        if (!statSync(connectorDir).isDirectory()) continue;
      } catch {
        continue;
      }

      const files = readdirSync(connectorDir).filter((f) =>
        f.includes(`_${recordingId}.json`),
      );

      for (const file of files) {
        try {
          unlinkSync(join(connectorDir, file));
          logger.info({ recordingId }, 'Deleted recording');

          // Clean up empty directory
          const remaining = readdirSync(connectorDir);
          if (remaining.length === 0) {
            rmdirSync(connectorDir);
          }

          return true;
        } catch (e) {
          logger.error({ recordingId, err: e }, 'Failed to delete recording');
          return false;
        }
      }
    }

    logger.warn({ recordingId }, 'Recording not found');
    return false;
  }

  getRecordingById(recordingId: string): RecordingInfo | null {
    for (const recording of this.listRecordings()) {
      if (recording.recording_id === recordingId) {
        return recording;
      }
    }
    return null;
  }
}
