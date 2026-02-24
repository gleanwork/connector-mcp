/**
 * In-process session state for the MCP server.
 * The active project path is set by create_connector and used by all tools.
 */

let activeProjectPath: string =
  process.env['GLEAN_PROJECT_PATH'] ?? process.cwd();

export function getProjectPath(): string {
  return activeProjectPath;
}

export function setProjectPath(path: string): void {
  activeProjectPath = path;
}
