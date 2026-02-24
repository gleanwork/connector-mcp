import { z } from 'zod';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runCopier } from '../core/copier-runner.js';
import { setProjectPath } from '../session.js';
import { atomicWriteFileSync } from '../core/fs-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const createConnectorSchema = z.object({
  name: z
    .string()
    .describe('Name for the new connector (e.g. "salesforce-opportunities")'),
  parent_directory: z
    .string()
    .optional()
    .describe('Directory to create the connector in. Defaults to cwd.'),
});

export type CreateConnectorParams = z.infer<typeof createConnectorSchema>;

export async function handleCreateConnector(params: CreateConnectorParams) {
  const parentDir = params.parent_directory ?? process.cwd();
  const projectPath = join(parentDir, params.name);

  const result = await runCopier(params.name, parentDir);

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
  const template = readFileSync(
    join(__dirname, '../templates/CLAUDE.md.template'),
    'utf8',
  );
  const claudeMd = template.replace('{{connector_name}}', params.name);
  atomicWriteFileSync(join(projectPath, 'CLAUDE.md'), claudeMd);

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
          ``,
          `Next step: describe your data source and use set_config to define the connector configuration.`,
        ].join('\n'),
      },
    ],
  };
}
