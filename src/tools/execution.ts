import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { getWorkerPool } from '../core/worker-pool.js';
import { RecordingManager } from '../core/recording-manager.js';
import {
  createExecution,
  getExecution,
  updateExecution,
  listExecutions,
  summarizeValidation,
} from '../lib/execution-store.js';
import { getLogger } from '../lib/logger.js';
import { getProjectPath } from '../session.js';
import { formatNextSteps } from './workflow.js';
import { checkSdkVersion } from './prerequisites.js';

const logger = getLogger('execution');

// ── run_connector ────────────────────────────────────────────────

export const runConnectorSchema = z.object({
  connector_name: z
    .string()
    .optional()
    .default('Connector')
    .describe('Python class name of the connector to run'),
  recording_id: z
    .string()
    .optional()
    .describe(
      'If provided, replay from this recording instead of hitting the live source',
    ),
});

export async function handleRunConnector(
  params: z.infer<typeof runConnectorSchema>,
  projectPath = getProjectPath(),
) {
  const executionId = randomUUID().slice(0, 8);
  const state = createExecution(
    executionId,
    params.connector_name ?? 'Connector',
  );

  // Spawn a Python worker asynchronously — don't await it here so we return immediately
  void (async () => {
    const sdkCheck = checkSdkVersion(projectPath);
    if (!sdkCheck.ok) {
      updateExecution(executionId, {
        status: 'failed',
        error: [
          sdkCheck.message,
          sdkCheck.fix ? `Fix: ${sdkCheck.fix}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        completedAt: new Date(),
      });
      logger.warn({ executionId, sdkCheck }, 'SDK incompatible — aborting before spawn');
      return;
    }

    const pool = getWorkerPool();
    const spawnResult = await pool.spawn(projectPath);

    if (!spawnResult.ok) {
      updateExecution(executionId, {
        status: 'failed',
        error: spawnResult.error.message,
        completedAt: new Date(),
      });
      logger.warn(
        { executionId, err: spawnResult.error.message },
        'Worker spawn failed',
      );
      return;
    }

    const { workerId } = spawnResult.value;

    // Wire worker notifications into the execution state (SDK 1.x protocol — v1.0 schema)
    pool.addNotificationHandler(workerId, (msg) => {
      const current = getExecution(executionId);
      if (!current) return;

      if (msg['method'] === 'record_fetched') {
        const p = msg['params'] as
          | { record_id?: string; index?: number; data?: Record<string, unknown> }
          | undefined;
        const record = p?.data;
        if (record) {
          updateExecution(executionId, {
            recordsFetched: current.recordsFetched + 1,
            records: [
              ...current.records,
              {
                id: p?.record_id ?? randomUUID(),
                raw: record,
                mapped: {},
                validationIssues: [],
              },
            ],
          });
        }
      } else if (msg['method'] === 'log') {
        const p = msg['params'] as { message?: string } | undefined;
        if (p?.message) {
          updateExecution(executionId, { logs: [...current.logs, p.message] });
        }
      } else if (msg['method'] === 'execution_complete') {
        const p = msg['params'] as { success?: boolean; error?: string } | undefined;
        if (p?.success === false) {
          updateExecution(executionId, {
            status: 'failed',
            error: p.error ?? 'Execution failed',
            completedAt: new Date(),
          });
        } else {
          updateExecution(executionId, {
            status: 'complete',
            completedAt: new Date(),
          });
        }
        void pool.kill(workerId);
      }
      // Other SDK notifications (phase_start, phase_complete, heartbeat, transform_complete)
      // are informational and not currently surfaced by connector-mcp.
    });

    // execute returns {execution_id, status: "started"} immediately.
    // Notifications arrive asynchronously per the v1.0 protocol schema.
    const startResult = await pool.sendRequest(workerId, 'execute', {
      connector: params.connector_name ?? 'Connector',
    });

    if (!startResult.ok) {
      updateExecution(executionId, {
        status: 'failed',
        error: startResult.error.message,
        completedAt: new Date(),
      });
    }
  })();

  state.emitter.emit('started');

  return {
    content: [
      {
        type: 'text' as const,
        text:
          [
            `Connector execution started.`,
            `execution_id: ${executionId}`,
            `connector: ${params.connector_name ?? 'Connector'}`,
            ``,
            `Poll status with: inspect_execution { "execution_id": "${executionId}" }`,
          ].join('\n') +
          formatNextSteps([
            {
              label: 'Inspect Execution',
              description: 'check status and view fetched records',
              tool: 'inspect_execution',
            },
            {
              label: 'Record This Run',
              description:
                'save the output as a recording to replay without hitting the API — use manage_recording with action: "record"',
              tool: 'manage_recording',
            },
          ]),
      },
    ],
  };
}

// ── inspect_execution ────────────────────────────────────────────

export const inspectExecutionSchema = z.object({
  execution_id: z
    .string()
    .describe('The execution_id returned by run_connector'),
  offset: z.number().optional().default(0).describe('Record pagination offset'),
  limit: z
    .number()
    .optional()
    .default(20)
    .describe('Maximum records to return'),
});

export async function handleInspectExecution(
  params: z.infer<typeof inspectExecutionSchema>,
  _projectPath = getProjectPath(),
) {
  const state = getExecution(params.execution_id);

  if (!state) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Execution "${params.execution_id}" not found. Active executions: ${
            listExecutions()
              .map((e) => e.id)
              .join(', ') || 'none'
          }`,
        },
      ],
    };
  }

  const offset = params.offset ?? 0;
  const limit = params.limit ?? 20;
  const pageRecords = state.records.slice(offset, offset + limit);
  const validationSummary = summarizeValidation(state.records);

  const failed = state.status === 'failed';

  const lines = [
    `## Execution ${state.id}`,
    `Status: ${state.status}`,
    `Connector: ${state.connectorName}`,
    `Started: ${state.startedAt.toISOString()}`,
    state.completedAt ? `Completed: ${state.completedAt.toISOString()}` : null,
    `Records fetched: ${state.recordsFetched}`,
    state.error ? `Error: ${state.error}` : null,
    // On failure, surface all worker output immediately after the error so the
    // cause is visible without scrolling (e.g. missing .env credentials).
    failed && state.logs.length > 0
      ? `Worker output:\n${state.logs.map((l) => `  ${l}`).join('\n')}`
      : null,
    '',
    `## Records (${offset}–${offset + pageRecords.length} of ${state.records.length})`,
    pageRecords.length > 0
      ? pageRecords
          .map((r) => `  [${r.id}] ${JSON.stringify(r.raw).slice(0, 120)}`)
          .join('\n')
      : '  (none yet)',
    '',
    Object.keys(validationSummary).length > 0
      ? `## Validation Issues\n${Object.entries(validationSummary)
          .map(([f, c]) => `  ${f}: ${c} issue(s)`)
          .join('\n')}`
      : '## Validation: No issues',
    '',
    !failed && state.logs.length > 0
      ? `## Recent Logs\n${state.logs
          .slice(-10)
          .map((l) => `  ${l}`)
          .join('\n')}`
      : null,
  ].filter((l): l is string => l !== null);

  const nextSteps =
    state.status === 'complete'
      ? formatNextSteps([
          {
            label: 'Manage Recordings',
            description: 'save, replay, list, or delete connector recordings',
            tool: 'manage_recording',
          },
        ])
      : state.status === 'failed'
        ? formatNextSteps([
            {
              label: 'Update Schema',
              description: 'fix field definitions before rebuilding',
              tool: 'update_schema',
            },
            {
              label: 'Get Mappings',
              description: 'review and correct field mappings',
              tool: 'get_mappings',
            },
            {
              label: 'Build Connector',
              description: 'regenerate connector code after fixing issues',
              tool: 'build_connector',
            },
          ])
        : formatNextSteps([
            {
              label: 'Inspect Execution',
              description: 'poll again for updated status and records',
              tool: 'inspect_execution',
            },
          ]);

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') + nextSteps }],
  };
}

// ── manage_recording ─────────────────────────────────────────────

export const manageRecordingSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list').describe('Show available recordings'),
    connector_name: z
      .string()
      .optional()
      .describe('Optional filter: only show recordings for this connector'),
  }),
  z.object({
    action: z
      .literal('record')
      .describe('Run the connector and save its output as a recording'),
    connector_name: z
      .string()
      .optional()
      .default('Connector')
      .describe('Connector class name to run'),
  }),
  z.object({
    action: z
      .literal('replay')
      .describe('Run the connector from a saved recording file'),
    recording_id: z
      .string()
      .describe(
        "Recording ID to replay (use manage_recording with action 'list' to see available IDs)",
      ),
    connector_name: z
      .string()
      .optional()
      .describe('Connector class name override'),
  }),
  z.object({
    action: z.literal('delete').describe('Remove a recording'),
    recording_id: z
      .string()
      .describe(
        "Recording ID to delete (use manage_recording with action 'list' to see available IDs)",
      ),
  }),
]);

