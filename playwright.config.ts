import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/mcp',
  timeout: 30_000,
  reporter: [['list'], ['@gleanwork/mcp-server-tester/reporters/mcpReporter']],
  projects: [
    {
      name: 'connector-mcp',
      use: {},
    },
  ],
});
