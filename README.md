# @gleanwork/connector-mcp

[![Experimental](https://img.shields.io/badge/-Experimental-D8FD49?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMzIgMzIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxwYXRoIGQ9Ik0yNC4zMDA2IDIuOTU0MjdMMjAuNzY1NiAwLjE5OTk1MUwxNy45MDI4IDMuOTk1MjdDMTMuNTY1MyAxLjkzNDk1IDguMjMwMTkgMy4wODQzOSA1LjE5Mzk0IDcuMDA5ODNDMS42NTg4OCAxMS41NjQyIDIuNDgzIDE4LjExMzggNy4wMzczOCAyMS42NDg5QzguNzcyMzggMjIuOTkzNSAxMC43ODkzIDIzLjcwOTIgMTIuODI3OSAyMy44MTc3QzE2LjE0NjEgMjQuMDEyOCAxOS41MDc3IDIyLjYyNDggMjEuNjc2NSAxOS44MDU1QzI0LjczNDQgMTUuODggMjQuNTE3NSAxMC40MTQ4IDIxLjQ1OTYgNi43Mjc4OUwyNC4zMDA2IDIuOTU0MjdaTTE4LjExOTcgMTcuMDUxMkMxNi4xMDI4IDE5LjYzMiAxMi4zNzI1IDIwLjEwOTEgOS43NzAwMSAxOC4wOTIyQzcuMTg5MTkgMTYuMDc1MiA2LjcxMjA3IDEyLjMyMzMgOC43MjkwMSA5Ljc0MjQ2QzkuNzA0OTQgOC40ODQ1OCAxMS4xMTQ2IDcuNjgyMTQgMTIuNjc2MSA3LjQ4Njk2QzEzLjA0NDggNy40NDM1OCAxMy40MTM1IDcuNDIxOSAxMy43ODIyIDcuNDQzNThDMTQuOTc1IDcuNTA4NjUgMTYuMTI0NCA3Ljk0MjM5IDE3LjA3ODcgOC42Nzk3N0MxOS42NTk1IDEwLjcxODQgMjAuMTM2NiAxNC40NzAzIDE4LjExOTcgMTcuMDUxMloiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0yNC41MTc2IDIxLjY5MjJDMjMuOTMyIDIyLjQ1MTMgMjMuMjgxNCAyMy4xMjM2IDIyLjU2NTcgMjMuNzUyNUMyMS44NzE3IDI0LjMzODEgMjEuMTEyNyAyNC44ODAzIDIwLjMxMDIgMjUuMzM1N0MxOS41Mjk1IDI1Ljc2OTUgMTguNjgzNyAyNi4xMzgyIDE3LjgzNzggMjYuNDIwMUMxNi45OTIgMjYuNzAyIDE2LjEwMjggMjYuODk3MiAxNS4yMTM3IDI3LjAwNTdDMTQuMzI0NSAyNy4xMTQxIDEzLjQzNTMgMjcuMTU3NSAxMi41MjQ0IDI3LjA5MjRDMTEuNjEzNSAyNy4wMjczIDEwLjcyNDMgMjYuODc1NSA5Ljg1Njg0IDI2LjY1ODdMOS42NjE2NSAyNy4zNzQzTDguNzcyNDYgMzAuOTk2MkM5LjkwMDIxIDMxLjI5OTggMTEuMDQ5NyAzMS40NzMzIDEyLjIyMDggMzEuNTZDMTIuMjY0MiAzMS41NiAxMi4zMjkyIDMxLjU2IDEyLjM3MjYgMzEuNTZDMTMuNTAwMyAzMS42MjUxIDE0LjY0OTggMzEuNTgxNyAxNS43NTU4IDMxLjQ1MTZDMTYuOTI3IDMxLjI5OTggMTguMDk4MSAzMS4wMzk1IDE5LjIyNTggMzAuNjcwOEMyMC4zNTM2IDMwLjMwMjIgMjEuNDU5NyAyOS44MjUgMjIuNTAwNyAyOS4yMzk1QzIzLjU2MzQgMjguNjUzOSAyNC41NjEgMjcuOTM4MiAyNS40OTM1IDI3LjE1NzVDMjYuNDQ3OCAyNi4zNTUgMjcuMzE1MyAyNS40NDQyIDI4LjA3NDQgMjQuNDQ2NUMyOC4xODI4IDI0LjMxNjQgMjguMjY5NSAyNC4xNjQ2IDI4LjM3OCAyNC4wMTI4TDI0Ljc3NzkgMjEuMzQ1MkMyNC42Njk0IDIxLjQ1MzcgMjQuNjA0NCAyMS41ODM4IDI0LjUxNzYgMjEuNjkyMloiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPg==&labelColor=343CED)](https://github.com/gleanwork/.github/blob/main/docs/repository-stability.md#experimental)
[![npm version](https://img.shields.io/npm/v/@gleanwork/connector-mcp.svg)](https://www.npmjs.com/package/@gleanwork/connector-mcp)
[![CI](https://github.com/gleanwork/connector-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/gleanwork/connector-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server for AI-assisted Glean connector development. Add it to your IDE's MCP config and use Claude Code, Cursor, or any MCP-compatible AI assistant to scaffold, schema-map, generate, and test Glean connectors — without leaving your editor.

## Prerequisites

- Node.js ≥ 20
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

These are set in the MCP server config, not in your connector project.

| Variable                        | Required | Description                                                                            |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `GLEAN_PROJECT_PATH`            | No       | Default project directory; overridden by `create_connector`                            |
| `GLEAN_CONNECTOR_TEMPLATE_PATH` | No       | Path to a custom Copier template (defaults to `copier-glean-connector` in workspace)   |
| `GLEAN_WORKER_COMMAND`          | No       | Command to start the Python worker (default: `uv run python -m glean.indexing.worker`) |
| `GLEAN_WORKER_REQUEST_TIMEOUT`  | No       | Max seconds to wait for a worker JSON-RPC response (default: 30)                       |
| `GLEAN_WORKER_SHUTDOWN_TIMEOUT` | No       | Seconds to wait for graceful worker shutdown before SIGKILL (default: 5)               |

`GLEAN_INSTANCE` and `GLEAN_API_TOKEN` belong in your connector project's `.env` file — `create_connector` generates a `.env.example` to get you started.

## Quick Start

In your AI assistant, try:

> "I want to build a Glean connector for our Salesforce Opportunities data. The API uses OAuth2 bearer tokens and returns paginated JSON. Let's start."

Or call `get_started` — the assistant will ask what you're connecting and walk you through the rest.

## Core Workflow

Six steps from zero to a running connector. The assistant guides you through each one.

| Step | What you're doing                                        | Tool                                     |
| ---- | -------------------------------------------------------- | ---------------------------------------- |
| 0    | Verify prerequisites                                     | `check_prerequisites`                    |
| 1    | Scaffold the project                                     | `create_connector`                       |
| 2    | Configure the data source                                | `set_config`                             |
| 3    | Define the schema (infer from a sample file or write it) | `infer_schema` + `update_schema`         |
| 4    | Map fields and verify required Glean fields are covered  | `confirm_mappings` + `validate_mappings` |
| 5    | Generate the Python connector code                       | `build_connector`                        |
| 5a   | Implement real API calls in data_client.py               | `get_data_client` + `update_data_client` |
| 6    | Run the connector and inspect results                    | `run_connector` + `inspect_execution`    |

## Tool Reference

### Project Setup

| Tool                  | Description                                                                  |
| --------------------- | ---------------------------------------------------------------------------- |
| `get_started`         | Open the guided workflow; the assistant asks what you're connecting          |
| `check_prerequisites` | Verify uv, python, mise, copier, and Glean credentials are all configured    |
| `create_connector`    | Scaffold a new connector project and set the active session path             |
| `list_connectors`     | List all connector classes found in the project with their DataClient status |
| `set_config`          | Write connector config (auth, endpoint, pagination) to `.glean/config.json`  |
| `get_config`          | Read `.glean/config.json`                                                    |

### Schema

| Tool            | Description                                                           |
| --------------- | --------------------------------------------------------------------- |
| `infer_schema`  | Parse a `.csv`, `.json`, or `.ndjson` file and return field analysis  |
| `get_schema`    | Read current `.glean/schema.json`                                     |
| `update_schema` | Write field definitions to `.glean/schema.json`                       |
| `analyze_field` | Deep-dive on a single field: samples, type, Glean mapping suggestions |

### Field Mapping

| Tool                | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `get_mappings`      | Show source schema and Glean entity model side-by-side |
| `confirm_mappings`  | Save field mapping decisions to `.glean/mappings.json` |
| `validate_mappings` | Check mappings for missing required Glean fields       |

### Data Client

| Tool                 | Description                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `get_data_client`    | Read `data_client.py` and connector config — use before asking AI to write real API calls |
| `update_data_client` | Write a new `data_client.py` implementation (replaces the mock with real API calls)       |

### Build & Run

| Tool                | Description                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| `build_connector`   | Generate `src/{module}/connector.py`, `models.py`, `mock_data.json` from schema+mappings+config |
| `run_connector`     | Start async connector execution; returns `execution_id` immediately                             |
| `inspect_execution` | Poll execution status; returns records, validation issues, logs                                 |
| `manage_recording`  | Record/replay/list/delete connector data recordings                                             |

## Project Layout

After `create_connector`, your project directory looks like:

```
my-connector/
├── src/
│   └── {module_name}/
│       ├── connector.py    ← generated by build_connector
│       ├── models.py       ← generated TypedDict for source data
│       └── mock_data.json  ← sample data for local testing
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

## Known Limitations

- **Single project per MCP session.** The server tracks one active project at a time. To switch projects, set `GLEAN_PROJECT_PATH` in the MCP server config or restart the server after running `create_connector` for the new project.
- **Execution state is in-memory.** Active execution history is lost when the MCP server restarts. Completed execution results written to `.glean/executions/` persist on disk, but any in-progress executions must be re-run.

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
