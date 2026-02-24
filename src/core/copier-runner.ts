/**
 * Copier template runner — invokes the Copier CLI as a subprocess
 * to generate connector projects from a template.
 *
 * Adapted from glean-connector-studio. Simplified interface for MCP use:
 * takes a connector name and parent directory, returns success/error.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
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
 * Resolve the path to the Glean connector project template.
 * Checks common locations relative to the workspace.
 */
function getTemplatePath(): string {
  const candidates = [
    // Env override for CI / custom setups
    process.env['GLEAN_CONNECTOR_TEMPLATE_PATH'],
    // Alongside this package in the glean workspace
    resolve(
      new URL(import.meta.url).pathname,
      '..', '..', '..', '..', '..', 'glean-connector-project',
    ),
    resolve(process.env['HOME'] ?? '~', 'workspace', 'glean', 'glean-connector-project'),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Copier template not found. Set GLEAN_CONNECTOR_TEMPLATE_PATH or ensure ' +
    'glean-connector-project is at: ' + candidates.join(' or '),
  );
}

/**
 * Run Copier to scaffold a new connector project.
 *
 * @param name - Connector project name (used as the directory name)
 * @param parentDirectory - Parent directory where the project will be created
 */
export async function runCopier(name: string, parentDirectory: string): Promise<CopierResult> {
  const projectPath = join(parentDirectory, name);

  try {
    const templatePath = getTemplatePath();
    mkdirSync(parentDirectory, { recursive: true });

    const args = [
      'run',
      'copier',
      'copy',
      '--trust',
      '--force',
      '--defaults',
      '--data', `project_name=${name}`,
      templatePath,
      projectPath,
    ];

    logger.info({ projectPath, name, templatePath }, 'Running Copier to generate connector project');

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
    logger.error({ projectPath, err: error }, 'Copier failed to generate project');
    return { success: false, projectPath, error: errorMessage };
  }
}
