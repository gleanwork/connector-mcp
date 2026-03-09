/**
 * Copier template runner — invokes the Copier CLI as a subprocess
 * to generate connector projects from a template.
 *
 * Adapted from glean-connector-studio. Simplified interface for MCP use:
 * takes a connector name and parent directory, returns success/error.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';

import { getLogger } from '../lib/logger.js';

const logger = getLogger('copier-runner');
const execFileAsync = promisify(execFile);

export interface CopierResult {
  success: boolean;
  projectPath: string;
  error?: string;
}

/**
 * Resolve the path or URL to the Glean connector project template.
 * Checks local paths first; falls back to the published GitHub repo.
 */
function getTemplatePath(): string {
  const localCandidates = [
    // Env override for CI / custom setups
    process.env['GLEAN_CONNECTOR_TEMPLATE_PATH'],
    // Alongside this package in the glean workspace (dev)
    resolve(
      new URL(import.meta.url).pathname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'copier-glean-connector',
    ),
    resolve(
      process.env['HOME'] ?? '~',
      'workspace',
      'glean',
      'copier-glean-connector',
    ),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of localCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Production fallback: use the published GitHub template directly
  return 'https://github.com/gleanwork/copier-glean-connector.git';
}

export interface CopierData {
  connector_category?: 'datasource' | 'people';
  datasource_type?: 'basic' | 'streaming' | 'async_streaming';
  description?: string;
}

function getSdkRangeFromManifest(): string {
  try {
    const manifestPath = resolve(
      new URL(import.meta.url).pathname,
      '../../manifest.json',
    );
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      sdk?: { compatible_range?: string };
    };
    return m.sdk?.compatible_range ?? '>=1.0.0b1,<2.0';
  } catch {
    return '>=1.0.0b1,<2.0';
  }
}

/**
 * Run Copier to scaffold a new connector project.
 *
 * @param name - Connector project name (used as the directory name)
 * @param parentDirectory - Parent directory where the project will be created
 * @param data - Additional template variables passed via --data flags
 */
export async function runCopier(
  name: string,
  parentDirectory: string,
  data: CopierData = {},
): Promise<CopierResult> {
  const projectPath = join(parentDirectory, name);

  try {
    const templatePath = getTemplatePath();
    mkdirSync(parentDirectory, { recursive: true });

    const extraData: string[] = [];
    if (data.connector_category) {
      extraData.push('--data', `connector_category=${data.connector_category}`);
    }
    if (data.datasource_type) {
      extraData.push('--data', `datasource_type=${data.datasource_type}`);
    }
    if (data.description) {
      extraData.push('--data', `description=${data.description}`);
    }
    extraData.push('--data', `sdk_range=${getSdkRangeFromManifest()}`);

    const args = [
      'run',
      'copier',
      'copy',
      '--trust',
      '--force',
      '--defaults',
      '--data',
      `project_name=${name}`,
      ...extraData,
      templatePath,
      projectPath,
    ];

    logger.info(
      { projectPath, name, templatePath },
      'Running Copier to generate connector project',
    );

    const { stdout, stderr } = await execFileAsync('uv', args, {
      timeout: 120_000,
      env: {
        ...process.env,
        COPIER_ANSWERS: 'true',
      },
    });

    if (stdout) logger.info({ stdout: stdout.trim() }, 'Copier stdout');
    if (stderr) logger.info({ stderr: stderr.trim() }, 'Copier stderr');

    logger.info({ projectPath, name }, 'Copier generated project successfully');

    return { success: true, projectPath };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(
      { projectPath, err: error },
      'Copier failed to generate project',
    );
    return { success: false, projectPath, error: errorMessage };
  }
}
