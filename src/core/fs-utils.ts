/**
 * Atomic file write utility.
 *
 * Prevents data corruption on crash by writing to a temp file first,
 * then renaming to the target path. rename() is atomic on the same filesystem —
 * a crash mid-write leaves the old file intact rather than a truncated one.
 */

import { writeFileSync, renameSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Atomically writes data to a file by writing to a temp file first,
 * then renaming to the target path. Prevents data corruption on crash.
 *
 * The temp file is written in the same directory as the target so that
 * rename() stays on the same filesystem (required for atomicity).
 */
export function atomicWriteFileSync(filePath: string, data: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = join(dir, `.tmp-${randomBytes(6).toString('hex')}`);
  try {
    writeFileSync(tmpPath, data, { encoding: 'utf8' });
    renameSync(tmpPath, filePath);
  } catch (err) {
    // Clean up temp file if rename fails
    try {
      unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup errors — the temp file will be cleaned up eventually
    }
    throw err;
  }
}
