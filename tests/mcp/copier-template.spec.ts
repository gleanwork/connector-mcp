import {
  test as base,
  expect,
  createMCPClientForConfig,
  closeMCPClient,
  createMCPFixture,
} from '@gleanwork/mcp-server-tester';
import { Project } from 'fixturify-project';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const SERVER_ENTRY = resolve(
  fileURLToPath(import.meta.url),
  '../../../dist/index.js',
);

const EXCLUDE_DIRS = new Set([
  '.git',
  '.venv',
  '__pycache__',
  '.pytest_cache',
  '.ruff_cache',
]);

// Only lists files (not directories) — Copier always generates files in every dir it creates.
function listFilesRecursive(dir: string, root: string = dir): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(fullPath, root));
    } else {
      results.push(relative(root, fullPath));
    }
  }
  return results;
}

function checkCommandAvailable(cmd: string): boolean {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const available = checkCommandAvailable('mise') && checkCommandAvailable('uv');

const templateTest = base.extend<{ baseDir: string }>({
  // eslint-disable-next-line no-empty-pattern
  baseDir: async ({}, use) => {
    const project = new Project('copier-template-test', '0.0.0', { files: {} });
    await project.write();
    try {
      await use(project.baseDir);
    } finally {
      await project.dispose();
    }
  },

  mcpClient: async ({ baseDir }, use) => {
    const client = await createMCPClientForConfig({
      transport: 'stdio',
      command: 'node',
      args: [SERVER_ENTRY],
      cwd: baseDir,
    });
    try {
      await use(client);
    } finally {
      await closeMCPClient(client);
    }
  },

  mcp: async ({ mcpClient }, use, testInfo) => {
    const api = createMCPFixture(mcpClient, testInfo);
    await use(api);
  },
});

templateTest.describe('Copier template snapshot', () => {
  templateTest.skip(!available, 'Requires mise and uv to be installed');

  templateTest(
    'generates correct file structure and key file contents',
    async ({ mcp, baseDir }) => {
      templateTest.setTimeout(120_000);

      const result = await mcp.callTool('create_connector', {
        name: 'test-connector',
        parent_directory: baseDir,
      });
      const text = result.content[0].text as string;
      expect(text).not.toContain('Error creating connector:');

      const connectorDir = resolve(baseDir, 'test-connector');

      const tree = listFilesRecursive(connectorDir);
      expect(tree.join('\n')).toMatchSnapshot('file-tree.txt');

      const filesToSnapshot = [
        'mise.toml',
        'pyproject.toml',
        join('src', 'test_connector', 'connector.py'),
        join('src', 'test_connector', 'data_client.py'),
        join('src', 'test_connector', 'models.py'),
        join('src', 'test_connector', 'mock_data.json'),
      ];
      for (const file of filesToSnapshot) {
        const content = readFileSync(resolve(connectorDir, file), 'utf8');
        expect(content).toMatchSnapshot(file.replace(/[\\/]/g, '-') + '.txt');
      }
    },
  );
});
