/**
 * Worker pool — manages subprocess workers communicating via JSON-RPC over stdio.
 *
 * Adapted from glean-connector-studio. Removes dependency on config/errors modules.
 * Uses hardcoded defaults (overridable via env vars) and inline error types.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { randomUUID } from 'node:crypto';

import { getLogger } from '../lib/logger.js';

const logger = getLogger('worker-pool');

// ── Inline Result type ───────────────────────────────────────────

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function success<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function failure<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ── Worker errors ────────────────────────────────────────────────

export class WorkerError extends Error {}

export class WorkerNotFoundError extends WorkerError {
  constructor(workerId: string) {
    super(`Worker not found: ${workerId}`);
  }
}

export class WorkerSpawnError extends WorkerError {
  constructor(projectPath: string, reason: string) {
    super(`Failed to spawn worker for ${projectPath}: ${reason}`);
  }
}

export class WorkerDeadError extends WorkerError {
  constructor(workerId: string, exitCode: number | null) {
    super(`Worker ${workerId} is dead (exit code: ${exitCode})`);
  }
}

export class WorkerTimeoutError extends WorkerError {
  constructor(workerId: string, method: string, timeoutSeconds: number) {
    super(`Worker ${workerId} timed out on ${method} after ${timeoutSeconds}s`);
  }
}

export class WorkerCommunicationError extends WorkerError {
  constructor(workerId: string, reason: string) {
    super(`Worker ${workerId} communication error: ${reason}`);
  }
}

// ── Configuration (env-overridable) ─────────────────────────────

function getWorkerCommand(): string[] {
  const cmd = process.env['GLEAN_WORKER_COMMAND'];
  if (cmd) return cmd.split(' ');
  return ['uv', 'run', 'python', '-m', 'glean_connector_worker'];
}

const REQUEST_TIMEOUT_SECONDS = parseInt(
  process.env['GLEAN_WORKER_REQUEST_TIMEOUT'] ?? '30',
  10,
);

const SHUTDOWN_TIMEOUT_SECONDS = parseInt(
  process.env['GLEAN_WORKER_SHUTDOWN_TIMEOUT'] ?? '5',
  10,
);

// ── Worker types ─────────────────────────────────────────────────

export type NotificationHandler = (message: Record<string, unknown>) => void;

export enum WorkerState {
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  DEAD = 'dead',
}

export interface WorkerHandle {
  workerId: string;
  projectPath: string;
  pid: number;
  state: WorkerState;
}

function withState(handle: WorkerHandle, state: WorkerState): WorkerHandle {
  return { ...handle, state };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface WorkerConnection {
  process: ChildProcess;
  notificationHandlers: NotificationHandler[];
  pendingRequests: Map<number, PendingRequest>;
  requestCounter: number;
  readline: Interface | null;
}

// ── WorkerPool ───────────────────────────────────────────────────

export class WorkerPool {
  private handles = new Map<string, WorkerHandle>();
  private connections = new Map<string, WorkerConnection>();

  async spawn(projectPath: string): Promise<Result<WorkerHandle, WorkerError>> {
    const workerId = randomUUID();
    const log = logger.child({ workerId, projectPath });

    log.info('Spawning worker');

    let proc: ChildProcess;
    try {
      const [cmd, ...args] = getWorkerCommand();
      if (!cmd) {
        return failure(new WorkerSpawnError(projectPath, 'Empty worker command'));
      }

      proc = spawn(cmd, args, {
        cwd: projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error({ err: e }, 'Worker spawn failed');
      return failure(new WorkerSpawnError(projectPath, msg));
    }

    if (!proc.pid) {
      log.error('Worker spawn failed: no PID assigned');
      return failure(new WorkerSpawnError(projectPath, 'No PID assigned'));
    }

    const handle: WorkerHandle = {
      workerId,
      projectPath,
      pid: proc.pid,
      state: WorkerState.RUNNING,
    };

    const connection: WorkerConnection = {
      process: proc,
      notificationHandlers: [],
      pendingRequests: new Map(),
      requestCounter: 0,
      readline: null,
    };

    this.handles.set(workerId, handle);
    this.connections.set(workerId, connection);

    // Start reading stdout (JSON-RPC responses + notifications)
    if (proc.stdout) {
      const rl = createInterface({ input: proc.stdout });
      connection.readline = rl;
      rl.on('line', (line: string) => {
        this.processLine(workerId, line.trim());
      });
      rl.on('close', () => {
        log.info('stdout stream ended');
      });
    }

    // Start reading stderr (worker logs)
    if (proc.stderr) {
      const stderrRl = createInterface({ input: proc.stderr });
      stderrRl.on('line', (line: string) => {
        const trimmed = line.trim();
        if (trimmed) {
          log.info({ message: trimmed }, 'worker_stderr');
          this.emitStderrAsLog(workerId, trimmed);
        }
      });
    }

    // Handle process exit
    proc.on('exit', (code) => {
      log.info({ exitCode: code }, 'Worker process exited');
      const h = this.handles.get(workerId);
      if (h) {
        this.handles.set(workerId, withState(h, WorkerState.DEAD));
      }
      // Reject all pending requests
      const conn = this.connections.get(workerId);
      if (conn) {
        for (const [, pending] of conn.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error(`Worker exited with code ${code}`));
        }
        conn.pendingRequests.clear();
      }
    });

    log.info({ pid: proc.pid }, 'Worker spawned');
    return success(handle);
  }

  async sendRequest(
    workerId: string,
    method: string,
    params?: Record<string, unknown>,
    timeout?: number,
  ): Promise<Result<unknown, WorkerError>> {
    const effectiveTimeout = timeout ?? REQUEST_TIMEOUT_SECONDS;

    const connection = this.connections.get(workerId);
    if (!connection) {
      return failure(new WorkerNotFoundError(workerId));
    }

    // Check if process is alive
    if (connection.process.exitCode !== null) {
      const handle = this.handles.get(workerId);
      if (handle) {
        this.handles.set(workerId, withState(handle, WorkerState.DEAD));
      }
      this.handles.delete(workerId);
      this.connections.delete(workerId);
      return failure(new WorkerDeadError(workerId, connection.process.exitCode));
    }

    connection.requestCounter += 1;
    const requestId = connection.requestCounter;

    const rpcRequest = {
      jsonrpc: '2.0',
      method,
      params: params ?? {},
      id: requestId,
    };

    return new Promise<Result<unknown, WorkerError>>((resolve) => {
      const timer = setTimeout(() => {
        connection.pendingRequests.delete(requestId);
        resolve(failure(new WorkerTimeoutError(workerId, method, effectiveTimeout)));
      }, effectiveTimeout * 1000);

      connection.pendingRequests.set(requestId, {
        resolve: (value: unknown) => {
          clearTimeout(timer);
          connection.pendingRequests.delete(requestId);
          resolve(success(value));
        },
        reject: (error: Error) => {
          clearTimeout(timer);
          connection.pendingRequests.delete(requestId);
          resolve(failure(new WorkerCommunicationError(workerId, error.message)));
        },
        timer,
      });

      try {
        const line = JSON.stringify(rpcRequest) + '\n';
        connection.process.stdin?.write(line);
      } catch (e) {
        clearTimeout(timer);
        connection.pendingRequests.delete(requestId);
        const msg = e instanceof Error ? e.message : String(e);
        resolve(failure(new WorkerCommunicationError(workerId, msg)));
      }
    });
  }

  addNotificationHandler(
    workerId: string,
    handler: NotificationHandler,
  ): Result<void, WorkerError> {
    const connection = this.connections.get(workerId);
    if (!connection) return failure(new WorkerNotFoundError(workerId));
    connection.notificationHandlers.push(handler);
    return success(undefined);
  }

  removeNotificationHandler(
    workerId: string,
    handler: NotificationHandler,
  ): Result<void, WorkerError> {
    const connection = this.connections.get(workerId);
    if (!connection) return failure(new WorkerNotFoundError(workerId));
    const idx = connection.notificationHandlers.indexOf(handler);
    if (idx >= 0) connection.notificationHandlers.splice(idx, 1);
    return success(undefined);
  }

  async kill(workerId: string): Promise<Result<void, WorkerError>> {
    const connection = this.connections.get(workerId);
    const handle = this.handles.get(workerId);

    if (!connection || !handle) {
      return failure(new WorkerNotFoundError(workerId));
    }

    this.handles.set(workerId, withState(handle, WorkerState.STOPPING));

    logger.info({ workerId, pid: handle.pid }, 'Killing worker');

    // Close readline
    connection.readline?.close();

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        logger.warn({ workerId, pid: handle.pid }, 'Force killing worker');
        connection.process.kill('SIGKILL');
        resolve();
      }, SHUTDOWN_TIMEOUT_SECONDS * 1000);

      connection.process.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      connection.process.kill('SIGTERM');
    });

    this.handles.delete(workerId);
    this.connections.delete(workerId);

    logger.info({ workerId, pid: handle.pid }, 'Worker killed');
    return success(undefined);
  }

  async killAll(): Promise<void> {
    const workerIds = [...this.handles.keys()];
    for (const workerId of workerIds) {
      await this.kill(workerId);
    }
  }

  getHandle(workerId: string): Result<WorkerHandle, WorkerError> {
    const handle = this.handles.get(workerId);
    if (!handle) return failure(new WorkerNotFoundError(workerId));

    const connection = this.connections.get(workerId);
    if (connection && connection.process.exitCode !== null) {
      const dead = withState(handle, WorkerState.DEAD);
      this.handles.set(workerId, dead);
      return failure(new WorkerDeadError(workerId, connection.process.exitCode));
    }

    return success(handle);
  }

  listHandles(): WorkerHandle[] {
    // Update dead workers
    for (const [workerId, connection] of this.connections) {
      if (connection.process.exitCode !== null) {
        const handle = this.handles.get(workerId);
        if (handle) {
          this.handles.set(workerId, withState(handle, WorkerState.DEAD));
          logger.warn({ workerId }, 'Worker died');
        }
      }
    }
    return [...this.handles.values()];
  }

  findByProject(projectPath: string): WorkerHandle | null {
    for (const handle of this.handles.values()) {
      if (handle.projectPath === projectPath && handle.state === WorkerState.RUNNING) {
        const connection = this.connections.get(handle.workerId);
        if (connection && connection.process.exitCode === null) {
          return handle;
        }
      }
    }
    return null;
  }

  private processLine(workerId: string, line: string): void {
    const connection = this.connections.get(workerId);
    if (!connection) return;

    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      logger.warn({ workerId }, 'Invalid JSON from worker');
      return;
    }

    // JSON-RPC response (has "id" field)
    if ('id' in message && message['id'] !== null) {
      const requestId = message['id'] as number;
      const pending = connection.pendingRequests.get(requestId);
      if (pending) {
        if ('error' in message) {
          const errObj = message['error'] as Record<string, unknown>;
          pending.reject(new Error((errObj['message'] as string) ?? 'JSON-RPC error'));
        } else {
          pending.resolve(message['result']);
        }
      }
    } else {
      // Notification (no "id" field)
      for (const handler of connection.notificationHandlers) {
        try {
          handler(message);
        } catch (e) {
          logger.error({ workerId, err: e }, 'Notification handler error');
        }
      }
    }
  }

  private static readonly LOG_LEVEL_PREFIXES: Record<string, string> = {
    'ERROR:': 'error',
    'CRITICAL:': 'error',
    'WARNING:': 'warning',
    'DEBUG:': 'debug',
    'INFO:': 'info',
  };

  private emitStderrAsLog(workerId: string, line: string): void {
    const connection = this.connections.get(workerId);
    if (!connection) return;

    let level = 'info';
    let message = line;

    for (const [prefix, logLevel] of Object.entries(WorkerPool.LOG_LEVEL_PREFIXES)) {
      if (line.startsWith(prefix)) {
        level = logLevel;
        message = line.slice(prefix.length).trim();
        break;
      }
    }

    const logNotification = {
      method: 'log',
      params: { level, message, source: 'worker' },
    };

    for (const handler of connection.notificationHandlers) {
      try {
        handler(logNotification);
      } catch {
        // Ignore handler errors for log notifications
      }
    }
  }
}

let _pool: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool {
  if (!_pool) {
    _pool = new WorkerPool();
  }
  return _pool;
}
