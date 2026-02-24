/**
 * In-process execution state store.
 *
 * Tracks running and completed connector executions for the lifetime of
 * the MCP server process. State is not persisted — if the server restarts,
 * in-flight executions are lost. This is expected for a local dev tool.
 */

import { EventEmitter } from 'node:events';

export type ExecutionStatus = 'running' | 'complete' | 'failed' | 'stopped';

export interface ExecutionRecord {
  id: string;
  raw: unknown;
  mapped: Record<string, unknown>;
  validationIssues: Array<{ field: string; issue: string }>;
}

export interface ExecutionState {
  id: string;
  status: ExecutionStatus;
  connectorName: string;
  startedAt: Date;
  completedAt?: Date;
  recordsFetched: number;
  records: ExecutionRecord[];
  logs: string[];
  error?: string;
  emitter: EventEmitter;
}

const executions = new Map<string, ExecutionState>();

export function createExecution(id: string, connectorName: string): ExecutionState {
  const state: ExecutionState = {
    id,
    connectorName,
    status: 'running',
    startedAt: new Date(),
    recordsFetched: 0,
    records: [],
    logs: [],
    emitter: new EventEmitter(),
  };
  executions.set(id, state);
  return state;
}

export function getExecution(id: string): ExecutionState | undefined {
  return executions.get(id);
}

export function updateExecution(id: string, update: Partial<Omit<ExecutionState, 'emitter'>>): void {
  const state = executions.get(id);
  if (state) {
    executions.set(id, { ...state, ...update });
  }
}

export function listExecutions(): ExecutionState[] {
  return [...executions.values()];
}

export function summarizeValidation(records: ExecutionRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of records) {
    for (const issue of r.validationIssues) {
      counts[issue.field] = (counts[issue.field] ?? 0) + 1;
    }
  }
  return counts;
}
