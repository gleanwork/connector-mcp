import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { z } from 'zod';

import { runCopier } from '../core/copier-runner.js';
import { setProjectPath } from '../session.js';
import { atomicWriteFileSync } from '../core/fs-utils.js';
import { formatNextSteps } from './workflow.js';

const CONNECTOR_MANIFEST = readFileSync(
  resolve(fileURLToPath(import.meta.url), '../../manifest.json'),
  'utf8',
);

const CLAUDE_MD_TEMPLATE = `# Glean Connector: {{connector_name}}

This project uses the Glean Connector MCP server. The following workflow is available via MCP tools:

## Authoring Workflow

1. **Configure** — Describe your data source and call \`set_config\` to save the connector configuration (auth type, endpoint, pagination).
2. **Schema** — Call \`infer_schema\` with a sample data file, or describe your fields and call \`update_schema\` directly.
3. **Map fields** — Call \`get_mappings\` to see your schema alongside Glean's entity model, then call \`confirm_mappings\` with your mapping decisions.
4. **Validate** — Call \`validate_mappings\` to check for missing required fields.
5. **Build** — Call \`build_connector\` with \`dry_run: true\` to preview, then without to write files.
6. **Test** — Call \`run_connector\` to start execution, then \`inspect_execution\` to see results and validation.

## Project Layout

- \`.glean/schema.json\` — field schema (source of truth)
- \`.glean/mappings.json\` — field mappings to Glean entity model
- \`.glean/config.json\` — connector configuration
- \`src/<module_name>/connector.py\` — generated connector (do not hand-edit; regenerate instead)
- \`src/<module_name>/models.py\` — generated SourceDocument TypedDict
- \`src/<module_name>/mock_data.json\` — sample data for local testing

## MCP Tools Available

- \`create_connector\`, \`infer_schema\`, \`get_schema\`, \`update_schema\`, \`analyze_field\`
- \`get_mappings\`, \`confirm_mappings\`, \`validate_mappings\`
- \`get_config\`, \`set_config\`
- \`build_connector\`
- \`run_connector\`, \`inspect_execution\`, \`manage_recording\`

## Development Loop

1. Implement \`src/<module>/data_client.py\` with real API calls — use \`get_data_client\` then \`update_data_client\`
2. Run \`run_connector\` to test live
3. Save a recording: \`manage_recording\` with \`action: "record"\`
4. Replay while iterating on transforms: \`manage_recording\` with \`action: "replay"\`
5. Use \`inspect_execution\` to verify records are correct
`;

export const createConnectorSchema = z.object({
  name: z
    .string()
    .describe('Name for the new connector (e.g. "salesforce-opportunities")'),
  parent_directory: z
    .string()
    .optional()
    .describe('Directory to create the connector in. Defaults to cwd.'),
  connector_category: z
    .enum(['datasource', 'people'])
    .optional()
    .default('datasource')
    .describe('Type of connector: datasource (default) or people'),
  datasource_type: z
    .enum(['basic', 'streaming', 'async_streaming'])
    .optional()
    .default('basic')
    .describe(
      'Connector base class type (only applies to datasource category)',
    ),
  description: z
    .string()
    .optional()
    .describe('Short description of what this connector indexes'),
});

export type CreateConnectorParams = z.infer<typeof createConnectorSchema>;

export async function handleCreateConnector(params: CreateConnectorParams) {
  const parentDir = params.parent_directory ?? process.cwd();
  const projectPath = join(parentDir, params.name);

  const result = await runCopier(params.name, parentDir, {
    connector_category: params.connector_category,
    datasource_type: params.datasource_type,
    description: params.description,
  });

  if (!result.success) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error creating connector: ${result.error}`,
        },
      ],
    };
  }

  // Write CLAUDE.md with workflow guidance
  const claudeMd = CLAUDE_MD_TEMPLATE.replace(
    '{{connector_name}}',
    params.name,
  );
  atomicWriteFileSync(join(projectPath, 'CLAUDE.md'), claudeMd);
  atomicWriteFileSync(
    join(projectPath, '.glean', 'manifest.json'),
    CONNECTOR_MANIFEST,
  );

  // Set the session active project path so subsequent tools target this project
  setProjectPath(projectPath);

  return {
    content: [
      {
        type: 'text' as const,
        text: [
          `Connector "${params.name}" created at ${projectPath}.`,
          `CLAUDE.md written.`,
          `Active project path set to: ${projectPath}`,
          formatNextSteps([
            {
              label: 'Set Config',
              description: 'define auth, endpoint, and pagination settings',
              tool: 'set_config',
            },
            {
              label: 'Infer Schema',
              description: 'parse a sample data file to detect field types',
              tool: 'infer_schema',
            },
          ]),
        ].join('\n'),
      },
    ],
  };
}