export async function handleManageRecording(
  params: z.infer<typeof manageRecordingSchema>,
  projectPath = getProjectPath(),
) {
  const manager = new RecordingManager(projectPath);

  switch (params.action) {
    case 'list': {
      const recordings = manager.listRecordings(params.connector_name ?? null);
      if (recordings.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No recordings found in this project.',
            },
          ],
        };
      }
      const lines = recordings.map(
        (r) =>
          `  ${r.recording_id} | ${r.connector_name} | ${r.record_count} records | ${r.created_at}`,
      );
      return {
        content: [
          { type: 'text' as const, text: `Recordings:\n${lines.join('\n')}` },
        ],
      };
    }

    case 'record': {
      const connectorName = params.connector_name ?? 'Connector';
      const executionId = randomUUID().slice(0, 8);
      const state = createExecution(executionId, connectorName);

      // Start recording before spawning worker
      manager.startRecording(connectorName);

      void (async () => {
        const pool = getWorkerPool();
        const spawnResult = await pool.spawn(projectPath);

        if (!spawnResult.ok) {
          manager.cancelRecording();
          updateExecution(executionId, {
            status: 'failed',
            error: spawnResult.error.message,
            completedAt: new Date(),
          });
          return;
        }

        const { workerId } = spawnResult.value;

        pool.addNotificationHandler(workerId, (msg) => {
          const current = getExecution(executionId);
          if (!current) return;

          if (msg['method'] === 'record_fetched') {
            const p = msg['params'] as
              | { record_id?: string; index?: number; data?: Record<string, unknown> }
              | undefined;
            const record = p?.data;
            if (record) {
              manager.addRecord(record);
              updateExecution(executionId, {
                recordsFetched: current.recordsFetched + 1,
                records: [
                  ...current.records,
                  {
                    id: p?.record_id ?? randomUUID(),
                    raw: record,
                    mapped: {},
                    validationIssues: [],
                  },
                ],
              });
            }
          } else if (msg['method'] === 'log') {
            const p = msg['params'] as { message?: string } | undefined;
            if (p?.message) {
              updateExecution(executionId, {
                logs: [...current.logs, p.message],
              });
            }
          } else if (msg['method'] === 'execution_complete') {
            const p = msg['params'] as { success?: boolean; error?: string } | undefined;
            if (p?.success === false) {
              manager.cancelRecording();
              updateExecution(executionId, {
                status: 'failed',
                error: p.error ?? 'Execution failed',
                completedAt: new Date(),
              });
            } else {
              const saved = manager.saveRecording();
              updateExecution(executionId, {
                status: 'complete',
                completedAt: new Date(),
              });
              if (saved) {
                logger.info(
                  {
                    executionId,
                    recordingId: saved.recording_id,
                    recordCount: saved.record_count,
                  },
                  'Recording saved',
                );
              }
            }
            void pool.kill(workerId);
          }
        });

        const startResult = await pool.sendRequest(workerId, 'execute', {
          connector: connectorName,
        });

        if (!startResult.ok) {
          manager.cancelRecording();
          updateExecution(executionId, {
            status: 'failed',
            error: startResult.error.message,
            completedAt: new Date(),
          });
        }
      })();

      state.emitter.emit('started');

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Recording started.`,
              `execution_id: ${executionId}`,
              `connector: ${connectorName}`,
              ``,
              `Records will be saved to .glean/recordings/${connectorName}/ on completion.`,
              `Poll status with: inspect_execution { "execution_id": "${executionId}" }`,
            ].join('\n'),
          },
        ],
      };
    }

    case 'replay': {
      return handleRunConnector(
        {
          connector_name: params.connector_name ?? 'Connector',
          recording_id: params.recording_id,
        },
        projectPath,
      );
    }

    case 'delete': {
      const deleted = manager.deleteRecording(params.recording_id);
      return {
        content: [
          {
            type: 'text' as const,
            text: deleted
              ? `Recording ${params.recording_id} deleted.`
              : `Recording ${params.recording_id} not found.`,
          },
        ],
      };
    }
  }
}
