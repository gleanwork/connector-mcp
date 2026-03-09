import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SESSION_FILE = '.glean/session.json';

function loadPersistedPath(dir: string): string | null {
  try {
    const file = join(dir, SESSION_FILE);
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
      projectPath?: string;
    };
    return parsed.projectPath ?? null;
  } catch {
    return null;
  }
}

function persistPath(projectPath: string): void {
  try {
    mkdirSync(join(projectPath, '.glean'), { recursive: true });
    writeFileSync(
      join(projectPath, SESSION_FILE),
      JSON.stringify({ projectPath }, null, 2) + '\n',
    );
  } catch {
    // Non-fatal — in-memory path still works if the write fails.
  }
}

// Boot order: GLEAN_PROJECT_PATH env > session file in cwd > cwd itself
const cwd = process.cwd();
let activeProjectPath: string = process.env['GLEAN_PROJECT_PATH'] ?? cwd;

if (!process.env['GLEAN_PROJECT_PATH']) {
  const persisted = loadPersistedPath(cwd);
  if (persisted && existsSync(persisted)) {
    activeProjectPath = persisted;
  }
}

export function getProjectPath(): string {
  return activeProjectPath;
}

export function setProjectPath(path: string): void {
  activeProjectPath = path;
  persistPath(path);
}
