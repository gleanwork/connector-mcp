import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectPath } from '../session.js';
import { formatNextSteps } from './workflow.js';

export const getDataClientSchema = z.object({
  module_name: z
    .string()
    .describe(
      'Snake_case module name (e.g. "jira_connector"). Use list_connectors to find available names.',
    ),
});

export const updateDataClientSchema = z.object({
  module_name: z
    .string()
    .describe('Snake_case module name matching the connector to update.'),
  code: z
    .string()
    .describe(
      'Complete replacement for data_client.py. Must include DataClient class with get_source_data() method.',
    ),
});

export function handleGetDataClient(
  params: z.infer<typeof getDataClientSchema>,
  projectPath = getProjectPath(),
) {
  const filePath = join(
    projectPath,
    'src',
    params.module_name,
    'data_client.py',
  );

  if (!existsSync(filePath)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `data_client.py not found at src/${params.module_name}/. Run list_connectors to see available modules.`,
        },
      ],
    };
  }

  const code = readFileSync(filePath, 'utf8');

  const configPath = join(projectPath, '.glean', 'config.json');
  const configNote = existsSync(configPath)
    ? `\n## Connector config (.glean/config.json)\n\`\`\`json\n${readFileSync(configPath, 'utf8')}\`\`\`\n`
    : '';

  return {
    content: [
      {
        type: 'text' as const,
        text: [
          `## src/${params.module_name}/data_client.py`,
          '',
          '```python',
          code.trimEnd(),
          '```',
          configNote,
          'Replace get_source_data() with real API calls.',
          'Use update_data_client to write the new implementation.',
        ].join('\n'),
      },
    ],
  };
}

export function handleUpdateDataClient(
  params: z.infer<typeof updateDataClientSchema>,
  projectPath = getProjectPath(),
) {
  const dirPath = join(projectPath, 'src', params.module_name);

  if (!existsSync(dirPath)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Module directory not found: src/${params.module_name}/. Run list_connectors to see available modules.`,
        },
      ],
    };
  }

  writeFileSync(join(dirPath, 'data_client.py'), params.code, 'utf8');

  return {
    content: [
      {
        type: 'text' as const,
        text:
          [
            `✓ src/${params.module_name}/data_client.py updated.`,
            '',
            'Run run_connector to test the new implementation.',
          ].join('\n') +
          formatNextSteps([
            {
              label: 'Run Connector',
              description: 'test the updated data client',
              tool: 'run_connector',
            },
          ]),
      },
    ],
  };
}
