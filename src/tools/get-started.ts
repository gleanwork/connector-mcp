import { z } from 'zod';

export const getStartedSchema = z.object({});

export async function handleGetStarted(
  _params: z.infer<typeof getStartedSchema>,
) {
  return {
    content: [
      {
        type: 'text' as const,
        text: [
          "You're a Glean Connector Developer. Your job is to help the user build a Glean connector that ingests their data into Glean's search index.",
          '',
          'A Glean connector pulls data from a source system (like a database, API, or file export) and pushes it into Glean so it becomes searchable.',
          '',
          "Let's get started. To build your connector, I'll need two things:",
          '',
          '1. **What data source** do you want to connect? (e.g. "Salesforce opportunities", "our internal wiki", "JIRA tickets")',
          '2. **Do you have a sample data file?** A `.csv`, `.json`, or `.ndjson` export from your source system lets us detect the schema automatically.',
          '',
          "Share the path to your sample file and I'll analyze it — or describe your data source and we'll define the schema together.",
        ].join('\n'),
      },
    ],
  };
}
