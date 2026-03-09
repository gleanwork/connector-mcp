import { z } from 'zod';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectPath } from '../session.js';
import { formatNextSteps } from './workflow.js';

export const listConnectorsSchema = z.object({});

interface ConnectorInfo {
  className: string;
  modulePath: string;
  dataClientExists: boolean;
}

function findConnectors(projectPath: string): ConnectorInfo[] {
  const srcDir = join(projectPath, 'src');
  if (!existsSync(srcDir)) return [];

  const results: ConnectorInfo[] = [];
  const classPattern = /^class\s+(\w+)\s*\(/m;

  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const connectorFile = join(srcDir, entry.name, 'connector.py');
    if (!existsSync(connectorFile)) continue;

    const source = readFileSync(connectorFile, 'utf8');
    const match = classPattern.exec(source);
    if (!match) continue;

    results.push({
      className: match[1],
      modulePath: `src/${entry.name}/connector.py`,
      dataClientExists: existsSync(join(srcDir, entry.name, 'data_client.py')),
    });
  }

  return results;
}

export function handleListConnectors(
  _params: z.infer<typeof listConnectorsSchema>,
  projectPath = getProjectPath(),
) {
  const connectors = findConnectors(projectPath);

  if (connectors.length === 0) {
    return {
      content: [
        {
          type: 'text' as const,
          text: [
            'No connectors found in this project.',
            '',
            'Run build_connector to generate one, or create_connector to scaffold a new project.',
          ].join('\n'),
        },
      ],
    };
  }

  const lines = [
    `Found ${connectors.length} connector${connectors.length === 1 ? '' : 's'}:`,
    '',
    ...connectors.map((c) => {
      const dcStatus = c.dataClientExists ? '✓ DataClient' : '✗ No DataClient';
      return `  ${c.className}  (${c.modulePath})  [${dcStatus}]`;
    }),
    '',
    'Pass the class name to run_connector or build_connector.',
  ];

  return {
    content: [
      {
        type: 'text' as const,
        text:
          lines.join('\n') +
          formatNextSteps([
            {
              label: 'Run Connector',
              description: 'execute a connector by class name',
              tool: 'run_connector',
            },
          ]),
      },
    ],
  };
}
