import { describe, it, expect } from 'vitest';
import { MCPConfigRegistry } from '@gleanwork/mcp-config-schema';
import yaml from 'js-yaml';
import * as toml from 'smol-toml';
import { generateClientConfig, IDE_CLIENTS, PLACEHOLDER_ENV } from '../scripts/generate-configs.ts';

describe('generateClientConfig', () => {
  const registry = new MCPConfigRegistry({
    serverPackage: '@gleanwork/connector-mcp',
  });

  for (const clientId of IDE_CLIENTS) {
    describe(clientId, () => {
      it('produces non-empty output', () => {
        const { content, ext } = generateClientConfig(registry, clientId, PLACEHOLDER_ENV);
        expect(content.length).toBeGreaterThan(0);
        expect(['json', 'yaml', 'toml']).toContain(ext);
      });

      it('output is valid for its format', () => {
        const { content, ext } = generateClientConfig(registry, clientId, PLACEHOLDER_ENV);
        expect(() => {
          if (ext === 'json') JSON.parse(content);
          else if (ext === 'yaml') yaml.load(content);
          else if (ext === 'toml') toml.parse(content);
        }).not.toThrow();
      });

      it('contains GLEAN_INSTANCE placeholder', () => {
        const { content } = generateClientConfig(registry, clientId, PLACEHOLDER_ENV);
        expect(content).toContain('your-instance');
      });

      it('contains GLEAN_API_TOKEN placeholder', () => {
        const { content } = generateClientConfig(registry, clientId, PLACEHOLDER_ENV);
        expect(content).toContain('glean_xxx');
      });
    });
  }
});
