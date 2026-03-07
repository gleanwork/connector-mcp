import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  WorkerPool,
  WorkerNotFoundError,
  WorkerTimeoutError,
  WorkerState,
} from '../../src/core/worker-pool.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `worker-pool-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Access private members for unit testing without subprocess round-trips.
type PoolInternals = {
  connections: Map<
    string,
    {
      process: { stdin: null; stdout: null; exitCode: number | null };
      notificationHandlers: ((msg: Record<string, unknown>) => void)[];
      pendingRequests: Map<
        number,
        {
          resolve: (v: unknown) => void;
          reject: (e: Error) => void;
          timer: ReturnType<typeof setTimeout>;
        }
      >;
      requestCounter: number;
      readline: null;
    }
  >;
  handles: Map<
    string,
    {
      workerId: string;
      projectPath: string;
      pid: number;
      state: WorkerState;
    }
  >;
  processLine(workerId: string, line: string): void;
};

function internals(pool: WorkerPool): PoolInternals {
  return pool as unknown as PoolInternals;
}

/**
 * Insert a fake worker connection directly into the pool so we can test
 * processLine and related methods without spawning a real process.
 */
function injectFakeWorker(
  pool: WorkerPool,
  workerId: string,
  projectPath: string,
): void {
  const i = internals(pool);
  i.handles.set(workerId, {
    workerId,
    projectPath,
    pid: 99999,
    state: WorkerState.RUNNING,
  });
  i.connections.set(workerId, {
    process: { stdin: null, stdout: null, exitCode: null } as never,
    notificationHandlers: [],
    pendingRequests: new Map(),
    requestCounter: 0,
    readline: null,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WorkerPool.processLine', () => {
  let pool: WorkerPool;
  const workerId = 'test-worker-id';
  const projectPath = '/fake/path';

  beforeEach(() => {
    pool = new WorkerPool();
    injectFakeWorker(pool, workerId, projectPath);
  });

  it('resolves a pending request when a valid JSON-RPC response arrives', async () => {
    const conn = internals(pool).connections.get(workerId)!;

    let resolvedValue: unknown = undefined;
    const timer = setTimeout(() => {}, 60_000);
    conn.pendingRequests.set(1, {
      resolve: (v) => {
        resolvedValue = v;
        conn.pendingRequests.delete(1);
        clearTimeout(timer);
      },
      reject: (e) => {
        clearTimeout(timer);
        throw e;
      },
      timer,
    });

    internals(pool).processLine(
      workerId,
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }),
    );

    expect(resolvedValue).toEqual({ ok: true });
    expect(conn.pendingRequests.has(1)).toBe(false);
  });

  it('rejects a pending request when a JSON-RPC error response arrives', async () => {
    const conn = internals(pool).connections.get(workerId)!;

    let rejectedError: Error | undefined;
    const timer = setTimeout(() => {}, 60_000);
    conn.pendingRequests.set(2, {
      resolve: () => {
        clearTimeout(timer);
        throw new Error('should not resolve');
      },
      reject: (e) => {
        rejectedError = e;
        conn.pendingRequests.delete(2);
        clearTimeout(timer);
      },
      timer,
    });

    internals(pool).processLine(
      workerId,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        error: { code: -32600, message: 'Invalid Request' },
      }),
    );

    expect(rejectedError).toBeInstanceOf(Error);
    expect(rejectedError!.message).toBe('Invalid Request');
    expect(conn.pendingRequests.has(2)).toBe(false);
  });

  it('calls notification handlers when a notification (no id) arrives', () => {
    const received: Record<string, unknown>[] = [];
    pool.addNotificationHandler(workerId, (msg) => received.push(msg));

    internals(pool).processLine(
      workerId,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'progress',
        params: { pct: 50 },
      }),
    );

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ method: 'progress' });
  });

  it('does not throw when receiving invalid JSON', () => {
    expect(() => {
      internals(pool).processLine(workerId, 'this is not json {{{');
    }).not.toThrow();
  });
});

describe('WorkerPool.sendRequest timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns WorkerTimeoutError after the configured timeout elapses', async () => {
    const pool = new WorkerPool();
    const workerId = 'timeout-worker';
    injectFakeWorker(pool, workerId, '/fake/path');

    // Override the process's stdin.write so we don't need a real pipe
    const conn = internals(pool).connections.get(workerId)!;
    (conn.process as unknown as Record<string, unknown>)['stdin'] = {
      write: () => true,
    };

    // Use a 1-second timeout so fake timers can advance easily
    const resultPromise = pool.sendRequest(workerId, 'some.method', {}, 1);

    // Advance fake clock past the timeout
    await vi.advanceTimersByTimeAsync(2_000);

    const result = await resultPromise;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(WorkerTimeoutError);
      expect(result.error.message).toContain('some.method');
    }
  });
});

describe('WorkerPool.spawn', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  it('returns ok:false when the worker command does not exist', async () => {
    const original = process.env['GLEAN_WORKER_COMMAND'];
    // Use a command that exists but immediately exits with a non-zero code so
    // Node can assign a PID — then verifying ok:false. Alternatively, use a
    // definitely-nonexistent path and suppress the async ENOENT error event.
    process.env['GLEAN_WORKER_COMMAND'] =
      '/nonexistent-binary-that-cannot-exist-xyz';

    // Attach a one-time global uncaughtException suppressor for the ENOENT that
    // Node fires asynchronously when spawn fails to find the binary.
    const suppressEnoent = (err: Error) => {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    };
    process.on('uncaughtException', suppressEnoent);

    const pool = new WorkerPool();
    const result = await pool.spawn(tmpDir);

    // Give the event loop a tick so the error event fires and is swallowed
    await new Promise((r) => setTimeout(r, 20));

    process.off('uncaughtException', suppressEnoent);

    if (original === undefined) {
      delete process.env['GLEAN_WORKER_COMMAND'];
    } else {
      process.env['GLEAN_WORKER_COMMAND'] = original;
    }

    expect(result.ok).toBe(false);
  });

  it('spawns and kills a real short-lived process successfully', async () => {
    const original = process.env['GLEAN_WORKER_COMMAND'];
    // Use a shell sleep so the process stays alive long enough to kill
    process.env['GLEAN_WORKER_COMMAND'] = 'sleep 30';

    const pool = new WorkerPool();
    const spawnResult = await pool.spawn(tmpDir);

    if (original === undefined) {
      delete process.env['GLEAN_WORKER_COMMAND'];
    } else {
      process.env['GLEAN_WORKER_COMMAND'] = original;
    }

    expect(spawnResult.ok).toBe(true);
    if (!spawnResult.ok) return;

    const { workerId } = spawnResult.value;
    const killResult = await pool.kill(workerId);
    expect(killResult.ok).toBe(true);
  });
});

describe('WorkerPool.getHandle', () => {
  it('returns WorkerNotFoundError for an unknown worker ID', () => {
    const pool = new WorkerPool();
    const result = pool.getHandle('nonexistent-worker-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(WorkerNotFoundError);
      expect(result.error.message).toContain('nonexistent-worker-id');
    }
  });
});
