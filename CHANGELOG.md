# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-25

### Added

#### MCP Server

- Initial release of `@gleanwork/connector-mcp`, an MCP server for AI-assisted Glean connector development.
- Server exposes 14 tools and one resource over the MCP stdio transport.
- Startup dependency validation: the server checks that `uv` is available in `PATH` and logs a warning to stderr and continues running if it is not.
- `GLEAN_WORKER_COMMAND` environment variable to override the Python worker command (default: `uv run python -m glean.indexing.worker`).

#### Schema Tools

- `infer_schema` — parses `.csv`, `.json`, and `.ndjson` files; returns per-field type analysis including null rates, cardinality, and sample values. Supports OpenAPI spec parsing (OpenAPI 3.x `components/schemas` and Swagger 2.x `definitions`).
- `get_schema` — reads the current canonical flat schema from `.glean/schema.json`.
- `update_schema` — writes field definitions to `.glean/schema.json` using an atomic write to prevent partial writes.
- `analyze_field` — deep-dives on a single field: samples, type details, and Glean entity model mapping suggestions.

#### Mapping Tools

- `get_mappings` — displays the source schema and Glean entity model side-by-side for mapping decisions.
- `confirm_mappings` — saves field mapping decisions to `.glean/mappings.json`, merging with any existing mappings.
- `validate_mappings` — checks current mappings against Glean's entity model and reports missing required fields and type mismatches.

#### Config Tools

- `get_config` — reads the current connector configuration from `.glean/config.json`.
- `set_config` — writes connector configuration (auth type, endpoint, pagination, and arbitrary keys) to `.glean/config.json`, merging with existing values.

#### Build Tool

- `build_connector` — generates Python connector files (`connector.py`, `models.py`, `mock_data.json`) from the combined schema, mappings, and config. Supports `dry_run: true` to preview generated code without writing files.
- Generated files are written to `src/{module_name}/` inside the connector project directory.

#### Execution Tools

- `run_connector` — starts async execution of the Python connector worker subprocess; returns an `execution_id` immediately without blocking.
- `inspect_execution` — polls execution status and returns records fetched, per-record validation results, and recent logs.
- `manage_recording` — manages connector data recordings: `record` captures live API responses, `replay` runs the connector from a saved recording, `list` shows available recordings, and `delete` removes a recording.

#### Project Scaffolding

- `create_connector` — scaffolds a new connector project directory using [Copier](https://copier.readthedocs.io/) and the `gleanwork/copier-glean-connector` template. Sets the active project directory for the current MCP session.
- Template resolution order: `GLEAN_CONNECTOR_TEMPLATE_PATH` env var, local workspace path, published GitHub repository via SSH.

#### MCP Resource

- `connector://workflow` — a `text/markdown` resource exposing the full step-by-step connector authoring guide. AI assistants can fetch this at session start for workflow context.

#### Internal Architecture

- `session.ts` — in-process session state; active project path set by `create_connector` and used by all tools. Falls back to `GLEAN_PROJECT_PATH` env var or `process.cwd()`.
- `src/lib/schema-store.ts` — canonical flat schema format (`StoredSchema`) with atomic disk I/O. Handles legacy `SchemaDefinition` (entities array) format via automatic conversion.
- `src/core/worker-pool.ts` — subprocess worker manager communicating via JSON-RPC over stdio. Supports request timeouts, graceful SIGTERM/SIGKILL shutdown, and stderr log forwarding as MCP notifications.
- `src/core/copier-runner.ts` — thin wrapper around the Copier CLI, invoked via `uv run copier`.
- `src/core/code-generator.ts` — generates Python connector and model files from schema and mapping data.
- `src/lib/execution-store.ts` — persists execution state to `.glean/executions/`.
- `src/lib/recording-manager.ts` — manages API response recordings in `.glean/recordings/`.
- `src/lib/file-analyzer.ts` — CSV, JSON, and NDJSON file parsing and field analysis.
- `src/lib/glean-entity-model.ts` — Glean entity model definitions used for mapping validation.

[0.1.0]: https://github.com/gleanwork/connector-mcp/releases/tag/v0.1.0
