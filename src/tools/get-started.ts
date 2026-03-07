import { z } from 'zod';
import { formatNextSteps } from './workflow.js';

export const getStartedSchema = z.object({});

export async function handleGetStarted(
  _params: z.infer<typeof getStartedSchema>,
) {
  return {
    content: [
      {
        type: 'text' as const,
        text: [
          "Let's get started building your Glean connector. I have two questions:",
          '',
          '1. **What data source** do you want to connect? (e.g. "Salesforce opportunities", "our internal wiki", "JIRA tickets")',
          '2. **Do you have a sample data file?** A `.csv`, `.json`, or `.ndjson` export from your source system lets us detect the schema automatically.',
          '',
          "Share the path to your sample file and I'll analyze it — or describe your data source and we'll define the schema together.",
          formatNextSteps([
            {
              label: 'Create Connector',
              description:
                'scaffold a new connector project in a local directory',
              tool: 'create_connector',
            },
          ]),
        ].join('\n'),
      },
    ],
  };
}
