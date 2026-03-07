import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWriteFileSync } from '../core/fs-utils.js';
import { getProjectPath } from '../session.js';
import { formatNextSteps } from './workflow.js';

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
    .object({
      // Code-generation keys — consumed by build_connector to populate the
      // Glean datasource registration config and generated Python files.
      name: z
        .string()
        .optional()
        .describe(
          'Datasource identifier used in Glean (e.g. "my-wiki"). ' +
            'Consumed by build_connector.',
        ),
      display_name: z
        .string()
        .optional()
        .describe(
          'Human-readable datasource name shown in the Glean UI (e.g. "My Wiki"). ' +
            'Consumed by build_connector.',
        ),
      datasource_category: z
        .string()
        .optional()
        .describe(
          'Glean datasource category (e.g. "PUBLISHED_CONTENT", "TICKETS", "CODE"). ' +
            'Consumed by build_connector.',
        ),
      url_regex: z
        .string()
        .optional()
        .describe(
          'Regex that matches document URLs for this datasource. ' +
            'Consumed by build_connector.',
        ),
      icon_url: z
        .string()
        .optional()
        .describe(
          'URL for the datasource icon shown in the Glean UI. ' +
            'Consumed by build_connector.',
        ),
      connector_type: z
        .string()
        .optional()
        .describe(
          'Connector base class type ("basic", "streaming", "async_streaming"). ' +
            'Consumed by build_connector.',
        ),

      // Runtime keys — used by the generated Python connector at execution
      // time to authenticate and talk to the source API. Not used during
      // code generation, but stored here for convenience.
      auth_type: z
        .string()
        .optional()
        .describe(
          'Authentication scheme for the source API (e.g. "bearer", "basic", "api_key"). ' +
            'Used by the connector at runtime, not by build_connector.',
        ),
      endpoint: z
        .string()
        .optional()
        .describe(
          'Base URL of the source API. ' +
            'Used by the connector at runtime, not by build_connector.',
        ),
      api_key_header: z
        .string()
        .optional()
        .describe(
          'HTTP header name used to pass an API key. ' +
            'Used by the connector at runtime, not by build_connector.',
        ),
      page_size: z
        .number()
        .optional()
        .describe(
          'Number of records to request per API page. ' +
            'Used by the connector at runtime, not by build_connector.',
        ),
      rate_limit_rps: z
        .number()
        .optional()
        .describe(
          'Maximum requests per second to the source API. ' +
            'Used by the connector at runtime, not by build_connector.',
        ),
    })
    .describe(
      'Configuration to save. Merged with any existing config. ' +
        'Code-generation keys (consumed by build_connector): name, display_name, datasource_category, ' +
        'url_regex, icon_url, connector_type. ' +
        'Runtime-only keys (used by the generated connector, not by build_connector): auth_type, endpoint, ' +
        'api_key_header, page_size, rate_limit_rps.',
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
          formatNextSteps([
            {
              label: 'Infer Schema',
              description: 'parse a sample data file to detect field types',
              tool: 'infer_schema',
            },
            {
              label: 'View Config',
              description: 'review the config that was just saved',
              tool: 'get_config',
            },
          ]),
        ].join('\n'),
      },
    ],
  };
}
