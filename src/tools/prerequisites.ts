import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectPath } from '../session.js';

export const checkPrerequisitesSchema = z.object({});

export interface PrerequisiteCheck {
  name: string;
  ok: boolean;
  message: string;
  fix?: string;
}

function tryCommand(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

export function checkPrerequisites(projectPath = getProjectPath()): { checks: PrerequisiteCheck[] } {
  const checks: PrerequisiteCheck[] = [];

  const uvVersion = tryCommand('uv', ['--version']);
  checks.push(
    uvVersion
      ? { name: 'uv', ok: true, message: uvVersion }
      : {
          name: 'uv',
          ok: false,
          message: 'not found',
          fix: 'curl -LsSf https://astral.sh/uv/install.sh | sh',
        },
  );

  const pythonVersion = tryCommand('uv', ['run', 'python', '--version']);
  checks.push(
    pythonVersion
      ? { name: 'python', ok: true, message: pythonVersion }
      : {
          name: 'python',
          ok: false,
          message: 'not available via uv',
          fix: 'uv python install 3.12',
        },
  );

  const miseVersion = tryCommand('mise', ['--version']);
  checks.push(
    miseVersion
      ? { name: 'mise', ok: true, message: miseVersion }
      : {
          name: 'mise',
          ok: false,
          message: 'not found (needed for create_connector)',
          fix: 'curl https://mise.run | sh',
        },
  );

  const copierOut = tryCommand('uv', [
    'tool',
    'run',
    '--from',
    'copier',
    'copier',
    '--version',
  ]);
  checks.push(
    copierOut
      ? { name: 'copier', ok: true, message: `available (${copierOut.trim()})` }
      : {
          name: 'copier',
          ok: false,
          message: 'not found (needed for create_connector)',
          fix: 'uv tool install copier',
        },
  );

  const instance = process.env['GLEAN_INSTANCE'];
  checks.push({
    name: 'GLEAN_INSTANCE',
    ok: Boolean(instance),
    message: instance ? `set (${instance})` : 'not set',
    fix: instance
      ? undefined
      : 'Add GLEAN_INSTANCE=your-company to your environment or .env file',
  });

  const token = process.env['GLEAN_API_TOKEN'];
  checks.push({
    name: 'GLEAN_API_TOKEN',
    ok: Boolean(token),
    message: token ? 'set' : 'not set',
    fix: token
      ? undefined
      : 'Add GLEAN_API_TOKEN=your-token to .env\nCreate one at https://<your-company>.glean.com/admin/api-tokens',
  });

  const sdkResult = checkSdkVersion(projectPath);
  if (existsSync(join(projectPath, '.venv', 'bin', 'python'))) {
    checks.push({
      name: 'glean-indexing-sdk',
      ok: sdkResult.ok,
      message: sdkResult.message,
      fix: sdkResult.fix,
    });
  }

  return { checks };
}

export interface SdkVersionResult {
  ok: boolean;
  installedVersion: string | null;
  requiredRange: string;
  message: string;
  fix?: string;
}

export function checkSdkVersion(projectPath: string): SdkVersionResult {
  const manifestPath = join(projectPath, '.glean', 'manifest.json');
  let requiredRange = '>=1.0.0b1,<2.0';

  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        sdk?: { compatible_range?: string };
      };
      requiredRange = m.sdk?.compatible_range ?? requiredRange;
    } catch {
      // use default
    }
  }

  const venvPython = join(projectPath, '.venv', 'bin', 'python');
  if (!existsSync(venvPython)) {
    return {
      ok: false,
      installedVersion: null,
      requiredRange,
      message: `No .venv found in ${projectPath}`,
      fix: `cd ${projectPath} && uv sync`,
    };
  }

  const version = tryCommand(venvPython, [
    '-c',
    "import importlib.metadata; print(importlib.metadata.version('glean-indexing-sdk'))",
  ]);

  if (!version) {
    return {
      ok: false,
      installedVersion: null,
      requiredRange,
      message: 'glean-indexing-sdk not installed in .venv',
      fix: `cd ${projectPath} && uv add 'glean-indexing-sdk${requiredRange}'`,
    };
  }

  // Range ">=1.0.0b1,<2.0" — accept v1.x only
  const majorOk = version.startsWith('1.');
  return {
    ok: majorOk,
    installedVersion: version,
    requiredRange,
    message: majorOk
      ? `${version} (compatible with ${requiredRange})`
      : `${version} — required: ${requiredRange}`,
    fix: majorOk
      ? undefined
      : `cd ${projectPath} && uv add 'glean-indexing-sdk${requiredRange}'`,
  };
}

export function handleCheckPrerequisites(
  _params: z.infer<typeof checkPrerequisitesSchema>,
) {
  const { checks } = checkPrerequisites();
  const allOk = checks.every((c) => c.ok);

  const lines = [
    allOk ? '✓ All prerequisites met.' : '⚠ Some prerequisites are missing.',
    '',
    ...checks.map((c) => {
      const icon = c.ok ? '✓' : '✗';
      const line = `${icon} ${c.name}: ${c.message}`;
      return c.fix ? `${line}\n    → ${c.fix}` : line;
    }),
  ];

  return {
    content: [{ type: 'text' as const, text: lines.join('\n') }],
  };
}
