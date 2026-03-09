# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v0.5.0 (2026-03-08)

#### :rocket: Enhancement

- [#3](https://github.com/gleanwork/connector-mcp/pull/3) feat: guided workflow — get_started tool and What's next? follow-ups ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#2](https://github.com/gleanwork/connector-mcp/pull/2) feat: guided workflow — get_started tool and What's next? follow-ups ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#1](https://github.com/gleanwork/connector-mcp/pull/1) feat: generate IDE client configs via mcp-config-schema, sync to docs ([@steve-calvert-glean](https://github.com/steve-calvert-glean))

#### :bug: Bug Fix

- [#22](https://github.com/gleanwork/connector-mcp/pull/22) fix: pre-release polish — CHANGELOG URL, schema-store JSON.parse safety ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#21](https://github.com/gleanwork/connector-mcp/pull/21) fix: verification findings — template packaging, JSON.parse safety, docs (CHK-037–041) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#19](https://github.com/gleanwork/connector-mcp/pull/19) fix: schema validation improvements (CHK-017, CHK-019, CHK-023) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#18](https://github.com/gleanwork/connector-mcp/pull/18) fix: code correctness fixes (CHK-018, CHK-020, CHK-032, CHK-033) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#17](https://github.com/gleanwork/connector-mcp/pull/17) fix: doc accuracy fixes (CHK-022, CHK-026, CHK-027, CHK-034, CHK-035) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#16](https://github.com/gleanwork/connector-mcp/pull/16) fix: server version, Node engine floor, CLAUDE.md template (CHK-016, CHK-025, CHK-030) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#15](https://github.com/gleanwork/connector-mcp/pull/15) fix: improve tool descriptions and formatNextSteps UX (CHK-021, CHK-024, CHK-028) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#12](https://github.com/gleanwork/connector-mcp/pull/12) fix: bridge get_started to create_connector and add permissions guidance (CHK-008, CHK-009) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#14](https://github.com/gleanwork/connector-mcp/pull/14) fix: correct repository URL in package.json ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#11](https://github.com/gleanwork/connector-mcp/pull/11) fix: preserve transform field from mappings in build_connector (CHK-005) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#10](https://github.com/gleanwork/connector-mcp/pull/10) fix: correct README layout, env vars, add stability badge, fix CI badge (CHK-010–013) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#8](https://github.com/gleanwork/connector-mcp/pull/8) fix: unify recording_id naming in manage_recording replay (CHK-006) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#7](https://github.com/gleanwork/connector-mcp/pull/7) fix: align set_config description with keys consumed by build_connector (CHK-003) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#7](https://github.com/gleanwork/connector-mcp/pull/7) fix: align set_config description with keys consumed by build_connector (CHK-003) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#6](https://github.com/gleanwork/connector-mcp/pull/6) fix: kill workers after execution and add SIGTERM/SIGINT cleanup (CHK-004) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#5](https://github.com/gleanwork/connector-mcp/pull/5) fix: correct sampleData shape so analyze_field returns samples (CHK-002) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#4](https://github.com/gleanwork/connector-mcp/pull/4) fix: use HTTPS for Copier template fallback (CHK-001) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))

#### :memo: Documentation

- [#16](https://github.com/gleanwork/connector-mcp/pull/16) fix: server version, Node engine floor, CLAUDE.md template (CHK-016, CHK-025, CHK-030) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))

#### :house: Internal

- [#20](https://github.com/gleanwork/connector-mcp/pull/20) test: coverage enforcement, file-analyzer tests, execution-store isolation (CHK-029, CHK-031, CHK-036) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))
- [#13](https://github.com/gleanwork/connector-mcp/pull/13) test: add dedicated unit tests for WorkerPool and RecordingManager (CHK-014) ([@steve-calvert-glean](https://github.com/steve-calvert-glean))

#### Committers: 1

- Steve Calvert ([@steve-calvert-glean](https://github.com/steve-calvert-glean))

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
