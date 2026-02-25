import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCPConfigRegistry, type ClientId } from '@gleanwork/mcp-config-schema';
import yaml from 'js-yaml';
import * as toml from 'smol-toml';

export const IDE_CLIENTS: ClientId[] = [
  'claude-code',
  'cursor',
  'cursor-agent',
  'vscode',
  'windsurf',
  'goose',
  'codex',
  'junie',
  'jetbrains',
  'gemini',
  'opencode',
];

export const PLACEHOLDER_ENV: Record<string, string> = {
  GLEAN_INSTANCE: 'your-instance',
  GLEAN_API_TOKEN: 'xxxxx',
};

export function generateClientConfig(
  registry: MCPConfigRegistry,
  clientId: ClientId,
  env: Record<string, string>,
): { content: string; ext: string } {
  const clientConfig = registry.getConfig(clientId);
  if (!clientConfig) {
    throw new Error(`Unknown client: ${clientId}`);
  }

  const builder = registry.createBuilder(clientId);
  const config = builder.buildConfiguration({ transport: 'stdio', env });
  const { configFormat } = clientConfig;

  if (configFormat === 'yaml') {
    return { content: yaml.dump(config), ext: 'yaml' };
  } else if (configFormat === 'toml') {
    // smol-toml requires Record<string, unknown>; buildConfiguration returns a
    // typed config object that is always a plain object at runtime.
    return { content: toml.stringify(config as Record<string, unknown>), ext: 'toml' };
  } else {
    return { content: JSON.stringify(config, null, 2) + '\n', ext: 'json' };
  }
}

function main() {
  const registry = new MCPConfigRegistry({
    serverPackage: '@gleanwork/connector-mcp',
  });

  const outDir = join(process.cwd(), 'docs', 'snippets');
  mkdirSync(outDir, { recursive: true });

  for (const clientId of IDE_CLIENTS) {
    const { content, ext } = generateClientConfig(registry, clientId, PLACEHOLDER_ENV);
    const outPath = join(outDir, `${clientId}.${ext}`);
    writeFileSync(outPath, content, 'utf-8');
    console.log(`  wrote ${outPath}`);
  }

  console.log(`\nGenerated ${IDE_CLIENTS.length} config snippets to docs/snippets/`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
