import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWriteFileSync } from '../core/fs-utils.js';
import { getProjectPath } from '../session.js';

function configPath(projectPath: string): string {
  return join(projectPath, '.glean', 'config.json');
}

function readConfig(projectPath: string): Record<string, unknown> | null {
  const p = configPath(projectPath);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
}

// ── get_config ───────────────────────────────────────────────────

export const getConfigSchema = z.object({});

export async function handleGetConfig(
  _params: z.infer<typeof getConfigSchema>,
  projectPath = getProjectPath(),
) {
  const config = readConfig(projectPath);
  if (!config) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No config found. Use set_config to define the connector configuration.',
        },
      ],
    };
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(config, null, 2) }],
  };
}

// ── set_config ───────────────────────────────────────────────────

export const setConfigSchema = z.object({
  config: z
    .record(z.unknown())
    .describe(
      'Key-value configuration pairs to save. Merged with any existing config. ' +
        'Common keys: auth_type, endpoint, api_key_header, page_size, rate_limit_rps.',
    ),
});

export async function handleSetConfig(
  params: z.infer<typeof setConfigSchema>,
  projectPath = getProjectPath(),
) {
  const existing = readConfig(projectPath) ?? {};
  const merged = { ...existing, ...params.config };
  atomicWriteFileSync(configPath(projectPath), JSON.stringify(merged, null, 2));

  return {
    content: [
      {
        type: 'text' as const,
        text: [
          `Config saved to .glean/config.json (${Object.keys(merged).length} key(s)):`,
          JSON.stringify(merged, null, 2),
        ].join('\n'),
      },
    ],
  };
}
