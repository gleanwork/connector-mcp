# @gleanwork/connector-mcp

[![npm version](https://img.shields.io/npm/v/@gleanwork/connector-mcp.svg)](https://www.npmjs.com/package/@gleanwork/connector-mcp)
[![CI](https://github.com/gleanwork/connector-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/gleanwork/connector-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server for AI-assisted Glean connector development. Add it to your IDE's MCP config and use Claude Code, Cursor, or any MCP-compatible AI assistant to scaffold, schema-map, generate, and test Glean connectors — without leaving your editor.

## Prerequisites

- Node.js ≥ 18
- Python + [uv](https://docs.astral.sh/uv/) (for `run_connector` and Copier scaffolding)
- A Glean API token

## Setup

### Claude Code

Add to `.claude/mcp.json` in your project (or `~/.claude/mcp.json` globally):

```json snippet=docs/snippets/claude-code.json
{
  "mcpServers": {
    "local": {
      "command": "npx",
      "args": [
        "-y",
        "@gleanwork/connector-mcp"
      ],
      "type": "stdio"
    }
  }
}
```

For setup instructions for Cursor, VS Code, Windsurf, Goose, Codex, JetBrains, Gemini CLI, OpenCode, and more, see [docs/setup.md](docs/setup.md).

## Environment Variables

| Variable                        | Required | Description                                                                             |
| ------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `GLEAN_INSTANCE`                | Yes      | Glean instance subdomain (e.g. `my-company`)                                            |
| `GLEAN_API_TOKEN`               | Yes      | Glean API token for index operations                                                    |
| `GLEAN_PROJECT_PATH`            | No       | Default project directory; overridden by `create_connector`                             |
| `GLEAN_CONNECTOR_TEMPLATE_PATH` | No       | Path to a custom Copier template (defaults to `glean-connector-project` in workspace)   |
| `GLEAN_WORKER_COMMAND`          | No       | Command to start the Python worker (default: `uv run python -m glean_connector_worker`) |

## Quick Start

In your AI assistant, try:

> "I want to build a Glean connector for our Salesforce Opportunities data. The API uses OAuth2 bearer tokens and returns paginated JSON. Let's start."

The assistant will guide you through the full workflow using the MCP tools below.

## Authoring Workflow

1. **`create_connector`** — scaffold the project, sets active directory
2. **`set_config`** — save auth, endpoint, pagination config
3. **`infer_schema`** — parse a sample data file and detect field types
4. **`update_schema`** — define or adjust field definitions
5. **`get_mappings`** — view source schema alongside Glean entity model
6. **`confirm_mappings`** — save field mapping decisions
7. **`validate_mappings`** — check all required Glean fields are covered
8. **`build_connector`** — generate Python connector code (`dry_run: true` to preview)
9. **`run_connector`** — start async execution, get `execution_id`
10. **`inspect_execution`** — poll status, view records and validation results

## Tool Reference

| Tool                | Description                                                                        |
| ------------------- | ---------------------------------------------------------------------------------- |
| `create_connector`  | Scaffold a new connector project and set the active session path                   |
| `infer_schema`      | Parse a `.csv`, `.json`, or `.ndjson` file and return field analysis               |
| `get_schema`        | Read current `.glean/schema.json`                                                  |
| `update_schema`     | Write field definitions to `.glean/schema.json`                                    |
| `analyze_field`     | Deep-dive on a single field: samples, type, Glean mapping suggestions              |
| `get_mappings`      | Show source schema and Glean entity model side-by-side                             |
| `confirm_mappings`  | Save field mapping decisions to `.glean/mappings.json`                             |
| `validate_mappings` | Check mappings for missing required Glean fields                                   |
| `get_config`        | Read `.glean/config.json`                                                          |
| `set_config`        | Write connector config (auth, endpoint, pagination) to `.glean/config.json`        |
| `build_connector`   | Generate `connector.py`, `models.py`, `mock_data.json` from schema+mappings+config |
| `run_connector`     | Start async connector execution; returns `execution_id` immediately                |
| `inspect_execution` | Poll execution status; returns records, validation issues, logs                    |
| `manage_recording`  | Record/replay/list/delete connector data recordings                                |

## Project Layout

After `create_connector`, your project directory looks like:

```
my-connector/
├── connector.py        ← generated by build_connector
├── models.py           ← generated TypedDict for source data
├── mock_data.json      ← sample data for local testing
├── CLAUDE.md           ← workflow guidance (for Claude Code users)
└── .glean/
    ├── schema.json     ← field schema
    ├── mappings.json   ← field mappings to Glean entity model
    ├── config.json     ← connector configuration
    ├── executions/     ← execution results (written on completion)
    └── recordings/     ← captured API responses for replay
```

## MCP Resource

The server exposes a `connector://workflow` resource that returns the full authoring guide. Your AI assistant can fetch it at session start for workflow context.

## Troubleshooting

### `spawn uv ENOENT`

`uv` is not installed or is not on your `PATH`. The server requires `uv` to scaffold connector projects and to run the Python worker.

Install it following the [official uv instructions](https://docs.astral.sh/uv/getting-started/installation/), then verify:

```sh
uv --version
```

If `uv` is installed but not on the PATH seen by your IDE, add it explicitly in the MCP server `env` config or set `GLEAN_WORKER_COMMAND` to the full path of an alternative command.

### `Copier template not found`

The server could not locate the `copier-glean-connector` template. By default it looks for the template alongside this package in the Glean workspace or clones it from `github.com/gleanwork` over SSH.

Set the `GLEAN_CONNECTOR_TEMPLATE_PATH` environment variable to the absolute path of a local checkout of the template:

```json
{
  "env": {
    "GLEAN_CONNECTOR_TEMPLATE_PATH": "/path/to/copier-glean-connector"
  }
}
```

### `Worker exited` / `glean.indexing.worker` module not found

The Python worker process exited immediately. This usually means one of:

1. **You are not inside a Copier-scaffolded connector project.** The `run_connector` tool must be called after `create_connector` has set up the project directory with the correct `pyproject.toml` and dependencies.
2. **The `glean-indexing-sdk` is not installed** in the project's virtual environment. Run `uv sync` inside the connector project directory to install dependencies.
3. **Wrong working directory.** Ensure `GLEAN_PROJECT_PATH` points to the connector project root, or run `create_connector` first to set the active session path automatically.
