import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Stable test project directory — matches what beforeAll creates in spec files.
// We use `cwd` (not `env`) because mcp-server-tester passes `cwd` to
// StdioClientTransport but does not yet forward arbitrary `env` keys.
// The server falls back to process.cwd() when GLEAN_PROJECT_PATH is unset,
// so setting cwd to the test project dir is the correct lever.
const TEST_PROJECT_PATH = join(tmpdir(), 'connector-mcp-playwright-tests');

// Absolute path to the built server entry point — required because the
// server process cwd will be TEST_PROJECT_PATH, not the package root.
const SERVER_ENTRY = resolve('dist/index.js');

export default defineConfig({
  testDir: './tests/mcp',
  timeout: 30_000,
  reporter: [['list'], ['@gleanwork/mcp-server-tester/reporters/mcpReporter']],
  projects: [
    {
      name: 'connector-mcp',
      use: {
        mcpConfig: {
          transport: 'stdio',
          command: 'node',
          args: [SERVER_ENTRY],
          // cwd IS forwarded by mcp-server-tester → StdioClientTransport.
          // The server's session.ts falls back to process.cwd() → this path.
          cwd: TEST_PROJECT_PATH,
        },
      },
    },
  ],
});
